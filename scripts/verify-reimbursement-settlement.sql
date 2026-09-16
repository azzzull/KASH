-- Run with psql -v ON_ERROR_STOP=1 -f scripts/verify-reimbursement-settlement.sql
-- against a disposable database after migration 202609160001. All rows roll back.
begin;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_recipient uuid := gen_random_uuid();
  v_bystander uuid := gen_random_uuid();
  v_managed_space uuid;
  v_personal_space uuid;
  v_owner_personal_space uuid;
  v_managed_wallet uuid;
  v_original_wallet uuid;
  v_destination_wallet uuid;
  v_owner_personal_wallet uuid;
  v_event uuid;
  v_settlement uuid;
  v_request uuid := gen_random_uuid();
  v_allocation_request uuid := gen_random_uuid();
  v_managed_remaining numeric;
  v_personal_remaining numeric;
  v_pending numeric;
  v_balance numeric;
  v_before_net_worth numeric;
  v_after_net_worth numeric;
  v_second_event uuid;
  v_third_event uuid;
  v_third_settlement uuid;
  v_allocation_transaction uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role)
  values
    (v_owner, v_owner::text || '@kash.test', '{}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, 'authenticated', 'authenticated'),
    (v_recipient, v_recipient::text || '@kash.test', '{}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, 'authenticated', 'authenticated'),
    (v_bystander, v_bystander::text || '@kash.test', '{}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, 'authenticated', 'authenticated');
  insert into public.profiles (id, email, full_name)
  values
    (v_owner, v_owner::text || '@kash.test', 'Owner A'),
    (v_recipient, v_recipient::text || '@kash.test', 'Member B'),
    (v_bystander, v_bystander::text || '@kash.test', 'Member C')
  on conflict (id) do nothing;

  select id into v_personal_space from public.financial_spaces
  where owner_user_id = v_recipient and space_type = 'personal';
  select id into v_owner_personal_space from public.financial_spaces
  where owner_user_id = v_owner and space_type = 'personal';
  if v_personal_space is null or v_owner_personal_space is null then
    raise exception 'Personal fixture space missing';
  end if;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  insert into public.financial_spaces (owner_user_id, name, space_type)
  values (v_owner, 'Office Fixture', 'managed') returning id into v_managed_space;
  insert into public.managed_space_members (space_id, user_id, role, status)
  values (v_managed_space, v_owner, 'owner', 'active')
  on conflict (space_id, user_id) do nothing;
  insert into public.managed_space_members (space_id, user_id, role, status)
  values (v_managed_space, v_recipient, 'member', 'active')
  on conflict (space_id, user_id) do nothing;
  insert into public.wallets (user_id, space_id, name, wallet_type, initial_balance, currency)
  values (v_owner, v_managed_space, 'Petty Cash', 'cash', 1000000, 'IDR')
  returning id into v_managed_wallet;
  insert into public.wallets (user_id, space_id, name, wallet_type, initial_balance, currency)
  values (v_owner, v_owner_personal_space, 'Owner Bank', 'bank', 1000000, 'IDR')
  returning id into v_owner_personal_wallet;
  perform set_config('request.jwt.claim.sub', v_recipient::text, true);
  insert into public.wallets (user_id, space_id, name, wallet_type, initial_balance, currency)
  values (v_recipient, v_personal_space, 'GoPay', 'ewallet', 1000000, 'IDR')
  returning id into v_original_wallet;
  insert into public.wallets (user_id, space_id, name, wallet_type, initial_balance, currency)
  values (v_recipient, v_personal_space, 'myBCA', 'bank', 2000000, 'IDR')
  returning id into v_destination_wallet;

  v_event := (public.record_cross_space_expense(
    gen_random_uuid(), v_personal_space, v_managed_space, 500000,
    v_original_wallet, null, 'Office expense', null, '2026-09-10T00:00:00Z'
  )->>'event_id')::uuid;

  -- A: full direct settlement is one linked event and does not move Managed cash.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_settlement := (public.record_reimbursement_settlement_v2(
    v_request, v_event, 500000, 'external_direct', null,
    '2026-09-16T00:00:00Z', 'Supervisor paid directly'
  )->>'settlement_id')::uuid;
  select dp.remaining_amount into v_managed_remaining from public.debt_progress_view dp
  where dp.cross_space_event_id = v_event and dp.cross_space_role = 'managed_payable';
  select dp.remaining_amount into v_personal_remaining from public.debt_progress_view dp
  where dp.cross_space_event_id = v_event and dp.cross_space_role = 'personal_receivable';
  if v_managed_remaining <> 0 or v_personal_remaining <> 0 then
    raise exception 'Direct settlement did not atomically clear both obligations';
  end if;
  select current_balance into v_balance from public.wallet_balance_view where wallet_id = v_managed_wallet;
  if v_balance <> 1000000 then raise exception 'Direct settlement fabricated Managed cash'; end if;
  select amount into v_pending from public.reimbursement_receipts where settlement_id = v_settlement and destination_wallet_id is null;
  if v_pending <> 500000 then raise exception 'Pending receipt missing'; end if;
  select coalesce(sum(current_balance), 0) + v_pending into v_after_net_worth
  from public.wallet_balance_view where wallet_id in (v_original_wallet, v_destination_wallet);
  if v_after_net_worth <> 3000000 then raise exception 'Direct settlement changed Personal Net Worth'; end if;
  if exists (select 1 from public.transactions where space_id = v_personal_space and type = 'income') then
    raise exception 'Reimbursement principal became Income';
  end if;
  if exists (select 1 from public.transactions where related_entity_type = 'receivable_payment' and related_entity_id in (
    select id from public.debt_payments where cross_space_settlement_id = v_settlement
  )) then raise exception 'Direct settlement credited a Personal wallet before allocation'; end if;

  -- G: exact retry returns the same audit event.
  if (public.record_reimbursement_settlement_v2(
    v_request, v_event, 500000, 'external_direct', null,
    '2026-09-16T00:00:00Z', 'Supervisor paid directly'
  )->>'settlement_id')::uuid <> v_settlement then raise exception 'Settlement retry changed ID'; end if;
  if (select count(*) from public.cross_space_settlements where event_id = v_event) <> 1 then
    raise exception 'Settlement retry duplicated history';
  end if;

  -- B/F/H: destination can differ from payer wallet, allocation is once only.
  perform set_config('request.jwt.claim.sub', v_recipient::text, true);
  begin
    perform public.allocate_reimbursement_receipt(v_settlement, v_owner_personal_wallet, gen_random_uuid());
    raise exception 'Foreign wallet allocation unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'Foreign wallet allocation unexpectedly succeeded' then raise; end if;
  end;
  perform public.allocate_reimbursement_receipt(v_settlement, v_destination_wallet, v_allocation_request);
  perform public.allocate_reimbursement_receipt(v_settlement, v_destination_wallet, v_allocation_request);
  select t.id into v_allocation_transaction from public.transactions t
  join public.debt_payments dp on dp.id = t.related_entity_id
  where dp.cross_space_settlement_id = v_settlement and t.related_entity_type = 'receivable_payment';
  begin
    perform public.void_transaction(v_allocation_transaction);
    raise exception 'Recipient unexpectedly voided the receipt allocation';
  exception when others then
    if sqlerrm = 'Recipient unexpectedly voided the receipt allocation' then raise; end if;
  end;
  select current_balance into v_balance from public.wallet_balance_view where wallet_id = v_destination_wallet;
  if v_balance <> 2500000 then raise exception 'Recipient wallet not credited exactly once'; end if;
  select current_balance into v_balance from public.wallet_balance_view where wallet_id = v_original_wallet;
  if v_balance <> 500000 then raise exception 'Original payer wallet was credited'; end if;
  if exists (select 1 from public.reimbursement_receipts where settlement_id = v_settlement and allocated_at is null) then
    raise exception 'Receipt remains pending after allocation';
  end if;

  -- D/E: another obligation is settled 200k from Managed cash, 300k direct.
  v_second_event := (public.record_cross_space_expense(
    gen_random_uuid(), v_personal_space, v_managed_space, 500000,
    v_original_wallet, null, 'Second office expense', null, '2026-09-11T00:00:00Z'
  )->>'event_id')::uuid;
  select coalesce(sum(wb.current_balance), 0) + 500000 into v_before_net_worth
  from public.wallet_balance_view wb
  where wb.wallet_id in (v_original_wallet, v_destination_wallet);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform public.record_reimbursement_settlement_v2(
    gen_random_uuid(), v_second_event, 200000, 'managed_wallet', v_managed_wallet,
    '2026-09-12T00:00:00Z', null
  );
  select dp.remaining_amount into v_managed_remaining from public.debt_progress_view dp
  where dp.cross_space_event_id = v_second_event and dp.cross_space_role = 'managed_payable';
  select dp.remaining_amount into v_personal_remaining from public.debt_progress_view dp
  where dp.cross_space_event_id = v_second_event and dp.cross_space_role = 'personal_receivable';
  if v_managed_remaining <> 300000 or v_personal_remaining <> 300000 then
    raise exception 'Partial wallet settlement drifted';
  end if;
  perform public.record_reimbursement_settlement_v2(
    gen_random_uuid(), v_second_event, 300000, 'external_direct', null,
    '2026-09-15T00:00:00Z', null
  );
  select dp.remaining_amount into v_managed_remaining from public.debt_progress_view dp
  where dp.cross_space_event_id = v_second_event and dp.cross_space_role = 'managed_payable';
  select dp.remaining_amount into v_personal_remaining from public.debt_progress_view dp
  where dp.cross_space_event_id = v_second_event and dp.cross_space_role = 'personal_receivable';
  if v_managed_remaining <> 0 or v_personal_remaining <> 0 then raise exception 'Mixed settlement drifted'; end if;
  select current_balance into v_balance from public.wallet_balance_view where wallet_id = v_managed_wallet;
  if v_balance <> 800000 then raise exception 'Mixed settlement Managed cash delta was not -200k'; end if;
  select coalesce(sum(amount), 0) into v_pending from public.reimbursement_receipts
  where settlement_id in (select id from public.cross_space_settlements where event_id = v_second_event)
    and destination_wallet_id is null;
  if v_pending <> 500000 then raise exception 'Mixed settlement pending receipts do not total 500k'; end if;
  select coalesce(sum(wb.current_balance), 0) + v_pending into v_after_net_worth
  from public.wallet_balance_view wb
  where wb.wallet_id in (v_original_wallet, v_destination_wallet);
  if v_before_net_worth <> v_after_net_worth then raise exception 'Personal Net Worth changed on settlement'; end if;
  if exists (select 1 from public.transactions where space_id = v_managed_space and related_entity_type = 'debt_payment' and type <> 'adjustment') then
    raise exception 'Settlement changed Managed Spending/Funding';
  end if;

  -- D: a standalone partial direct payment leaves equal 200k outstanding.
  perform set_config('request.jwt.claim.sub', v_recipient::text, true);
  v_third_event := (public.record_cross_space_expense(
    gen_random_uuid(), v_personal_space, v_managed_space, 500000,
    v_destination_wallet, null, 'Third office expense', null, '2026-09-13T00:00:00Z'
  )->>'event_id')::uuid;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_third_settlement := (public.record_reimbursement_settlement_v2(
    gen_random_uuid(), v_third_event, 300000, 'external_direct', null,
    '2026-09-14T00:00:00Z', null
  )->>'settlement_id')::uuid;
  select dp.remaining_amount into v_managed_remaining from public.debt_progress_view dp
  where dp.cross_space_event_id = v_third_event and dp.cross_space_role = 'managed_payable';
  select dp.remaining_amount into v_personal_remaining from public.debt_progress_view dp
  where dp.cross_space_event_id = v_third_event and dp.cross_space_role = 'personal_receivable';
  select amount into v_pending from public.reimbursement_receipts where settlement_id = v_third_settlement;
  if v_managed_remaining <> 200000 or v_personal_remaining <> 200000 or v_pending <> 300000 then
    raise exception 'Partial direct settlement did not reconcile';
  end if;
  select current_balance into v_balance from public.wallet_balance_view where wallet_id = v_managed_wallet;
  if v_balance <> 800000 then raise exception 'Partial direct payment moved Managed cash'; end if;

  perform set_config('kash.fixture.owner_id', v_owner::text, true);
  perform set_config('kash.fixture.bystander_id', v_bystander::text, true);
  perform set_config('kash.fixture.original_wallet_id', v_original_wallet::text, true);
  perform set_config('kash.fixture.destination_wallet_id', v_destination_wallet::text, true);
end;
$$;

-- C: authenticate as Owner A and Member C to exercise wallet RLS.
select set_config('request.jwt.claim.sub', current_setting('kash.fixture.owner_id'), true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.wallets where id in (current_setting('kash.fixture.original_wallet_id')::uuid, current_setting('kash.fixture.destination_wallet_id')::uuid)) then
    raise exception 'Managed Owner can read recipient Personal wallets';
  end if;
  if exists (select 1 from public.wallet_balance_view where wallet_id in (current_setting('kash.fixture.original_wallet_id')::uuid, current_setting('kash.fixture.destination_wallet_id')::uuid)) then
    raise exception 'Managed Owner can read recipient Personal balances';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('kash.fixture.bystander_id'), true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.wallets where id in (current_setting('kash.fixture.original_wallet_id')::uuid, current_setting('kash.fixture.destination_wallet_id')::uuid)) then
    raise exception 'Other member can read recipient Personal wallets';
  end if;
  if exists (select 1 from public.wallet_balance_view where wallet_id in (current_setting('kash.fixture.original_wallet_id')::uuid, current_setting('kash.fixture.destination_wallet_id')::uuid)) then
    raise exception 'Other member can read recipient Personal balances';
  end if;
end $$;
reset role;

rollback;
