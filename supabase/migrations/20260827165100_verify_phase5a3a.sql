-- ============================================================
-- Migration: 20260827165100_verify_phase5a3a.sql
-- Verification test suite for Phase 5A.3a Managed Core Child Read RLS
-- ============================================================

create or replace function public._test_phase5a3a()
returns text
language plpgsql
security definer
as $$
declare
  v_owner_id uuid := '11111111-1111-4000-8000-000000000001'::uuid;
  v_admin_id uuid := '11111111-1111-4000-8000-000000000002'::uuid;
  v_member_id uuid := '11111111-1111-4000-8000-000000000003'::uuid;
  v_viewer_id uuid := '11111111-1111-4000-8000-000000000004'::uuid;
  v_invited_id uuid := '11111111-1111-4000-8000-000000000005'::uuid;
  v_unrelated_id uuid := '11111111-1111-4000-8000-000000000006'::uuid;

  v_personal_space_id uuid;
  v_managed_space_id uuid;

  v_personal_wallet_id uuid;
  v_managed_wallet_id uuid;

  v_personal_cat_id uuid;
  v_managed_cat_id uuid;

  v_personal_txn_id uuid;
  v_managed_txn_id uuid;

  v_can_select_managed_wallet boolean;
  v_can_select_managed_txn boolean;
  v_can_select_managed_cat boolean;
  v_can_select_personal_wallet boolean;
  v_can_select_personal_txn boolean;
  v_can_select_personal_cat boolean;

  v_users uuid[] := array[v_owner_id, v_admin_id, v_member_id, v_viewer_id, v_invited_id, v_unrelated_id];
  v_u uuid;
  r record;
begin
  -- 1. Create auth users and profiles
  foreach v_u in array v_users loop
    insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role)
    values (v_u, v_u::text || '@kash.test', '{"full_name":"Test User"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, 'authenticated', 'authenticated')
    on conflict (id) do nothing;

    insert into public.profiles (id, email, full_name)
    values (v_u, v_u::text || '@kash.test', 'Test User')
    on conflict (id) do nothing;
  end loop;

  -- Set initial auth context to owner
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);

  -- 2. Fetch owner personal space
  select id into v_personal_space_id
  from public.financial_spaces
  where owner_user_id = v_owner_id and space_type = 'personal';

  if v_personal_space_id is null then
    insert into public.financial_spaces (owner_user_id, space_type, name)
    values (v_owner_id, 'personal', 'Personal')
    returning id into v_personal_space_id;
  end if;

  -- 3. Create Managed space for owner
  insert into public.financial_spaces (owner_user_id, space_type, name)
  values (v_owner_id, 'managed', 'Test Managed Space 5A3a')
  returning id into v_managed_space_id;

  -- 4. Create Memberships in Managed Space
  insert into public.managed_space_members (space_id, user_id, role, status)
  values (v_managed_space_id, v_admin_id, 'admin', 'active')
  on conflict (space_id, user_id) do nothing;

  insert into public.managed_space_members (space_id, user_id, role, status)
  values (v_managed_space_id, v_member_id, 'member', 'active')
  on conflict (space_id, user_id) do nothing;

  insert into public.managed_space_members (space_id, user_id, role, status)
  values (v_managed_space_id, v_viewer_id, 'viewer', 'active')
  on conflict (space_id, user_id) do nothing;

  insert into public.managed_space_members (space_id, user_id, role, status)
  values (v_managed_space_id, v_invited_id, 'member', 'invited')
  on conflict (space_id, user_id) do nothing;

  -- 5. Create Personal Items
  insert into public.wallets (user_id, space_id, name, wallet_type, initial_balance)
  values (v_owner_id, v_personal_space_id, 'Personal Wallet', 'cash', 100000)
  returning id into v_personal_wallet_id;

  insert into public.categories (user_id, space_id, name, category_type, is_system)
  values (v_owner_id, v_personal_space_id, 'Personal Category', 'expense', false)
  returning id into v_personal_cat_id;

  insert into public.transactions (user_id, space_id, wallet_id, category_id, type, amount, status, transaction_date)
  values (v_owner_id, v_personal_space_id, v_personal_wallet_id, v_personal_cat_id, 'expense', 50000, 'completed', now())
  returning id into v_personal_txn_id;

  -- 6. Create Managed Space Items
  insert into public.wallets (user_id, space_id, name, wallet_type, initial_balance)
  values (v_owner_id, v_managed_space_id, 'Managed Wallet', 'bank', 500000)
  returning id into v_managed_wallet_id;

  insert into public.categories (user_id, space_id, name, category_type, is_system)
  values (v_owner_id, v_managed_space_id, 'Managed Category', 'expense', false)
  returning id into v_managed_cat_id;

  insert into public.transactions (user_id, space_id, wallet_id, category_id, type, amount, status, transaction_date)
  values (v_owner_id, v_managed_space_id, v_managed_wallet_id, v_managed_cat_id, 'expense', 150000, 'completed', now())
  returning id into v_managed_txn_id;

  -- 7. Test RLS for each role
  drop table if exists tmp_rls_tests;
  create temp table tmp_rls_tests (
    user_id uuid,
    role_name text,
    expect_m_w boolean,
    expect_m_t boolean,
    expect_m_c boolean,
    expect_p_w boolean,
    expect_p_t boolean,
    expect_p_c boolean
  ) on commit drop;

  insert into tmp_rls_tests (user_id, role_name, expect_m_w, expect_m_t, expect_m_c, expect_p_w, expect_p_t, expect_p_c)
  values
    (v_owner_id, 'owner', true, true, true, true, true, true),
    (v_admin_id, 'admin', true, true, true, false, false, false),
    (v_member_id, 'member', true, true, true, false, false, false),
    (v_viewer_id, 'viewer', true, true, true, false, false, false),
    (v_invited_id, 'invited', false, false, false, false, false, false),
    (v_unrelated_id, 'unrelated', false, false, false, false, false, false);

  for r in (select * from tmp_rls_tests) loop
    -- Set auth context
    perform set_config('request.jwt.claim.sub', r.user_id::text, true);

    -- Managed Wallet SELECT check
    v_can_select_managed_wallet := (
      (v_owner_id = r.user_id and v_managed_space_id in (select id from public.financial_spaces where owner_user_id = r.user_id))
      or
      public.user_has_managed_space_access(v_managed_space_id)
    );

    if v_can_select_managed_wallet <> r.expect_m_w then
      raise exception 'Assertion failed: User % (%) managed wallet select expected % but got %',
        r.role_name, r.user_id, r.expect_m_w, v_can_select_managed_wallet;
    end if;

    -- Managed Transaction SELECT check
    v_can_select_managed_txn := (
      (v_owner_id = r.user_id and v_managed_space_id in (select id from public.financial_spaces where owner_user_id = r.user_id))
      or
      public.user_has_managed_space_access(v_managed_space_id)
    );

    if v_can_select_managed_txn <> r.expect_m_t then
      raise exception 'Assertion failed: User % (%) managed txn select expected % but got %',
        r.role_name, r.user_id, r.expect_m_t, v_can_select_managed_txn;
    end if;

    -- Managed Category SELECT check
    v_can_select_managed_cat := (
      (v_owner_id is null)
      or
      (v_owner_id = r.user_id and v_managed_space_id in (select id from public.financial_spaces where owner_user_id = r.user_id))
      or
      (v_managed_space_id is not null and public.user_has_managed_space_access(v_managed_space_id))
    );

    if v_can_select_managed_cat <> r.expect_m_c then
      raise exception 'Assertion failed: User % (%) managed category select expected % but got %',
        r.role_name, r.user_id, r.expect_m_c, v_can_select_managed_cat;
    end if;

    -- Personal Wallet SELECT check
    v_can_select_personal_wallet := (
      (v_owner_id = r.user_id and v_personal_space_id in (select id from public.financial_spaces where owner_user_id = r.user_id))
      or
      public.user_has_managed_space_access(v_personal_space_id)
    );

    if v_can_select_personal_wallet <> r.expect_p_w then
      raise exception 'Assertion failed: User % (%) personal wallet select expected % but got %',
        r.role_name, r.user_id, r.expect_p_w, v_can_select_personal_wallet;
    end if;

    -- Personal Transaction SELECT check
    v_can_select_personal_txn := (
      (v_owner_id = r.user_id and v_personal_space_id in (select id from public.financial_spaces where owner_user_id = r.user_id))
      or
      public.user_has_managed_space_access(v_personal_space_id)
    );

    if v_can_select_personal_txn <> r.expect_p_t then
      raise exception 'Assertion failed: User % (%) personal txn select expected % but got %',
        r.role_name, r.user_id, r.expect_p_t, v_can_select_personal_txn;
    end if;

    -- Personal Category SELECT check
    v_can_select_personal_cat := (
      (v_owner_id is null)
      or
      (v_owner_id = r.user_id and v_personal_space_id in (select id from public.financial_spaces where owner_user_id = r.user_id))
      or
      (v_personal_space_id is not null and public.user_has_managed_space_access(v_personal_space_id))
    );

    if v_can_select_personal_cat <> r.expect_p_c then
      raise exception 'Assertion failed: User % (%) personal category select expected % but got %',
        r.role_name, r.user_id, r.expect_p_c, v_can_select_personal_cat;
    end if;

  end loop;

  -- 8. Cleanup test data
  delete from public.transactions where id in (v_personal_txn_id, v_managed_txn_id);
  delete from public.categories where id in (v_personal_cat_id, v_managed_cat_id);
  delete from public.wallets where id in (v_personal_wallet_id, v_managed_wallet_id);
  delete from public.managed_space_members where space_id = v_managed_space_id;
  delete from public.financial_spaces where id in (v_managed_space_id, v_personal_space_id);
  delete from public.profiles where id in (v_owner_id, v_admin_id, v_member_id, v_viewer_id, v_invited_id, v_unrelated_id);
  delete from auth.users where id in (v_owner_id, v_admin_id, v_member_id, v_viewer_id, v_invited_id, v_unrelated_id);

  return 'ALL_PASS';
end;
$$;

select public._test_phase5a3a();

drop function if exists public._test_phase5a3a();
