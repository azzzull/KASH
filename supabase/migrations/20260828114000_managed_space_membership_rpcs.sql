-- KASH Phase 5A.5a - Managed Space Membership RPCs

create or replace function public.get_managed_space_members(p_space_id uuid)
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  role public.managed_space_role,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.user_has_managed_space_access(p_space_id) then
    raise exception 'Unauthorized: Must be an active member to view space members';
  end if;

  return query
  select 
    m.user_id,
    p.full_name,
    p.avatar_url,
    m.role,
    m.status,
    m.created_at
  from public.managed_space_members m
  join public.profiles p on p.id = m.user_id
  where m.space_id = p_space_id;
end;
$$;

create or replace function public.add_managed_space_member(
  p_space_id uuid,
  p_email text,
  p_role public.managed_space_role
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role public.managed_space_role;
  v_target_user_id uuid;
begin
  select role into v_caller_role 
  from public.managed_space_members 
  where space_id = p_space_id and user_id = auth.uid() and status = 'active';

  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'Unauthorized';
  end if;

  if p_role = 'owner' then
    raise exception 'Cannot add an owner';
  end if;
  
  if v_caller_role = 'admin' and p_role = 'admin' then
    raise exception 'Admin cannot create an admin';
  end if;

  select id into v_target_user_id 
  from public.profiles 
  where email = lower(trim(p_email));
  
  if not found then
    raise exception 'User not found';
  end if;

  if v_target_user_id = auth.uid() then
    raise exception 'Cannot add yourself';
  end if;

  insert into public.managed_space_members (space_id, user_id, role, status, invited_by)
  values (p_space_id, v_target_user_id, p_role, 'active', auth.uid());

  return jsonb_build_object('success', true, 'user_id', v_target_user_id);
end;
$$;

create or replace function public.update_managed_space_member_role(
  p_space_id uuid,
  p_user_id uuid,
  p_new_role public.managed_space_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role public.managed_space_role;
  v_target_role public.managed_space_role;
begin
  select role into v_caller_role 
  from public.managed_space_members 
  where space_id = p_space_id and user_id = auth.uid() and status = 'active';

  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'Unauthorized';
  end if;

  if p_new_role = 'owner' then
    raise exception 'Cannot assign owner role';
  end if;

  select role into v_target_role 
  from public.managed_space_members 
  where space_id = p_space_id and user_id = p_user_id;

  if not found then
    raise exception 'Member not found';
  end if;

  if v_target_role = 'owner' then
    raise exception 'Cannot modify owner';
  end if;

  if v_caller_role = 'admin' then
    if v_target_role = 'admin' then
      raise exception 'Admin cannot modify another admin';
    end if;
    if p_new_role = 'admin' then
      raise exception 'Admin cannot promote to admin';
    end if;
  end if;

  update public.managed_space_members
  set role = p_new_role, updated_at = now()
  where space_id = p_space_id and user_id = p_user_id;
end;
$$;

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
begin
  select role into v_caller_role 
  from public.managed_space_members 
  where space_id = p_space_id and user_id = auth.uid() and status = 'active';

  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'Unauthorized';
  end if;

  select role into v_target_role 
  from public.managed_space_members 
  where space_id = p_space_id and user_id = p_user_id;

  if not found then
    raise exception 'Member not found';
  end if;

  if v_target_role = 'owner' then
    raise exception 'Cannot remove owner';
  end if;

  if v_caller_role = 'admin' and v_target_role = 'admin' then
    raise exception 'Admin cannot remove another admin';
  end if;

  delete from public.managed_space_members
  where space_id = p_space_id and user_id = p_user_id;
end;
$$;
