-- Qualify table columns in the Managed member profile helper.
-- Supabase lint treats output column names as PL/pgSQL variables, so unqualified
-- user_id references are ambiguous inside the function body.

create or replace function public.get_managed_space_member_profile(
  p_managed_space_id uuid,
  p_target_user_id uuid
)
returns table (
  user_id uuid,
  full_name text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.managed_space_members m
    where m.space_id = p_managed_space_id
      and m.user_id = v_caller_id
      and m.status = 'active'
  ) then
    raise exception 'Access denied: caller is not an active member of this Managed Space';
  end if;

  if v_caller_id <> p_target_user_id
    and not exists (
      select 1
      from public.managed_space_members m
      where m.space_id = p_managed_space_id
        and m.user_id = p_target_user_id
    )
    and not exists (
      select 1
      from public.transactions t
      where t.space_id = p_managed_space_id
        and t.created_by_user_id = p_target_user_id
    )
    and not exists (
      select 1
      from public.financial_spaces s
      where s.id = p_managed_space_id
        and s.owner_user_id = p_target_user_id
    )
  then
    raise exception 'Access denied: target has no relationship with this Managed Space';
  end if;

  return query
    select p.id, p.full_name, p.avatar_url
    from public.profiles p
    where p.id = p_target_user_id;
end;
$$;

revoke all on function public.get_managed_space_member_profile(uuid, uuid) from public, anon;
grant execute on function public.get_managed_space_member_profile(uuid, uuid) to authenticated;
