-- Fix record_cross_space_settlement: wrong table name financial_space_members → managed_space_members
-- Also: derive caller role from managed_space_members (correct table).

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
  v_caller_id uuid := auth.uid();
  v_original_payer_id uuid;
  v_event public.cross_space_events%ROWTYPE;
  v_member_role text;
  v_wallet_space_id uuid;
  
  v_existing_settlement public.cross_space_settlements%ROWTYPE;
  v_settlement_id uuid;
  v_personal_receivable public.debt_progress_view%ROWTYPE;
  v_managed_payable public.debt_progress_view%ROWTYPE;
  v_outstanding numeric;
  v_total_settled numeric;
  
  v_actual_personal_wallet_id uuid;
  v_personal_payment_id uuid;
  v_managed_payment_id uuid;
begin
  select * into v_event from public.cross_space_events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  
  v_original_payer_id := v_event.user_id;

  -- 1. Caller must have active owner/admin role in the Managed Space
  select role into v_member_role from public.managed_space_members 
  where space_id = v_event.managed_space_id and user_id = v_caller_id and status = 'active';
  
  if v_member_role not in ('owner', 'admin') then
    raise exception 'Unauthorized: Only active owner or admin can settle managed reimbursements';
  end if;

  -- 2. Managed source wallet belongs to the Managed Space
  select space_id into v_wallet_space_id from public.wallets where id = p_managed_wallet_id;
  if v_wallet_space_id != v_event.managed_space_id then
    raise exception 'Integrity Error: Managed wallet does not belong to the managed space';
  end if;

  -- Idempotency check: Client request ID is globally unique
  select * into v_existing_settlement from public.cross_space_settlements 
  where client_request_id = p_client_request_id;
  
  if found then
    if v_existing_settlement.amount != p_amount or v_existing_settlement.event_id != p_event_id then
      raise exception 'Conflict: Settlement exists with different payload';
    end if;
    return jsonb_build_object('settlement_id', v_existing_settlement.id);
  end if;

  select * into v_personal_receivable from public.debt_progress_view where cross_space_event_id = p_event_id and cross_space_role = 'personal_receivable';
  select * into v_managed_payable from public.debt_progress_view where cross_space_event_id = p_event_id and cross_space_role = 'managed_payable';

  -- Derive the original personal wallet from the cash_out transaction
  select wallet_id into v_actual_personal_wallet_id from public.transactions where cross_space_event_id = p_event_id and cross_space_role = 'personal_cash_out' limit 1;
  if v_actual_personal_wallet_id is null then
    raise exception 'Integrity Error: Cannot resolve original personal wallet';
  end if;

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
    v_original_payer_id, p_event_id, p_amount, p_managed_wallet_id, v_actual_personal_wallet_id, p_settlement_date, p_note, p_client_request_id
  ) returning id into v_settlement_id;
  
  -- Personal Settle
  insert into public.debt_payments (
    user_id, counterparty_id, debt_type, payment_mode, total_amount, payment_date, note, cross_space_settlement_id, cross_space_role
  ) values (
    v_original_payer_id, v_personal_receivable.counterparty_id, 'receivable', 'wallet', p_amount, p_settlement_date, p_note, v_settlement_id, 'personal_receivable_collection'
  ) returning id into v_personal_payment_id;

  insert into public.debt_payment_allocations (
    user_id, debt_payment_id, debt_id, amount
  ) values (
    v_original_payer_id, v_personal_payment_id, v_personal_receivable.debt_id, p_amount
  );

  update public.debts set remaining_amount = remaining_amount - p_amount, status = case when remaining_amount - p_amount <= 0 then 'paid' else 'active' end where id = v_personal_receivable.debt_id;

  insert into public.transactions (
    user_id, space_id, type, amount, wallet_id, transaction_date, title, note, related_entity_id, related_entity_type
  ) values (
    v_original_payer_id, v_event.personal_space_id, 'adjustment', p_amount, v_actual_personal_wallet_id, p_settlement_date, 'Pelunasan Piutang (Cross-Space)', p_note, v_personal_payment_id, 'receivable_payment'
  );

  -- Managed Settle
  insert into public.debt_payments (
    user_id, counterparty_id, debt_type, payment_mode, total_amount, payment_date, note, cross_space_settlement_id, cross_space_role
  ) values (
    v_original_payer_id, v_managed_payable.counterparty_id, 'debt', 'wallet', p_amount, p_settlement_date, p_note, v_settlement_id, 'managed_payable_payment'
  ) returning id into v_managed_payment_id;

  insert into public.debt_payment_allocations (
    user_id, debt_payment_id, debt_id, amount
  ) values (
    v_original_payer_id, v_managed_payment_id, v_managed_payable.debt_id, p_amount
  );

  update public.debts set remaining_amount = remaining_amount - p_amount, status = case when remaining_amount - p_amount <= 0 then 'paid' else 'active' end where id = v_managed_payable.debt_id;

  insert into public.transactions (
    user_id, space_id, type, amount, wallet_id, transaction_date, title, note, related_entity_id, related_entity_type
  ) values (
    v_original_payer_id, v_event.managed_space_id, 'adjustment', -p_amount, p_managed_wallet_id, p_settlement_date, 'Pelunasan Utang (Cross-Space)', p_note, v_managed_payment_id, 'debt_payment'
  );

  if p_amount >= v_outstanding then
    update public.cross_space_events set status = 'completed' where id = p_event_id;
  else
    update public.cross_space_events set status = 'partially_reimbursed' where id = p_event_id;
  end if;

  return jsonb_build_object('settlement_id', v_settlement_id);
end;
$$ language plpgsql security definer set search_path = public;
