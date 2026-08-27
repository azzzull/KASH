-- ============================================================
-- Migration: 20260827164200_verify_phase5a1.sql
-- Verification & Assertion suite for Phase 5A.1
-- ============================================================

do $$
declare
  v_managed_space_count int;
  v_owner_membership_count int;
  v_personal_space_memberships int;
  v_sample_personal_space_id uuid;
  v_sample_user_id uuid;
  v_sample_managed_space_id uuid;
  v_sample_owner_id uuid;
  v_error_caught boolean;
begin
  -- 1. Count of Managed Spaces vs Active Owner Memberships
  select count(*) into v_managed_space_count
  from public.financial_spaces
  where space_type = 'managed';

  select count(*) into v_owner_membership_count
  from public.managed_space_members
  where role = 'owner' and status = 'active';

  if v_managed_space_count <> v_owner_membership_count then
    raise exception 'Assertion Failed: managed_space_count (%) != owner_membership_count (%)',
      v_managed_space_count, v_owner_membership_count;
  end if;

  -- 2. Count of Personal Space memberships must be 0
  select count(*) into v_personal_space_memberships
  from public.managed_space_members m
  join public.financial_spaces s on s.id = m.space_id
  where s.space_type = 'personal';

  if v_personal_space_memberships <> 0 then
    raise exception 'Assertion Failed: Found % memberships attached to personal spaces',
      v_personal_space_memberships;
  end if;

  -- 3. Verify duplicate membership protection
  select space_id, user_id into v_sample_managed_space_id, v_sample_owner_id
  from public.managed_space_members
  limit 1;

  if v_sample_managed_space_id is not null then
    v_error_caught := false;
    begin
      insert into public.managed_space_members (space_id, user_id, role, status)
      values (v_sample_managed_space_id, v_sample_owner_id, 'admin', 'active');
    exception when others then
      v_error_caught := true;
    end;

    if not v_error_caught then
      raise exception 'Assertion Failed: Duplicate membership was allowed!';
    end if;
  end if;

  -- 4. Verify Personal Space membership rejection
  select id, owner_user_id into v_sample_personal_space_id, v_sample_user_id
  from public.financial_spaces
  where space_type = 'personal'
  limit 1;

  if v_sample_personal_space_id is not null then
    v_error_caught := false;
    begin
      insert into public.managed_space_members (space_id, user_id, role, status)
      values (v_sample_personal_space_id, v_sample_user_id, 'member', 'active');
    exception when others then
      v_error_caught := true;
    end;

    if not v_error_caught then
      raise exception 'Assertion Failed: Personal space membership insertion was allowed!';
    end if;
  end if;

  raise notice 'Phase 5A.1 verification PASSED: % managed spaces backfilled, % personal space memberships, duplicate protection verified.',
    v_managed_space_count, v_personal_space_memberships;
end;
$$;
