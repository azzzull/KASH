-- Guest participants have no user_id, so removal must be authorized and
-- accounted for by their immutable participant id.
create or replace function public.remove_shared_savings_guest_member(
  p_shared_savings_id uuid,
  p_participant_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_member public.shared_savings_members;
  v_current_share numeric;
  v_rows_updated integer;
begin
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1 from public.shared_savings
    where id = p_shared_savings_id
      and owner_user_id = v_caller_id
  ) then
    raise exception 'Only the Owner can remove a Guest participant.';
  end if;

  select * into v_member
  from public.shared_savings_members
  where id = p_participant_id
    and shared_savings_id = p_shared_savings_id
    and member_type = 'guest'
    and status = 'active'
  for update;

  if v_member.id is null then
    raise exception 'Active Guest participant not found.';
  end if;

  select coalesce(sum(amount_signed), 0) into v_current_share
  from public.shared_savings_member_allocations
  where shared_savings_id = p_shared_savings_id
    and member_id = v_member.id;

  if v_current_share <> 0 then
    raise exception 'Guest cannot be removed while having an unresolved share balance (Porsi saat ini: Rp%). Tarik porsi hingga 0 terlebih dahulu.',
      to_char(v_current_share, 'FM999,999,999,999');
  end if;

  if exists (
    select 1 from public.shared_savings_member_link_requests
    where participant_id = v_member.id
      and status = 'pending'
  ) then
    raise exception 'Guest cannot be removed while an account link request is pending.';
  end if;

  update public.shared_savings_members
  set status = 'removed', left_at = now(), updated_at = now()
  where id = v_member.id
    and status = 'active';

  get diagnostics v_rows_updated = row_count;
  if v_rows_updated <> 1 then
    raise exception 'Failed to remove Guest participant.';
  end if;

  return true;
end;
$$;

revoke execute on function public.remove_shared_savings_guest_member(uuid, uuid) from public, anon;
grant execute on function public.remove_shared_savings_guest_member(uuid, uuid) to authenticated;
