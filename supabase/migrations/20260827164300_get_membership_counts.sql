-- ============================================================
-- Migration: 20260827164300_get_membership_counts.sql
-- ============================================================

create or replace function public._get_phase5a1_counts()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_managed_count int;
  v_owner_count int;
  v_personal_count int;
begin
  select count(*) into v_managed_count from public.financial_spaces where space_type = 'managed';
  select count(*) into v_owner_count from public.managed_space_members where role = 'owner' and status = 'active';
  select count(*) into v_personal_count from public.managed_space_members m join public.financial_spaces s on s.id = m.space_id where s.space_type = 'personal';

  return jsonb_build_object(
    'managed_spaces_count', v_managed_count,
    'owner_memberships_count', v_owner_count,
    'personal_memberships_count', v_personal_count
  );
end;
$$;
