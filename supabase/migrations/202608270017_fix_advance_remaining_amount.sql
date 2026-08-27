-- Fix remaining_amount in record_cross_space_advance

create or replace function public.record_cross_space_advance(
  p_client_request_id uuid,
  p_personal_space_id uuid,
  p_managed_space_id uuid,
  p_amount numeric,
  p_personal_wallet_id uuid,
  p_managed_wallet_id uuid,
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
  if not exists (select 1 from public.financial_spaces where id = p_personal_space_id and owner_user_id = v_user_id and space_type = 'personal') then
    raise exception 'Invalid personal space';
  end if;
  if not exists (select 1 from public.financial_spaces where id = p_managed_space_id and owner_user_id = v_user_id and space_type = 'managed') then
    raise exception 'Invalid managed space';
  end if;
  if not exists (select 1 from public.wallets where id = p_personal_wallet_id and user_id = v_user_id and space_id = p_personal_space_id) then
    raise exception 'Invalid personal wallet';
  end if;
  if not exists (select 1 from public.wallets where id = p_managed_wallet_id and user_id = v_user_id and space_id = p_managed_space_id) then
    raise exception 'Invalid managed wallet';
  end if;

  -- Counterparties
  select id into v_personal_counterparty_id from public.counterparties
  where user_id = v_user_id and space_id = p_personal_space_id and linked_space_id = p_managed_space_id;
  
  if not found then
    insert into public.counterparties (user_id, space_id, linked_space_id, name)
    values (v_user_id, p_personal_space_id, p_managed_space_id, 'Managed Space')
    returning id into v_personal_counterparty_id;
  end if;

  select id into v_managed_counterparty_id from public.counterparties
  where user_id = v_user_id and space_id = p_managed_space_id and linked_space_id = p_personal_space_id;
  
  if not found then
    insert into public.counterparties (user_id, space_id, linked_space_id, name)
    values (v_user_id, p_managed_space_id, p_personal_space_id, 'Personal Funds')
    returning id into v_managed_counterparty_id;
  end if;

  -- Create Event
  insert into public.cross_space_events (
    user_id, event_type, personal_space_id, managed_space_id, amount, event_date, title, note, client_request_id
  ) values (
    v_user_id, 'personal_advance_to_managed', p_personal_space_id, p_managed_space_id, p_amount, p_event_date, p_title, p_note, p_client_request_id
  ) returning id into v_event_id;

  -- Create Personal Receivable
  insert into public.debts (
    user_id, space_id, counterparty_id, type, original_amount, due_date, title, note, cross_space_event_id, cross_space_role
  ) values (
    v_user_id, p_personal_space_id, v_personal_counterparty_id, 'receivable', p_amount, p_event_date, p_title, p_note, v_event_id, 'personal_receivable'
  ) returning id into v_personal_receivable_id;

  -- Create Personal Cash Out Transaction
  insert into public.transactions (
    user_id, space_id, type, amount, wallet_id, transaction_date, title, note, related_entity_id, related_entity_type, cross_space_event_id, cross_space_role
  ) values (
    v_user_id, p_personal_space_id, 'adjustment', -p_amount, p_personal_wallet_id, p_event_date, p_title, p_note, v_personal_receivable_id, 'receivable_creation', v_event_id, 'personal_cash_out'
  ) returning id into v_personal_tx_id;

  -- Create Managed Payable
  insert into public.debts (
    user_id, space_id, counterparty_id, type, original_amount, due_date, title, note, cross_space_event_id, cross_space_role
  ) values (
    v_user_id, p_managed_space_id, v_managed_counterparty_id, 'debt', p_amount, p_event_date, p_title, p_note, v_event_id, 'managed_payable'
  ) returning id into v_managed_payable_id;

  -- Create Managed Cash In Transaction
  insert into public.transactions (
    user_id, space_id, type, amount, wallet_id, transaction_date, title, note, related_entity_id, related_entity_type, cross_space_event_id, cross_space_role
  ) values (
    v_user_id, p_managed_space_id, 'adjustment', p_amount, p_managed_wallet_id, p_event_date, p_title, p_note, v_managed_payable_id, 'debt_creation', v_event_id, 'managed_advance_cash_in'
  ) returning id into v_managed_tx_id;

  return jsonb_build_object('event_id', v_event_id);
end;
$$ language plpgsql security definer set search_path = public;
