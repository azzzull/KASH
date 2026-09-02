-- Migration: 202609020006_preserve_membership_history_and_identities.sql
-- Description: Preserve membership history on remove/leave and support historical identity resolution

-- 1. Update status check constraint on managed_space_members
alter table public.managed_space_members
  drop constraint if exists managed_space_members_status_check;

alter table public.managed_space_members
  add constraint managed_space_members_status_check
  check (status in ('invited', 'active', 'removed', 'left'));

-- 2. Add audit/lifecycle timestamp and actor tracking columns
alter table public.managed_space_members
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references public.profiles(id) on delete set null,
  add column if not exists left_at timestamptz;

-- 3. Update remove_managed_space_member RPC to revoke access without deleting history or row
create or replace function public.remove_managed_space_member(
  p_space_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role public.managed_space_role;
  v_target_role public.managed_space_role;
  v_target_status text;
begin
  select role into v_caller_role 
  from public.managed_space_members 
  where space_id = p_space_id and user_id = auth.uid() and status = 'active';

  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'Unauthorized';
  end if;

  select role, status into v_target_role, v_target_status 
  from public.managed_space_members 
  where space_id = p_space_id and user_id = p_user_id;

  if not found or v_target_status <> 'active' then
    raise exception 'Active member not found';
  end if;

  if v_target_role = 'owner' then
    raise exception 'Cannot remove owner';
  end if;

  if v_caller_role = 'admin' and v_target_role = 'admin' then
    raise exception 'Admin cannot remove another admin';
  end if;

  update public.managed_space_members
  set status = 'removed',
      removed_at = now(),
      removed_by = auth.uid(),
      updated_at = now()
  where space_id = p_space_id and user_id = p_user_id;
end;
$$;

grant execute on function public.remove_managed_space_member(uuid, uuid) to authenticated;

-- 4. Update leave_managed_space RPC to revoke access without deleting history or row
create or replace function public.leave_managed_space(
  p_space_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role public.managed_space_role;
  v_caller_status text;
  v_space_type public.financial_space_type;
  v_owner_user_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Unauthorized';
  end if;

  select space_type, owner_user_id into v_space_type, v_owner_user_id
  from public.financial_spaces
  where id = p_space_id;

  if not found then
    raise exception 'Space not found';
  end if;

  if v_space_type = 'personal' then
    raise exception 'Cannot leave personal space';
  end if;

  if v_owner_user_id = v_caller_id then
    raise exception 'Owner cannot leave managed space';
  end if;

  select role, status into v_caller_role, v_caller_status
  from public.managed_space_members
  where space_id = p_space_id and user_id = v_caller_id;

  if not found or v_caller_status <> 'active' or v_caller_role = 'owner' then
    raise exception 'Owner or non-active member cannot leave managed space';
  end if;

  update public.managed_space_members
  set status = 'left',
      left_at = now(),
      updated_at = now()
  where space_id = p_space_id and user_id = v_caller_id;
end;
$$;

grant execute on function public.leave_managed_space(uuid) to authenticated;

-- 5. Update get_managed_space_member_profile to allow resolving historical space actors
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
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.managed_space_members
    where space_id = p_managed_space_id
      and user_id  = v_caller_id
      and status   = 'active'
  ) then
    raise exception 'Access denied: caller is not an active member of this Managed Space';
  end if;

  if v_caller_id <> p_target_user_id and not exists (
    select 1 from public.managed_space_members
    where space_id = p_managed_space_id
      and user_id  = p_target_user_id
  ) and not exists (
    select 1 from public.transactions
    where space_id = p_managed_space_id
      and created_by_user_id = p_target_user_id
  ) and not exists (
    select 1 from public.financial_spaces
    where id = p_managed_space_id
      and owner_user_id = p_target_user_id
  ) then
    raise exception 'Access denied: target has no relationship with this Managed Space';
  end if;

  return query
    select p.id, p.full_name, p.avatar_url
    from public.profiles p
    where p.id = p_target_user_id;
end;
$$;

grant execute on function public.get_managed_space_member_profile(uuid, uuid) to authenticated;

-- 6. RPC to get identities of all actors (current and historical) in a Managed Space
create or replace function public.get_managed_space_member_identities(p_space_id uuid)
returns table (
  user_id uuid,
  full_name text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.user_has_managed_space_access(p_space_id) then
    raise exception 'Unauthorized: active membership is required.';
  end if;

  return query
  select distinct
    p.id as user_id,
    p.full_name,
    p.avatar_url
  from public.profiles p
  where p.id in (
    select m.user_id from public.managed_space_members m where m.space_id = p_space_id
    union
    select t.created_by_user_id from public.transactions t where t.space_id = p_space_id and t.created_by_user_id is not null
    union
    select s.owner_user_id from public.financial_spaces s where s.id = p_space_id
  );
end;
$$;

grant execute on function public.get_managed_space_member_identities(uuid) to authenticated;
