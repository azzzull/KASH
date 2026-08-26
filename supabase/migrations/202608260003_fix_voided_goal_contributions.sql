create or replace function public.get_monthly_budget_progress(
  p_period_start date default null,
  p_space_id uuid default null
)
returns table (
  budget_id uuid,
  name text,
  type text,
  target_type text,
  category_id uuid,
  category_name text,
  category_icon text,
  category_color text,
  envelope_id uuid,
  envelope_name text,
  envelope_icon text,
  envelope_color text,
  counterparty_id uuid,
  counterparty_name text,
  debt_id uuid,
  debt_title text,
  goal_id uuid,
  goal_name text,
  goal_icon text,
  wallet_id uuid,
  wallet_name text,
  wallet_icon text,
  wallet_color text,
  note text,
  repeat_monthly boolean,
  start_period date,
  end_period date,
  base_amount numeric,
  rollover_enabled boolean,
  rollover_amount numeric,
  effective_budget numeric,
  spent numeric,
  remaining numeric,
  usage_percentage numeric,
  status text,
  included_category_ids uuid[],
  included_category_names text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_space_id uuid;
  v_target_period date;
  v_prev_period date;
  v_user_tz text;
  v_target_start_timestamptz timestamptz;
  v_target_end_timestamptz timestamptz;
  v_prev_start_timestamptz timestamptz;
  v_prev_end_timestamptz timestamptz;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if p_space_id is null then
    select id into v_space_id
    from public.financial_spaces
    where owner_user_id = v_user_id and space_type = 'personal'
    limit 1;
  else
    v_space_id := p_space_id;
  end if;

  if p_period_start is null then
    v_target_period := date_trunc('month', current_date)::date;
  else
    v_target_period := date_trunc('month', p_period_start)::date;
  end if;

  v_prev_period := (v_target_period - interval '1 month')::date;

  select coalesce(timezone, 'Asia/Jakarta') into v_user_tz
  from public.profiles where id = v_user_id;

  v_target_start_timestamptz := (v_target_period::text || ' 00:00:00')::timestamp at time zone v_user_tz;
  v_target_end_timestamptz := ((v_target_period + interval '1 month')::date::text || ' 00:00:00')::timestamp at time zone v_user_tz;

  v_prev_start_timestamptz := (v_prev_period::text || ' 00:00:00')::timestamp at time zone v_user_tz;
  v_prev_end_timestamptz := ((v_prev_period + interval '1 month')::date::text || ' 00:00:00')::timestamp at time zone v_user_tz;

  return query
  with applicable_budgets as (
    select
      b.id as b_id,
      b.name as b_name,
      b.type as b_type,
      b.target_type as b_target_type,
      b.category_id as b_category_id,
      b.envelope_id as b_envelope_id,
      b.counterparty_id as b_counterparty_id,
      b.debt_id as b_debt_id,
      b.goal_id as b_goal_id,
      b.wallet_id as b_wallet_id,
      b.note as b_note,
      b.repeat_monthly as b_repeat_monthly,
      b.start_period as b_start_period,
      b.end_period as b_end_period
    from public.budgets b
    where b.user_id = v_user_id
      and (v_space_id is null or b.space_id = v_space_id)
      and b.start_period <= v_target_period
      and (
        (b.repeat_monthly = false and b.start_period = v_target_period) or
        (b.repeat_monthly = true and (b.end_period is null or b.end_period >= v_target_period))
      )
  ),
  resolved_versions as (
    select
      ab.b_id,
      bv.amount as ver_amount,
      bv.rollover_enabled as ver_rollover_enabled
    from applicable_budgets ab
    cross join lateral (
      select v.amount, v.rollover_enabled
      from public.budget_versions v
      where v.budget_id = ab.b_id
        and v.effective_from_period <= v_target_period
      order by v.effective_from_period desc
      limit 1
    ) bv
  ),
  target_spending as (
    select
      ab.b_id,
      case
        -- 1. Category Target: Sum completed expense transactions matching category in target space
        when ab.b_target_type = 'category' then
          coalesce((
            select sum(t.amount)
            from public.transactions t
            where t.user_id = v_user_id
              and (v_space_id is null or t.space_id = v_space_id)
              and t.type = 'expense'
              and t.status = 'completed'
              and t.category_id = ab.b_category_id
              and t.transaction_date >= v_target_start_timestamptz
              and t.transaction_date < v_target_end_timestamptz
          ), 0)

        -- 2. Envelope Target: Sum completed expense transactions assigned to envelope in target space
        when ab.b_target_type = 'envelope' then
          coalesce((
            select sum(t.amount)
            from public.transactions t
            where t.user_id = v_user_id
              and (v_space_id is null or t.space_id = v_space_id)
              and t.type = 'expense'
              and t.status = 'completed'
              and t.envelope_id = ab.b_envelope_id
              and t.transaction_date >= v_target_start_timestamptz
              and t.transaction_date < v_target_end_timestamptz
          ), 0)

        -- 3. Debt Payment Target: Sum principal debt payments in month in target space
        when ab.b_target_type = 'debt' then
          coalesce(
            case
              when ab.b_debt_id is not null then (
                select sum(dpa.allocated_amount)
                from public.debt_payment_allocations dpa
                join public.debts d on d.id = dpa.debt_id
                join public.debt_payments dp on dp.id = dpa.debt_payment_id
                where dpa.user_id = v_user_id
                  and (v_space_id is null or d.space_id = v_space_id)
                  and dpa.debt_id = ab.b_debt_id
                  and dp.payment_date >= v_target_start_timestamptz
                  and dp.payment_date < v_target_end_timestamptz
              )
              when ab.b_counterparty_id is not null then (
                select sum(dp.total_amount)
                from public.debt_payments dp
                join public.counterparties cp on cp.id = dp.counterparty_id
                where dp.user_id = v_user_id
                  and (v_space_id is null or cp.space_id = v_space_id)
                  and dp.counterparty_id = ab.b_counterparty_id
                  and dp.debt_type = 'debt'
                  and dp.payment_date >= v_target_start_timestamptz
                  and dp.payment_date < v_target_end_timestamptz
              )
              else (
                select sum(dp.total_amount)
                from public.debt_payments dp
                join public.counterparties cp on cp.id = dp.counterparty_id
                where dp.user_id = v_user_id
                  and (v_space_id is null or cp.space_id = v_space_id)
                  and dp.debt_type = 'debt'
                  and dp.payment_date >= v_target_start_timestamptz
                  and dp.payment_date < v_target_end_timestamptz
              )
            end,
            0
          )

        -- 4. Savings / Goal Target: Sum goal contributions OR incoming money to savings pocket in month in target space
        when ab.b_target_type = 'goal' then
          coalesce(
            case
              when ab.b_goal_id is not null then (
                select sum(gc.amount)
                from public.goal_contributions gc
                join public.goals g on g.id = gc.goal_id
                left join public.transactions t on t.id = gc.transaction_id
                where gc.user_id = v_user_id
                  and (v_space_id is null or g.space_id = v_space_id)
                  and gc.goal_id = ab.b_goal_id
                  and (gc.transaction_id is null or t.status = 'completed')
                  and gc.contribution_date >= v_target_start_timestamptz
                  and gc.contribution_date < v_target_end_timestamptz
              )
              when ab.b_wallet_id is not null then (
                select sum(
                  case
                    when t.type = 'transfer' and t.destination_wallet_id = ab.b_wallet_id then t.amount
                    when t.type = 'income' and t.wallet_id = ab.b_wallet_id then t.amount
                    else 0
                  end
                )
                from public.transactions t
                where t.user_id = v_user_id
                  and (v_space_id is null or t.space_id = v_space_id)
                  and t.status = 'completed'
                  and (
                    (t.type = 'transfer' and t.destination_wallet_id = ab.b_wallet_id) or
                    (t.type = 'income' and t.wallet_id = ab.b_wallet_id)
                  )
                  and t.transaction_date >= v_target_start_timestamptz
                  and t.transaction_date < v_target_end_timestamptz
              )
              else 0
            end,
            0
          )

        else 0
      end as target_spent
    from applicable_budgets ab
  ),
  prev_month_evaluation as (
    select
      ab.b_id,
      case
        when rv.ver_rollover_enabled and (
          (ab.b_repeat_monthly and ab.b_start_period <= v_prev_period and (ab.b_end_period is null or ab.b_end_period >= v_prev_period)) or
          (not ab.b_repeat_monthly and ab.b_start_period = v_prev_period)
        ) then
          greatest(
            coalesce(
              (
                select pv.amount
                from public.budget_versions pv
                where pv.budget_id = ab.b_id
                  and pv.effective_from_period <= v_prev_period
                order by pv.effective_from_period desc
                limit 1
              ),
              0
            ) - coalesce(
              case
                when ab.b_target_type = 'category' then
                  (
                    select sum(t.amount)
                    from public.transactions t
                    where t.user_id = v_user_id
                      and (v_space_id is null or t.space_id = v_space_id)
                      and t.type = 'expense'
                      and t.status = 'completed'
                      and t.category_id = ab.b_category_id
                      and t.transaction_date >= v_prev_start_timestamptz
                      and t.transaction_date < v_prev_end_timestamptz
                  )
                when ab.b_target_type = 'envelope' then
                  (
                    select sum(t.amount)
                    from public.transactions t
                    where t.user_id = v_user_id
                      and (v_space_id is null or t.space_id = v_space_id)
                      and t.type = 'expense'
                      and t.status = 'completed'
                      and t.envelope_id = ab.b_envelope_id
                      and t.transaction_date >= v_prev_start_timestamptz
                      and t.transaction_date < v_prev_end_timestamptz
                  )
                when ab.b_target_type = 'debt' then
                  case
                    when ab.b_debt_id is not null then (
                      select sum(dpa.allocated_amount)
                      from public.debt_payment_allocations dpa
                      join public.debts d on d.id = dpa.debt_id
                      join public.debt_payments dp on dp.id = dpa.debt_payment_id
                      where dpa.user_id = v_user_id
                        and (v_space_id is null or d.space_id = v_space_id)
                        and dpa.debt_id = ab.b_debt_id
                        and dp.payment_date >= v_prev_start_timestamptz
                        and dp.payment_date < v_prev_end_timestamptz
                    )
                    when ab.b_counterparty_id is not null then (
                      select sum(dp.total_amount)
                      from public.debt_payments dp
                      join public.counterparties cp on cp.id = dp.counterparty_id
                      where dp.user_id = v_user_id
                        and (v_space_id is null or cp.space_id = v_space_id)
                        and dp.counterparty_id = ab.b_counterparty_id
                        and dp.debt_type = 'debt'
                        and dp.payment_date >= v_prev_start_timestamptz
                        and dp.payment_date < v_prev_end_timestamptz
                    )
                    else (
                      select sum(dp.total_amount)
                      from public.debt_payments dp
                      join public.counterparties cp on cp.id = dp.counterparty_id
                      where dp.user_id = v_user_id
                        and (v_space_id is null or cp.space_id = v_space_id)
                        and dp.debt_type = 'debt'
                        and dp.payment_date >= v_prev_start_timestamptz
                        and dp.payment_date < v_prev_end_timestamptz
                    )
                  end
                when ab.b_target_type = 'goal' then
                  case
                    when ab.b_goal_id is not null then (
                      select sum(gc.amount)
                      from public.goal_contributions gc
                join public.goals g on g.id = gc.goal_id
                left join public.transactions t on t.id = gc.transaction_id
                where gc.user_id = v_user_id
                        and (v_space_id is null or g.space_id = v_space_id)
                        and gc.goal_id = ab.b_goal_id
                  and (gc.transaction_id is null or t.status = 'completed')
                  and gc.contribution_date >= v_prev_start_timestamptz
                        and gc.contribution_date < v_prev_end_timestamptz
                    )
                    when ab.b_wallet_id is not null then (
                      select sum(
                        case
                          when t.type = 'transfer' and t.destination_wallet_id = ab.b_wallet_id then t.amount
                          when t.type = 'income' and t.wallet_id = ab.b_wallet_id then t.amount
                          else 0
                        end
                      )
                      from public.transactions t
                      where t.user_id = v_user_id
                        and (v_space_id is null or t.space_id = v_space_id)
                        and t.status = 'completed'
                        and (
                          (t.type = 'transfer' and t.destination_wallet_id = ab.b_wallet_id) or
                          (t.type = 'income' and t.wallet_id = ab.b_wallet_id)
                        )
                        and t.transaction_date >= v_prev_start_timestamptz
                        and t.transaction_date < v_prev_end_timestamptz
                    )
                    else 0
                  end
                else 0
              end,
              0
            ),
            0
          )
        else 0
      end as rollover_val
    from applicable_budgets ab
    join resolved_versions rv on rv.b_id = ab.b_id
  )
  select
    ab.b_id as budget_id,
    ab.b_name as name,
    ab.b_type as type,
    ab.b_target_type as target_type,
    ab.b_category_id as category_id,
    c.name as category_name,
    c.icon as category_icon,
    c.color as category_color,
    ab.b_envelope_id as envelope_id,
    e.name as envelope_name,
    e.icon as envelope_icon,
    e.color as envelope_color,
    ab.b_counterparty_id as counterparty_id,
    cp.name as counterparty_name,
    ab.b_debt_id as debt_id,
    d.title as debt_title,
    ab.b_goal_id as goal_id,
    g.name as goal_name,
    g.icon as goal_icon,
    ab.b_wallet_id as wallet_id,
    w.name as wallet_name,
    w.icon as wallet_icon,
    w.color as wallet_color,
    ab.b_note as note,
    ab.b_repeat_monthly as repeat_monthly,
    ab.b_start_period as start_period,
    ab.b_end_period as end_period,
    rv.ver_amount::numeric(18,2) as base_amount,
    rv.ver_rollover_enabled as rollover_enabled,
    pme.rollover_val::numeric(18,2) as rollover_amount,
    (rv.ver_amount + pme.rollover_val)::numeric(18,2) as effective_budget,
    ts.target_spent::numeric(18,2) as spent,
    ((rv.ver_amount + pme.rollover_val) - ts.target_spent)::numeric(18,2) as remaining,
    case
      when (rv.ver_amount + pme.rollover_val) > 0 then
        round((ts.target_spent / (rv.ver_amount + pme.rollover_val)) * 100, 2)
      else 0
    end::numeric(8,2) as usage_percentage,
    case
      when ts.target_spent > (rv.ver_amount + pme.rollover_val) then 'over_budget'
      when (rv.ver_amount + pme.rollover_val) > 0 and (ts.target_spent / (rv.ver_amount + pme.rollover_val)) >= 0.8 then 'near_limit'
      else 'healthy'
    end as status,
    case
      when ab.b_target_type = 'category' then array[ab.b_category_id]::uuid[]
      else '{}'::uuid[]
    end as included_category_ids,
    case
      when ab.b_target_type = 'category' and c.name is not null then array[c.name]::text[]
      else '{}'::text[]
    end as included_category_names
  from applicable_budgets ab
  join resolved_versions rv on rv.b_id = ab.b_id
  join target_spending ts on ts.b_id = ab.b_id
  join prev_month_evaluation pme on pme.b_id = ab.b_id
  left join public.categories c on c.id = ab.b_category_id
  left join public.envelopes e on e.id = ab.b_envelope_id
  left join public.debts d on d.id = ab.b_debt_id
  left join public.counterparties cp on cp.id = coalesce(ab.b_counterparty_id, d.counterparty_id)
  left join public.goals g on g.id = ab.b_goal_id
  left join public.wallets w on w.id = ab.b_wallet_id
  order by ab.b_start_period desc, ab.b_name asc;
end;
$$;


create or replace function public.get_monthly_budget_overview(
  p_period_start date default null,
  p_space_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_space_id uuid;
  v_target_period date;
  v_user_tz text;
  v_target_start_timestamptz timestamptz;
  v_target_end_timestamptz timestamptz;
  v_total_allocated numeric := 0;
  v_total_category_budget numeric := 0;
  v_total_envelope_budget numeric := 0;
  v_total_debt_budget numeric := 0;
  v_total_goal_budget numeric := 0;
  v_budget_count integer := 0;
  v_over_budget_count integer := 0;
  v_near_limit_count integer := 0;
  v_actual_expenses numeric := 0;
  v_actual_transfer_fees numeric := 0;
  v_actual_debt_payments numeric := 0;
  v_actual_goal_contributions numeric := 0;
  v_total_actual_cash_outflow numeric := 0;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if p_space_id is null then
    select id into v_space_id
    from public.financial_spaces
    where owner_user_id = v_user_id and space_type = 'personal'
    limit 1;
  else
    v_space_id := p_space_id;
  end if;

  if p_period_start is null then
    v_target_period := date_trunc('month', current_date)::date;
  else
    v_target_period := date_trunc('month', p_period_start)::date;
  end if;

  select coalesce(timezone, 'Asia/Jakarta') into v_user_tz
  from public.profiles where id = v_user_id;

  v_target_start_timestamptz := (v_target_period::text || ' 00:00:00')::timestamp at time zone v_user_tz;
  v_target_end_timestamptz := ((v_target_period + interval '1 month')::date::text || ' 00:00:00')::timestamp at time zone v_user_tz;

  -- 1. Calculate Planned Budget Allocations from active budget targets in target space
  select
    coalesce(sum(effective_budget), 0),
    coalesce(sum(effective_budget) filter (where target_type = 'category'), 0),
    coalesce(sum(effective_budget) filter (where target_type = 'envelope'), 0),
    coalesce(sum(effective_budget) filter (where target_type = 'debt'), 0),
    coalesce(sum(effective_budget) filter (where target_type = 'goal'), 0),
    count(*)::integer,
    coalesce(count(*) filter (where status = 'over_budget'), 0)::integer,
    coalesce(count(*) filter (where status = 'near_limit'), 0)::integer
  into
    v_total_allocated,
    v_total_category_budget,
    v_total_envelope_budget,
    v_total_debt_budget,
    v_total_goal_budget,
    v_budget_count,
    v_over_budget_count,
    v_near_limit_count
  from public.get_monthly_budget_progress(v_target_period, v_space_id);

  -- 2. Calculate ACTUAL Unique Cash-Flow Outflows in target space
  -- Actual completed expense transactions
  select coalesce(sum(amount), 0) into v_actual_expenses
  from public.transactions
  where user_id = v_user_id
    and (v_space_id is null or space_id = v_space_id)
    and type = 'expense'
    and status = 'completed'
    and transaction_date >= v_target_start_timestamptz
    and transaction_date < v_target_end_timestamptz;

  -- Actual transfer fees
  select coalesce(sum(transfer_fee), 0) into v_actual_transfer_fees
  from public.transactions
  where user_id = v_user_id
    and (v_space_id is null or space_id = v_space_id)
    and type = 'transfer'
    and status = 'completed'
    and transaction_date >= v_target_start_timestamptz
    and transaction_date < v_target_end_timestamptz;

  -- Actual debt payments in month in target space
  select coalesce(sum(dp.total_amount), 0) into v_actual_debt_payments
  from public.debt_payments dp
  join public.counterparties cp on cp.id = dp.counterparty_id
  where dp.user_id = v_user_id
    and (v_space_id is null or cp.space_id = v_space_id)
    and dp.debt_type = 'debt'
    and dp.payment_date >= v_target_start_timestamptz
    and dp.payment_date < v_target_end_timestamptz;

  -- Actual goal contributions in month in target space
  select coalesce(sum(gc.amount), 0) into v_actual_goal_contributions
  from public.goal_contributions gc
  join public.goals g on g.id = gc.goal_id
  left join public.transactions t on t.id = gc.transaction_id
  where gc.user_id = v_user_id
    and (v_space_id is null or g.space_id = v_space_id)
    and (gc.transaction_id is null or t.status = 'completed')
    and gc.contribution_date >= v_target_start_timestamptz
    and gc.contribution_date < v_target_end_timestamptz;

  v_total_actual_cash_outflow := v_actual_expenses + v_actual_transfer_fees + v_actual_debt_payments + v_actual_goal_contributions;

  return jsonb_build_object(
    'period_start', v_target_period,
    'total_allocated', v_total_allocated,
    'total_category_budget', v_total_category_budget,
    'total_envelope_budget', v_total_envelope_budget,
    'total_debt_budget', v_total_debt_budget,
    'total_goal_budget', v_total_goal_budget,
    'actual_expenses', v_actual_expenses + v_actual_transfer_fees,
    'actual_debt_payments', v_actual_debt_payments,
    'actual_goal_contributions', v_actual_goal_contributions,
    'total_actual_cash_outflow', v_total_actual_cash_outflow,
    'remaining_allocation', greatest(v_total_allocated - v_total_actual_cash_outflow, 0),
    'overall_usage_percentage', case when v_total_allocated > 0 then round((v_total_actual_cash_outflow / v_total_allocated) * 100, 2) else 0 end,
    'budget_count', v_budget_count,
    'over_budget_count', v_over_budget_count,
    'near_limit_count', v_near_limit_count
  );
end;
$$;
