-- ============================================================
-- Migration: 20260827164000_managed_space_members_foundation.sql
-- KASH: Managed Space Membership Foundation (Phase 5A.1)
-- ============================================================

-- 1. Create Role Enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'managed_space_role') then
    create type public.managed_space_role as enum ('owner', 'admin', 'member', 'viewer');
  end if;
end;
$$;

-- 2. Create Members Table
create table if not exists public.managed_space_members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.financial_spaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.managed_space_role not null,
  status text not null default 'active' check (status in ('invited', 'active')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint managed_space_members_space_user_key unique (space_id, user_id)
);

-- 3. Trigger for updated_at
drop trigger if exists managed_space_members_set_updated_at on public.managed_space_members;
create trigger managed_space_members_set_updated_at
before update on public.managed_space_members
for each row
execute function public.set_updated_at();

-- 4. DB-Level Validation: Only Managed Spaces & Mirror Canonical Owner
create or replace function public.validate_managed_space_member()
returns trigger
language plpgsql
as $$
declare
  v_space_type public.financial_space_type;
  v_space_owner uuid;
begin
  select space_type, owner_user_id into v_space_type, v_space_owner
  from public.financial_spaces
  where id = new.space_id;

  if not found then
    raise exception 'Financial space % does not exist', new.space_id;
  end if;

  if v_space_type <> 'managed' then
    raise exception 'Memberships can only belong to Managed Spaces (found %)', v_space_type;
  end if;

  -- Canonical owner mirror enforcement:
  -- If role is 'owner', user_id MUST match financial_spaces.owner_user_id.
  if new.role = 'owner' and new.user_id <> v_space_owner then
    raise exception 'User % is not the canonical owner of space %', new.user_id, new.space_id;
  end if;

  -- The canonical space owner must hold the 'owner' role.
  if new.user_id = v_space_owner and new.role <> 'owner' then
    raise exception 'Canonical owner of space % must have the owner role', new.space_id;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_managed_space_member_trigger on public.managed_space_members;
create trigger validate_managed_space_member_trigger
before insert or update on public.managed_space_members
for each row
execute function public.validate_managed_space_member();

-- 5. Auto-sync trigger on financial_spaces to mirror owner membership
create or replace function public.sync_managed_space_owner_membership()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.space_type = 'managed' then
    insert into public.managed_space_members (space_id, user_id, role, status)
    values (new.id, new.owner_user_id, 'owner', 'active')
    on conflict (space_id, user_id) do update
    set role = 'owner', status = 'active', updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists sync_managed_space_owner_membership_trigger on public.financial_spaces;
create trigger sync_managed_space_owner_membership_trigger
after insert or update of owner_user_id on public.financial_spaces
for each row
when (new.space_type = 'managed')
execute function public.sync_managed_space_owner_membership();

-- 6. Backfill existing Managed Spaces
insert into public.managed_space_members (space_id, user_id, role, status)
select id, owner_user_id, 'owner'::public.managed_space_role, 'active'
from public.financial_spaces
where space_type = 'managed'
on conflict (space_id, user_id) do nothing;

-- 7. Minimal Indexes for future authorization checks
create index if not exists idx_managed_space_members_user_status on public.managed_space_members(user_id, status);
create index if not exists idx_managed_space_members_space_status on public.managed_space_members(space_id, status);

-- 8. Enable RLS on membership table
alter table public.managed_space_members enable row level security;

drop policy if exists "Users can view memberships of their spaces" on public.managed_space_members;
create policy "Users can view memberships of their spaces" on public.managed_space_members
for select using (
  user_id = auth.uid() or 
  space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())
);
