-- ============================================================
-- Migration: 20260827165000_managed_core_child_read_rls.sql
-- KASH: Managed Core Child Read RLS (Phase 5A.3a)
-- ============================================================

-- 1. Performance Indexes for space_id lookups
create index if not exists idx_wallets_space_id on public.wallets(space_id);
create index if not exists idx_transactions_space_id on public.transactions(space_id);
create index if not exists idx_categories_space_id on public.categories(space_id);

-- 2. Wallets SELECT Policy
-- Personal: owner only
-- Managed: active owner/admin/member/viewer via user_has_managed_space_access(space_id)
drop policy if exists "Users can view their own wallets" on public.wallets;
drop policy if exists "Users can view wallets" on public.wallets;
create policy "Users can view wallets" on public.wallets
for select using (
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  public.user_has_managed_space_access(space_id)
);

-- 3. Transactions SELECT Policy
-- Personal: owner only
-- Managed: active owner/admin/member/viewer via user_has_managed_space_access(space_id)
drop policy if exists "Users can view their own transactions" on public.transactions;
drop policy if exists "Users can view transactions" on public.transactions;
create policy "Users can view transactions" on public.transactions
for select using (
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  public.user_has_managed_space_access(space_id)
);

-- 4. Categories SELECT Policy
-- System categories: user_id is null
-- Personal categories: owner only
-- Managed categories: active owner/admin/member/viewer via user_has_managed_space_access(space_id)
drop policy if exists "Users can read own categories and system categories" on public.categories;
drop policy if exists "Users can view categories" on public.categories;
create policy "Users can read own categories and system categories" on public.categories
for select using (
  (user_id is null)
  or
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  (space_id is not null and public.user_has_managed_space_access(space_id))
);
