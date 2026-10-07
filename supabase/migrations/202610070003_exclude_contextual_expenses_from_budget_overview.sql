-- Budget spending is personal consumption only. Work and reimbursable expenses
-- still affect their own accounting flows, but must not consume a personal
-- category/envelope budget or inflate the Budget overview totals.
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
    and coalesce(expense_context, 'personal') = 'personal'
    and status = 'completed'
    and transaction_date >= v_target_start_timestamptz
    and transaction_date < v_target_end_timestamptz;

  select coalesce(sum(amount), 0) into v_cash_expenses
  from public.transactions
  where user_id = v_user_id
    and (v_space_id is null or space_id = v_space_id)
    and type = 'expense'
    and coalesce(expense_context, 'personal') = 'personal'
    and wallet_id is not null
    and status = 'completed'
    and transaction_date >= v_target_start_timestamptz
    and transaction_date < v_target_end_timestamptz;

  select coalesce(sum(transfer_fee), 0) into v_actual_transfer_fees
  from public.transactions
  where user_id = v_user_id
    and (v_space_id is null or space_id = v_space_id)
    and (
      type = 'transfer'
      or (type = 'expense' and coalesce(expense_context, 'personal') = 'personal')
    )
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
