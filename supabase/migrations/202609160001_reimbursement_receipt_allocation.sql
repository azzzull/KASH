-- A Managed reimbursement is paid before its recipient privately identifies the
-- destination wallet. Financial settlement and receipt creation share one RPC.
alter table public.cross_space_settlements
  alter column managed_wallet_id drop not null,
  alter column personal_wallet_id drop not null;

alter table public.cross_space_settlements
  add column settlement_source text not null default 'managed_wallet',
  add column recorded_by_user_id uuid references public.profiles(id),
  add column note text;

alter table public.cross_space_settlements
  add constraint cross_space_settlements_source_wallet_check check (
    (settlement_source = 'managed_wallet' and managed_wallet_id is not null)
    or (settlement_source = 'external_direct' and managed_wallet_id is null)
  );

-- Historical settlements retain their actual destination. New rows have none.
create table public.reimbursement_receipts (
  settlement_id uuid primary key references public.cross_space_settlements(id) on delete restrict,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  personal_space_id uuid not null references public.financial_spaces(id) on delete restrict,
  amount numeric(18,2) not null check (amount > 0),
  payment_date timestamptz not null,
  destination_wallet_id uuid references public.wallets(id) on delete restrict,
  allocation_request_id uuid,
  allocated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reimbursement_receipts_allocation_check check (
    (destination_wallet_id is null and allocation_request_id is null and allocated_at is null)
    or (destination_wallet_id is not null and allocation_request_id is not null and allocated_at is not null)
  ),
  unique (recipient_user_id, allocation_request_id)
);

create index reimbursement_receipts_pending_idx
  on public.reimbursement_receipts(recipient_user_id, personal_space_id, payment_date)
  where destination_wallet_id is null;

alter table public.reimbursement_receipts enable row level security;
create policy reimbursement_receipts_recipient_read on public.reimbursement_receipts
  for select to authenticated using (recipient_user_id = auth.uid());
revoke all on public.reimbursement_receipts from public, anon, authenticated;
grant select on public.reimbursement_receipts to authenticated;

drop policy if exists "Users can manage their own cross space events" on public.cross_space_events;
create policy cross_space_events_recipient_read on public.cross_space_events
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.cross_space_events from authenticated;

-- Linked obligations and their payment rows are owned by the cross-space RPC.
-- Restrictive policies combine with existing ordinary-debt permissions without
-- hiding linked rows from legitimate readers. SECURITY DEFINER RPCs bypass RLS.
create policy linked_debts_rpc_insert on public.debts as restrictive
  for insert to authenticated with check (cross_space_event_id is null);
create policy linked_debts_rpc_update on public.debts as restrictive
  for update to authenticated using (cross_space_event_id is null)
  with check (cross_space_event_id is null);
create policy linked_debts_rpc_delete on public.debts as restrictive
  for delete to authenticated using (cross_space_event_id is null);

create policy linked_payments_rpc_insert on public.debt_payments as restrictive
  for insert to authenticated with check (cross_space_settlement_id is null);
create policy linked_payments_rpc_update on public.debt_payments as restrictive
  for update to authenticated using (cross_space_settlement_id is null)
  with check (cross_space_settlement_id is null);
create policy linked_payments_rpc_delete on public.debt_payments as restrictive
  for delete to authenticated using (cross_space_settlement_id is null);

create policy linked_allocations_rpc_insert on public.debt_payment_allocations as restrictive
  for insert to authenticated with check (exists (
    select 1 from public.debts d where d.id = debt_id and d.cross_space_event_id is null
  ));
create policy linked_allocations_rpc_update on public.debt_payment_allocations as restrictive
  for update to authenticated using (exists (
    select 1 from public.debts d where d.id = debt_id and d.cross_space_event_id is null
  )) with check (exists (
    select 1 from public.debts d where d.id = debt_id and d.cross_space_event_id is null
  ));
create policy linked_allocations_rpc_delete on public.debt_payment_allocations as restrictive
  for delete to authenticated using (exists (
    select 1 from public.debts d where d.id = debt_id and d.cross_space_event_id is null
  ));

create policy linked_transactions_rpc_insert on public.transactions as restrictive
  for insert to authenticated with check (cross_space_event_id is null);
create policy linked_transactions_rpc_update on public.transactions as restrictive
  for update to authenticated using (cross_space_event_id is null)
  with check (cross_space_event_id is null);
create policy linked_transactions_rpc_delete on public.transactions as restrictive
  for delete to authenticated using (cross_space_event_id is null);

-- Settlement wallet movements have no cross_space_event_id so they can be
-- reported normally. This trigger prevents generic transaction mutation or
-- voiding from changing a paid reimbursement without a reversal workflow.
create function public.protect_reimbursement_settlement_transaction()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if old.related_entity_type in ('debt_payment', 'receivable_payment')
    and exists (
      select 1 from public.debt_payments dp
      where dp.id = old.related_entity_id and dp.cross_space_settlement_id is not null
    ) then
    raise exception 'Reimbursement settlement transaction cannot be changed directly';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger protect_reimbursement_settlement_transaction
before update or delete on public.transactions
for each row execute function public.protect_reimbursement_settlement_transaction();
revoke execute on function public.protect_reimbursement_settlement_transaction() from public;

-- The settlement row can contain a historical Personal wallet ID. Managed
-- actors receive only a deliberately limited history RPC below.
drop policy if exists "Users can manage their own cross space settlements" on public.cross_space_settlements;
create policy cross_space_settlements_recipient_read on public.cross_space_settlements
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.cross_space_settlements from authenticated;

create or replace function public.enforce_cross_space_settlement_wallet_balance()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_managed_space_id uuid;
  v_current_balance numeric;
begin
  if new.amount is null or new.amount <= 0 then
    raise exception 'Settlement amount must be greater than zero';
  end if;
  if new.settlement_source = 'external_direct' then
    if new.managed_wallet_id is not null then
      raise exception 'Direct reimbursement cannot use a Managed wallet';
    end if;
    return new;
  end if;

  select e.managed_space_id into v_managed_space_id
  from public.cross_space_events e where e.id = new.event_id;
  if not found then
    raise exception 'Cross-space reimbursement event not found';
  end if;

  perform 1 from public.wallets w
  where w.id = new.managed_wallet_id
    and w.space_id = v_managed_space_id and w.is_archived = false
  for update;
  if not found then
    raise exception 'Selected Managed wallet is not active or does not belong to this Managed Space';
  end if;

  select wb.current_balance into v_current_balance
  from public.wallet_balance_view wb where wb.wallet_id = new.managed_wallet_id;
  if v_current_balance is null then
    raise exception 'Selected Managed wallet balance could not be resolved';
  end if;
  if v_current_balance < new.amount then
    raise exception 'Insufficient wallet balance for this payment.';
  end if;
  return new;
end;
$$;

-- A new name avoids PostgREST overload ambiguity with the historical RPC.
create function public.record_reimbursement_settlement_v2(
  p_client_request_id uuid,
  p_event_id uuid,
  p_amount numeric,
  p_settlement_source text,
  p_managed_wallet_id uuid,
  p_payment_date timestamptz,
  p_note text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_event public.cross_space_events%rowtype;
  v_existing public.cross_space_settlements%rowtype;
  v_settlement_id uuid;
  v_personal_receivable_id uuid;
  v_personal_counterparty_id uuid;
  v_personal_remaining numeric;
  v_managed_payable_id uuid;
  v_managed_counterparty_id uuid;
  v_managed_remaining numeric;
  v_outstanding numeric;
  v_remaining_after numeric;
  v_personal_payment_id uuid;
  v_managed_payment_id uuid;
  v_effective_date timestamptz := coalesce(p_payment_date, now());
begin
  if v_caller_id is null then raise exception 'Authentication required'; end if;
  if p_client_request_id is null then raise exception 'Request ID is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Settlement amount must be greater than zero'; end if;
  if p_settlement_source not in ('managed_wallet', 'external_direct') or p_settlement_source is null then
    raise exception 'Invalid reimbursement settlement source';
  end if;
  if (p_settlement_source = 'managed_wallet' and p_managed_wallet_id is null)
    or (p_settlement_source = 'external_direct' and p_managed_wallet_id is not null) then
    raise exception 'Managed wallet must match settlement source';
  end if;

  select * into v_event from public.cross_space_events
  where id = p_event_id for update;
  if not found or v_event.event_type <> 'managed_expense_paid_personally' then
    raise exception 'Cross-space reimbursement event not found';
  end if;
  if not exists (
    select 1 from public.managed_space_members m
    where m.space_id = v_event.managed_space_id
      and m.user_id = v_caller_id and m.status = 'active'
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'Only an active Managed Space owner or admin can settle reimbursements';
  end if;

  select * into v_existing from public.cross_space_settlements
  where user_id = v_event.user_id and client_request_id = p_client_request_id;
  if found then
    if v_existing.event_id <> p_event_id or v_existing.amount <> p_amount
      or v_existing.settlement_source <> p_settlement_source
      or v_existing.managed_wallet_id is distinct from p_managed_wallet_id
      or v_existing.settlement_date <> v_effective_date
      or v_existing.note is distinct from p_note then
      raise exception 'Settlement request conflicts with an existing request';
    end if;
    return jsonb_build_object('settlement_id', v_existing.id);
  end if;

  if v_event.status not in ('active', 'partially_reimbursed') then
    raise exception 'Cross-space reimbursement is not open for settlement';
  end if;
  if p_settlement_source = 'managed_wallet' and not exists (
    select 1 from public.wallets w
    where w.id = p_managed_wallet_id and w.space_id = v_event.managed_space_id
      and w.is_archived = false
  ) then
    raise exception 'Selected Managed wallet is not active or does not belong to this Managed Space';
  end if;

  select dp.debt_id, dp.counterparty_id, dp.remaining_amount
  into v_personal_receivable_id, v_personal_counterparty_id, v_personal_remaining
  from public.debt_progress_view dp
  where dp.cross_space_event_id = p_event_id and dp.cross_space_role = 'personal_receivable';
  if not found then raise exception 'Personal receivable for reimbursement event not found'; end if;
  select dp.debt_id, dp.counterparty_id, dp.remaining_amount
  into v_managed_payable_id, v_managed_counterparty_id, v_managed_remaining
  from public.debt_progress_view dp
  where dp.cross_space_event_id = p_event_id and dp.cross_space_role = 'managed_payable';
  if not found then raise exception 'Managed payable for reimbursement event not found'; end if;

  select v_event.amount - coalesce(sum(s.amount), 0) into v_outstanding
  from public.cross_space_settlements s
  where s.event_id = p_event_id and s.status = 'completed';
  if v_outstanding <= 0 then raise exception 'Cross-space reimbursement is already fully settled'; end if;
  if p_amount > v_outstanding then raise exception 'Settlement amount exceeds outstanding reimbursement'; end if;
  if v_personal_remaining <> v_outstanding or v_managed_remaining <> v_outstanding then
    raise exception 'Reimbursement event and debt progress are out of sync';
  end if;
  v_remaining_after := v_outstanding - p_amount;

  insert into public.cross_space_settlements (
    user_id, event_id, amount, managed_wallet_id, personal_wallet_id,
    settlement_date, client_request_id, settlement_source, recorded_by_user_id, note
  ) values (
    v_event.user_id, p_event_id, p_amount, p_managed_wallet_id, null,
    v_effective_date, p_client_request_id, p_settlement_source, v_caller_id, p_note
  ) returning id into v_settlement_id;

  insert into public.debt_payments (
    user_id, counterparty_id, debt_type, payment_mode, total_amount,
    payment_date, note, cross_space_settlement_id, cross_space_role
  ) values (
    v_event.user_id, v_personal_counterparty_id, 'receivable', 'wallet', p_amount,
    v_effective_date, p_note, v_settlement_id, 'personal_receivable_collection'
  ) returning id into v_personal_payment_id;
  insert into public.debt_payment_allocations (user_id, debt_payment_id, debt_id, allocated_amount)
  values (v_event.user_id, v_personal_payment_id, v_personal_receivable_id, p_amount);
  update public.debts set status = case when v_remaining_after = 0
    then 'settled'::public.debt_status else 'partially_paid'::public.debt_status end,
    updated_at = now() where id = v_personal_receivable_id;

  insert into public.reimbursement_receipts (
    settlement_id, recipient_user_id, personal_space_id, amount, payment_date
  ) values (v_settlement_id, v_event.user_id, v_event.personal_space_id, p_amount, v_effective_date);

  insert into public.debt_payments (
    user_id, counterparty_id, debt_type, payment_mode, total_amount,
    payment_date, note, cross_space_settlement_id, cross_space_role
  ) values (
    v_event.user_id, v_managed_counterparty_id, 'debt', 'wallet', p_amount,
    v_effective_date, p_note, v_settlement_id, 'managed_payable_payment'
  ) returning id into v_managed_payment_id;
  insert into public.debt_payment_allocations (user_id, debt_payment_id, debt_id, allocated_amount)
  values (v_event.user_id, v_managed_payment_id, v_managed_payable_id, p_amount);
  update public.debts set status = case when v_remaining_after = 0
    then 'settled'::public.debt_status else 'partially_paid'::public.debt_status end,
    updated_at = now() where id = v_managed_payable_id;

  if p_settlement_source = 'managed_wallet' then
    insert into public.transactions (
      user_id, space_id, type, amount, wallet_id, transaction_date,
      title, note, status, related_entity_id, related_entity_type
    ) values (
      v_event.user_id, v_event.managed_space_id, 'adjustment', -p_amount,
      p_managed_wallet_id, v_effective_date, 'Pelunasan Utang (Cross-Space)',
      p_note, 'completed', v_managed_payment_id, 'debt_payment'
    );
  end if;

  update public.cross_space_events set status = case when v_remaining_after = 0
    then 'completed' else 'partially_reimbursed' end, updated_at = now()
  where id = p_event_id;

  return jsonb_build_object('settlement_id', v_settlement_id);
end;
$$;

revoke all on function public.record_reimbursement_settlement_v2(
  uuid, uuid, numeric, text, uuid, timestamptz, text
) from public, anon;
grant execute on function public.record_reimbursement_settlement_v2(
  uuid, uuid, numeric, text, uuid, timestamptz, text
) to authenticated;

-- Retire the path that silently credits the original payer wallet.
revoke execute on function public.record_cross_space_settlement(
  uuid, uuid, numeric, uuid, uuid, timestamptz, text
) from authenticated;

create function public.allocate_reimbursement_receipt(
  p_settlement_id uuid,
  p_destination_wallet_id uuid,
  p_client_request_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt public.reimbursement_receipts%rowtype;
  v_payment_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_client_request_id is null then raise exception 'Request ID is required'; end if;
  select * into v_receipt from public.reimbursement_receipts
  where settlement_id = p_settlement_id for update;
  if not found or v_receipt.recipient_user_id <> v_user_id then
    raise exception 'Reimbursement receipt not found';
  end if;
  if v_receipt.destination_wallet_id is not null then
    if v_receipt.destination_wallet_id = p_destination_wallet_id
      and v_receipt.allocation_request_id = p_client_request_id then
      return jsonb_build_object('settlement_id', p_settlement_id);
    end if;
    raise exception 'Reimbursement receipt is already allocated';
  end if;
  if not exists (
    select 1 from public.wallets w
    where w.id = p_destination_wallet_id and w.user_id = v_user_id
      and w.space_id = v_receipt.personal_space_id and w.is_archived = false
  ) then
    raise exception 'Destination wallet does not belong to recipient';
  end if;

  select id into v_payment_id from public.debt_payments
  where cross_space_settlement_id = p_settlement_id
    and cross_space_role = 'personal_receivable_collection';
  if v_payment_id is null then raise exception 'Linked receivable payment not found'; end if;

  insert into public.transactions (
    user_id, space_id, type, amount, wallet_id, transaction_date,
    title, status, related_entity_id, related_entity_type
  ) values (
    v_user_id, v_receipt.personal_space_id, 'adjustment', v_receipt.amount,
    p_destination_wallet_id, v_receipt.payment_date,
    'Reimbursement Received', 'completed', v_payment_id, 'receivable_payment'
  );
  update public.reimbursement_receipts set
    destination_wallet_id = p_destination_wallet_id,
    allocation_request_id = p_client_request_id,
    allocated_at = now()
  where settlement_id = p_settlement_id;
  return jsonb_build_object('settlement_id', p_settlement_id);
end;
$$;

revoke all on function public.allocate_reimbursement_receipt(uuid, uuid, uuid) from public, anon;
grant execute on function public.allocate_reimbursement_receipt(uuid, uuid, uuid) to authenticated;

-- Managed history reveals settlement and allocation state, never Personal IDs.
create function public.get_managed_reimbursement_history(p_event_id uuid)
returns table (
  settlement_id uuid,
  amount numeric,
  payment_date timestamptz,
  settlement_source text,
  note text,
  recorded_by_name text,
  allocation_status text
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_space_id uuid;
begin
  select e.managed_space_id into v_space_id from public.cross_space_events e
  where e.id = p_event_id and e.event_type = 'managed_expense_paid_personally';
  if v_space_id is null or not exists (
    select 1 from public.managed_space_members m
    where m.space_id = v_space_id and m.user_id = auth.uid()
      and m.status = 'active' and m.role in ('owner', 'admin')
  ) then
    raise exception 'Reimbursement history not available';
  end if;
  return query
  select s.id, s.amount, s.settlement_date, s.settlement_source, s.note,
    coalesce(nullif(trim(p.full_name), ''), 'Member')::text,
    case when r.settlement_id is null then 'legacy'
      when r.allocated_at is null then 'pending' else 'allocated' end::text
  from public.cross_space_settlements s
  left join public.profiles p on p.id = s.recorded_by_user_id
  left join public.reimbursement_receipts r on r.settlement_id = s.id
  where s.event_id = p_event_id and s.status = 'completed'
  order by s.settlement_date desc, s.created_at desc;
end;
$$;

revoke all on function public.get_managed_reimbursement_history(uuid) from public, anon;
grant execute on function public.get_managed_reimbursement_history(uuid) to authenticated;

create or replace function public.notify_managed_reimbursement_settlement()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.cross_space_events%rowtype;
  v_counterparty_id uuid;
  v_space_name text;
  v_actor_name text;
  v_english boolean;
  v_remaining numeric;
  v_amount text;
  v_source text;
begin
  begin
    select * into v_event from public.cross_space_events
    where id = new.event_id and event_type = 'managed_expense_paid_personally';
    if not found or v_event.user_id = new.recorded_by_user_id then return new; end if;
    if not exists (
      select 1 from public.managed_space_members m
      where m.space_id = v_event.managed_space_id and m.user_id = v_event.user_id
        and m.status = 'active'
    ) then return new; end if;

    select d.counterparty_id into v_counterparty_id from public.debts d
    where d.cross_space_event_id = v_event.id and d.cross_space_role = 'personal_receivable';
    if v_counterparty_id is null then return new; end if;
    select greatest(0, v_event.amount - coalesce(sum(s.amount), 0)) into v_remaining
    from public.cross_space_settlements s
    where s.event_id = v_event.id and s.status = 'completed';
    select name into v_space_name from public.financial_spaces where id = v_event.managed_space_id;
    select coalesce(nullif(trim(full_name), ''), 'Member') into v_actor_name
    from public.profiles where id = new.recorded_by_user_id;
    select lower(coalesce(locale, 'id')) like 'en%' into v_english
    from public.profiles where id = v_event.user_id;
    v_amount := public.managed_reimbursement_notification_amount(new.amount);
    v_source := case when new.settlement_source = 'external_direct'
      then case when v_english then 'directly' else 'secara langsung' end
      else case when v_english then 'from a Managed wallet' else 'dari dompet Managed' end end;

    insert into public.notifications (
      user_id, type, title, message, entity_type, entity_id, metadata, source_key
    ) values (
      v_event.user_id,
      case when v_remaining = 0 then 'managed_reimbursement_paid'
        else 'managed_reimbursement_partially_paid' end,
      case when v_english then 'Reimbursement received' else 'Reimbursement diterima' end,
      case when v_english
        then coalesce(v_space_name, 'Managed Space') || ' marked your ' || v_amount ||
          ' reimbursement as paid ' || v_source || '. Assign the wallet where you received it.'
        else coalesce(v_space_name, 'Managed Space') || ' menandai reimbursement ' || v_amount ||
          ' dibayar ' || v_source || '. Pilih dompet tempat kamu menerimanya.' end,
      'counterparty', v_counterparty_id,
      jsonb_build_object(
        'managed_space_id', v_event.managed_space_id,
        'cross_space_event_id', v_event.id,
        'settlement_id', new.id,
        'recipient_user_id', v_event.user_id,
        'settled_by_user_id', new.recorded_by_user_id,
        'settled_by_name', v_actor_name,
        'amount', new.amount,
        'remaining_amount', v_remaining,
        'settlement_source', new.settlement_source,
        'space_name', v_space_name,
        'target_space_id', v_event.personal_space_id,
        'target_path', '/debts/' || v_counterparty_id::text || '?settlement_id=' || new.id::text || '&space_id=' || v_event.personal_space_id::text
      ),
      'managed_reimbursement_settlement:' || new.id::text || ':' || v_event.user_id::text
    ) on conflict (source_key) where source_key is not null do nothing;
  exception when others then
    raise warning 'Managed reimbursement settlement notification failed for settlement %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
