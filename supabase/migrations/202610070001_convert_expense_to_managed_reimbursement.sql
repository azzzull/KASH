-- Converts an existing ordinary personal expense into a Managed Space
-- reimbursement without duplicating its wallet movement. The original row is
-- transformed into the personal receivable cash-out, and the remaining linked
-- ledger records are created in the same transaction.

create or replace function public.convert_expense_to_managed_reimbursement(
  p_amount numeric,
  p_client_request_id uuid,
  p_managed_category_id uuid,
  p_managed_space_id uuid,
  p_note text,
  p_personal_wallet_id uuid,
  p_source_transaction_id uuid,
  p_title text,
  p_transaction_date timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source public.transactions%rowtype;
  v_existing_event public.cross_space_events%rowtype;
  v_event_id uuid;
  v_personal_counterparty_id uuid;
  v_managed_counterparty_id uuid;
  v_personal_receivable_id uuid;
  v_managed_payable_id uuid;
  v_title text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Expense amount must be greater than zero';
  end if;
  if p_managed_category_id is null or p_managed_space_id is null or p_personal_wallet_id is null then
    raise exception 'Managed Space, category, and personal wallet are required';
  end if;

  -- Retrying an already completed request must not create another event.
  select * into v_existing_event
  from public.cross_space_events
  where user_id = v_user_id
    and client_request_id = p_client_request_id;

  if found then
    if v_existing_event.event_type <> 'managed_expense_paid_personally'
      or v_existing_event.amount <> p_amount
      or v_existing_event.managed_space_id <> p_managed_space_id then
      raise exception 'Conflict: reimbursement conversion exists with different payload';
    end if;
    return jsonb_build_object('event_id', v_existing_event.id);
  end if;

  select * into v_source
  from public.transactions
  where id = p_source_transaction_id
  for update;

  if not found
    or v_source.user_id <> v_user_id
    or v_source.type <> 'expense'
    or v_source.status <> 'completed'
    or v_source.transaction_subtype is not null
    or v_source.cross_space_event_id is not null
    or v_source.related_entity_type is not null
    or v_source.related_entity_id is not null
    or coalesce(v_source.expense_context, 'personal') = 'reimbursable' then
    raise exception 'Only an ordinary personal expense can be converted to a Managed Space reimbursement';
  end if;

  if coalesce(v_source.transfer_fee, 0) <> 0 then
    raise exception 'An expense with an admin fee cannot be converted to a Managed Space reimbursement';
  end if;

  if not exists (
    select 1
    from public.financial_spaces personal_space
    where personal_space.id = v_source.space_id
      and personal_space.owner_user_id = v_user_id
      and personal_space.space_type = 'personal'
      and personal_space.is_archived = false
      and personal_space.deleted_at is null
  ) then
    raise exception 'The source transaction must belong to your active Personal Space';
  end if;

  if not exists (
    select 1
    from public.wallets personal_wallet
    where personal_wallet.id = p_personal_wallet_id
      and personal_wallet.user_id = v_user_id
      and personal_wallet.space_id = v_source.space_id
      and personal_wallet.is_archived = false
  ) then
    raise exception 'Selected personal wallet is not active in this Personal Space';
  end if;

  if not exists (
    select 1
    from public.financial_spaces managed_space
    where managed_space.id = p_managed_space_id
      and managed_space.space_type = 'managed'
      and managed_space.is_archived = false
      and managed_space.deleted_at is null
  ) or not public.user_has_managed_space_role(
    p_managed_space_id,
    array['owner', 'admin', 'member']::public.managed_space_role[]
  ) then
    raise exception 'You do not have access to this Managed Space';
  end if;

  if not exists (
    select 1
    from public.categories managed_category
    where managed_category.id = p_managed_category_id
      and managed_category.category_type = 'expense'
      and managed_category.is_archived = false
      and (managed_category.space_id = p_managed_space_id or (managed_category.space_id is null and managed_category.user_id is null))
  ) then
    raise exception 'Selected category is not an active expense category in this Managed Space';
  end if;

  v_title := coalesce(nullif(trim(p_title), ''), v_source.title, 'Pengeluaran Reimburse');

  select id into v_personal_counterparty_id
  from public.counterparties
  where user_id = v_user_id
    and space_id = v_source.space_id
    and linked_space_id = p_managed_space_id;

  if not found then
    insert into public.counterparties (user_id, space_id, linked_space_id, name)
    values (v_user_id, v_source.space_id, p_managed_space_id, 'Managed Space')
    returning id into v_personal_counterparty_id;
  end if;

  select id into v_managed_counterparty_id
  from public.counterparties
  where user_id = v_user_id
    and space_id = p_managed_space_id
    and linked_space_id = v_source.space_id;

  if not found then
    insert into public.counterparties (user_id, space_id, linked_space_id, name)
    values (v_user_id, p_managed_space_id, v_source.space_id, 'Personal Funds')
    returning id into v_managed_counterparty_id;
  end if;

  insert into public.cross_space_events (
    user_id,
    event_type,
    personal_space_id,
    managed_space_id,
    amount,
    managed_category_id,
    event_date,
    title,
    note,
    client_request_id
  ) values (
    v_user_id,
    'managed_expense_paid_personally',
    v_source.space_id,
    p_managed_space_id,
    p_amount,
    p_managed_category_id,
    coalesce(p_transaction_date, v_source.transaction_date),
    v_title,
    p_note,
    p_client_request_id
  ) returning id into v_event_id;

  insert into public.debts (
    user_id,
    space_id,
    counterparty_id,
    type,
    original_amount,
    due_date,
    title,
    note,
    cross_space_event_id,
    cross_space_role
  ) values (
    v_user_id,
    v_source.space_id,
    v_personal_counterparty_id,
    'receivable',
    p_amount,
    coalesce(p_transaction_date, v_source.transaction_date),
    v_title,
    p_note,
    v_event_id,
    'personal_receivable'
  ) returning id into v_personal_receivable_id;

  -- This update preserves one and only one cash-out: it replaces the old
  -- expense with the receivable principal movement. The wallet-balance trigger
  -- validates a changed source wallet using the restored old balance.
  update public.transactions
  set type = 'adjustment',
      amount = -p_amount,
      wallet_id = p_personal_wallet_id,
      category_id = null,
      envelope_id = null,
      destination_wallet_id = null,
      transfer_fee = 0,
      transaction_date = coalesce(p_transaction_date, transaction_date),
      title = v_title,
      note = p_note,
      expense_context = 'personal',
      related_entity_id = v_personal_receivable_id,
      related_entity_type = 'receivable_creation',
      cross_space_event_id = v_event_id,
      cross_space_role = 'personal_cash_out'
  where id = v_source.id;

  insert into public.debts (
    user_id,
    space_id,
    counterparty_id,
    type,
    original_amount,
    due_date,
    title,
    note,
    cross_space_event_id,
    cross_space_role
  ) values (
    v_user_id,
    p_managed_space_id,
    v_managed_counterparty_id,
    'debt',
    p_amount,
    coalesce(p_transaction_date, v_source.transaction_date),
    v_title,
    p_note,
    v_event_id,
    'managed_payable'
  ) returning id into v_managed_payable_id;

  insert into public.transactions (
    user_id,
    space_id,
    type,
    amount,
    wallet_id,
    category_id,
    transaction_date,
    title,
    note,
    related_entity_id,
    related_entity_type,
    cross_space_event_id,
    cross_space_role
  ) values (
    v_user_id,
    p_managed_space_id,
    'expense',
    p_amount,
    null,
    p_managed_category_id,
    coalesce(p_transaction_date, v_source.transaction_date),
    v_title,
    p_note,
    v_event_id,
    'cross_space_event',
    v_event_id,
    'managed_spending'
  );

  return jsonb_build_object('event_id', v_event_id);
end;
$$;

revoke all on function public.convert_expense_to_managed_reimbursement(
  numeric, uuid, uuid, uuid, text, uuid, uuid, text, timestamptz
) from public, anon;
grant execute on function public.convert_expense_to_managed_reimbursement(
  numeric, uuid, uuid, uuid, text, uuid, uuid, text, timestamptz
) to authenticated;
