-- ============================================================
-- Migration: 202608280001_managed_core_transaction_write_rls.sql
-- KASH: Managed Core Child Write RLS (Phase 5A.3b1)
-- ============================================================

-- 1. Add nullable actor metadata columns
alter table public.transactions
add column if not exists created_by_user_id uuid references public.profiles(id),
add column if not exists updated_by_user_id uuid references public.profiles(id);

-- 2. Trigger to set actor metadata securely
create or replace function public.transactions_set_actor_metadata()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_user_id = auth.uid();
    new.updated_by_user_id = auth.uid();
  elsif tg_op = 'UPDATE' then
    -- Keep original created_by, update updated_by
    new.created_by_user_id = old.created_by_user_id;
    new.updated_by_user_id = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_actor_metadata_trigger on public.transactions;
create trigger transactions_actor_metadata_trigger
before insert or update on public.transactions
for each row execute function public.transactions_set_actor_metadata();

-- 3. Transactions INSERT Policy
drop policy if exists "Users can insert their own transactions" on public.transactions;
drop policy if exists "Users can insert transactions" on public.transactions;

create policy "Users can insert transactions" on public.transactions
for insert with check (
  (
    -- Personal Space: owner only
    user_id = auth.uid()
    and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())
  )
  or
  (
    -- Managed Space: active owner, admin, or member
    public.user_has_managed_space_role(space_id, array['owner', 'admin', 'member']::public.managed_space_role[])
  )
);

-- 4. Transactions UPDATE Policy
drop policy if exists "Users can update their own transactions" on public.transactions;
drop policy if exists "Users can update transactions" on public.transactions;

create policy "Users can update transactions" on public.transactions
for update using (
  (
    -- Personal Space: owner only
    user_id = auth.uid()
    and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())
  )
  or
  (
    -- Managed Space: Owner/Admin can update ALL transactions in the space
    public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[])
  )
  or
  (
    -- Managed Space: Member can update ONLY transactions they created
    public.user_has_managed_space_role(space_id, array['member']::public.managed_space_role[])
    and created_by_user_id = auth.uid()
  )
);

-- 5. Transactions DELETE Policy
drop policy if exists "Users can delete their own transactions" on public.transactions;
drop policy if exists "Users can delete transactions" on public.transactions;

create policy "Users can delete transactions" on public.transactions
for delete using (
  (
    -- Personal Space: owner only
    user_id = auth.uid()
    and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())
  )
  or
  (
    -- Managed Space: Owner/Admin can delete ALL transactions in the space
    public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[])
  )
  or
  (
    -- Managed Space: Member can delete ONLY transactions they created
    public.user_has_managed_space_role(space_id, array['member']::public.managed_space_role[])
    and created_by_user_id = auth.uid()
  )
);
