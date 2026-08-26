-- ============================================================
-- KASH REFINEMENT BATCH MIGRATION
-- 1. Specific Debt / Receivable Settlement (p_debt_id)
-- 2. Notification Push Deliveries & Immediate Server-side Push Dispatcher
-- ============================================================

-- ============================================================
-- 1. DEBT / RECEIVABLE SETTLEMENT WITH SPECIFIC ITEM SUPPORT
-- ============================================================

create or replace function public.record_counterparty_settlement(
  p_counterparty_id uuid,
  p_debt_type public.debt_type,
  p_payment_mode public.payment_mode,
  p_amount numeric,
  p_wallet_id uuid default null,
  p_payment_date timestamptz default now(),
  p_note text default null,
  p_debt_id uuid default null
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
  v_specific_debt record;
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

  -- If a specific item is chosen:
  if p_debt_id is not null then
    select
      d.id,
      d.title,
      d.original_amount,
      d.status,
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
    into v_specific_debt
    from public.debts d
    where d.id = p_debt_id
      and d.user_id = v_user_id
      and d.counterparty_id = p_counterparty_id
      and d.type = p_debt_type
      and d.status in ('active', 'partially_paid')
    for update;

    if not found or v_specific_debt.current_remaining <= 0 then
      raise exception 'Selected obligation item not found or already fully settled.';
    end if;

    if p_amount > v_specific_debt.current_remaining then
      raise exception 'Payment amount exceeds the remaining balance of % for "%".', v_specific_debt.current_remaining, v_specific_debt.title;
    end if;

    -- Generate payment header UUID
    v_payment_id := gen_random_uuid();

    -- Ledger transaction if wallet mode
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
          when p_debt_type = 'debt' then 'Debt Payment: ' || v_counterparty.name || ' (' || v_specific_debt.title || ')'
          else 'Receivable Collection: ' || v_counterparty.name || ' (' || v_specific_debt.title || ')'
        end,
        p_note,
        'completed',
        case when p_debt_type = 'debt' then 'debt_payment' else 'receivable_payment' end,
        v_payment_id
      ) returning id into v_transaction_id;
    end if;

    -- Insert payment header
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

    -- Insert specific allocation
    insert into public.debt_payment_allocations (
      debt_payment_id,
      debt_id,
      user_id,
      allocated_amount
    ) values (
      v_payment_id,
      v_specific_debt.id,
      v_user_id,
      p_amount
    );

    -- Update specific debt item status
    if (v_specific_debt.current_remaining - p_amount) = 0 then
      update public.debts
      set status = 'settled', updated_at = now()
      where id = v_specific_debt.id;
    else
      update public.debts
      set status = 'partially_paid', updated_at = now()
      where id = v_specific_debt.id;
    end if;

    return jsonb_build_object(
      'payment_id', v_payment_id,
      'transaction_id', v_transaction_id,
      'settled_amount', p_amount,
      'allocations_count', 1,
      'specific_debt_id', v_specific_debt.id
    );
  end if;

  -- Otherwise: Deterministic auto-allocation across open items
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

    v_alloc_amount := least(v_remaining_payment, v_debt.current_remaining);

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

    v_alloc_count := v_alloc_count + 1;
    v_remaining_payment := v_remaining_payment - v_alloc_amount;

    -- Update debt item status
    if (v_debt.current_remaining - v_alloc_amount) = 0 then
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
    'settled_amount', p_amount,
    'allocations_count', v_alloc_count
  );
end;
$$;

grant execute on function public.record_counterparty_settlement(uuid, public.debt_type, public.payment_mode, numeric, uuid, timestamptz, text, uuid) to authenticated;


-- ============================================================
-- 2. NOTIFICATION PUSH DELIVERIES & GENERIC DISPATCHER
-- ============================================================

create table if not exists public.notification_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'delivered', 'failed', 'no_devices', 'skipped')),
  attempted_at timestamptz not null default now(),
  delivered_at timestamptz,
  devices_targeted int not null default 0,
  devices_delivered int not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.notification_push_deliveries enable row level security;

create policy "Users can view their own push deliveries"
on public.notification_push_deliveries for select
using (user_id = auth.uid());

-- Generic real-time push trigger on notifications insertion
create or replace function public.dispatch_notification_push_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions, net
as $$
declare
  v_url text;
  v_secret text;
begin
  -- Retrieve endpoint URL from Vault
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'kash_project_url'
  order by created_at desc
  limit 1;

  -- Retrieve internal push secret from Vault
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'kash_push_internal_secret'
  order by created_at desc
  limit 1;

  if v_url is not null and v_secret is not null then
    -- Real-time async dispatch to send-push Edge Function via pg_net
    perform net.http_post(
      url := rtrim(v_url, '/') || '/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-kash-push-secret', v_secret
      ),
      body := jsonb_build_object(
        'notification_id', NEW.id,
        'user_id', NEW.user_id,
        'title', NEW.title,
        'message', NEW.message
      )
    );
  end if;

  return NEW;
exception
  when others then
    -- Do not abort the business transaction if async net call fails
    return NEW;
end;
$$;

drop trigger if exists trigger_dispatch_notification_push on public.notifications;

create trigger trigger_dispatch_notification_push
after insert on public.notifications
for each row
execute function public.dispatch_notification_push_trigger();

-- Helper to provision push internal secret in vault
create or replace function public.setup_kash_push_vault_secret(
  p_push_secret text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
begin
  if exists (select 1 from vault.secrets where name = 'kash_push_internal_secret') then
    select id into v_secret_id from vault.secrets where name = 'kash_push_internal_secret' limit 1;
    perform vault.update_secret(v_secret_id, p_push_secret, 'kash_push_internal_secret', 'KASH internal push secret');
  else
    perform vault.create_secret(p_push_secret, 'kash_push_internal_secret', 'KASH internal push secret');
  end if;
end;
$$;
