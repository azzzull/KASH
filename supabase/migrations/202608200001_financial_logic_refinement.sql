-- ============================================================
-- KASH MAJOR FINANCIAL LOGIC REFINEMENT
-- Migration: 202608200001_financial_logic_refinement.sql
-- 1. Investment Valuation-based Accounting (table, columns, RPC, view)
-- 2. Envelope Purpose Layer (table, transactions.envelope_id, RLS)
-- 3. Budget Engine Multi-Target Expansion (category, envelope, debt, goal)
-- 4. Budget Progress & Overview with Zero Cross-Budget Double-Counting
-- ============================================================

-- ------------------------------------------------------------
-- 1. INVESTMENT VALUATIONS & WALLET BALANCE VIEW UPDATE
-- ------------------------------------------------------------

-- Add investment valuation tracking columns to wallets
alter table public.wallets
add column if not exists cost_basis numeric(18,2) null,
add column if not exists current_market_value numeric(18,2) null,
add column if not exists last_valuation_at timestamptz null;

-- Create investment valuations audit history table
create table if not exists public.investment_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  market_value numeric(18,2) not null check (market_value >= 0),
  cost_basis_at_valuation numeric(18,2) not null default 0,
  valuation_date timestamptz not null default now(),
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_investment_valuations_wallet on public.investment_valuations(wallet_id, valuation_date desc);
create index if not exists idx_investment_valuations_user on public.investment_valuations(user_id, valuation_date desc);

alter table public.investment_valuations enable row level security;

drop policy if exists "Users can view own investment valuations" on public.investment_valuations;
create policy "Users can view own investment valuations"
on public.investment_valuations for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own investment valuations" on public.investment_valuations;
create policy "Users can insert own investment valuations"
on public.investment_valuations for insert
with check (auth.uid() = user_id);

-- RPC to update investment market valuation cleanly
create or replace function public.update_investment_valuation(
  p_wallet_id uuid,
  p_market_value numeric,
  p_valuation_date timestamptz default now(),
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet record;
  v_ledger_total numeric;
  v_cost_basis numeric;
  v_valuation_id uuid;
  v_unrealized_pl numeric;
  v_return_pct numeric;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_wallet
  from public.wallets
  where id = p_wallet_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Wallet not found or not owned by you.';
  end if;

  if v_wallet.wallet_type != 'investment' then
    raise exception 'Manual market valuation is only applicable for Investment wallets.';
  end if;

  if p_market_value < 0 then
    raise exception 'Market value cannot be negative.';
  end if;

  -- Calculate ledger basis (initial balance + net deposits/withdrawals)
  select coalesce(sum(
    case
      when t.status <> 'completed' then 0
      when t.type = 'income' and t.wallet_id = v_wallet.id then t.amount
      when t.type = 'expense' and t.wallet_id = v_wallet.id then -t.amount
      when t.type = 'adjustment' and t.wallet_id = v_wallet.id then t.amount
      when t.type = 'transfer' and t.wallet_id = v_wallet.id then -(t.amount + t.transfer_fee)
      when t.type = 'transfer' and t.destination_wallet_id = v_wallet.id then t.amount
      else 0
    end
  ), 0) into v_ledger_total
  from public.transactions t
  where t.wallet_id = v_wallet.id or t.destination_wallet_id = v_wallet.id;

  v_cost_basis := v_wallet.initial_balance + v_ledger_total;
  v_unrealized_pl := p_market_value - v_cost_basis;
  v_return_pct := case when v_cost_basis > 0 then round((v_unrealized_pl / v_cost_basis) * 100, 2) else 0 end;

  -- Insert valuation record
  insert into public.investment_valuations (
    user_id,
    wallet_id,
    market_value,
    cost_basis_at_valuation,
    valuation_date,
    note
  ) values (
    v_user_id,
    p_wallet_id,
    p_market_value,
    v_cost_basis,
    coalesce(p_valuation_date, now()),
    p_note
  ) returning id into v_valuation_id;

  -- Update wallet metadata
  update public.wallets
  set current_market_value = p_market_value,
      cost_basis = v_cost_basis,
      last_valuation_at = coalesce(p_valuation_date, now()),
      updated_at = now()
  where id = p_wallet_id;

  return jsonb_build_object(
    'valuation_id', v_valuation_id,
    'wallet_id', p_wallet_id,
    'market_value', p_market_value,
    'cost_basis', v_cost_basis,
    'unrealized_gain_loss', v_unrealized_pl,
    'return_percentage', v_return_pct,
    'valuation_date', coalesce(p_valuation_date, now())
  );
end;
$$;

-- Update wallet_balance_view with valuation-based accounting for investment wallets
create or replace view public.wallet_balance_view
with (security_invoker = true) as
with transaction_totals as (
  select
    w.id as wallet_id,
    coalesce(sum(
      case
        when t.status <> 'completed' then 0
        when t.type = 'income' and t.wallet_id = w.id then t.amount
        when t.type = 'expense' and t.wallet_id = w.id then -t.amount
        when t.type = 'adjustment' and t.wallet_id = w.id then t.amount
        when t.type = 'transfer' and t.wallet_id = w.id then -(t.amount + t.transfer_fee)
        when t.type = 'transfer' and t.destination_wallet_id = w.id then t.amount
        else 0
      end
    ), 0)::numeric(18,2) as transaction_total
  from public.wallets w
  left join public.transactions t
    on t.wallet_id = w.id
    or t.destination_wallet_id = w.id
  group by w.id
)
select
  w.id as wallet_id,
  w.user_id,
  w.initial_balance,
  coalesce(tt.transaction_total, 0)::numeric(18,2) as transaction_total,
  case
    when w.wallet_type = 'investment' and w.current_market_value is not null
      then w.current_market_value
    else (w.initial_balance + coalesce(tt.transaction_total, 0))
  end::numeric(18,2) as current_balance,
  0::numeric(18,2) as allocated_to_goals,
  case
    when w.wallet_type = 'investment' and w.current_market_value is not null
      then w.current_market_value
    else (w.initial_balance + coalesce(tt.transaction_total, 0))
  end::numeric(18,2) as available_balance,
  (w.initial_balance + coalesce(tt.transaction_total, 0))::numeric(18,2) as cost_basis,
  case
    when w.wallet_type = 'investment' and w.current_market_value is not null
      then (w.current_market_value - (w.initial_balance + coalesce(tt.transaction_total, 0)))
    else 0
  end::numeric(18,2) as unrealized_gain_loss,
  case
    when w.wallet_type = 'investment' and w.current_market_value is not null and (w.initial_balance + coalesce(tt.transaction_total, 0)) > 0
      then round(((w.current_market_value - (w.initial_balance + coalesce(tt.transaction_total, 0))) / (w.initial_balance + coalesce(tt.transaction_total, 0))) * 100, 2)
    else 0
  end::numeric(8,2) as return_percentage,
  w.last_valuation_at
from public.wallets w
left join transaction_totals tt on tt.wallet_id = w.id;

grant select on public.wallet_balance_view to authenticated;

-- ------------------------------------------------------------
-- 2. ENVELOPES TABLE & TRANSACTIONS.ENVELOPE_ID
-- ------------------------------------------------------------

create table if not exists public.envelopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  icon text null,
  color text null,
  target_amount numeric(18,2) null check (target_amount is null or target_amount > 0),
  is_archived boolean not null default false,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_envelopes_user on public.envelopes(user_id, is_archived);

alter table public.envelopes enable row level security;

drop policy if exists "Users can view own envelopes" on public.envelopes;
create policy "Users can view own envelopes"
on public.envelopes for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own envelopes" on public.envelopes;
create policy "Users can insert own envelopes"
on public.envelopes for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own envelopes" on public.envelopes;
create policy "Users can update own envelopes"
on public.envelopes for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own envelopes" on public.envelopes;
create policy "Users can delete own envelopes"
on public.envelopes for delete
using (auth.uid() = user_id);

-- Add envelope_id to transactions table
alter table public.transactions
add column if not exists envelope_id uuid null references public.envelopes(id) on delete set null;

create index if not exists idx_transactions_envelope_id on public.transactions(envelope_id) where envelope_id is not null;

-- ------------------------------------------------------------
-- 3. BUDGET ENGINE MULTI-TARGET EXTENSION
-- ------------------------------------------------------------

-- Add target_type and target references to budgets table
alter table public.budgets
add column if not exists target_type text not null default 'category',
add column if not exists envelope_id uuid null references public.envelopes(id) on delete cascade,
add column if not exists counterparty_id uuid null references public.counterparties(id) on delete cascade,
add column if not exists debt_id uuid null references public.debts(id) on delete cascade,
add column if not exists goal_id uuid null references public.goals(id) on delete cascade,
add column if not exists wallet_id uuid null references public.wallets(id) on delete cascade;

-- Migrate legacy envelope budgets into envelopes table
do $$
declare
  b_rec record;
  new_env_id uuid;
begin
  for b_rec in select * from public.budgets where type = 'envelope' and envelope_id is null loop
    insert into public.envelopes (user_id, name, note, created_at, updated_at)
    values (b_rec.user_id, b_rec.name, b_rec.note, b_rec.created_at, b_rec.updated_at)
    returning id into new_env_id;

    update public.budgets
    set envelope_id = new_env_id, target_type = 'envelope'
    where id = b_rec.id;
  end loop;
end $$;

-- Update target_type constraint
alter table public.budgets drop constraint if exists budgets_target_type_check;
alter table public.budgets add constraint budgets_target_type_check check (
  target_type in ('category', 'envelope', 'debt', 'goal')
);

alter table public.budgets drop constraint if exists budgets_type_category_check;
alter table public.budgets drop constraint if exists budgets_target_reference_check;
alter table public.budgets add constraint budgets_target_reference_check check (
  (target_type = 'category' and category_id is not null and envelope_id is null and counterparty_id is null and debt_id is null and goal_id is null and wallet_id is null) or
  (target_type = 'envelope' and envelope_id is not null and category_id is null and counterparty_id is null and debt_id is null and goal_id is null and wallet_id is null) or
  (target_type = 'debt' and category_id is null and envelope_id is null and goal_id is null and wallet_id is null) or
  (target_type = 'goal' and (goal_id is not null or wallet_id is not null) and category_id is null and envelope_id is null and counterparty_id is null and debt_id is null)
);

create index if not exists idx_budgets_envelope_target on public.budgets(envelope_id) where envelope_id is not null;
create index if not exists idx_budgets_debt_target on public.budgets(counterparty_id, debt_id) where target_type = 'debt';
create index if not exists idx_budgets_goal_target on public.budgets(goal_id) where goal_id is not null;
create index if not exists idx_budgets_wallet_target on public.budgets(wallet_id) where wallet_id is not null;

-- ------------------------------------------------------------
-- 4. AUTHORITATIVE BUDGET ENGINE PROGRESS & OVERVIEW FUNCTIONS
-- ------------------------------------------------------------

drop function if exists public.get_monthly_budget_progress(date) cascade;
drop function if exists public.get_monthly_budget_overview(date) cascade;
drop function if exists public.create_budget_target(text, text, numeric, date, boolean, boolean, uuid, uuid, uuid, uuid, uuid, text) cascade;

-- Monthly Budget Progress with multi-target calculation
create or replace function public.get_monthly_budget_progress(
  p_period_start date default null
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
        -- 1. Category Target: Sum completed expense transactions matching category
        when ab.b_target_type = 'category' then
          coalesce((
            select sum(t.amount)
            from public.transactions t
            where t.user_id = v_user_id
              and t.type = 'expense'
              and t.status = 'completed'
              and t.category_id = ab.b_category_id
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

-- Monthly Budget Overview with strict ZERO cross-budget double counting
create or replace function public.get_monthly_budget_overview(
  p_period_start date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
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

  if p_period_start is null then
    v_target_period := date_trunc('month', current_date)::date;
  else
    v_target_period := date_trunc('month', p_period_start)::date;
  end if;

  select coalesce(timezone, 'Asia/Jakarta') into v_user_tz
  from public.profiles where id = v_user_id;

  v_target_start_timestamptz := (v_target_period::text || ' 00:00:00')::timestamp at time zone v_user_tz;
  v_target_end_timestamptz := ((v_target_period + interval '1 month')::date::text || ' 00:00:00')::timestamp at time zone v_user_tz;

  -- 1. Calculate Planned Budget Allocations from active budget targets
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
  from public.get_monthly_budget_progress(v_target_period);

  -- 2. Calculate ACTUAL Unique Cash-Flow Outflows (Prevent Cross-Budget Double-Counting)
  -- Actual completed expense transactions
  select coalesce(sum(amount), 0) into v_actual_expenses
  from public.transactions
  where user_id = v_user_id
    and type = 'expense'
    and status = 'completed'
    and transaction_date >= v_target_start_timestamptz
    and transaction_date < v_target_end_timestamptz;

  -- Actual transfer fees
  select coalesce(sum(transfer_fee), 0) into v_actual_transfer_fees
  from public.transactions
  where user_id = v_user_id
    and type = 'transfer'
    and status = 'completed'
    and transaction_date >= v_target_start_timestamptz
    and transaction_date < v_target_end_timestamptz;

  -- Actual debt payments in month
  select coalesce(sum(total_amount), 0) into v_actual_debt_payments
  from public.debt_payments
  where user_id = v_user_id
    and debt_type = 'debt'
    and payment_date >= v_target_start_timestamptz
    and payment_date < v_target_end_timestamptz;

  -- Actual goal contributions in month
  select coalesce(sum(amount), 0) into v_actual_goal_contributions
  from public.goal_contributions
  where user_id = v_user_id
    and contribution_date >= v_target_start_timestamptz
    and contribution_date < v_target_end_timestamptz;

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

-- Helper RPC to create any budget target atomically
create or replace function public.create_budget_target(
  p_name text,
  p_target_type text,
  p_amount numeric,
  p_start_period date,
  p_repeat_monthly boolean default true,
  p_rollover_enabled boolean default false,
  p_category_id uuid default null,
  p_envelope_id uuid default null,
  p_counterparty_id uuid default null,
  p_debt_id uuid default null,
  p_goal_id uuid default null,
  p_wallet_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_budget_id uuid;
  v_norm_period date;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  v_norm_period := date_trunc('month', p_start_period)::date;

  if p_amount <= 0 then
    raise exception 'Nominal budget harus lebih besar dari 0.';
  end if;

  if p_target_type = 'category' and p_category_id is null then
    raise exception 'Kategori pengeluaran wajib dipilih.';
  elsif p_target_type = 'envelope' and p_envelope_id is null then
    raise exception 'Amplop wajib dipilih.';
  elsif p_target_type = 'goal' and p_goal_id is null and p_wallet_id is null then
    raise exception 'Pos Tabungan atau Kantong Tabungan wajib dipilih.';
  end if;

  insert into public.budgets (
    user_id,
    name,
    type,
    target_type,
    category_id,
    envelope_id,
    counterparty_id,
    debt_id,
    goal_id,
    wallet_id,
    start_period,
    repeat_monthly,
    note
  ) values (
    v_user_id,
    trim(p_name),
    case when p_target_type = 'envelope' then 'envelope' else 'category' end,
    p_target_type,
    p_category_id,
    p_envelope_id,
    p_counterparty_id,
    p_debt_id,
    p_goal_id,
    p_wallet_id,
    v_norm_period,
    coalesce(p_repeat_monthly, true),
    trim(p_note)
  ) returning id into v_budget_id;

  insert into public.budget_versions (
    budget_id,
    user_id,
    effective_from_period,
    amount,
    rollover_enabled
  ) values (
    v_budget_id,
    v_user_id,
    v_norm_period,
    p_amount,
    coalesce(p_rollover_enabled, false)
  );

  return v_budget_id;
end;
$$;

grant execute on function public.update_investment_valuation to authenticated;
grant execute on function public.get_monthly_budget_progress to authenticated;
grant execute on function public.get_monthly_budget_overview to authenticated;
grant execute on function public.create_budget_target to authenticated;
