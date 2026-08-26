-- ============================================================
-- KASH: Shared Savings Leave/Remove Reliability
--
-- Ensures leave/remove only reports success when an active membership
-- was actually changed to left/removed.
-- ============================================================

create or replace function public.remove_shared_savings_member(
  p_shared_savings_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_space public.shared_savings;
  v_current_share numeric;
  v_approver_count integer;
  v_rows_updated integer;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_space
  from public.shared_savings
  where id = p_shared_savings_id;

  if v_space.id is null then
    raise exception 'Shared savings space not found.';
  end if;

  if v_space.owner_user_id <> v_caller_id and p_user_id <> v_caller_id then
    raise exception 'You do not have permission to remove this member.';
  end if;

  if p_user_id = v_space.owner_user_id then
    raise exception 'Owner cannot leave the space. Transfer ownership to another active member first.';
  end if;

  if p_user_id = v_space.account_holder_user_id then
    raise exception 'Account Holder cannot leave the space. Assign a replacement Account Holder first.';
  end if;

  if not exists (
    select 1
    from public.shared_savings_members
    where shared_savings_id = p_shared_savings_id
      and user_id = p_user_id
      and status = 'active'
  ) then
    raise exception 'Member is not active in this shared savings space.';
  end if;

  select coalesce(sum(amount_signed), 0) into v_current_share
  from public.shared_savings_member_allocations
  where shared_savings_id = p_shared_savings_id
    and user_id = p_user_id;

  if v_current_share <> 0 then
    raise exception 'Member cannot leave while having an unresolved share balance (Porsi saat ini: Rp%). Tarik porsi hingga 0 terlebih dahulu.',
      to_char(v_current_share, 'FM999,999,999,999');
  end if;

  if exists (
    select 1 from public.shared_savings_requests
    where shared_savings_id = p_shared_savings_id
      and requested_by_user_id = p_user_id
      and status = 'pending'
  ) then
    raise exception 'Member cannot leave while having pending requests under review.';
  end if;

  if exists (
    select 1 from public.shared_savings_approvers
    where shared_savings_id = p_shared_savings_id
      and user_id = p_user_id
  ) then
    select count(*) into v_approver_count
    from public.shared_savings_approvers a
    join public.shared_savings_members m
      on m.shared_savings_id = a.shared_savings_id
     and m.user_id = a.user_id
    where a.shared_savings_id = p_shared_savings_id
      and a.user_id <> p_user_id
      and m.status = 'active';

    if v_approver_count = 0 then
      raise exception 'Cannot remove member: this user is the only active Approver. Assign another Approver first.';
    end if;

    delete from public.shared_savings_approvers
    where shared_savings_id = p_shared_savings_id
      and user_id = p_user_id;
  end if;

  update public.shared_savings_members
  set
    status = case when p_user_id = v_caller_id then 'left' else 'removed' end,
    left_at = now(),
    updated_at = now()
  where shared_savings_id = p_shared_savings_id
    and user_id = p_user_id
    and status = 'active';

  get diagnostics v_rows_updated = row_count;

  if v_rows_updated <> 1 then
    raise exception 'Failed to update shared savings membership.';
  end if;

  return true;
end;
$$;

revoke execute on function public.remove_shared_savings_member(uuid, uuid) from public, anon;
grant execute on function public.remove_shared_savings_member(uuid, uuid) to authenticated;
