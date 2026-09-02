-- Migration: 202609020005_leave_managed_space_rpc.sql
-- Description: RPC for non-owner members (Admin, Member, Viewer) to leave a Managed Space

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

  select role into v_caller_role
  from public.managed_space_members
  where space_id = p_space_id and user_id = v_caller_id;

  if not found or v_caller_role = 'owner' then
    raise exception 'Owner or non-member cannot leave managed space';
  end if;

  delete from public.managed_space_members
  where space_id = p_space_id and user_id = v_caller_id;
end;
$$;

grant execute on function public.leave_managed_space(uuid) to authenticated;
