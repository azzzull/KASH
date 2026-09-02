begin;

create temp table fixture_refs (
  key text primary key,
  value uuid not null
) on commit drop;

grant select on fixture_refs to authenticated;

do $$
declare
  v_owner uuid := 'b0040000-0000-4000-8000-000000000001';
  v_admin uuid := 'b0040000-0000-4000-8000-000000000002';
  v_b uuid := 'b0040000-0000-4000-8000-000000000003';
  v_d uuid := 'b0040000-0000-4000-8000-000000000004';
  v_e uuid := 'b0040000-0000-4000-8000-000000000005';
  v_f uuid := 'b0040000-0000-4000-8000-000000000006';
  v_g uuid := 'b0040000-0000-4000-8000-000000000007';
  v_h uuid := 'b0040000-0000-4000-8000-000000000008';
  v_managed uuid := 'b0041000-0000-4000-8000-000000000001';
  v_managed_wallet uuid := 'b0042000-0000-4000-8000-000000000001';
  v_managed_category uuid := 'b0043000-0000-4000-8000-000000000001';
  v_counterparty uuid := 'b0044000-0000-4000-8000-000000000001';
  v_debt uuid := 'b0045000-0000-4000-8000-000000000001';
  v_personal uuid;
  v_safe_wallet uuid := 'b0042000-0000-4000-8000-000000000002';
  v_blocked_wallet uuid := 'b0042000-0000-4000-8000-000000000003';
  v_other_personal_wallet uuid := 'b0042000-0000-4000-8000-000000000004';
  v_created_space uuid;
  v_result jsonb;
  v_analysis jsonb;
  v_invite_b uuid;
  v_invite_d uuid;
  v_invite_e uuid;
  v_invite_f uuid;
  v_invite_g uuid;
  v_detail record;
  v_shared_accept uuid;
  v_shared_decline uuid;
  v_shared_space uuid;
  v_user uuid;
  v_email text;
begin
  foreach v_user in array array[v_owner, v_admin, v_b, v_d, v_e, v_f, v_g, v_h]
  loop
    v_email := 'managed-fixture-' || right(v_user::text, 1) || '@kash.test';
    insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role)
    values (
      v_user,
      v_email,
      jsonb_build_object('full_name', 'Fixture ' || right(v_user::text, 1)),
      '{"provider":"email","providers":["email"]}'::jsonb,
      'authenticated',
      'authenticated'
    );

    insert into public.profiles (id, email, full_name, locale)
    values (v_user, v_email, 'Fixture ' || right(v_user::text, 1), 'id')
    on conflict (id) do update
    set email = excluded.email, full_name = excluded.full_name, locale = excluded.locale;
  end loop;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  select id into v_created_space
  from public.create_managed_space('Onboarding Zero Wallet');

  if (select count(*) from public.wallets where space_id = v_created_space) <> 0 then
    raise exception 'ASSERT: Managed creation must not create a wallet before setup';
  end if;

  if not exists (
    select 1 from public.managed_space_members
    where space_id = v_created_space and user_id = v_owner
      and role = 'owner' and status = 'active'
  ) then
    raise exception 'ASSERT: Managed creation must create active owner membership';
  end if;

  insert into public.financial_spaces (id, owner_user_id, name, space_type, is_archived)
  values (v_managed, v_owner, 'Kantor Fixture', 'managed', false);

  insert into public.managed_space_members (space_id, user_id, role, status, invited_by)
  values (v_managed, v_admin, 'admin', 'active', v_owner);

  insert into public.wallets (id, user_id, space_id, name, wallet_type, initial_balance, currency)
  values (v_managed_wallet, v_owner, v_managed, 'Managed Cash', 'cash', 500000, 'IDR');

  insert into public.categories (id, user_id, space_id, name, category_type, is_system)
  values (v_managed_category, v_owner, v_managed, 'Managed Supplies', 'expense', false);

  insert into public.transactions (
    user_id, created_by_user_id, space_id, wallet_id, category_id,
    type, amount, status, transaction_date, title
  ) values (
    v_owner, v_owner, v_managed, v_managed_wallet, v_managed_category,
    'expense', 25000, 'completed', now(), 'Managed fixture spending'
  );

  insert into public.counterparties (id, user_id, space_id, name)
  values (v_counterparty, v_owner, v_managed, 'Managed Vendor');

  insert into public.debts (id, user_id, space_id, counterparty_id, type, title, original_amount)
  values (v_debt, v_owner, v_managed, v_counterparty, 'debt', 'Managed invoice', 100000);

  select id into v_personal
  from public.financial_spaces
  where owner_user_id = v_owner and space_type = 'personal';

  insert into public.wallets (id, user_id, space_id, name, wallet_type, initial_balance, currency)
  values
    (v_safe_wallet, v_owner, v_personal, 'Safe Personal Wallet', 'cash', 1000000, 'IDR'),
    (v_blocked_wallet, v_owner, v_personal, 'Blocked Personal Wallet', 'cash', 500000, 'IDR'),
    (v_other_personal_wallet, v_owner, v_personal, 'Other Personal Wallet', 'cash', 100000, 'IDR');

  insert into public.transactions (
    user_id, created_by_user_id, space_id, wallet_id,
    type, amount, status, transaction_date, title
  ) values
    (v_owner, v_owner, v_personal, v_safe_wallet, 'income', 200000, 'completed', now(), 'Fixture income'),
    (v_owner, v_owner, v_personal, v_safe_wallet, 'expense', 50000, 'completed', now(), 'Fixture expense');

  v_analysis := public.analyze_wallet_move_to_managed(v_safe_wallet, v_managed);
  if not coalesce((v_analysis->>'can_move')::boolean, false) then
    raise exception 'ASSERT: safe Personal wallet should pass authoritative preview';
  end if;

  v_result := public.move_wallet_to_managed(v_safe_wallet, v_managed);
  if (v_result->>'balance_before')::numeric <> (v_result->>'balance_after')::numeric then
    raise exception 'ASSERT: wallet migration changed balance';
  end if;
  if not exists (select 1 from public.wallets where id = v_safe_wallet and space_id = v_managed) then
    raise exception 'ASSERT: safe wallet was not moved to Managed Space';
  end if;
  if exists (select 1 from public.transactions where wallet_id = v_safe_wallet and space_id <> v_managed) then
    raise exception 'ASSERT: moved wallet history remained in Personal space';
  end if;

  insert into public.transactions (
    user_id, created_by_user_id, space_id, wallet_id, destination_wallet_id,
    type, amount, status, transaction_date, title
  ) values (
    v_owner, v_owner, v_personal, v_blocked_wallet, v_other_personal_wallet,
    'transfer', 10000, 'completed', now(), 'Blocking transfer'
  );

  v_analysis := public.analyze_wallet_move_to_managed(v_blocked_wallet, v_managed);
  if coalesce((v_analysis->>'can_move')::boolean, true) then
    raise exception 'ASSERT: active Personal cross-wallet transfer must block migration';
  end if;
  if not exists (select 1 from public.wallets where id = v_blocked_wallet and space_id = v_personal) then
    raise exception 'ASSERT: blocked migration changed wallet space';
  end if;

  v_result := public.invite_managed_space_member(
    v_managed,
    'managed-fixture-3@kash.test',
    'member'
  );
  v_invite_b := (v_result->>'invitation_id')::uuid;

  v_result := public.invite_managed_space_member(
    v_managed,
    'managed-fixture-3@kash.test',
    'member'
  );
  if not (v_result->>'duplicate')::boolean
    or (v_result->>'invitation_id')::uuid <> v_invite_b then
    raise exception 'ASSERT: duplicate invitation request was not idempotent';
  end if;

  if (select count(*) from public.managed_space_invitations where space_id = v_managed and invited_user_id = v_b and status = 'pending') <> 1 then
    raise exception 'ASSERT: duplicate pending invitations were created';
  end if;
  if (select count(*) from public.notifications where entity_type = 'managed_space_invitation' and entity_id = v_invite_b) <> 1 then
    raise exception 'ASSERT: duplicate invitation notifications were created';
  end if;
  if exists (select 1 from public.managed_space_members where space_id = v_managed and user_id = v_b) then
    raise exception 'ASSERT: pending invitation created membership access';
  end if;

  select * into v_detail from public.get_managed_space_invitation(v_invite_b);
  if v_detail.invited_by <> v_owner
    or v_detail.inviter_name <> 'Fixture 1'
    or v_detail.inviter_email <> 'managed-fixture-1@kash.test'
    or v_detail.space_name <> 'Kantor Fixture'
    or v_detail.role <> 'member' then
    raise exception 'ASSERT: invitation identity, space, or role is incorrect';
  end if;

  if not exists (
    select 1 from public.notifications
    where entity_id = v_invite_b
      and type = 'managed_space_invitation'
      and metadata->>'target_path' = '/managed-invitations/' || v_invite_b::text
  ) then
    raise exception 'ASSERT: in-app invitation notification or deep-link is incorrect';
  end if;

  v_result := public.invite_managed_space_member(v_managed, 'managed-fixture-4@kash.test', 'viewer');
  v_invite_d := (v_result->>'invitation_id')::uuid;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  v_result := public.invite_managed_space_member(v_managed, 'managed-fixture-5@kash.test', 'member');
  v_invite_e := (v_result->>'invitation_id')::uuid;
  v_result := public.invite_managed_space_member(v_managed, 'managed-fixture-6@kash.test', 'viewer');
  v_invite_f := (v_result->>'invitation_id')::uuid;

  if exists (
    select 1 from public.managed_space_invitations
    where id in (v_invite_e, v_invite_f) and invited_by <> v_admin
  ) then
    raise exception 'ASSERT: Admin invitation actor was replaced by owner';
  end if;

  begin
    perform public.invite_managed_space_member(v_managed, 'managed-fixture-7@kash.test', 'admin');
    raise exception 'ASSERT_ADMIN_ESCALATION_ALLOWED';
  exception
    when others then
      if sqlerrm = 'ASSERT_ADMIN_ESCALATION_ALLOWED' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_result := public.invite_managed_space_member(v_managed, 'managed-fixture-7@kash.test', 'admin');
  v_invite_g := (v_result->>'invitation_id')::uuid;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  begin
    perform public.cancel_managed_space_invitation(v_invite_g);
    raise exception 'ASSERT_ADMIN_CANCELLED_ADMIN_INVITE';
  exception
    when others then
      if sqlerrm = 'ASSERT_ADMIN_CANCELLED_ADMIN_INVITE' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform public.cancel_managed_space_invitation(v_invite_g);
  if not exists (select 1 from public.managed_space_invitations where id = v_invite_g and status = 'cancelled') then
    raise exception 'ASSERT: Owner could not cancel pending Admin invitation';
  end if;

  insert into fixture_refs(key, value) values
    ('owner', v_owner), ('admin', v_admin), ('b', v_b), ('d', v_d),
    ('managed', v_managed), ('managed_wallet', v_managed_wallet),
    ('managed_category', v_managed_category), ('debt', v_debt),
    ('personal', v_personal), ('invite_b', v_invite_b), ('invite_d', v_invite_d);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0040000-0000-4000-8000-000000000003', true);

do $$
declare
  v_managed uuid := 'b0041000-0000-4000-8000-000000000001';
begin
  if exists (select 1 from public.financial_spaces where id = v_managed) then
    raise exception 'ASSERT: pending user can read Managed Space';
  end if;
  if exists (select 1 from public.wallets where space_id = v_managed) then
    raise exception 'ASSERT: pending user can read Managed wallets';
  end if;
  if exists (select 1 from public.transactions where space_id = v_managed) then
    raise exception 'ASSERT: pending user can read Managed transactions/dashboard/analytics data';
  end if;
  if exists (select 1 from public.categories where space_id = v_managed) then
    raise exception 'ASSERT: pending user can read Managed categories';
  end if;
  if exists (select 1 from public.debts where space_id = v_managed) then
    raise exception 'ASSERT: pending user can read Managed debts';
  end if;

  begin
    perform * from public.get_managed_space_members(v_managed);
    raise exception 'ASSERT_PENDING_MEMBERS_RPC_ALLOWED';
  exception
    when others then
      if sqlerrm = 'ASSERT_PENDING_MEMBERS_RPC_ALLOWED' then raise; end if;
  end;
end;
$$;

reset role;

do $$
declare
  v_b uuid := 'b0040000-0000-4000-8000-000000000003';
  v_d uuid := 'b0040000-0000-4000-8000-000000000004';
  v_owner uuid := 'b0040000-0000-4000-8000-000000000001';
  v_h uuid := 'b0040000-0000-4000-8000-000000000008';
  v_managed uuid := 'b0041000-0000-4000-8000-000000000001';
  v_invite_b uuid := (select value from fixture_refs where key = 'invite_b');
  v_invite_d uuid := (select value from fixture_refs where key = 'invite_d');
  v_shared_space uuid;
  v_shared_accept uuid;
  v_shared_decline uuid;
  v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  v_result := public.respond_managed_space_invitation(v_invite_b, 'accept');
  if v_result->>'status' <> 'accepted' then
    raise exception 'ASSERT: Accept response status is incorrect';
  end if;
  if not exists (
    select 1 from public.managed_space_members
    where space_id = v_managed and user_id = v_b and role = 'member' and status = 'active'
  ) then
    raise exception 'ASSERT: Accept did not create active membership with invited role';
  end if;
  if not exists (select 1 from public.managed_space_invitations where id = v_invite_b and status = 'accepted') then
    raise exception 'ASSERT: Accept did not resolve invitation';
  end if;
  if exists (
    select 1 from public.notifications
    where entity_id = v_invite_b and user_id = v_b and not is_read
  ) then
    raise exception 'ASSERT: Accepted invitation notification remains actionable';
  end if;

  perform set_config('request.jwt.claim.sub', v_d::text, true);
  v_result := public.respond_managed_space_invitation(v_invite_d, 'decline');
  if v_result->>'status' <> 'declined' then
    raise exception 'ASSERT: Decline response status is incorrect';
  end if;
  if exists (select 1 from public.managed_space_members where space_id = v_managed and user_id = v_d) then
    raise exception 'ASSERT: Decline created Managed access';
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_shared_space := public.create_shared_savings('Shared Regression Fixture', 1000000, null, 'users', '#10B981');
  v_shared_accept := public.invite_shared_savings_member(v_shared_space, 'managed-fixture-8@kash.test');
  v_shared_decline := public.invite_shared_savings_member(v_shared_space, 'managed-fixture-4@kash.test');

  perform set_config('request.jwt.claim.sub', v_h::text, true);
  if not public.respond_shared_savings_invite(v_shared_accept, 'accept') then
    raise exception 'ASSERT: Shared Savings Accept regression';
  end if;
  if not exists (
    select 1 from public.shared_savings_members
    where shared_savings_id = v_shared_space and user_id = v_h and status = 'active'
  ) then
    raise exception 'ASSERT: Shared Savings accepted membership missing';
  end if;

  perform set_config('request.jwt.claim.sub', v_d::text, true);
  if not public.respond_shared_savings_invite(v_shared_decline, 'reject') then
    raise exception 'ASSERT: Shared Savings Reject regression';
  end if;
  if not exists (select 1 from public.shared_savings_invites where id = v_shared_decline and status = 'rejected') then
    raise exception 'ASSERT: Shared Savings rejected status missing';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0040000-0000-4000-8000-000000000003', true);

do $$
declare
  v_owner uuid := 'b0040000-0000-4000-8000-000000000001';
  v_managed uuid := 'b0041000-0000-4000-8000-000000000001';
  v_personal uuid := (select value from fixture_refs where key = 'personal');
begin
  if not exists (select 1 from public.financial_spaces where id = v_managed) then
    raise exception 'ASSERT: accepted Managed Space missing from switcher query';
  end if;
  if not exists (select 1 from public.wallets where space_id = v_managed) then
    raise exception 'ASSERT: active Member cannot read Managed wallets';
  end if;
  if not exists (select 1 from public.transactions where space_id = v_managed) then
    raise exception 'ASSERT: active Member cannot read Managed transactions';
  end if;
  if exists (select 1 from public.wallets where space_id = v_personal and user_id = v_owner) then
    raise exception 'ASSERT: active Managed member can read owner Personal wallet';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'b0040000-0000-4000-8000-000000000004', true);

do $$
begin
  if exists (select 1 from public.financial_spaces where id = 'b0041000-0000-4000-8000-000000000001') then
    raise exception 'ASSERT: declined user can read Managed Space';
  end if;
end;
$$;

reset role;
rollback;
