-- Migration: 202609020007_managed_space_tombstone_deletion.sql
-- Description: Implement safe tombstone deletion for Managed Spaces with protected financial history

-- 1. Add deleted_at and deleted_by columns to financial_spaces
alter table public.financial_spaces
  add column if not exists deleted_at timestamptz default null,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_financial_spaces_deleted_at on public.financial_spaces(deleted_at);

-- 2. Update access helpers to strictly disallow deleted spaces
create or replace function public.user_has_managed_space_access(p_space_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.managed_space_members m
    join public.financial_spaces s on s.id = m.space_id
    where m.space_id = p_space_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and s.space_type = 'managed'
      and s.deleted_at is null
  );
$$;

create or replace function public.user_has_managed_space_role(p_space_id uuid, p_allowed_roles public.managed_space_role[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.managed_space_members m
    join public.financial_spaces s on s.id = m.space_id
    where m.space_id = p_space_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and s.space_type = 'managed'
      and s.deleted_at is null
      and m.role = any(p_allowed_roles)
  );
$$;

-- 3. Update financial_spaces RLS policies
drop policy if exists "Users can view financial spaces" on public.financial_spaces;
drop policy if exists "Users can view their own financial spaces" on public.financial_spaces;

create policy "Users can view financial spaces" on public.financial_spaces
for select using (
  (owner_user_id = auth.uid() and deleted_at is null)
  or 
  (space_type = 'managed' and deleted_at is null and public.user_has_managed_space_access(id))
  or
  (id in (select linked_space_id from public.counterparties where user_id = auth.uid() and linked_space_id is not null))
  or
  (id in (select managed_space_id from public.cross_space_events where personal_space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())))
  or
  (id in (select personal_space_id from public.cross_space_events where managed_space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())))
);

drop policy if exists "Users can update their own financial spaces" on public.financial_spaces;
create policy "Users can update their own financial spaces" on public.financial_spaces
for update using (owner_user_id = auth.uid() and deleted_at is null);

-- 4. Authoritative Archive & Restore RPCs
create or replace function public.archive_managed_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_type public.financial_space_type;
  v_owner_user_id uuid;
  v_deleted_at timestamptz;
begin
  select space_type, owner_user_id, deleted_at
  into v_space_type, v_owner_user_id, v_deleted_at
  from public.financial_spaces
  where id = p_space_id;

  if not found or v_deleted_at is not null then
    raise exception 'Financial Space not found.';
  end if;

  if v_owner_user_id <> auth.uid() then
    raise exception 'Unauthorized.';
  end if;

  if v_space_type = 'personal' then
    raise exception 'Personal Space cannot be archived.';
  end if;

  update public.financial_spaces
  set is_archived = true, updated_at = now()
  where id = p_space_id;
end;
$$;

grant execute on function public.archive_managed_space(uuid) to authenticated;

create or replace function public.restore_managed_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_type public.financial_space_type;
  v_owner_user_id uuid;
  v_deleted_at timestamptz;
begin
  select space_type, owner_user_id, deleted_at
  into v_space_type, v_owner_user_id, v_deleted_at
  from public.financial_spaces
  where id = p_space_id;

  if not found then
    raise exception 'Financial Space not found.';
  end if;

  if v_deleted_at is not null then
    raise exception 'Cannot restore permanently deleted space.';
  end if;

  if v_owner_user_id <> auth.uid() then
    raise exception 'Unauthorized.';
  end if;

  if v_space_type = 'personal' then
    raise exception 'Personal Space cannot be restored.';
  end if;

  update public.financial_spaces
  set is_archived = false, updated_at = now()
  where id = p_space_id;
end;
$$;

grant execute on function public.restore_managed_space(uuid) to authenticated;

-- 5. Authoritative Tombstone Deletion RPC
create or replace function public.delete_managed_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_type public.financial_space_type;
  v_owner_user_id uuid;
  v_deleted_at timestamptz;
begin
  select space_type, owner_user_id, deleted_at
  into v_space_type, v_owner_user_id, v_deleted_at
  from public.financial_spaces
  where id = p_space_id;

  if not found then
    raise exception 'Financial Space not found.';
  end if;

  if v_deleted_at is not null then
    -- Already deleted / idempotent safe exit
    return;
  end if;

  if v_owner_user_id <> auth.uid() then
    raise exception 'Unauthorized.';
  end if;

  if v_space_type = 'personal' then
    raise exception 'Personal Space cannot be deleted.';
  end if;

  -- Protect against deleting a space with active unsettled obligations
  -- 1. Check for pending or partially settled cross-space events
  if exists (
    select 1 from public.cross_space_events
    where (managed_space_id = p_space_id or personal_space_id = p_space_id)
      and status in ('pending', 'partially_settled')
  ) then
    raise exception 'Selesaikan Payable/Receivable yang masih aktif sebelum menghapus Managed Space.';
  end if;

  -- 2. Check for active unsettled debts in the space
  if exists (
    select 1 from public.debts
    where space_id = p_space_id
      and status not in ('settled', 'voided')
      and remaining_amount > 0
  ) then
    raise exception 'Selesaikan Payable/Receivable yang masih aktif sebelum menghapus Managed Space.';
  end if;

  -- Tombstone the space: mark deleted_at, unarchive, preserve all historical records
  update public.financial_spaces
  set deleted_at = now(),
      deleted_by = auth.uid(),
      is_archived = false,
      updated_at = now()
  where id = p_space_id;

  -- Cancel any pending invitations
  update public.managed_space_invitations
  set status = 'cancelled',
      updated_at = now()
  where space_id = p_space_id
    and status = 'pending';
end;
$$;

grant execute on function public.delete_managed_space(uuid) to authenticated;
