-- A work-funded expense must carry its allocation at insert time so the
-- balance guard can use the source wallet's physical balance, not its
-- personal available balance. Keep this as an overload of the canonical
-- contextual writer; it is intentionally executable only through the
-- dedicated work-fund wrapper below.
create or replace function public.record_contextual_expense(
  p_amount numeric,
  p_category_id uuid,
  p_context text,
  p_counterparty_name text,
  p_envelope_id uuid,
  p_note text,
  p_space_id uuid,
  p_title text,
  p_transaction_date timestamptz,
  p_transaction_id uuid,
  p_wallet_id uuid,
  p_work_fund_id uuid
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_space public.financial_spaces%rowtype;
  v_fund public.wallets%rowtype;
  v_existing public.transactions%rowtype;
  v_remaining numeric;
  v_transaction public.transactions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(nullif(trim(p_context), ''), 'personal') <> 'work' then
    raise exception 'A work fund can only pay a Work expense';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Expense amount must be greater than zero';
  end if;
  if p_category_id is null or p_wallet_id is null or p_space_id is null or p_work_fund_id is null then
    raise exception 'Wallet, category, space, and work fund are required';
  end if;

  select * into v_space
  from public.financial_spaces
  where id = p_space_id
    and space_type = 'personal'
    and owner_user_id = v_user_id
    and is_archived = false;
  if not found then
    raise exception 'Personal Space not found or archived';
  end if;

  if not exists (
    select 1
    from public.wallets w
    where w.id = p_wallet_id
      and w.user_id = v_user_id
      and w.space_id = p_space_id
      and w.is_archived = false
      and w.work_fund_kind is null
  ) then
    raise exception 'Selected wallet is not an active personal wallet';
  end if;

  if not exists (
    select 1
    from public.categories c
    where c.id = p_category_id
      and c.category_type = 'expense'
      and c.is_archived = false
      and (c.is_system = true or c.space_id = p_space_id)
  ) then
    raise exception 'Selected category is not an active expense category in this space';
  end if;

  if p_envelope_id is not null and not exists (
    select 1
    from public.envelopes e
    where e.id = p_envelope_id
      and e.space_id = p_space_id
  ) then
    raise exception 'Selected envelope does not belong to this space';
  end if;

  select * into v_fund
  from public.wallets w
  where w.id = p_work_fund_id
    and w.user_id = v_user_id
    and w.space_id = p_space_id
    and w.work_fund_kind is not null
    and w.source_wallet_id = p_wallet_id
    and w.is_archived = false
  for update;
  if not found then
    raise exception 'Selected work fund source was not found';
  end if;

  if p_transaction_id is not null then
    select * into v_existing
    from public.transactions
    where id = p_transaction_id
      and space_id = p_space_id
      and user_id = v_user_id
    for update;

    if not found
      or v_existing.type <> 'expense'
      or v_existing.transaction_subtype = 'external_transfer'
      or v_existing.work_fund_id is distinct from p_work_fund_id then
      raise exception 'Work-funded expense transaction not found';
    end if;
  end if;

  select current_balance into v_remaining
  from public.work_fund_summary_view
  where wallet_id = v_fund.id;

  if v_existing.id is not null and v_existing.status = 'completed' then
    v_remaining := coalesce(v_remaining, 0) + v_existing.amount + coalesce(v_existing.transfer_fee, 0);
  end if;
  if p_amount > coalesce(v_remaining, 0) then
    raise exception 'Work fund balance is not enough for this expense';
  end if;

  perform set_config('kash.contextual_expense_write', 'on', true);
  perform set_config('kash.work_fund_write', 'on', true);

  if p_transaction_id is null then
    insert into public.transactions (
      user_id, space_id, type, amount, wallet_id, category_id, envelope_id,
      transaction_date, title, note, status, expense_context, work_fund_id
    ) values (
      v_user_id, p_space_id, 'expense', p_amount, p_wallet_id, p_category_id, p_envelope_id,
      coalesce(p_transaction_date, now()), nullif(trim(coalesce(p_title, '')), ''), p_note,
      'completed', 'work', p_work_fund_id
    ) returning * into v_transaction;
  else
    update public.transactions
    set amount = p_amount,
        wallet_id = p_wallet_id,
        category_id = p_category_id,
        envelope_id = p_envelope_id,
        transaction_date = coalesce(p_transaction_date, transaction_date),
        title = nullif(trim(coalesce(p_title, '')), ''),
        note = p_note,
        expense_context = 'work',
        related_entity_type = null,
        related_entity_id = null,
        work_fund_id = p_work_fund_id
    where id = v_existing.id
    returning * into v_transaction;
  end if;

  return v_transaction;
end;
$$;

revoke all on function public.record_contextual_expense(numeric, uuid, text, text, uuid, text, uuid, text, timestamptz, uuid, uuid, uuid) from public, anon, authenticated;

-- All public work-fund operations remain routed through this wrapper. For
-- reclassification away from Work, it clears the allocation under ownership
-- checks before delegating to the original 11-argument canonical writer.
create or replace function public.record_work_fund_contextual_expense(
  p_amount numeric,
  p_category_id uuid,
  p_context text,
  p_counterparty_name text,
  p_envelope_id uuid,
  p_note text,
  p_space_id uuid,
  p_title text,
  p_transaction_date timestamptz,
  p_transaction_id uuid,
  p_wallet_id uuid,
  p_work_fund_id uuid
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.transactions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_work_fund_id is not null then
    return public.record_contextual_expense(
      p_amount,
      p_category_id,
      p_context,
      p_counterparty_name,
      p_envelope_id,
      p_note,
      p_space_id,
      p_title,
      p_transaction_date,
      p_transaction_id,
      p_wallet_id,
      p_work_fund_id
    );
  end if;

  if p_transaction_id is null then
    raise exception 'A work fund is required when creating a work-funded expense';
  end if;

  select * into v_existing
  from public.transactions
  where id = p_transaction_id
    and user_id = v_user_id
    and space_id = p_space_id
  for update;

  if not found or v_existing.work_fund_id is null then
    raise exception 'Only an existing work-funded expense can remove its work fund';
  end if;

  update public.transactions
  set work_fund_id = null
  where id = v_existing.id;

  return public.record_contextual_expense(
    p_amount,
    p_category_id,
    p_context,
    p_counterparty_name,
    p_envelope_id,
    p_note,
    p_space_id,
    p_title,
    p_transaction_date,
    p_transaction_id,
    p_wallet_id
  );
end;
$$;

revoke all on function public.record_work_fund_contextual_expense(numeric, uuid, text, text, uuid, text, uuid, text, timestamptz, uuid, uuid, uuid) from public, anon;
grant execute on function public.record_work_fund_contextual_expense(numeric, uuid, text, text, uuid, text, uuid, text, timestamptz, uuid, uuid, uuid) to authenticated;
