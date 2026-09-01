-- Stabilize collaborative Managed reimbursement settlement without changing
-- the existing RPC signature. The legacy personal-wallet argument is ignored;
-- the destination is always derived from the event's personal cash-out row.

-- Remove permissive pre-space transaction policies left by the alpha schema.
-- Their names differ from the policies replaced by the Managed write migration,
-- so they currently allow Viewer inserts and creator-agnostic updates.
drop policy if exists "Users can create own transactions" on public.transactions;
drop policy if exists "Users can read own transactions" on public.transactions;
drop policy if exists "Users can update own transactions" on public.transactions;

-- Ordinary counterparties remain unique by normalized name within a space.
-- Linked cross-space counterparties already have their own identity index and
-- must be allowed to reuse presentation labels such as "Managed Space".
drop index if exists public.counterparties_user_normalized_name_uidx;

create unique index if not exists counterparties_user_space_normalized_name_uidx
  on public.counterparties(user_id, space_id, lower(trim(name)))
  where linked_space_id is null and space_id is not null;

create unique index if not exists counterparties_user_unscoped_normalized_name_uidx
  on public.counterparties(user_id, lower(trim(name)))
  where linked_space_id is null and space_id is null;

alter table public.cross_space_events
  drop constraint if exists cross_space_events_status_check;

alter table public.cross_space_events
  add constraint cross_space_events_status_check
  check (status in ('active', 'partially_reimbursed', 'completed', 'void'));

create or replace function public.record_cross_space_settlement(
  p_client_request_id uuid,
  p_event_id uuid,
  p_amount numeric,
  p_managed_wallet_id uuid,
  p_personal_wallet_id uuid,
  p_settlement_date timestamptz,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_event public.cross_space_events%rowtype;
  v_existing_settlement public.cross_space_settlements%rowtype;
  v_settlement_id uuid;
  v_original_payer_id uuid;
  v_actual_personal_wallet_id uuid;
  v_personal_receivable_id uuid;
  v_personal_counterparty_id uuid;
  v_personal_remaining numeric;
  v_managed_payable_id uuid;
  v_managed_counterparty_id uuid;
  v_managed_remaining numeric;
  v_total_settled numeric;
  v_outstanding numeric;
  v_remaining_after numeric;
  v_personal_payment_id uuid;
  v_managed_payment_id uuid;
  v_effective_settlement_date timestamptz := coalesce(p_settlement_date, now());
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Settlement amount must be greater than zero';
  end if;

  select *
  into v_event
  from public.cross_space_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Cross-space reimbursement event not found';
  end if;

  if v_event.event_type <> 'managed_expense_paid_personally' then
    raise exception 'Event is not a Managed reimbursement';
  end if;

  if not exists (
    select 1
    from public.managed_space_members m
    where m.space_id = v_event.managed_space_id
      and m.user_id = v_caller_id
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'Only an active Managed Space owner or admin can settle reimbursements';
  end if;

  if not exists (
    select 1
    from public.wallets w
    where w.id = p_managed_wallet_id
      and w.space_id = v_event.managed_space_id
      and w.is_archived = false
  ) then
    raise exception 'Selected Managed wallet is not active or does not belong to this Managed Space';
  end if;

  select *
  into v_existing_settlement
  from public.cross_space_settlements
  where client_request_id = p_client_request_id;

  if found then
    if v_existing_settlement.event_id <> p_event_id
      or v_existing_settlement.amount <> p_amount
      or v_existing_settlement.managed_wallet_id <> p_managed_wallet_id then
      raise exception 'Settlement request conflicts with an existing request';
    end if;

    return jsonb_build_object('settlement_id', v_existing_settlement.id);
  end if;

  if v_event.status not in ('active', 'partially_reimbursed') then
    raise exception 'Cross-space reimbursement is not open for settlement';
  end if;

  v_original_payer_id := v_event.user_id;

  select t.wallet_id
  into v_actual_personal_wallet_id
  from public.transactions t
  where t.cross_space_event_id = p_event_id
    and t.cross_space_role = 'personal_cash_out'
    and t.space_id = v_event.personal_space_id
    and t.user_id = v_original_payer_id;

  if v_actual_personal_wallet_id is null then
    raise exception 'Original Personal destination wallet cannot be resolved';
  end if;

  if not exists (
    select 1
    from public.wallets w
    where w.id = v_actual_personal_wallet_id
      and w.space_id = v_event.personal_space_id
      and w.user_id = v_original_payer_id
  ) then
    raise exception 'Original Personal destination wallet is invalid';
  end if;

  select dp.debt_id, dp.counterparty_id, dp.remaining_amount
  into v_personal_receivable_id, v_personal_counterparty_id, v_personal_remaining
  from public.debt_progress_view dp
  where dp.cross_space_event_id = p_event_id
    and dp.cross_space_role = 'personal_receivable';

  if not found then
    raise exception 'Personal receivable for reimbursement event not found';
  end if;

  select dp.debt_id, dp.counterparty_id, dp.remaining_amount
  into v_managed_payable_id, v_managed_counterparty_id, v_managed_remaining
  from public.debt_progress_view dp
  where dp.cross_space_event_id = p_event_id
    and dp.cross_space_role = 'managed_payable';

  if not found then
    raise exception 'Managed payable for reimbursement event not found';
  end if;

  select coalesce(sum(s.amount), 0)
  into v_total_settled
  from public.cross_space_settlements s
  where s.event_id = p_event_id
    and s.status = 'completed';

  v_outstanding := v_event.amount - v_total_settled;

  if v_outstanding <= 0 then
    raise exception 'Cross-space reimbursement is already fully settled';
  end if;

  if p_amount > v_outstanding then
    raise exception 'Settlement amount exceeds outstanding reimbursement';
  end if;

  if v_personal_remaining <> v_outstanding or v_managed_remaining <> v_outstanding then
    raise exception 'Reimbursement event and debt progress are out of sync';
  end if;

  v_remaining_after := v_outstanding - p_amount;

  insert into public.cross_space_settlements (
    user_id,
    event_id,
    amount,
    managed_wallet_id,
    personal_wallet_id,
    settlement_date,
    client_request_id
  ) values (
    v_original_payer_id,
    p_event_id,
    p_amount,
    p_managed_wallet_id,
    v_actual_personal_wallet_id,
    v_effective_settlement_date,
    p_client_request_id
  )
  returning id into v_settlement_id;

  insert into public.debt_payments (
    user_id,
    counterparty_id,
    debt_type,
    payment_mode,
    total_amount,
    payment_date,
    note,
    cross_space_settlement_id,
    cross_space_role
  ) values (
    v_original_payer_id,
    v_personal_counterparty_id,
    'receivable',
    'wallet',
    p_amount,
    v_effective_settlement_date,
    p_note,
    v_settlement_id,
    'personal_receivable_collection'
  )
  returning id into v_personal_payment_id;

  insert into public.debt_payment_allocations (
    user_id,
    debt_payment_id,
    debt_id,
    allocated_amount
  ) values (
    v_original_payer_id,
    v_personal_payment_id,
    v_personal_receivable_id,
    p_amount
  );

  update public.debts
  set status = case
    when v_remaining_after = 0 then 'settled'::public.debt_status
    else 'partially_paid'::public.debt_status
  end,
  updated_at = now()
  where id = v_personal_receivable_id;

  insert into public.transactions (
    user_id,
    space_id,
    type,
    amount,
    wallet_id,
    transaction_date,
    title,
    note,
    status,
    related_entity_id,
    related_entity_type
  ) values (
    v_original_payer_id,
    v_event.personal_space_id,
    'adjustment',
    p_amount,
    v_actual_personal_wallet_id,
    v_effective_settlement_date,
    'Pelunasan Piutang (Cross-Space)',
    p_note,
    'completed',
    v_personal_payment_id,
    'receivable_payment'
  );

  insert into public.debt_payments (
    user_id,
    counterparty_id,
    debt_type,
    payment_mode,
    total_amount,
    payment_date,
    note,
    cross_space_settlement_id,
    cross_space_role
  ) values (
    v_original_payer_id,
    v_managed_counterparty_id,
    'debt',
    'wallet',
    p_amount,
    v_effective_settlement_date,
    p_note,
    v_settlement_id,
    'managed_payable_payment'
  )
  returning id into v_managed_payment_id;

  insert into public.debt_payment_allocations (
    user_id,
    debt_payment_id,
    debt_id,
    allocated_amount
  ) values (
    v_original_payer_id,
    v_managed_payment_id,
    v_managed_payable_id,
    p_amount
  );

  update public.debts
  set status = case
    when v_remaining_after = 0 then 'settled'::public.debt_status
    else 'partially_paid'::public.debt_status
  end,
  updated_at = now()
  where id = v_managed_payable_id;

  insert into public.transactions (
    user_id,
    space_id,
    type,
    amount,
    wallet_id,
    transaction_date,
    title,
    note,
    status,
    related_entity_id,
    related_entity_type
  ) values (
    v_original_payer_id,
    v_event.managed_space_id,
    'adjustment',
    -p_amount,
    p_managed_wallet_id,
    v_effective_settlement_date,
    'Pelunasan Utang (Cross-Space)',
    p_note,
    'completed',
    v_managed_payment_id,
    'debt_payment'
  );

  update public.cross_space_events
  set status = case
    when v_remaining_after = 0 then 'completed'
    else 'partially_reimbursed'
  end,
  updated_at = now()
  where id = p_event_id;

  return jsonb_build_object('settlement_id', v_settlement_id);
end;
$$;

revoke execute on function public.record_cross_space_settlement(
  uuid,
  uuid,
  numeric,
  uuid,
  uuid,
  timestamptz,
  text
) from public;

grant execute on function public.record_cross_space_settlement(
  uuid,
  uuid,
  numeric,
  uuid,
  uuid,
  timestamptz,
  text
) to authenticated;
