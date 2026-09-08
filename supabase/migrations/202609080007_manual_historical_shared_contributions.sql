-- KASH members may submit a past contribution without a locally recorded wallet
-- movement. It remains pending until reviewed and never creates a wallet,
-- Income, or Expense transaction.
alter table public.shared_savings_requests
  drop constraint if exists shared_savings_contribution_source_valid;

alter table public.shared_savings_requests
  add constraint shared_savings_contribution_source_valid check (
    request_type <> 'contribution'
    or (
      contribution_date is not null
      and contribution_source_type in (
        'wallet_contribution',
        'linked_historical_movement',
        'manual_historical_contribution',
        'already_received'
      )
    )
  );

create or replace function public.submit_shared_contribution_request(
  p_shared_savings_id uuid,
  p_source_wallet_id uuid,
  p_amount numeric,
  p_note text default null,
  p_contribution_date date default current_date,
  p_source_type text default 'wallet_contribution',
  p_source_transaction_id uuid default null,
  p_client_request_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_space public.shared_savings;
  v_wallet public.wallets;
  v_transaction public.transactions;
  v_request_id uuid;
  v_reviewer record;
  v_user_name text;
  v_timezone text;
  v_inserted boolean;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Contribution amount must be greater than zero.'; end if;
  if p_contribution_date is null or p_contribution_date > current_date then raise exception 'Contribution date cannot be in the future.'; end if;
  if p_source_type not in ('wallet_contribution', 'linked_historical_movement', 'manual_historical_contribution') then raise exception 'Invalid contribution source type.'; end if;

  select * into v_space from public.shared_savings where id = p_shared_savings_id;
  if v_space.id is null or v_space.status <> 'active' then raise exception 'Shared savings space not found or is inactive.'; end if;
  if not exists (select 1 from public.shared_savings_members where shared_savings_id = p_shared_savings_id and user_id = v_user_id and status = 'active') then
    raise exception 'You must be an active member of this space to contribute.';
  end if;

  if p_source_type = 'wallet_contribution' then
    select * into v_wallet from public.wallets where id = p_source_wallet_id and user_id = v_user_id and is_archived = false;
    if v_wallet.id is null then raise exception 'Source wallet not found or does not belong to you.'; end if;
    if p_source_transaction_id is not null then raise exception 'A wallet contribution cannot link an existing transaction.'; end if;
  elsif p_source_type = 'linked_historical_movement' then
    select * into v_transaction from public.transactions
    where id = p_source_transaction_id and user_id = v_user_id and status = 'completed'
      and type = 'adjustment' and amount = -p_amount and related_entity_type is null;
    if v_transaction.id is null then raise exception 'Choose an eligible, unlinked outgoing balance adjustment.'; end if;
    if v_transaction.wallet_id is null or v_transaction.wallet_id <> p_source_wallet_id then raise exception 'Historical movement source wallet is invalid.'; end if;
    select timezone into v_timezone from public.profiles where id = v_user_id;
    if (v_transaction.transaction_date at time zone coalesce(nullif(v_timezone, ''), 'Asia/Jakarta'))::date <> p_contribution_date then
      raise exception 'Contribution date must match the linked historical movement date.';
    end if;
  elsif p_source_wallet_id is not null or p_source_transaction_id is not null then
    raise exception 'A manual historical contribution cannot link a wallet or transaction.';
  end if;

  insert into public.shared_savings_requests (
    shared_savings_id, request_type, requested_by_user_id, amount, source_wallet_id,
    source_transaction_id, contribution_date, contribution_source_type, note, status, client_request_id
  ) values (
    p_shared_savings_id, 'contribution', v_user_id, p_amount, p_source_wallet_id,
    p_source_transaction_id, p_contribution_date, p_source_type, p_note, 'pending', p_client_request_id
  ) on conflict (requested_by_user_id, client_request_id) where client_request_id is not null
  do update set updated_at = public.shared_savings_requests.updated_at
  returning id, (xmax = 0) into v_request_id, v_inserted;

  if not v_inserted then return v_request_id; end if;
  select coalesce(full_name, email) into v_user_name from public.profiles where id = v_user_id;
  for v_reviewer in
    select distinct reviewer_id from (
      select a.user_id as reviewer_id
      from public.shared_savings_approvers a
      join public.shared_savings_members m on m.shared_savings_id = a.shared_savings_id and m.user_id = a.user_id
      where a.shared_savings_id = p_shared_savings_id and m.status = 'active'
      union all
      select v_space.account_holder_user_id
    ) reviewers
  loop
    insert into public.notifications (user_id,type,title,message,entity_type,entity_id,metadata) values
    (v_reviewer.reviewer_id, 'shared_contribution_pending', 'Permintaan Setoran Masuk', v_user_name || ' mengajukan setoran ke "' || v_space.name || '".', 'shared_savings', p_shared_savings_id,
      jsonb_build_object('shared_savings_id',p_shared_savings_id,'request_id',v_request_id,'target_path','/shared-savings/' || p_shared_savings_id::text));
  end loop;
  return v_request_id;
end;
$$;

create or replace function public.approve_shared_contribution(p_request_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_request public.shared_savings_requests;
  v_space public.shared_savings;
  v_transaction public.transactions;
  v_transaction_id uuid;
  v_ledger_id uuid := gen_random_uuid();
  v_total numeric;
  v_timezone text;
  v_economic_at timestamptz;
  v_new_balance numeric;
  v_member record;
  v_member_id uuid;
begin
  if v_caller_id is null then raise exception 'Authentication required.'; end if;
  select * into v_request from public.shared_savings_requests where id=p_request_id for update;
  if v_request.id is null or v_request.status <> 'pending' or v_request.request_type <> 'contribution' then raise exception 'Contribution request is not pending.'; end if;
  select * into v_space from public.shared_savings where id=v_request.shared_savings_id;
  if v_space.status <> 'active' then raise exception 'Shared savings space is not active.'; end if;

  if v_request.contribution_source_type = 'manual_historical_contribution' and v_space.account_holder_user_id = v_caller_id then
    if v_caller_id = v_request.requested_by_user_id and exists (
      select 1 from public.shared_savings_approvers a
      join public.shared_savings_members m on m.shared_savings_id = a.shared_savings_id and m.user_id = a.user_id
      where a.shared_savings_id = v_space.id and a.user_id <> v_caller_id and m.status = 'active'
    ) then
      raise exception 'A different active Approver must review this contribution.';
    end if;
  else
    perform public.check_shared_approver_permission(v_request.shared_savings_id, v_request.requested_by_user_id);
  end if;

  if v_request.contribution_source_type = 'linked_historical_movement' then
    select * into v_transaction from public.transactions where id=v_request.source_transaction_id for update;
    if v_transaction.id is null or v_transaction.user_id <> v_request.requested_by_user_id or v_transaction.status <> 'completed'
       or v_transaction.type <> 'adjustment' or v_transaction.amount <> -v_request.amount or v_transaction.wallet_id <> v_request.source_wallet_id
       or v_transaction.related_entity_type is not null then
      raise exception 'Historical source movement is no longer eligible.';
    end if;
    select timezone into v_timezone from public.profiles where id=v_request.requested_by_user_id;
    if (v_transaction.transaction_date at time zone coalesce(nullif(v_timezone, ''), 'Asia/Jakarta'))::date <> v_request.contribution_date then
      raise exception 'Historical source movement date no longer matches the contribution date.';
    end if;
    v_transaction_id := v_transaction.id;
    update public.transactions set related_entity_type='shared_savings_contribution', related_entity_id=v_ledger_id,
      title='Setoran Tabungan Bersama: ' || v_space.name, updated_at=now() where id=v_transaction_id;
  elsif v_request.contribution_source_type = 'wallet_contribution' then
    select timezone into v_timezone from public.profiles where id=v_request.requested_by_user_id;
    v_economic_at := v_request.contribution_date::timestamp at time zone coalesce(nullif(v_timezone, ''), 'Asia/Jakarta');
    v_transaction_id := gen_random_uuid();
    insert into public.transactions (id,user_id,type,amount,wallet_id,transfer_fee,transaction_date,title,note,status,related_entity_type,related_entity_id)
    values (v_transaction_id,v_request.requested_by_user_id,'adjustment',-v_request.amount,v_request.source_wallet_id,0,v_economic_at,'Setoran Tabungan Bersama: ' || v_space.name,v_request.note,'completed','shared_savings_contribution',v_ledger_id);
  elsif v_request.contribution_source_type = 'manual_historical_contribution' then
    v_transaction_id := null;
  else
    raise exception 'Invalid contribution source type.';
  end if;

  select id into v_member_id from public.shared_savings_members
  where shared_savings_id = v_space.id and user_id = v_request.requested_by_user_id and status = 'active';
  if v_member_id is null then raise exception 'Requesting member is no longer active.'; end if;

  insert into public.shared_savings_ledger (id,shared_savings_id,request_id,event_type,amount,title,note)
  values (v_ledger_id,v_space.id,v_request.id,'contribution',v_request.amount,'Setoran Anggota',v_request.note);
  insert into public.shared_savings_member_allocations (shared_savings_id,ledger_id,member_id,user_id,amount_signed)
  values (v_space.id,v_ledger_id,v_member_id,v_request.requested_by_user_id,v_request.amount);
  select sum(amount_signed) into v_total from public.shared_savings_member_allocations where ledger_id=v_ledger_id;
  if v_total <> v_request.amount then raise exception 'Financial invariant failed for contribution.'; end if;
  update public.shared_savings_requests set status='approved',approved_by_user_id=v_caller_id,approved_at=now(),transaction_id=v_transaction_id where id=v_request.id;
  insert into public.notifications (user_id,type,title,message,entity_type,entity_id,metadata) values
    (v_request.requested_by_user_id,'shared_contribution_verified','Setoran Disetujui','Setoran ke "' || v_space.name || '" telah disetujui.','shared_savings',v_space.id,
      jsonb_build_object('shared_savings_id',v_space.id,'request_id',v_request.id,'target_path','/shared-savings/' || v_space.id::text));
  if v_space.target_amount is not null then
    select coalesce(sum(case when event_type='contribution' then amount when event_type in ('personal_withdrawal','shared_spending') then -amount else amount end),0) into v_new_balance
    from public.shared_savings_ledger where shared_savings_id=v_space.id;
    if v_new_balance >= v_space.target_amount then
      insert into public.shared_savings_notification_logs (shared_savings_id,event_type,reference_value)
      values (v_space.id,'target_reached','target:' || v_space.target_amount::text) on conflict do nothing;
      if found then
        for v_member in select user_id from public.shared_savings_members where shared_savings_id=v_space.id and status='active' and user_id is not null loop
          insert into public.notifications (user_id,type,title,message,entity_type,entity_id,metadata) values
          (v_member.user_id,'shared_contribution_verified','Target Tabungan Tercapai!','Saldo "' || v_space.name || '" telah mencapai target.','shared_savings',v_space.id,
            jsonb_build_object('shared_savings_id',v_space.id,'request_id',v_request.id,'target_path','/shared-savings/' || v_space.id::text));
        end loop;
      end if;
    end if;
  end if;
  return true;
end;
$$;

create or replace function public.reject_shared_request(p_request_id uuid,p_reason text default null)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_request public.shared_savings_requests;
  v_space public.shared_savings;
begin
  if v_caller_id is null then raise exception 'Authentication required.'; end if;
  select * into v_request from public.shared_savings_requests where id = p_request_id for update;
  if v_request.id is null then raise exception 'Request not found.'; end if;
  if v_request.status <> 'pending' then raise exception 'Request is not pending.'; end if;
  select * into v_space from public.shared_savings where id = v_request.shared_savings_id;

  if v_request.request_type = 'contribution'
     and v_request.contribution_source_type = 'manual_historical_contribution'
     and v_space.account_holder_user_id = v_caller_id then
    if v_caller_id = v_request.requested_by_user_id and exists (
      select 1 from public.shared_savings_approvers a
      join public.shared_savings_members m on m.shared_savings_id = a.shared_savings_id and m.user_id = a.user_id
      where a.shared_savings_id = v_space.id and a.user_id <> v_caller_id and m.status = 'active'
    ) then
      raise exception 'A different active Approver must review this contribution.';
    end if;
  else
    perform public.check_shared_approver_permission(v_request.shared_savings_id, v_request.requested_by_user_id);
  end if;

  update public.shared_savings_requests
  set status = 'rejected', rejected_by_user_id = v_caller_id, rejected_at = now(), rejection_reason = p_reason
  where id = p_request_id;
  insert into public.notifications (user_id,type,title,message,entity_type,entity_id,metadata) values
    (v_request.requested_by_user_id,'shared_contribution_rejected','Pengajuan Ditolak','Pengajuan ' || v_request.request_type || ' Anda sebesar Rp' || to_char(v_request.amount, 'FM999,999,999,999') || ' ditolak.' || case when p_reason is not null and length(trim(p_reason)) > 0 then ' Alasan: ' || p_reason else '' end,'shared_savings',v_space.id,
      jsonb_build_object('shared_savings_id',v_space.id,'request_id',v_request.id,'target_path','/shared-savings/' || v_space.id::text));
  return true;
end;
$$;

grant execute on function public.submit_shared_contribution_request(uuid, uuid, numeric, text, date, text, uuid, uuid) to authenticated;
grant execute on function public.approve_shared_contribution(uuid) to authenticated;
grant execute on function public.reject_shared_request(uuid, text) to authenticated;
