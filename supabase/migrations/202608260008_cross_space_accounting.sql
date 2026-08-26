-- 202608260008_cross_space_accounting.sql

-- 1. Counterparty Unique Identity
alter table public.counterparties
  add column linked_space_id uuid references public.financial_spaces(id) on delete restrict;

create unique index counterparties_linked_space_unique_idx 
  on public.counterparties(user_id, space_id, linked_space_id) 
  where linked_space_id is not null;

create or replace function public.validate_counterparty_linked_space()
returns trigger as $$
declare
  v_linked_space_owner uuid;
begin
  if new.linked_space_id is not null then
    if new.space_id = new.linked_space_id then
      raise exception 'counterparty cannot link to its own space';
    end if;
    
    select user_id into v_linked_space_owner from public.financial_spaces where id = new.linked_space_id;
    if v_linked_space_owner is null or v_linked_space_owner != new.user_id then
      raise exception 'linked space must belong to the same user';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security invoker;

create trigger validate_counterparty_linked_space_trigger
  before insert or update on public.counterparties
  for each row
  execute function public.validate_counterparty_linked_space();

-- 2. Parent Tables
create type public.cross_space_event_type as enum (
  'managed_expense_paid_personally'
);

create table public.cross_space_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type public.cross_space_event_type not null,
  
  personal_space_id uuid not null references public.financial_spaces(id) on delete restrict,
  managed_space_id uuid not null references public.financial_spaces(id) on delete restrict,
  
  amount numeric(18,2) not null check (amount > 0),
  managed_category_id uuid references public.categories(id) on delete restrict,
  event_date timestamptz not null default now(),
  title text not null,
  note text,
  status text not null default 'active' check (status in ('active', 'void')),
  
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  unique(user_id, client_request_id)
);
alter table public.cross_space_events enable row level security;
create policy "Users can manage their own cross space events" on public.cross_space_events for all using (auth.uid() = user_id);

create table public.cross_space_settlements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.cross_space_events(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  
  amount numeric(18,2) not null check (amount > 0),
  status text not null default 'completed' check (status in ('completed', 'void')),
  
  managed_wallet_id uuid not null references public.wallets(id),
  personal_wallet_id uuid not null references public.wallets(id),
  
  client_request_id uuid not null,
  settlement_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  
  unique(user_id, client_request_id)
);
alter table public.cross_space_settlements enable row level security;
create policy "Users can manage their own cross space settlements" on public.cross_space_settlements for all using (auth.uid() = user_id);

-- 3. Enums and FKs
create type public.cross_space_debt_role as enum ('personal_receivable', 'managed_payable');
create type public.cross_space_tx_role as enum ('personal_cash_out', 'managed_spending');
create type public.cross_space_payment_role as enum ('personal_receivable_collection', 'managed_payable_payment');

alter table public.debts 
  add column cross_space_event_id uuid references public.cross_space_events(id) on delete restrict,
  add column cross_space_role public.cross_space_debt_role;

create unique index debts_cross_space_role_idx 
  on public.debts(cross_space_event_id, cross_space_role) 
  where cross_space_event_id is not null;

alter table public.transactions 
  add column cross_space_event_id uuid references public.cross_space_events(id) on delete restrict,
  add column cross_space_role public.cross_space_tx_role;

create unique index transactions_cross_space_role_idx 
  on public.transactions(cross_space_event_id, cross_space_role) 
  where cross_space_event_id is not null;

alter table public.debt_payments 
  add column cross_space_settlement_id uuid references public.cross_space_settlements(id) on delete restrict,
  add column cross_space_role public.cross_space_payment_role;

create unique index debt_payments_cross_space_role_idx 
  on public.debt_payments(cross_space_settlement_id, cross_space_role) 
  where cross_space_settlement_id is not null;

-- 4. Transactions Wallet CHECK Constraint
alter table public.transactions drop constraint if exists transactions_wallet_required;
alter table public.transactions add constraint transactions_wallet_required check (
  wallet_id is not null or
  (
    type = 'expense' and
    destination_wallet_id is null and
    cross_space_event_id is not null and
    cross_space_role = 'managed_spending'
  )
);

-- 5. DB Triggers
create or replace function public.validate_cross_space_transaction()
returns trigger as $$
declare
  v_event public.cross_space_events%ROWTYPE;
  v_space_type text;
begin
  if (new.cross_space_event_id is null) != (new.cross_space_role is null) then
    raise exception 'cross_space_event_id and cross_space_role must be provided together';
  end if;

  if new.cross_space_event_id is not null then
    select * into v_event from public.cross_space_events where id = new.cross_space_event_id;
    if not found then raise exception 'cross space event not found'; end if;
    if new.user_id != v_event.user_id then raise exception 'user id mismatch with event'; end if;

    select type into v_space_type from public.financial_spaces where id = new.space_id;

    if new.cross_space_role = 'managed_spending' then
      if new.wallet_id is not null then raise exception 'managed_spending must have null wallet'; end if;
      if new.destination_wallet_id is not null then raise exception 'managed_spending must have null destination_wallet_id'; end if;
      if new.type != 'expense' then raise exception 'managed_spending must be expense'; end if;
      if new.space_id != v_event.managed_space_id then raise exception 'managed_spending space mismatch'; end if;
      if v_space_type != 'managed' then raise exception 'managed_spending space must be managed'; end if;
      if v_event.event_type != 'managed_expense_paid_personally' then raise exception 'invalid event type'; end if;
      if new.amount != v_event.amount then raise exception 'managed_spending amount must match event amount'; end if;
      
    elsif new.cross_space_role = 'personal_cash_out' then
      if new.wallet_id is null then raise exception 'personal_cash_out must have wallet'; end if;
      if new.destination_wallet_id is not null then raise exception 'personal_cash_out must have null destination_wallet_id'; end if;
      if new.type != 'adjustment' then raise exception 'personal_cash_out must be adjustment'; end if;
      if new.space_id != v_event.personal_space_id then raise exception 'personal_cash_out space mismatch'; end if;
      if new.amount != -v_event.amount then raise exception 'personal_cash_out amount must be negative event amount'; end if;
    end if;
  end if;

  return new;
end;
$$ language plpgsql security invoker;

create trigger validate_cross_space_transaction_trigger
  before insert or update on public.transactions
  for each row
  execute function public.validate_cross_space_transaction();

create or replace function public.validate_cross_space_debt()
returns trigger as $$
declare
  v_event public.cross_space_events%ROWTYPE;
begin
  if (new.cross_space_event_id is null) != (new.cross_space_role is null) then
    raise exception 'cross_space_event_id and cross_space_role must be provided together';
  end if;

  if new.cross_space_event_id is not null then
    select * into v_event from public.cross_space_events where id = new.cross_space_event_id;
    if not found then raise exception 'cross space event not found'; end if;
    if new.user_id != v_event.user_id then raise exception 'user mismatch'; end if;

    if new.cross_space_role = 'managed_payable' then
      if new.type != 'debt' then raise exception 'managed_payable must be debt'; end if;
      if new.space_id != v_event.managed_space_id then raise exception 'managed_payable space mismatch'; end if;
      if new.original_amount != v_event.amount then raise exception 'amount mismatch'; end if;
    elsif new.cross_space_role = 'personal_receivable' then
      if new.type != 'receivable' then raise exception 'personal_receivable must be receivable'; end if;
      if new.space_id != v_event.personal_space_id then raise exception 'personal_receivable space mismatch'; end if;
      if new.original_amount != v_event.amount then raise exception 'amount mismatch'; end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security invoker;

create trigger validate_cross_space_debt_trigger
  before insert or update on public.debts
  for each row
  execute function public.validate_cross_space_debt();

create or replace function public.validate_cross_space_debt_payment()
returns trigger as $$
declare
  v_settlement public.cross_space_settlements%ROWTYPE;
  v_debt public.debts%ROWTYPE;
begin
  if (new.cross_space_settlement_id is null) != (new.cross_space_role is null) then
    raise exception 'cross_space_settlement_id and cross_space_role must be provided together';
  end if;

  if new.cross_space_settlement_id is not null then
    select * into v_settlement from public.cross_space_settlements where id = new.cross_space_settlement_id;
    if not found then raise exception 'settlement not found'; end if;
    if new.user_id != v_settlement.user_id then raise exception 'user mismatch'; end if;
    if new.total_amount != v_settlement.amount then raise exception 'amount mismatch'; end if;

    select * into v_debt from public.debts where id = new.debt_id;
    if v_debt.cross_space_event_id != v_settlement.event_id then
      raise exception 'debt event mismatch with settlement event';
    end if;

    if new.cross_space_role = 'managed_payable_payment' then
      if v_debt.cross_space_role != 'managed_payable' then raise exception 'wrong debt role for payment'; end if;
    elsif new.cross_space_role = 'personal_receivable_collection' then
      if v_debt.cross_space_role != 'personal_receivable' then raise exception 'wrong debt role for payment'; end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security invoker;

create trigger validate_cross_space_debt_payment_trigger
  before insert or update on public.debt_payments
  for each row
  execute function public.validate_cross_space_debt_payment();

-- 6. Space Permanent Delete Rule
create or replace function public.delete_financial_space(p_space_id uuid)
returns void as $$
declare
  v_space_type text;
  v_user_id uuid;
  v_cross_space_count integer;
begin
  select user_id, type into v_user_id, v_space_type
  from public.financial_spaces
  where id = p_space_id and user_id = auth.uid();
  
  if not found then
    raise exception 'Financial space not found or permission denied';
  end if;
  
  if v_space_type = 'personal' then
    raise exception 'Cannot delete personal financial space';
  end if;

  select count(*) into v_cross_space_count
  from public.cross_space_events
  where (managed_space_id = p_space_id or personal_space_id = p_space_id);

  if v_cross_space_count > 0 then
    raise exception 'Space contains cross-space financial history and cannot be permanently deleted. Please archive it instead.';
  end if;

  delete from public.financial_spaces where id = p_space_id;
end;
$$ language plpgsql security definer set search_path = public;

-- 7. Modified budget RPCs
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
                select greatest(sum(gc.amount) - coalesce((
                  select sum(rt.amount)
                  from public.transactions rt
                  where rt.user_id = v_user_id
                    and rt.related_entity_id = ab.b_goal_id
                    and rt.related_entity_type = 'goal_refund'
                    and rt.status = 'completed'
                    and rt.transaction_date >= v_target_start_timestamptz
                    and rt.transaction_date < v_target_end_timestamptz
                ), 0), 0)
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
                      select greatest(sum(gc.amount) - coalesce((
                        select sum(rt.amount)
                        from public.transactions rt
                        where rt.user_id = v_user_id
                          and rt.related_entity_id = ab.b_goal_id
                          and rt.related_entity_type = 'goal_refund'
                          and rt.status = 'completed'
                          and rt.transaction_date >= v_prev_start_timestamptz
                          and rt.transaction_date < v_prev_end_timestamptz
                      ), 0), 0)
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

  select coalesce(sum(amount), 0) into v_cash_expenses
  from public.transactions
  where user_id = v_user_id
    and (v_space_id is null or space_id = v_space_id)
    and type = 'expense'
    and wallet_id is not null
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

  -- Actual goal contributions in month in target space, netted by goal
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

-- 8. RPCs

-- record_cross_space_expense
create or replace function public.record_cross_space_expense(
  p_client_request_id uuid,
  p_personal_space_id uuid,
  p_managed_space_id uuid,
  p_amount numeric,
  p_personal_wallet_id uuid,
  p_managed_category_id uuid,
  p_title text,
  p_note text,
  p_event_date timestamptz
) returns jsonb as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_personal_counterparty_id uuid;
  v_managed_counterparty_id uuid;
  v_personal_receivable_id uuid;
  v_managed_payable_id uuid;
  v_personal_tx_id uuid;
  v_managed_tx_id uuid;
  v_existing_event public.cross_space_events%ROWTYPE;
begin
  -- Idempotency check
  select * into v_existing_event from public.cross_space_events 
  where user_id = v_user_id and client_request_id = p_client_request_id;
  
  if found then
    if v_existing_event.amount != p_amount or v_existing_event.personal_space_id != p_personal_space_id or v_existing_event.managed_space_id != p_managed_space_id then
      raise exception 'Conflict: Event exists with different payload';
    end if;
    return jsonb_build_object('event_id', v_existing_event.id);
  end if;

  -- Validation
  if not exists (select 1 from public.financial_spaces where id = p_personal_space_id and user_id = v_user_id and type = 'personal') then
    raise exception 'Invalid personal space';
  end if;
  if not exists (select 1 from public.financial_spaces where id = p_managed_space_id and user_id = v_user_id and type = 'managed') then
    raise exception 'Invalid managed space';
  end if;
  if not exists (select 1 from public.wallets where id = p_personal_wallet_id and user_id = v_user_id and space_id = p_personal_space_id) then
    raise exception 'Invalid personal wallet';
  end if;

  -- Counterparties
  -- Personal Counterparty (linked to managed space)
  select id into v_personal_counterparty_id from public.counterparties
  where user_id = v_user_id and space_id = p_personal_space_id and linked_space_id = p_managed_space_id;
  
  if not found then
    insert into public.counterparties (user_id, space_id, linked_space_id, name)
    values (v_user_id, p_personal_space_id, p_managed_space_id, 'Managed Space')
    returning id into v_personal_counterparty_id;
  end if;

  -- Managed Counterparty (linked to personal space)
  select id into v_managed_counterparty_id from public.counterparties
  where user_id = v_user_id and space_id = p_managed_space_id and linked_space_id = p_personal_space_id;
  
  if not found then
    insert into public.counterparties (user_id, space_id, linked_space_id, name)
    values (v_user_id, p_managed_space_id, p_personal_space_id, 'Personal Funds')
    returning id into v_managed_counterparty_id;
  end if;

  -- Create Event
  insert into public.cross_space_events (
    user_id, event_type, personal_space_id, managed_space_id, amount, managed_category_id, event_date, title, note, client_request_id
  ) values (
    v_user_id, 'managed_expense_paid_personally', p_personal_space_id, p_managed_space_id, p_amount, p_managed_category_id, p_event_date, p_title, p_note, p_client_request_id
  ) returning id into v_event_id;

  -- Create Personal Receivable
  insert into public.debts (
    user_id, space_id, counterparty_id, type, original_amount, remaining_amount, start_date, title, note, cross_space_event_id, cross_space_role
  ) values (
    v_user_id, p_personal_space_id, v_personal_counterparty_id, 'receivable', p_amount, p_amount, p_event_date, p_title, p_note, v_event_id, 'personal_receivable'
  ) returning id into v_personal_receivable_id;

  -- Create Personal Cash Out Transaction
  insert into public.transactions (
    user_id, space_id, type, amount, wallet_id, transaction_date, title, note, related_entity_id, related_entity_type, cross_space_event_id, cross_space_role
  ) values (
    v_user_id, p_personal_space_id, 'adjustment', -p_amount, p_personal_wallet_id, p_event_date, p_title, p_note, v_personal_receivable_id, 'receivable_creation', v_event_id, 'personal_cash_out'
  ) returning id into v_personal_tx_id;

  -- Create Managed Payable
  insert into public.debts (
    user_id, space_id, counterparty_id, type, original_amount, remaining_amount, start_date, title, note, cross_space_event_id, cross_space_role
  ) values (
    v_user_id, p_managed_space_id, v_managed_counterparty_id, 'debt', p_amount, p_amount, p_event_date, p_title, p_note, v_event_id, 'managed_payable'
  ) returning id into v_managed_payable_id;

  -- Create Managed Spending (Walletless)
  insert into public.transactions (
    user_id, space_id, type, amount, wallet_id, category_id, transaction_date, title, note, related_entity_id, related_entity_type, cross_space_event_id, cross_space_role
  ) values (
    v_user_id, p_managed_space_id, 'expense', p_amount, null, p_managed_category_id, p_event_date, p_title, p_note, v_event_id, 'cross_space_event', v_event_id, 'managed_spending'
  ) returning id into v_managed_tx_id;

  return jsonb_build_object('event_id', v_event_id);
end;
$$ language plpgsql security definer set search_path = public;

-- record_cross_space_settlement
create or replace function public.record_cross_space_settlement(
  p_client_request_id uuid,
  p_event_id uuid,
  p_amount numeric,
  p_managed_wallet_id uuid,
  p_personal_wallet_id uuid,
  p_settlement_date timestamptz,
  p_note text
) returns jsonb as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.cross_space_events%ROWTYPE;
  v_existing_settlement public.cross_space_settlements%ROWTYPE;
  v_settlement_id uuid;
  v_personal_receivable public.debts%ROWTYPE;
  v_managed_payable public.debts%ROWTYPE;
  v_outstanding numeric;
  v_total_settled numeric;
  
  v_personal_payment_id uuid;
  v_managed_payment_id uuid;
begin
  -- Idempotency check
  select * into v_existing_settlement from public.cross_space_settlements 
  where user_id = v_user_id and client_request_id = p_client_request_id;
  
  if found then
    if v_existing_settlement.amount != p_amount or v_existing_settlement.event_id != p_event_id then
      raise exception 'Conflict: Settlement exists with different payload';
    end if;
    return jsonb_build_object('settlement_id', v_existing_settlement.id);
  end if;

  select * into v_event from public.cross_space_events where id = p_event_id and user_id = v_user_id;
  if not found then raise exception 'Event not found'; end if;

  select * into v_personal_receivable from public.debts where cross_space_event_id = p_event_id and cross_space_role = 'personal_receivable';
  select * into v_managed_payable from public.debts where cross_space_event_id = p_event_id and cross_space_role = 'managed_payable';

  -- Calculate Outstanding
  select coalesce(sum(amount), 0) into v_total_settled from public.cross_space_settlements where event_id = p_event_id and status = 'completed';
  v_outstanding := v_event.amount - v_total_settled;

  if p_amount > v_outstanding then
    raise exception 'Settlement amount exceeds outstanding';
  end if;

  if v_outstanding != v_personal_receivable.remaining_amount or v_outstanding != v_managed_payable.remaining_amount then
    raise exception 'Integrity Error: Event outstanding does not match remaining debt amounts';
  end if;

  -- Create Settlement Parent
  insert into public.cross_space_settlements (
    user_id, event_id, amount, managed_wallet_id, personal_wallet_id, settlement_date, note, client_request_id
  ) values (
    v_user_id, p_event_id, p_amount, p_managed_wallet_id, p_personal_wallet_id, p_settlement_date, p_note, p_client_request_id
  ) returning id into v_settlement_id;

  -- Reuse canonical record_counterparty_settlement internally?
  -- record_counterparty_settlement expects (p_counterparty_id, p_debt_type, p_payment_mode, p_amount, p_wallet_id...)
  -- However, we need to explicitly attach cross_space_settlement_id to the debt_payments. 
  -- record_counterparty_settlement does NOT take cross_space_settlement_id as param.
  -- Since we are forced to link it, we can execute the exact internal logic here, or modify record_counterparty_settlement to accept the linkage.
  -- Modifying record_counterparty_settlement is safer.
  
  -- We will recreate the internal logic here to avoid altering the signature of record_counterparty_settlement for non-cross-space usage.
  -- Actually, let's just insert directly to avoid duplicating complex allocation math since we KNOW there is exactly ONE debt per role.
  -- Allocation math is trivial: there is only 1 debt!
  
  -- Personal Settle
  insert into public.debt_payments (
    user_id, counterparty_id, debt_type, payment_mode, total_amount, payment_date, note, cross_space_settlement_id, cross_space_role
  ) values (
    v_user_id, v_personal_receivable.counterparty_id, 'receivable', 'wallet', p_amount, p_settlement_date, p_note, v_settlement_id, 'personal_receivable_collection'
  ) returning id into v_personal_payment_id;

  insert into public.debt_payment_allocations (
    user_id, debt_payment_id, debt_id, amount
  ) values (
    v_user_id, v_personal_payment_id, v_personal_receivable.id, p_amount
  );

  update public.debts set remaining_amount = remaining_amount - p_amount, status = case when remaining_amount - p_amount <= 0 then 'paid' else 'active' end where id = v_personal_receivable.id;

  insert into public.transactions (
    user_id, space_id, type, amount, wallet_id, transaction_date, title, note, related_entity_id, related_entity_type
  ) values (
    v_user_id, v_event.personal_space_id, 'adjustment', p_amount, p_personal_wallet_id, p_settlement_date, 'Pelunasan Piutang (Cross-Space)', p_note, v_personal_payment_id, 'receivable_payment'
  );

  -- Managed Settle
  insert into public.debt_payments (
    user_id, counterparty_id, debt_type, payment_mode, total_amount, payment_date, note, cross_space_settlement_id, cross_space_role
  ) values (
    v_user_id, v_managed_payable.counterparty_id, 'debt', 'wallet', p_amount, p_settlement_date, p_note, v_settlement_id, 'managed_payable_payment'
  ) returning id into v_managed_payment_id;

  insert into public.debt_payment_allocations (
    user_id, debt_payment_id, debt_id, amount
  ) values (
    v_user_id, v_managed_payment_id, v_managed_payable.id, p_amount
  );

  update public.debts set remaining_amount = remaining_amount - p_amount, status = case when remaining_amount - p_amount <= 0 then 'paid' else 'active' end where id = v_managed_payable.id;

  insert into public.transactions (
    user_id, space_id, type, amount, wallet_id, transaction_date, title, note, related_entity_id, related_entity_type
  ) values (
    v_user_id, v_event.managed_space_id, 'adjustment', -p_amount, p_managed_wallet_id, p_settlement_date, 'Pembayaran Utang (Cross-Space)', p_note, v_managed_payment_id, 'debt_payment'
  );

  return jsonb_build_object('settlement_id', v_settlement_id);
end;
$$ language plpgsql security definer set search_path = public;

-- void standard override
create or replace function public.void_transaction(p_transaction_id uuid)
returns void as $$
declare
  v_transaction record;
begin
  select * into v_transaction from public.transactions
  where id = p_transaction_id and user_id = auth.uid();
  
  if not found then raise exception 'Transaction not found or permission denied'; end if;
  if v_transaction.status = 'void' then return; end if;
  
  if v_transaction.cross_space_event_id is not null then
    raise exception 'Cannot directly void a cross-space child transaction. Void the cross-space event instead.';
  end if;

  update public.transactions set status = 'void', updated_at = now() where id = p_transaction_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.void_debt(p_debt_id uuid)
returns void as $$
declare
  v_debt record;
begin
  select * into v_debt from public.debts
  where id = p_debt_id and user_id = auth.uid();
  
  if not found then raise exception 'Debt not found or permission denied'; end if;
  if v_debt.status = 'void' then return; end if;
  
  if v_debt.cross_space_event_id is not null then
    raise exception 'Cannot directly void a cross-space child debt. Void the cross-space event instead.';
  end if;

  update public.debts set status = 'void', updated_at = now() where id = p_debt_id;
end;
$$ language plpgsql security definer set search_path = public;

-- void_cross_space_event
create or replace function public.void_cross_space_event(p_event_id uuid)
returns void as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.cross_space_events%ROWTYPE;
  v_settlement_count integer;
begin
  select * into v_event from public.cross_space_events where id = p_event_id and user_id = v_user_id;
  if not found then raise exception 'Event not found'; end if;
  if v_event.status = 'void' then return; end if;

  select count(*) into v_settlement_count from public.cross_space_settlements where event_id = p_event_id and status = 'completed';
  if v_settlement_count > 0 then
    raise exception 'Cannot void event that has completed settlements. Reverse settlements first.';
  end if;

  update public.cross_space_events set status = 'void', updated_at = now() where id = p_event_id;
  
  -- We don't use the standard void_transaction RPC because it blocks cross-space transactions.
  -- We update them directly.
  update public.transactions set status = 'void', updated_at = now() where cross_space_event_id = p_event_id;
  update public.debts set status = 'void', updated_at = now() where cross_space_event_id = p_event_id;

end;
$$ language plpgsql security definer set search_path = public;
