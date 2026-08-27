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

  -- Create Settlement Parent
  insert into public.cross_space_settlements (
    user_id, event_id, amount, managed_wallet_id, personal_wallet_id, settlement_date, client_request_id
  ) values (
    v_user_id, p_event_id, p_amount, p_managed_wallet_id, p_personal_wallet_id, p_settlement_date, p_client_request_id
  ) returning id into v_settlement_id;
  
  -- Personal Settle
  insert into public.debt_payments (
    user_id, counterparty_id, debt_type, payment_mode, total_amount, payment_date, note, cross_space_settlement_id, cross_space_role
  ) values (
    v_user_id, v_personal_receivable.counterparty_id, 'receivable', 'wallet', p_amount, p_settlement_date, p_note, v_settlement_id, 'personal_receivable_collection'
  ) returning id into v_personal_payment_id;

  insert into public.debt_payment_allocations (
    user_id, debt_payment_id, debt_id, allocated_amount
  ) values (
    v_user_id, v_personal_payment_id, v_personal_receivable.id, p_amount
  );

  update public.debts set status = case when v_outstanding - p_amount <= 0 then 'settled'::public.debt_status else 'partially_paid'::public.debt_status end where id = v_personal_receivable.id;

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
    user_id, debt_payment_id, debt_id, allocated_amount
  ) values (
    v_user_id, v_managed_payment_id, v_managed_payable.id, p_amount
  );

  update public.debts set status = case when v_outstanding - p_amount <= 0 then 'settled'::public.debt_status else 'partially_paid'::public.debt_status end where id = v_managed_payable.id;

  insert into public.transactions (
    user_id, space_id, type, amount, wallet_id, transaction_date, title, note, related_entity_id, related_entity_type
  ) values (
    v_user_id, v_event.managed_space_id, 'adjustment', -p_amount, p_managed_wallet_id, p_settlement_date, 'Pembayaran Utang (Cross-Space)', p_note, v_managed_payment_id, 'debt_payment'
  );

  return jsonb_build_object('settlement_id', v_settlement_id);
end;
$$ language plpgsql security definer set search_path = public;
