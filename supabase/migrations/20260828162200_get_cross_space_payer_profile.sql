-- KASH Migration: Event-scoped Cross-Space Payer Profile Resolution
-- Resolves minimal identity authoritatively from cross_space_events

create or replace function public.get_cross_space_payer_profile(
  p_event_id uuid
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
  v_managed_space_id uuid;
  v_personal_space_id uuid;
  v_payer_user_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Resolve the relationship authoritatively from the event
  select
    e.managed_space_id,
    e.personal_space_id
  into
    v_managed_space_id,
    v_personal_space_id
  from public.cross_space_events e
  where e.id = p_event_id
    and e.event_type = 'managed_expense_paid_personally';

  if not found then
    raise exception 'Cross-space reimbursement event not found';
  end if;

  -- Caller only needs active access to the Managed Space
  if not exists (
    select 1
    from public.managed_space_members m
    where m.space_id = v_managed_space_id
      and m.user_id = v_caller_id
      and m.status = 'active'
  ) then
    raise exception 'Access denied';
  end if;

  -- Payer comes from the linked Personal Space, NOT client input
  select fs.owner_user_id
  into v_payer_user_id
  from public.financial_spaces fs
  where fs.id = v_personal_space_id
    and fs.space_type = 'personal';

  if v_payer_user_id is null then
    raise exception 'Payer identity not found';
  end if;

  return query
    select
      p.id,
      p.full_name,
      p.avatar_url
    from public.profiles p
    where p.id = v_payer_user_id;
end;
$$;

revoke execute on function public.get_cross_space_payer_profile(uuid) from public;
grant execute on function public.get_cross_space_payer_profile(uuid) to authenticated;
