-- Migration: Fix Shared Savings RLS infinite recursion
-- Use SECURITY DEFINER helper functions to bypass RLS when evaluating access control

create or replace function public.is_shared_savings_member(p_shared_savings_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.shared_savings_members m
    where m.shared_savings_id = p_shared_savings_id
      and m.user_id = p_user_id
  );
$$;

create or replace function public.is_shared_savings_owner(p_shared_savings_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.shared_savings s
    where s.id = p_shared_savings_id
      and s.owner_user_id = p_user_id
  );
$$;

grant execute on function public.is_shared_savings_member(uuid, uuid) to authenticated, anon;
grant execute on function public.is_shared_savings_owner(uuid, uuid) to authenticated, anon;

-- Drop existing policies that cause recursion
drop policy if exists "Users can view shared savings they belong to or created" on public.shared_savings;
drop policy if exists "Users can view members of their shared savings spaces" on public.shared_savings_members;
drop policy if exists "Users can view approvers of their shared savings spaces" on public.shared_savings_approvers;
drop policy if exists "Users can view invites for their spaces or sent to them" on public.shared_savings_invites;
drop policy if exists "Users can view requests in spaces they belong to" on public.shared_savings_requests;
drop policy if exists "Users can view ledger in spaces they belong to" on public.shared_savings_ledger;
drop policy if exists "Users can view allocations in spaces they belong to" on public.shared_savings_member_allocations;
drop policy if exists "Users can view notification logs for their spaces" on public.shared_savings_notification_logs;

-- Recreate non-recursive policies

-- 1. shared_savings
create policy "Users can view shared savings they belong to or created"
on public.shared_savings for select
using (
  owner_user_id = auth.uid()
  or public.is_shared_savings_member(id, auth.uid())
  or exists (
    select 1 from public.shared_savings_invites i
    where i.shared_savings_id = public.shared_savings.id
      and (i.invited_user_id = auth.uid() or lower(i.invited_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  )
);

-- 2. shared_savings_members
create policy "Users can view members of their shared savings spaces"
on public.shared_savings_members for select
using (
  user_id = auth.uid()
  or public.is_shared_savings_owner(shared_savings_id, auth.uid())
  or public.is_shared_savings_member(shared_savings_id, auth.uid())
);

-- 3. shared_savings_approvers
create policy "Users can view approvers of their shared savings spaces"
on public.shared_savings_approvers for select
using (
  user_id = auth.uid()
  or public.is_shared_savings_owner(shared_savings_id, auth.uid())
  or public.is_shared_savings_member(shared_savings_id, auth.uid())
);

-- 4. shared_savings_invites
create policy "Users can view invites for their spaces or sent to them"
on public.shared_savings_invites for select
using (
  inviter_user_id = auth.uid()
  or invited_user_id = auth.uid()
  or lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.is_shared_savings_owner(shared_savings_id, auth.uid())
  or public.is_shared_savings_member(shared_savings_id, auth.uid())
);

-- 5. shared_savings_requests
create policy "Users can view requests in spaces they belong to"
on public.shared_savings_requests for select
using (
  requested_by_user_id = auth.uid()
  or public.is_shared_savings_owner(shared_savings_id, auth.uid())
  or public.is_shared_savings_member(shared_savings_id, auth.uid())
);

-- 6. shared_savings_ledger
create policy "Users can view ledger in spaces they belong to"
on public.shared_savings_ledger for select
using (
  public.is_shared_savings_owner(shared_savings_id, auth.uid())
  or public.is_shared_savings_member(shared_savings_id, auth.uid())
);

-- 7. shared_savings_member_allocations
create policy "Users can view allocations in spaces they belong to"
on public.shared_savings_member_allocations for select
using (
  user_id = auth.uid()
  or public.is_shared_savings_owner(shared_savings_id, auth.uid())
  or public.is_shared_savings_member(shared_savings_id, auth.uid())
);

-- 8. shared_savings_notification_logs
create policy "Users can view notification logs for their spaces"
on public.shared_savings_notification_logs for select
using (
  public.is_shared_savings_owner(shared_savings_id, auth.uid())
  or public.is_shared_savings_member(shared_savings_id, auth.uid())
);
