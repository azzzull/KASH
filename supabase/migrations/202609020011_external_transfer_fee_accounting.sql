-- Add explicit external-transfer presentation identity while keeping accounting
-- classification as an expense.

alter table public.transactions
add column if not exists transaction_subtype text;

alter table public.transactions
drop constraint if exists transactions_subtype_valid;

alter table public.transactions
add constraint transactions_subtype_valid
check (
  transaction_subtype is null
  or (type = 'expense' and transaction_subtype = 'external_transfer')
);

alter table public.transactions
drop constraint if exists transactions_transfer_fee_only_on_transfer;

alter table public.transactions
add constraint transactions_transfer_fee_usage_valid
check (
  transfer_fee = 0
  or type = 'transfer'
  or (type = 'expense' and transaction_subtype = 'external_transfer')
);

create or replace view public.wallet_balance_view
with (security_invoker = true) as
with transaction_totals as (
  select w_1.id as wallet_id,
    coalesce(sum(
      case
        when t.status <> 'completed'::transaction_status then 0::numeric
        when t.type = 'income'::transaction_type and t.wallet_id = w_1.id then t.amount
        when t.type = 'expense'::transaction_type and t.wallet_id = w_1.id then -(t.amount + coalesce(t.transfer_fee, 0))
        when t.type = 'adjustment'::transaction_type and t.wallet_id = w_1.id then t.amount
        when t.type = 'transfer'::transaction_type and t.wallet_id = w_1.id then -(t.amount + coalesce(t.transfer_fee, 0))
        when t.type = 'transfer'::transaction_type and t.destination_wallet_id = w_1.id then t.amount
        else 0::numeric
      end
    ), 0::numeric)::numeric(18,2) as transaction_total
  from public.wallets w_1
  left join public.transactions t on t.wallet_id = w_1.id or t.destination_wallet_id = w_1.id
  group by w_1.id
),
activity_totals as (
  select a.wallet_id,
    coalesce(sum(
      case
        when a.activity_type = 'realized_gain' then a.amount
        when a.activity_type = 'realized_loss' then -a.amount
        else 0::numeric
      end
    ), 0::numeric)::numeric(18,2) as realized_pnl
  from public.investment_activities a
  group by a.wallet_id
)
select
  w.id as wallet_id,
  w.user_id,
  w.initial_balance,
  coalesce(tt.transaction_total, 0::numeric)::numeric(18,2) as transaction_total,
  case
    when w.wallet_type = 'investment'::wallet_type and w.current_market_value is not null then w.current_market_value
    else (w.initial_balance + coalesce(tt.transaction_total, 0::numeric))
  end::numeric(18,2) as current_balance,
  0::numeric(18,2) as allocated_to_goals,
  case
    when w.wallet_type = 'investment'::wallet_type and w.current_market_value is not null then w.current_market_value
    else (w.initial_balance + coalesce(tt.transaction_total, 0::numeric))
  end::numeric(18,2) as available_balance,
  (w.initial_balance + coalesce(tt.transaction_total, 0::numeric))::numeric(18,2) as cost_basis,
  case
    when w.wallet_type = 'investment'::wallet_type and w.current_market_value is not null
      then (w.current_market_value - (w.initial_balance + coalesce(tt.transaction_total, 0::numeric))) - coalesce(act.realized_pnl, 0::numeric)
    else 0::numeric
  end::numeric(18,2) as unrealized_gain_loss,
  case
    when w.wallet_type = 'investment'::wallet_type and w.current_market_value is not null and (w.initial_balance + coalesce(tt.transaction_total, 0::numeric)) > 0
      then round((((w.current_market_value - (w.initial_balance + coalesce(tt.transaction_total, 0::numeric))) / (w.initial_balance + coalesce(tt.transaction_total, 0::numeric))) * 100::numeric), 2)
    else null::numeric(8,2)
  end::numeric(8,2) as return_percentage,
  w.last_valuation_at,
  (w.initial_balance + coalesce(tt.transaction_total, 0::numeric))::numeric(18,2) as net_contributions,
  coalesce(act.realized_pnl, 0::numeric)::numeric(18,2) as realized_pnl,
  case
    when w.wallet_type = 'investment'::wallet_type and w.current_market_value is not null
      then (w.current_market_value - (w.initial_balance + coalesce(tt.transaction_total, 0::numeric)))
    else 0::numeric
  end::numeric(18,2) as total_pnl,
  case
    when w.wallet_type = 'investment'::wallet_type and w.current_market_value is not null
      then (w.current_market_value - (w.initial_balance + coalesce(tt.transaction_total, 0::numeric))) - coalesce(act.realized_pnl, 0::numeric)
    else 0::numeric
  end::numeric(18,2) as unrealized_pnl
from public.wallets w
left join transaction_totals tt on tt.wallet_id = w.id
left join activity_totals act on act.wallet_id = w.id;

grant select on public.wallet_balance_view to authenticated;

create or replace function public.enforce_transaction_wallet_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_required numeric := 0;
  v_current_balance numeric;
  v_old_wallet_effect numeric := 0;
  v_spendable_balance numeric;
begin
  if new.wallet_id is null or new.status <> 'completed' then
    return new;
  end if;

  v_required := case
    when new.type = 'expense' then new.amount + coalesce(new.transfer_fee, 0)
    when new.type = 'transfer' then new.amount + coalesce(new.transfer_fee, 0)
    when new.type = 'adjustment' and new.amount < 0 then -new.amount
    else 0
  end;

  if v_required <= 0 then
    return new;
  end if;

  perform 1
  from public.wallets w
  where w.id = new.wallet_id
  for update;

  if not found then
    raise exception 'Transaction source wallet was not found.';
  end if;

  select wb.current_balance
  into v_current_balance
  from public.wallet_balance_view wb
  where wb.wallet_id = new.wallet_id;

  if v_current_balance is null then
    raise exception 'Transaction source wallet balance could not be resolved.';
  end if;

  if tg_op = 'UPDATE' and old.wallet_id = new.wallet_id then
    v_old_wallet_effect := case
      when old.status <> 'completed' then 0
      when old.type = 'income' then old.amount
      when old.type = 'expense' then -(old.amount + coalesce(old.transfer_fee, 0))
      when old.type = 'transfer' then -(old.amount + coalesce(old.transfer_fee, 0))
      when old.type = 'adjustment' then old.amount
      else 0
    end;
  end if;

  v_spendable_balance := v_current_balance - v_old_wallet_effect;

  if v_spendable_balance < v_required then
    raise exception 'Insufficient wallet balance for this transaction.';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_enforce_wallet_balance on public.transactions;
create trigger transactions_enforce_wallet_balance
before insert or update
on public.transactions
for each row
execute function public.enforce_transaction_wallet_balance();

revoke execute on function public.enforce_transaction_wallet_balance() from public;

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
  v_cash_expenses numeric := 0;
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

  select coalesce(sum(amount), 0) into v_actual_expenses
  from public.transactions
  where user_id = v_user_id
    and (v_space_id is null or space_id = v_space_id)
    and type = 'expense'
    and status = 'completed'
    and transaction_date >= v_target_start_timestamptz
    and transaction_date < v_target_end_timestamptz;

  select coalesce(sum(amount), 0) into v_cash_expenses
  from public.transactions
  where user_id = v_user_id
    and (v_space_id is null or space_id = v_space_id)
    and type = 'expense'
    and wallet_id is not null
    and status = 'completed'
    and transaction_date >= v_target_start_timestamptz
    and transaction_date < v_target_end_timestamptz;

  select coalesce(sum(transfer_fee), 0) into v_actual_transfer_fees
  from public.transactions
  where user_id = v_user_id
    and (v_space_id is null or space_id = v_space_id)
    and (type = 'transfer' or type = 'expense')
    and status = 'completed'
    and transaction_date >= v_target_start_timestamptz
    and transaction_date < v_target_end_timestamptz;

  select coalesce(sum(dp.total_amount), 0) into v_actual_debt_payments
  from public.debt_payments dp
  join public.counterparties cp on cp.id = dp.counterparty_id
  where dp.user_id = v_user_id
    and (v_space_id is null or cp.space_id = v_space_id)
    and dp.debt_type = 'debt'
    and dp.payment_date >= v_target_start_timestamptz
    and dp.payment_date < v_target_end_timestamptz;

  select coalesce(sum(greatest(net_goal_alloc, 0)), 0) into v_actual_goal_contributions
  from (
    select g.id,
      sum(case when t_entity = 'contribution' then amount else 0 end) -
      sum(case when t_entity = 'refund' then amount else 0 end) as net_goal_alloc
    from (
      select g1.id as goal_id, gc.amount, 'contribution' as t_entity
      from public.goal_contributions gc
      join public.goals g1 on g1.id = gc.goal_id
      left join public.transactions t1 on t1.id = gc.transaction_id
      where gc.user_id = v_user_id
        and (v_space_id is null or g1.space_id = v_space_id)
        and (gc.transaction_id is null or t1.status = 'completed')
        and gc.contribution_date >= v_target_start_timestamptz
        and gc.contribution_date < v_target_end_timestamptz
      union all
      select t2.related_entity_id as goal_id, t2.amount, 'refund' as t_entity
      from public.transactions t2
      join public.goals g2 on g2.id = t2.related_entity_id
      where t2.user_id = v_user_id
        and (v_space_id is null or g2.space_id = v_space_id)
        and t2.related_entity_type = 'goal_refund'
        and t2.status = 'completed'
        and t2.transaction_date >= v_target_start_timestamptz
        and t2.transaction_date < v_target_end_timestamptz
    ) as goal_movements
    join public.goals g on g.id = goal_movements.goal_id
    group by g.id
  ) as net_goals;

  v_total_actual_cash_outflow := v_cash_expenses + v_actual_transfer_fees + v_actual_debt_payments + v_actual_goal_contributions;

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

grant execute on function public.get_monthly_budget_overview(date, uuid) to authenticated;
