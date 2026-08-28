-- get_managed_space_member_profile
-- Minimal SECURITY DEFINER RPC for resolving another active member's identity
-- within a Managed Space (e.g., to display the reimbursement payer's name).
--
-- Authorization:
--   - caller must have active membership in p_managed_space_id
--   - target user must also have active membership in p_managed_space_id
--   - OR target is the caller themselves
--
-- Returns only: user_id, full_name, avatar_url.
-- Does NOT return: email, currency, locale, financial data.

create or replace function public.get_managed_space_member_profile(
  p_managed_space_id uuid,
  p_target_user_id   uuid
)
returns table (
  user_id    uuid,
  full_name  text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  -- Caller must be authenticated
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Caller must be an active member of the Managed Space
  if not exists (
    select 1 from public.managed_space_members
    where space_id = p_managed_space_id
      and user_id  = v_caller_id
      and status   = 'active'
  ) then
    raise exception 'Access denied: caller is not an active member of this Managed Space';
  end if;

  -- Target must also be an active member of the same space
  -- (or be the caller — handles self-view)
  if v_caller_id <> p_target_user_id and not exists (
    select 1 from public.managed_space_members
    where space_id = p_managed_space_id
      and user_id  = p_target_user_id
      and status   = 'active'
  ) then
    raise exception 'Access denied: target is not an active member of this Managed Space';
  end if;

  -- Return minimal identity only (no email, no financial columns)
  return query
    select p.id, p.full_name, p.avatar_url
    from public.profiles p
    where p.id = p_target_user_id;
end;
$$;

-- Revoke direct execute from public, grant to authenticated only
revoke execute on function public.get_managed_space_member_profile(uuid, uuid) from public;
grant  execute on function public.get_managed_space_member_profile(uuid, uuid) to authenticated;
