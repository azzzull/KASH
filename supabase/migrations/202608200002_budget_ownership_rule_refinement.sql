-- ============================================================
-- KASH REFINEMENT: Budget Ownership Rule for Category vs Envelope
-- Migration: 202608200002_budget_ownership_rule_refinement.sql
-- Rule:
-- 1. Category Budget ONLY consumes expense transactions where:
--    category_id = budget.category_id AND envelope_id IS NULL.
-- 2. Envelope Budget consumes expense transactions where:
--    envelope_id = budget.envelope_id.
-- 3. Category Analytics remains independent across all expenses matching category_id.
-- ============================================================

drop function if exists public.get_monthly_budget_progress(date) cascade;
drop function if exists public.get_monthly_budget_progress(date, uuid) cascade;

create or replace function public.get_monthly_budget_progress(
  p_period_start date default null,
  p_user_id uuid default null
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
  v_user_id uuid := coalesce(p_user_id, auth.uid());
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
        -- 1. Category Target: ONLY sum completed expense transactions matching category WHERE envelope_id IS NULL
        when ab.b_target_type = 'category' then
          coalesce((
            select sum(t.amount)
            from public.transactions t
            where t.user_id = v_user_id
              and t.type = 'expense'
              and t.status = 'completed'
              and t.category_id = ab.b_category_id
              and t.envelope_id is null
              and t.transaction_date >= v_target_start_timestamptz
              and t.transaction_date < v_target_end_timestamptz
          ), 0)

        -- 2. Envelope Target: Sum completed expense transactions assigned to envelope
        when ab.b_target_type = 'envelope' then
          coalesce((
            select sum(t.amount)
            from public.transactions t
            where t.user_id = v_user_id
              and t.type = 'expense'
              and t.status = 'completed'
              and t.envelope_id = ab.b_envelope_id
              and t.transaction_date >= v_target_start_timestamptz
              and t.transaction_date < v_target_end_timestamptz
          ), 0)

        -- 3. Debt Payment Target: Sum principal debt payments in month
        when ab.b_target_type = 'debt' then
          coalesce(
            case
              when ab.b_debt_id is not null then (
                select sum(dpa.allocated_amount)
                from public.debt_payment_allocations dpa
                join public.debt_payments dp on dp.id = dpa.debt_payment_id
                where dpa.user_id = v_user_id
                  and dpa.debt_id = ab.b_debt_id
                  and dp.payment_date >= v_target_start_timestamptz
                  and dp.payment_date < v_target_end_timestamptz
              )
              when ab.b_counterparty_id is not null then (
                select sum(dp.total_amount)
                from public.debt_payments dp
                where dp.user_id = v_user_id
                  and dp.counterparty_id = ab.b_counterparty_id
                  and dp.debt_type = 'debt'
                  and dp.payment_date >= v_target_start_timestamptz
                  and dp.payment_date < v_target_end_timestamptz
              )
              else (
                select sum(dp.total_amount)
                from public.debt_payments dp
                where dp.user_id = v_user_id
                  and dp.debt_type = 'debt'
                  and dp.payment_date >= v_target_start_timestamptz
                  and dp.payment_date < v_target_end_timestamptz
              )
            end,
            0
          )

        -- 4. Savings / Goal Target: Sum goal contributions OR incoming money to savings pocket in month
        when ab.b_target_type = 'goal' then
          coalesce(
            case
              when ab.b_goal_id is not null then (
                select sum(gc.amount)
                from public.goal_contributions gc
                where gc.user_id = v_user_id
                  and gc.goal_id = ab.b_goal_id
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
                      and t.type = 'expense'
                      and t.status = 'completed'
                      and t.category_id = ab.b_category_id
                      and t.envelope_id is null
                      and t.transaction_date >= v_prev_start_timestamptz
                      and t.transaction_date < v_prev_end_timestamptz
                  )
                when ab.b_target_type = 'envelope' then
                  (
                    select sum(t.amount)
                    from public.transactions t
                    where t.user_id = v_user_id
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
                        join public.debt_payments dp on dp.id = dpa.debt_payment_id
                        where dpa.user_id = v_user_id
                          and dpa.debt_id = ab.b_debt_id
                          and dp.payment_date >= v_prev_start_timestamptz
                          and dp.payment_date < v_prev_end_timestamptz
                      )
                      when ab.b_counterparty_id is not null then (
                        select sum(dp.total_amount)
                        from public.debt_payments dp
                        where dp.user_id = v_user_id
                          and dp.counterparty_id = ab.b_counterparty_id
                          and dp.debt_type = 'debt'
                          and dp.payment_date >= v_prev_start_timestamptz
                          and dp.payment_date < v_prev_end_timestamptz
                      )
                      else (
                        select sum(dp.total_amount)
                        from public.debt_payments dp
                        where dp.user_id = v_user_id
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
                      where gc.user_id = v_user_id
                        and gc.goal_id = ab.b_goal_id
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

-- Update trigger function evaluate_budget_threshold_notifications
create or replace function public.evaluate_budget_threshold_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_tx_date timestamptz;
  v_category_id uuid;
  v_envelope_id uuid;
  v_user_tz text;
  v_local_month date;
  v_rec record;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    v_tx_date := old.transaction_date;
    v_category_id := old.category_id;
    v_envelope_id := old.envelope_id;
  else
    v_user_id := new.user_id;
    v_tx_date := new.transaction_date;
    v_category_id := new.category_id;
    v_envelope_id := new.envelope_id;
  end if;

  if v_user_id is null then
    return coalesce(new, old);
  end if;

  select coalesce(timezone, 'Asia/Jakarta') into v_user_tz
  from public.profiles where id = v_user_id;

  v_local_month := date_trunc('month', (v_tx_date at time zone v_user_tz))::date;

  for v_rec in (
    select
      b.id as budget_id,
      b.name as budget_name,
      pr.usage_percentage,
      pr.spent,
      pr.effective_budget
    from public.budgets b
    cross join lateral (
      select usage_percentage, spent, effective_budget
      from public.get_monthly_budget_progress(v_local_month, v_user_id) prog
      where prog.budget_id = b.id
    ) pr
    where b.user_id = v_user_id
      and (
        (b.target_type = 'category' and b.category_id = v_category_id and v_envelope_id is null) or
        (b.target_type = 'envelope' and b.envelope_id = v_envelope_id and v_envelope_id is not null)
      )
  ) loop
    if v_rec.usage_percentage >= 100.0 then
      if not exists (
        select 1 from public.budget_notification_logs
        where budget_id = v_rec.budget_id
          and period_start = v_local_month
          and threshold_percent = 100
      ) then
        insert into public.budget_notification_logs (budget_id, user_id, period_start, threshold_percent)
        values (v_rec.budget_id, v_user_id, v_local_month, 100)
        on conflict do nothing;

        perform public.create_notification(
          v_user_id,
          'budget_exceeded',
          'Anggaran Terlampaui: ' || v_rec.budget_name,
          'Pengeluaran Anda telah melebihi batas anggaran untuk bulan ini.',
          'budget',
          v_rec.budget_id,
          jsonb_build_object(
            'period_start', v_local_month,
            'usage_percentage', v_rec.usage_percentage,
            'target_path', '/budgets/' || v_rec.budget_id::text
          )
        );
      end if;
    elsif v_rec.usage_percentage >= 80.0 then
      if not exists (
        select 1 from public.budget_notification_logs
        where budget_id = v_rec.budget_id
          and period_start = v_local_month
          and threshold_percent = 80
      ) then
        insert into public.budget_notification_logs (budget_id, user_id, period_start, threshold_percent)
        values (v_rec.budget_id, v_user_id, v_local_month, 80)
        on conflict do nothing;

        perform public.create_notification(
          v_user_id,
          'budget_near_limit',
          'Mendekati Batas: ' || v_rec.budget_name,
          'Pengeluaran Anda telah mencapai ' || round(v_rec.usage_percentage)::text || '% dari batas anggaran.',
          'budget',
          v_rec.budget_id,
          jsonb_build_object(
            'period_start', v_local_month,
            'usage_percentage', v_rec.usage_percentage,
            'target_path', '/budgets/' || v_rec.budget_id::text
          )
        );
      end if;
    end if;
  end loop;

  return coalesce(new, old);
end;
$$;
