-- KASH Beta Sprint 12: Debt & Receivable Architecture
-- Creates counterparties, debts, debt_payments, debt_payment_allocations, progress views, and atomic settlement function.

create type public.debt_type as enum (
  'debt',
  'receivable'
);

create type public.debt_status as enum (
  'active',
  'partially_paid',
  'settled',
  'cancelled'
);

create type public.payment_mode as enum (
  'wallet',
  'historical'
);

-- 1. Counterparties Table (Minimal Stable Identity)
create table public.counterparties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint counterparties_name_not_blank check (length(trim(name)) > 0)
);

create unique index counterparties_user_normalized_name_uidx
on public.counterparties (
  user_id,
  lower(trim(name))
);

create index counterparties_user_id_idx on public.counterparties(user_id);

-- 2. Debts Table (Individual Obligation Items)
create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  counterparty_id uuid not null references public.counterparties(id) on delete restrict,
  type public.debt_type not null,
  title text not null,
  original_amount numeric(18,2) not null,
  due_date date,
  note text,
  status public.debt_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint debts_title_not_blank check (length(trim(title)) > 0),
  constraint debts_original_amount_positive check (original_amount > 0)
);

create index debts_user_counterparty_idx on public.debts(user_id, counterparty_id, type, status);
create index debts_user_id_idx on public.debts(user_id);
create index debts_counterparty_id_idx on public.debts(counterparty_id);
create index debts_due_date_idx on public.debts(due_date);

-- 3. Debt Payments Table (Settlement Header)
create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  counterparty_id uuid not null references public.counterparties(id) on delete restrict,
  debt_type public.debt_type not null,
  payment_mode public.payment_mode not null,
  total_amount numeric(18,2) not null,
  payment_date timestamptz not null default now(),
  wallet_id uuid references public.wallets(id),
  transaction_id uuid references public.transactions(id),
  note text,
  created_at timestamptz not null default now(),
  constraint debt_payments_amount_positive check (total_amount > 0),
  constraint debt_payments_mode_invariant check (
    (payment_mode = 'wallet' and wallet_id is not null and transaction_id is not null)
    or
    (payment_mode = 'historical' and wallet_id is null and transaction_id is null)
  )
);

create index debt_payments_user_counterparty_idx on public.debt_payments(user_id, counterparty_id, debt_type);
create index debt_payments_transaction_id_idx on public.debt_payments(transaction_id);
create index debt_payments_wallet_id_idx on public.debt_payments(wallet_id);

-- 4. Debt Payment Allocations Table
create table public.debt_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  debt_payment_id uuid not null references public.debt_payments(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  allocated_amount numeric(18,2) not null,
  created_at timestamptz not null default now(),
  constraint debt_payment_allocations_amount_positive check (allocated_amount > 0)
);

create index debt_payment_allocations_debt_id_idx on public.debt_payment_allocations(debt_id);
create index debt_payment_allocations_payment_id_idx on public.debt_payment_allocations(debt_payment_id);
create index debt_payment_allocations_user_id_idx on public.debt_payment_allocations(user_id);

-- 5. Progress View
create or replace view public.debt_progress_view
with (security_invoker = true) as
select
  d.id as debt_id,
  d.user_id,
  d.counterparty_id,
  c.name as counterparty_name,
  d.type,
  d.title,
  d.original_amount,
  d.due_date,
  d.note,
  d.status,
  d.created_at,
  d.updated_at,
  coalesce(sum(dpa.allocated_amount), 0)::numeric(18,2) as total_paid,
  case
    when d.status = 'cancelled' then 0::numeric(18,2)
    else greatest(d.original_amount - coalesce(sum(dpa.allocated_amount), 0), 0)::numeric(18,2)
  end as remaining_amount,
  case
    when d.original_amount > 0 then least((coalesce(sum(dpa.allocated_amount), 0) / d.original_amount) * 100, 100)::numeric(5,2)
    else 0::numeric(5,2)
  end as percentage
from public.debts d
join public.counterparties c on c.id = d.counterparty_id
left join public.debt_payment_allocations dpa on dpa.debt_id = d.id
group by d.id, c.name;

-- 6. Counterparty Summary View
create or replace view public.counterparty_summary_view
with (security_invoker = true) as
with item_totals as (
  select
    d.user_id,
    d.counterparty_id,
    d.type as debt_type,
    coalesce(sum(d.original_amount), 0)::numeric(18,2) as total_original,
    coalesce(sum(dpv.total_paid), 0)::numeric(18,2) as total_paid,
    coalesce(sum(dpv.remaining_amount), 0)::numeric(18,2) as remaining_amount,
    count(case when d.status in ('active', 'partially_paid') then 1 end)::int as active_item_count,
    count(case when d.status = 'settled' then 1 end)::int as settled_item_count,
    count(d.id)::int as total_item_count
  from public.debts d
  join public.debt_progress_view dpv on dpv.debt_id = d.id
  group by d.user_id, d.counterparty_id, d.type
)
select
  c.id as counterparty_id,
  c.user_id,
  c.name as counterparty_name,
  t.debt_type,
  coalesce(t.total_original, 0)::numeric(18,2) as total_original,
  coalesce(t.total_paid, 0)::numeric(18,2) as total_paid,
  coalesce(t.remaining_amount, 0)::numeric(18,2) as remaining_amount,
  coalesce(t.active_item_count, 0)::int as active_item_count,
  coalesce(t.settled_item_count, 0)::int as settled_item_count,
  coalesce(t.total_item_count, 0)::int as total_item_count,
  c.created_at,
  c.updated_at
from public.counterparties c
left join item_totals t on t.counterparty_id = c.id;

-- 7. Atomic Counterparty Settlement Function
create or replace function public.record_counterparty_settlement(
  p_counterparty_id uuid,
  p_debt_type public.debt_type,
  p_payment_mode public.payment_mode,
  p_amount numeric,
  p_wallet_id uuid default null,
  p_payment_date timestamptz default now(),
  p_note text default null
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_user_id uuid;
  v_counterparty record;
  v_wallet record;
  v_payment_id uuid;
  v_transaction_id uuid;
  v_total_outstanding numeric(18,2) := 0;
  v_remaining_payment numeric(18,2);
  v_debt record;
  v_item_allocated numeric(18,2);
  v_item_paid numeric(18,2);
  v_item_remaining numeric(18,2);
  v_alloc_amount numeric(18,2);
  v_alloc_count int := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  -- Validate counterparty
  select * into v_counterparty
  from public.counterparties
  where id = p_counterparty_id and user_id = v_user_id;

  if not found then
    raise exception 'Counterparty not found or does not belong to you.';
  end if;

  -- Validate wallet if wallet mode
  if p_payment_mode = 'wallet' then
    if p_wallet_id is null then
      raise exception 'Wallet is required for wallet settlement.';
    end if;

    select * into v_wallet
    from public.wallets
    where id = p_wallet_id and user_id = v_user_id and is_archived = false;

    if not found then
      raise exception 'Selected wallet not found or is archived.';
    end if;
  else
    if p_wallet_id is not null then
      raise exception 'Wallet must not be specified for historical settlement.';
    end if;
  end if;

  -- Lock relevant open debt items and calculate total outstanding
  -- Deterministic ordering:
  -- 1. Items with due_date first
  -- 2. Earliest due_date ascending
  -- 3. Oldest created_at ascending
  -- 4. Stable id ascending
  drop table if exists temp_open_debts;
  create temporary table temp_open_debts on commit drop as
  select
    d.id,
    d.original_amount,
    d.due_date,
    d.created_at,
    coalesce((
      select sum(dpa.allocated_amount)
      from public.debt_payment_allocations dpa
      where dpa.debt_id = d.id
    ), 0)::numeric(18,2) as current_paid,
    greatest(d.original_amount - coalesce((
      select sum(dpa.allocated_amount)
      from public.debt_payment_allocations dpa
      where dpa.debt_id = d.id
    ), 0), 0)::numeric(18,2) as current_remaining
  from public.debts d
  where d.user_id = v_user_id
    and d.counterparty_id = p_counterparty_id
    and d.type = p_debt_type
    and d.status in ('active', 'partially_paid')
  order by
    case when d.due_date is not null then 0 else 1 end asc,
    d.due_date asc nulls last,
    d.created_at asc,
    d.id asc
  for update;

  select coalesce(sum(current_remaining), 0) into v_total_outstanding
  from temp_open_debts;

  if v_total_outstanding <= 0 then
    raise exception 'No outstanding balance exists for this counterparty and type.';
  end if;

  if p_amount > v_total_outstanding then
    raise exception 'Payment amount exceeds total outstanding balance of %.', v_total_outstanding;
  end if;

  -- Pre-generate payment header UUID
  v_payment_id := gen_random_uuid();

  -- If wallet mode, create the signed adjustment ledger transaction
  if p_payment_mode = 'wallet' then
    insert into public.transactions (
      user_id,
      type,
      amount,
      wallet_id,
      destination_wallet_id,
      transfer_fee,
      transaction_date,
      title,
      note,
      status,
      related_entity_type,
      related_entity_id
    ) values (
      v_user_id,
      'adjustment',
      case when p_debt_type = 'debt' then -p_amount else p_amount end,
      p_wallet_id,
      null,
      0,
      p_payment_date,
      case
        when p_debt_type = 'debt' then 'Debt Payment: ' || v_counterparty.name
        else 'Receivable Collection: ' || v_counterparty.name
      end,
      p_note,
      'completed',
      case when p_debt_type = 'debt' then 'debt_payment' else 'receivable_payment' end,
      v_payment_id
    ) returning id into v_transaction_id;
  end if;

  -- Insert payment header satisfying the invariant
  insert into public.debt_payments (
    id,
    user_id,
    counterparty_id,
    debt_type,
    payment_mode,
    total_amount,
    payment_date,
    wallet_id,
    transaction_id,
    note
  ) values (
    v_payment_id,
    v_user_id,
    p_counterparty_id,
    p_debt_type,
    p_payment_mode,
    p_amount,
    p_payment_date,
    p_wallet_id,
    v_transaction_id,
    p_note
  );

  -- Deterministically allocate across open items
  v_remaining_payment := p_amount;

  for v_debt in (
    select * from temp_open_debts where current_remaining > 0
    order by
      case when due_date is not null then 0 else 1 end asc,
      due_date asc nulls last,
      created_at asc,
      id asc
  ) loop
    if v_remaining_payment <= 0 then
      exit;
    end if;

    v_alloc_amount := least(v_debt.current_remaining, v_remaining_payment);

    insert into public.debt_payment_allocations (
      debt_payment_id,
      debt_id,
      user_id,
      allocated_amount
    ) values (
      v_payment_id,
      v_debt.id,
      v_user_id,
      v_alloc_amount
    );

    v_remaining_payment := v_remaining_payment - v_alloc_amount;
    v_alloc_count := v_alloc_count + 1;

    -- Update debt status
    if (v_debt.current_paid + v_alloc_amount) >= v_debt.original_amount then
      update public.debts
      set status = 'settled', updated_at = now()
      where id = v_debt.id;
    else
      update public.debts
      set status = 'partially_paid', updated_at = now()
      where id = v_debt.id;
    end if;
  end loop;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'transaction_id', v_transaction_id,
    'allocated_count', v_alloc_count,
    'total_amount', p_amount,
    'remaining_counterparty_outstanding', greatest(v_total_outstanding - p_amount, 0)
  );
end;
$$;

-- 8. Row Level Security Policies
alter table public.counterparties enable row level security;
alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;
alter table public.debt_payment_allocations enable row level security;

create policy "Users can manage own counterparties"
on public.counterparties
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own debts"
on public.debts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own debt payments"
on public.debt_payments
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own debt payment allocations"
on public.debt_payment_allocations
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
