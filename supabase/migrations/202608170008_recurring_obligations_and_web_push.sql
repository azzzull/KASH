-- ============================================================
-- KASH BETA SPRINT 14: Recurring Obligations & PWA Web Push
-- Tables: public.recurring_obligations, public.recurring_payments,
--         public.push_subscriptions, public.notification_reminder_logs
-- Functions: Atomic payments, early settlement, cancellation,
--            scheduler processor, push subscription management
-- ============================================================

-- 1. Ensure timezone field exists on profiles
alter table public.profiles
add column if not exists timezone text not null default 'Asia/Jakarta';

-- 2. Create Recurring Obligations Table
create table if not exists public.recurring_obligations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('subscription', 'bill', 'paylater', 'installment')),
  name text not null check (length(trim(name)) > 0),
  provider text null,
  amount numeric(18,2) not null check (amount > 0),
  category_id uuid null references public.categories(id) on delete set null,
  frequency text not null default 'monthly' check (frequency in ('monthly', 'yearly', 'weekly', 'quarterly')),
  billing_day integer null check (billing_day between 1 and 31),
  start_date date not null,
  end_date date null,
  next_due_date date null,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled', 'completed')),
  default_wallet_id uuid null references public.wallets(id) on delete set null,
  reminder_offsets integer[] not null default '{7,3,1,0}'::integer[],
  overdue_reminder_enabled boolean not null default true,
  installment_total_amount numeric(18,2) null check (installment_total_amount is null or installment_total_amount > 0),
  installment_count integer null check (installment_count is null or installment_count > 0),
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recurring_obligations_type_check'
  ) then
    alter table public.recurring_obligations
    add constraint recurring_obligations_type_check check (
      (type in ('subscription', 'bill')) or
      (type in ('paylater', 'installment') and installment_count is not null and installment_total_amount is not null)
    );
  end if;
end $$;

-- 3. Create Recurring Payments Table (Occurrences & Payment History)
create table if not exists public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  obligation_id uuid not null references public.recurring_obligations(id) on delete restrict,
  due_date date not null,
  amount numeric(18,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue', 'skipped')),
  paid_at timestamptz null,
  payment_mode text null check (payment_mode in ('wallet', 'historical')),
  wallet_id uuid null references public.wallets(id) on delete set null,
  transaction_id uuid null references public.transactions(id) on delete set null,
  installment_number integer null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recurring_payments_paid_state_invariant'
  ) then
    alter table public.recurring_payments
    add constraint recurring_payments_paid_state_invariant check (
      (status = 'paid' and payment_mode = 'wallet' and wallet_id is not null and transaction_id is not null and paid_at is not null) or
      (status = 'paid' and payment_mode = 'historical' and wallet_id is null and transaction_id is null and paid_at is not null) or
      (status in ('pending', 'overdue', 'skipped') and paid_at is null and payment_mode is null and wallet_id is null and transaction_id is null)
    );
  end if;
end $$;

-- 4. Create Push Subscriptions Table
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  device_label text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz null
);

-- 5. Create Notification Reminder Deduplication Table
create table if not exists public.notification_reminder_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  obligation_id uuid not null references public.recurring_obligations(id) on delete cascade,
  payment_id uuid not null references public.recurring_payments(id) on delete cascade,
  reminder_offset integer not null, -- 7, 3, 1, 0, or -1 for overdue
  due_date date not null,
  notification_id uuid null references public.notifications(id) on delete set null,
  sent_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uq_notification_reminder'
  ) then
    alter table public.notification_reminder_logs
    add constraint uq_notification_reminder unique (payment_id, reminder_offset, due_date);
  end if;
end $$;

-- 6. Indexes for Performance
create index if not exists idx_recurring_obligations_user on public.recurring_obligations(user_id, status);
create index if not exists idx_recurring_obligations_due on public.recurring_obligations(user_id, next_due_date) where status = 'active';
create index if not exists idx_recurring_payments_obligation on public.recurring_payments(obligation_id, due_date asc);
create index if not exists idx_recurring_payments_user_due on public.recurring_payments(user_id, status, due_date asc);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id, is_active);
create index if not exists idx_reminder_logs_dedup on public.notification_reminder_logs(payment_id, reminder_offset, due_date);

-- 7. Helper: Safe Next Billing Date Calculation with Month-End Clamp
create or replace function public.calculate_next_billing_date(
  p_current_due date,
  p_frequency text,
  p_billing_day integer default null
)
returns date
language plpgsql
immutable
as $$
declare
  v_target_month_date date;
  v_target_year integer;
  v_target_month integer;
  v_day integer;
  v_days_in_month integer;
begin
  if p_frequency = 'weekly' then
    return p_current_due + interval '7 days';
  elsif p_frequency = 'yearly' then
    return p_current_due + interval '1 year';
  elsif p_frequency = 'quarterly' then
    v_target_month_date := p_current_due + interval '3 months';
  else -- default monthly
    v_target_month_date := p_current_due + interval '1 month';
  end if;

  v_target_year := extract(year from v_target_month_date)::integer;
  v_target_month := extract(month from v_target_month_date)::integer;
  v_day := coalesce(p_billing_day, extract(day from p_current_due)::integer);

  -- Calculate number of days in the target month (1st of next month - 1 day)
  v_days_in_month := extract(day from (
    date_trunc('month', make_date(v_target_year, v_target_month, 1)) + interval '1 month' - interval '1 day'
  ))::integer;

  -- Clamp day to valid month range (e.g. 31 Jan -> 28 Feb)
  return make_date(v_target_year, v_target_month, least(v_day, v_days_in_month));
end;
$$;

-- 8. View: Authoritative Summary View for Recurring Obligations
create or replace view public.recurring_obligations_summary_view
with (security_invoker = true) as
select
  o.*,
  coalesce(count(p.id) filter (where p.status = 'paid'), 0)::integer as paid_count,
  case
    when o.type in ('paylater', 'installment') then
      greatest(coalesce(o.installment_count, 0) - coalesce(count(p.id) filter (where p.status = 'paid'), 0), 0)::integer
    else 0
  end as remaining_count,
  coalesce(sum(p.amount) filter (where p.status = 'paid'), 0)::numeric(18,2) as total_paid_amount,
  case
    when o.type in ('paylater', 'installment') then
      greatest(coalesce(o.installment_total_amount, 0) - coalesce(sum(p.amount) filter (where p.status = 'paid'), 0), 0)::numeric(18,2)
    else 0
  end as remaining_amount,
  case
    when o.type in ('paylater', 'installment') and coalesce(o.installment_count, 0) > 0 then
      round((coalesce(count(p.id) filter (where p.status = 'paid'), 0)::numeric / o.installment_count::numeric) * 100, 2)
    else 0
  end as progress_percentage
from public.recurring_obligations o
left join public.recurring_payments p on p.obligation_id = o.id
group by o.id;

-- 9. Row Level Security (RLS)
alter table public.recurring_obligations enable row level security;
alter table public.recurring_payments enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_reminder_logs enable row level security;

-- Policies for recurring_obligations
drop policy if exists "Users can view own recurring obligations" on public.recurring_obligations;
create policy "Users can view own recurring obligations"
on public.recurring_obligations for select
using (auth.uid() = user_id);

drop policy if exists "Users can update metadata of own recurring obligations" on public.recurring_obligations;
create policy "Users can update metadata of own recurring obligations"
on public.recurring_obligations for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own recurring obligations without payment history" on public.recurring_obligations;
create policy "Users can delete own recurring obligations without payment history"
on public.recurring_obligations for delete
using (
  auth.uid() = user_id and
  not exists (select 1 from public.recurring_payments where obligation_id = id)
);

-- Policies for recurring_payments (Client read-only; modified via trusted RPCs)
drop policy if exists "Users can view own recurring payments" on public.recurring_payments;
create policy "Users can view own recurring payments"
on public.recurring_payments for select
using (auth.uid() = user_id);

-- Policies for push_subscriptions (Client manages own device subscriptions)
drop policy if exists "Users can view own push subscriptions" on public.push_subscriptions;
create policy "Users can view own push subscriptions"
on public.push_subscriptions for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own push subscriptions" on public.push_subscriptions;
create policy "Users can insert own push subscriptions"
on public.push_subscriptions for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own push subscriptions" on public.push_subscriptions;
create policy "Users can update own push subscriptions"
on public.push_subscriptions for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own push subscriptions" on public.push_subscriptions;
create policy "Users can delete own push subscriptions"
on public.push_subscriptions for delete
using (auth.uid() = user_id);

-- Policies for notification_reminder_logs (Read-only for user)
drop policy if exists "Users can view own reminder logs" on public.notification_reminder_logs;
create policy "Users can view own reminder logs"
on public.notification_reminder_logs for select
using (auth.uid() = user_id);

-- 10. RPC: Create Recurring Obligation with Initial History
create or replace function public.create_recurring_obligation(
  p_type text,
  p_name text,
  p_amount numeric,
  p_start_date date,
  p_frequency text default 'monthly',
  p_provider text default null,
  p_category_id uuid default null,
  p_default_wallet_id uuid default null,
  p_reminder_offsets integer[] default '{7,3,1,0}'::integer[],
  p_overdue_reminder_enabled boolean default true,
  p_installment_total_amount numeric default null,
  p_installment_count integer default null,
  p_already_paid_count integer default 0,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_obligation_id uuid;
  v_billing_day integer;
  v_first_due_date date;
  v_i integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  v_billing_day := extract(day from p_start_date)::integer;
  v_first_due_date := p_start_date;

  -- Create obligation record
  insert into public.recurring_obligations (
    user_id,
    type,
    name,
    provider,
    amount,
    category_id,
    frequency,
    billing_day,
    start_date,
    next_due_date,
    status,
    default_wallet_id,
    reminder_offsets,
    overdue_reminder_enabled,
    installment_total_amount,
    installment_count,
    note
  ) values (
    v_user_id,
    p_type,
    p_name,
    p_provider,
    p_amount,
    p_category_id,
    p_frequency,
    v_billing_day,
    p_start_date,
    v_first_due_date,
    'active',
    p_default_wallet_id,
    coalesce(p_reminder_offsets, '{7,3,1,0}'::integer[]),
    coalesce(p_overdue_reminder_enabled, true),
    p_installment_total_amount,
    p_installment_count,
    p_note
  ) returning id into v_obligation_id;

  -- If installment with already paid occurrences, insert auditable historical payments
  if p_type in ('paylater', 'installment') and coalesce(p_already_paid_count, 0) > 0 then
    for v_i in 1..least(p_already_paid_count, p_installment_count) loop
      insert into public.recurring_payments (
        user_id,
        obligation_id,
        due_date,
        amount,
        status,
        paid_at,
        payment_mode,
        installment_number,
        note
      ) values (
        v_user_id,
        v_obligation_id,
        p_start_date - ((p_already_paid_count - v_i + 1) * interval '1 month')::interval,
        p_amount,
        'paid',
        now(),
        'historical',
        v_i,
        'Initial historical record'
      );
    end loop;

    -- If all installments were already paid
    if p_already_paid_count >= p_installment_count then
      update public.recurring_obligations
      set status = 'completed', next_due_date = null
      where id = v_obligation_id;
      return v_obligation_id;
    end if;
  end if;

  -- Generate initial pending payment occurrence
  insert into public.recurring_payments (
    user_id,
    obligation_id,
    due_date,
    amount,
    status,
    installment_number,
    note
  ) values (
    v_user_id,
    v_obligation_id,
    v_first_due_date,
    p_amount,
    'pending',
    case when p_type in ('paylater', 'installment') then coalesce(p_already_paid_count, 0) + 1 else null end,
    null
  );

  return v_obligation_id;
end;
$$;

-- 11. RPC: Record Recurring Payment (Wallet / Historical)
create or replace function public.record_recurring_payment(
  p_payment_id uuid,
  p_payment_mode text,
  p_wallet_id uuid default null,
  p_paid_at timestamptz default now(),
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_payment record;
  v_obligation record;
  v_wallet record;
  v_transaction_id uuid := null;
  v_next_due date;
  v_paid_count integer;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  -- Lock payment occurrence
  select * into v_payment
  from public.recurring_payments
  where id = p_payment_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Payment occurrence not found or not owned by you.';
  end if;

  if v_payment.status = 'paid' then
    raise exception 'This payment has already been marked as paid.';
  end if;

  -- Lock obligation
  select * into v_obligation
  from public.recurring_obligations
  where id = v_payment.obligation_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Associated obligation not found.';
  end if;

  -- Validate wallet if wallet mode
  if p_payment_mode = 'wallet' then
    if p_wallet_id is null then
      raise exception 'Wallet is required for wallet payment.';
    end if;

    select * into v_wallet
    from public.wallets
    where id = p_wallet_id and user_id = v_user_id and is_archived = false;

    if not found then
      raise exception 'Selected wallet not found or is archived.';
    end if;

    -- Create Expense Transaction
    insert into public.transactions (
      user_id,
      type,
      amount,
      wallet_id,
      category_id,
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
      'expense',
      v_payment.amount,
      p_wallet_id,
      v_obligation.category_id,
      null,
      0,
      p_paid_at,
      case
        when v_obligation.provider is not null and length(trim(v_obligation.provider)) > 0
          then v_obligation.name || ' (' || v_obligation.provider || ')'
        else v_obligation.name
      end,
      coalesce(p_note, v_payment.note),
      'completed',
      'recurring_payment',
      v_payment.id
    ) returning id into v_transaction_id;
  end if;

  -- Mark current occurrence as paid
  update public.recurring_payments
  set
    status = 'paid',
    paid_at = coalesce(p_paid_at, now()),
    payment_mode = p_payment_mode,
    wallet_id = case when p_payment_mode = 'wallet' then p_wallet_id else null end,
    transaction_id = v_transaction_id,
    note = coalesce(p_note, note),
    updated_at = now()
  where id = v_payment.id;

  -- Calculate paid installments count
  select count(*) into v_paid_count
  from public.recurring_payments
  where obligation_id = v_obligation.id and status = 'paid';

  -- Handle Installment completion or next cycle
  if v_obligation.type in ('paylater', 'installment') then
    if v_paid_count >= v_obligation.installment_count then
      update public.recurring_obligations
      set status = 'completed', next_due_date = null, updated_at = now()
      where id = v_obligation.id;
    else
      v_next_due := public.calculate_next_billing_date(v_payment.due_date, v_obligation.frequency, v_obligation.billing_day);
      update public.recurring_obligations
      set next_due_date = v_next_due, updated_at = now()
      where id = v_obligation.id;

      -- Generate next pending installment occurrence
      insert into public.recurring_payments (
        user_id,
        obligation_id,
        due_date,
        amount,
        status,
        installment_number
      ) values (
        v_user_id,
        v_obligation.id,
        v_next_due,
        v_obligation.amount,
        'pending',
        v_paid_count + 1
      );
    end if;
  else
    -- Subscription / Bill: Advance next due date and generate next occurrence
    if v_obligation.status = 'active' then
      v_next_due := public.calculate_next_billing_date(v_payment.due_date, v_obligation.frequency, v_obligation.billing_day);
      update public.recurring_obligations
      set next_due_date = v_next_due, updated_at = now()
      where id = v_obligation.id;

      insert into public.recurring_payments (
        user_id,
        obligation_id,
        due_date,
        amount,
        status
      ) values (
        v_user_id,
        v_obligation.id,
        v_next_due,
        v_obligation.amount,
        'pending'
      );
    end if;
  end if;

  v_result := jsonb_build_object(
    'success', true,
    'payment_id', v_payment.id,
    'transaction_id', v_transaction_id,
    'paid_count', v_paid_count,
    'next_due_date', v_next_due
  );

  return v_result;
end;
$$;

-- 12. RPC: Early Settlement for Installment / PayLater
create or replace function public.settle_remaining_installment(
  p_obligation_id uuid,
  p_payment_mode text,
  p_wallet_id uuid default null,
  p_paid_at timestamptz default now(),
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_obligation record;
  v_wallet record;
  v_paid_count integer;
  v_remaining_count integer;
  v_settle_amount numeric(18,2);
  v_transaction_id uuid := null;
  v_payment_id uuid;
  v_i integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_obligation
  from public.recurring_obligations
  where id = p_obligation_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Obligation not found.';
  end if;

  if v_obligation.type not in ('paylater', 'installment') then
    raise exception 'Early settlement is only applicable to installments and paylater obligations.';
  end if;

  if v_obligation.status = 'completed' then
    raise exception 'This obligation has already been completed.';
  end if;

  select count(*) into v_paid_count
  from public.recurring_payments
  where obligation_id = v_obligation.id and status = 'paid';

  v_remaining_count := greatest(v_obligation.installment_count - v_paid_count, 0);

  if v_remaining_count <= 0 then
    update public.recurring_obligations
    set status = 'completed', next_due_date = null, updated_at = now()
    where id = v_obligation.id;
    return jsonb_build_object('success', true, 'message', 'Already completed');
  end if;

  v_settle_amount := v_remaining_count * v_obligation.amount;

  -- If wallet mode, create ONE Expense transaction for full remaining settlement
  if p_payment_mode = 'wallet' then
    if p_wallet_id is null then
      raise exception 'Wallet is required for settlement.';
    end if;

    select * into v_wallet
    from public.wallets
    where id = p_wallet_id and user_id = v_user_id and is_archived = false;

    if not found then
      raise exception 'Wallet not found or is archived.';
    end if;

    insert into public.transactions (
      user_id,
      type,
      amount,
      wallet_id,
      category_id,
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
      'expense',
      v_settle_amount,
      p_wallet_id,
      v_obligation.category_id,
      null,
      0,
      p_paid_at,
      'Early Settlement: ' || v_obligation.name,
      coalesce(p_note, 'Early settlement for remaining ' || v_remaining_count || ' installments'),
      'completed',
      'recurring_obligation',
      v_obligation.id
    ) returning id into v_transaction_id;
  end if;

  -- Delete any open pending occurrences to re-insert full remaining paid records
  delete from public.recurring_payments
  where obligation_id = v_obligation.id and status in ('pending', 'overdue');

  -- Insert all remaining paid records
  for v_i in (v_paid_count + 1)..v_obligation.installment_count loop
    insert into public.recurring_payments (
      user_id,
      obligation_id,
      due_date,
      amount,
      status,
      paid_at,
      payment_mode,
      wallet_id,
      transaction_id,
      installment_number,
      note
    ) values (
      v_user_id,
      v_obligation.id,
      coalesce(v_obligation.next_due_date, v_obligation.start_date),
      v_obligation.amount,
      'paid',
      coalesce(p_paid_at, now()),
      p_payment_mode,
      case when p_payment_mode = 'wallet' then p_wallet_id else null end,
      v_transaction_id,
      v_i,
      'Early settlement'
    );
  end loop;

  -- Mark obligation as completed
  update public.recurring_obligations
  set status = 'completed', next_due_date = null, updated_at = now()
  where id = v_obligation.id;

  return jsonb_build_object(
    'success', true,
    'settled_count', v_remaining_count,
    'total_settled_amount', v_settle_amount,
    'transaction_id', v_transaction_id
  );
end;
$$;

-- 13. RPC: Cancel Subscription / Bill (Blocks Installment Cancellation)
create or replace function public.cancel_recurring_obligation(
  p_obligation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_obligation record;
  v_paid_count integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_obligation
  from public.recurring_obligations
  where id = p_obligation_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Obligation not found.';
  end if;

  if v_obligation.type in ('paylater', 'installment') then
    select count(*) into v_paid_count
    from public.recurring_payments
    where obligation_id = v_obligation.id and status = 'paid';

    if v_paid_count < v_obligation.installment_count then
      raise exception 'Installments and PayLater obligations cannot be cancelled while remaining unpaid balances exist. Use Early Settlement instead.';
    end if;
  end if;

  -- Cancel future recurrence and stop future reminders
  update public.recurring_obligations
  set status = 'cancelled', next_due_date = null, updated_at = now()
  where id = v_obligation.id;
end;
$$;

-- 14. RPC: Upsert Push Subscription
create or replace function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null,
  p_device_label text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  insert into public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    device_label,
    is_active,
    last_used_at,
    updated_at
  ) values (
    v_user_id,
    p_endpoint,
    p_p256dh,
    p_auth,
    p_user_agent,
    p_device_label,
    true,
    now(),
    now()
  )
  on conflict (endpoint) do update
  set
    user_id = v_user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = coalesce(excluded.user_agent, push_subscriptions.user_agent),
    device_label = coalesce(excluded.device_label, push_subscriptions.device_label),
    is_active = true,
    last_used_at = now(),
    updated_at = now();
end;
$$;

-- 15. RPC: Scheduled Reminder Processor with Strict Deduplication
create or replace function public.process_recurring_reminders(
  p_current_date date default null
)
returns table (
  notification_id uuid,
  user_id uuid,
  title text,
  message text,
  target_path text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment record;
  v_offset integer;
  v_days_diff integer;
  v_notif_type text;
  v_title text;
  v_message text;
  v_target_path text;
  v_notif_id uuid;
  v_user_today date;
begin
  -- Loop through active obligations and their open (pending/overdue) payments
  for v_payment in
    select
      p.id as payment_id,
      p.user_id,
      p.due_date,
      p.amount,
      p.installment_number,
      o.id as obligation_id,
      o.name as obligation_name,
      o.provider,
      o.type as obligation_type,
      o.reminder_offsets,
      o.overdue_reminder_enabled,
      coalesce(prof.timezone, 'Asia/Jakarta') as user_timezone
    from public.recurring_payments p
    join public.recurring_obligations o on o.id = p.obligation_id
    join public.profiles prof on prof.id = p.user_id
    where o.status = 'active'
      and p.status in ('pending', 'overdue')
  loop
    -- Calculate user local current date based on their profile timezone or supplied override date
    v_user_today := coalesce(p_current_date, (now() at time zone v_payment.user_timezone)::date);
    v_days_diff := (v_payment.due_date - v_user_today);

    -- Check configured upcoming reminder offsets (e.g. 7, 3, 1, 0)
    if v_payment.reminder_offsets is not null then
      foreach v_offset in array v_payment.reminder_offsets loop
        if v_days_diff = v_offset then
          -- Attempt to claim reminder atomically via unique constraint
          begin
            insert into public.notification_reminder_logs (
              user_id,
              obligation_id,
              payment_id,
              reminder_offset,
              due_date
            ) values (
              v_payment.user_id,
              v_payment.obligation_id,
              v_payment.payment_id,
              v_offset,
              v_payment.due_date
            );

            -- Determine notification content
            if v_offset = 0 then
              if v_payment.obligation_type in ('paylater', 'installment') then
                v_notif_type := 'installment_due_today';
                v_title := 'Installment due today';
                v_message := v_payment.obligation_name || ' (Rp' || to_char(v_payment.amount, 'FM999,999,999,999') || ') is due today.';
              else
                v_notif_type := 'subscription_due_today';
                v_title := 'Subscription due today';
                v_message := v_payment.obligation_name || ' (Rp' || to_char(v_payment.amount, 'FM999,999,999,999') || ') is due today.';
              end if;
            else
              if v_payment.obligation_type in ('paylater', 'installment') then
                v_notif_type := 'installment_due_soon';
                v_title := 'Installment due soon';
                v_message := v_payment.obligation_name || ' (Rp' || to_char(v_payment.amount, 'FM999,999,999,999') || ') is due in ' || v_offset || ' days.';
              else
                v_notif_type := 'subscription_due_soon';
                v_title := 'Subscription due soon';
                v_message := v_payment.obligation_name || ' (Rp' || to_char(v_payment.amount, 'FM999,999,999,999') || ') is due in ' || v_offset || ' days.';
              end if;
            end if;

            v_target_path := '/subscriptions/' || v_payment.obligation_id;

            -- Create in-app notification record
            v_notif_id := public.create_notification(
              v_payment.user_id,
              v_notif_type,
              v_title,
              v_message,
              'recurring_obligation',
              v_payment.obligation_id,
              jsonb_build_object(
                'obligation_id', v_payment.obligation_id,
                'payment_id', v_payment.payment_id,
                'amount', v_payment.amount,
                'due_date', v_payment.due_date,
                'target_path', v_target_path
              )
            );

            -- Update log with created notification ID
            update public.notification_reminder_logs
            set notification_id = v_notif_id
            where payment_id = v_payment.payment_id and reminder_offset = v_offset and due_date = v_payment.due_date;

            notification_id := v_notif_id;
            user_id := v_payment.user_id;
            title := v_title;
            message := v_message;
            target_path := v_target_path;
            return next;

          exception when unique_violation then
            -- Already sent, ignore deduplicated reminder
            null;
          end;
        end if;
      end loop;
    end if;

    -- Check overdue reminder if enabled
    if v_payment.overdue_reminder_enabled and v_days_diff < 0 then
      begin
        insert into public.notification_reminder_logs (
          user_id,
          obligation_id,
          payment_id,
          reminder_offset,
          due_date
        ) values (
          v_payment.user_id,
          v_payment.obligation_id,
          v_payment.payment_id,
          -1, -- Overdue offset
          v_payment.due_date
        );

        if v_payment.obligation_type in ('paylater', 'installment') then
          v_notif_type := 'installment_overdue';
          v_title := 'Installment overdue';
          v_message := v_payment.obligation_name || ' was due on ' || to_char(v_payment.due_date, 'DD Mon YYYY') || '.';
        else
          v_notif_type := 'subscription_overdue';
          v_title := 'Payment overdue';
          v_message := v_payment.obligation_name || ' was due on ' || to_char(v_payment.due_date, 'DD Mon YYYY') || '.';
        end if;

        v_target_path := '/subscriptions/' || v_payment.obligation_id;

        v_notif_id := public.create_notification(
          v_payment.user_id,
          v_notif_type,
          v_title,
          v_message,
          'recurring_obligation',
          v_payment.obligation_id,
          jsonb_build_object(
            'obligation_id', v_payment.obligation_id,
            'payment_id', v_payment.payment_id,
            'amount', v_payment.amount,
            'due_date', v_payment.due_date,
            'target_path', v_target_path
          )
        );

        update public.notification_reminder_logs
        set notification_id = v_notif_id
        where payment_id = v_payment.payment_id and reminder_offset = -1 and due_date = v_payment.due_date;

        notification_id := v_notif_id;
        user_id := v_payment.user_id;
        title := v_title;
        message := v_message;
        target_path := v_target_path;
        return next;

      exception when unique_violation then
        -- Already logged, do not spam
        null;
      end;
    end if;

  end loop;
end;
$$;

-- 16. Grant Execution Permissions on Client RPCs
grant execute on function public.create_recurring_obligation(text, text, numeric, date, text, text, uuid, uuid, integer[], boolean, numeric, integer, integer, text) to authenticated;
grant execute on function public.record_recurring_payment(uuid, text, uuid, timestamptz, text) to authenticated;
grant execute on function public.settle_remaining_installment(uuid, text, uuid, timestamptz, text) to authenticated;
grant execute on function public.cancel_recurring_obligation(uuid) to authenticated;
grant execute on function public.upsert_push_subscription(text, text, text, text, text) to authenticated;
grant execute on function public.process_recurring_reminders(date) to authenticated, service_role;
