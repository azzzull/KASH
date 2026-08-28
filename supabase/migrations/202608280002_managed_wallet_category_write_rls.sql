-- ============================================================
-- Migration: 202608280002_managed_wallet_category_write_rls.sql
-- KASH: Managed Wallet + Category Write RLS (Phase 5A.3b2)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Wallets RLS Policy Cleanup & Write Policies
-- ------------------------------------------------------------

-- Drop all legacy and previous wallet policies
drop policy if exists "Users can read own wallets" on public.wallets;
drop policy if exists "Users can view their own wallets" on public.wallets;
drop policy if exists "Users can view wallets" on public.wallets;

drop policy if exists "Users can create own wallets" on public.wallets;
drop policy if exists "Users can insert own wallets" on public.wallets;
drop policy if exists "Users can insert their own wallets" on public.wallets;
drop policy if exists "Users can insert wallets" on public.wallets;

drop policy if exists "Users can update own wallets" on public.wallets;
drop policy if exists "Users can update their own wallets" on public.wallets;
drop policy if exists "Users can update wallets" on public.wallets;

drop policy if exists "Users can delete own unused wallets" on public.wallets;
drop policy if exists "Users can delete own wallets" on public.wallets;
drop policy if exists "Users can delete their own wallets" on public.wallets;
drop policy if exists "Users can delete wallets" on public.wallets;

-- Wallets SELECT Policy (preserve canonical Phase 5A.3a read access)
create policy "Users can view wallets" on public.wallets
for select using (
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  public.user_has_managed_space_access(space_id)
);

-- Wallets INSERT Policy
-- Personal Space: owner only
-- Managed Space: active owner or admin
create policy "Users can insert wallets" on public.wallets
for insert with check (
  (
    -- Personal Space: owner only
    user_id = auth.uid()
    and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())
  )
  or
  (
    -- Managed Space: active owner or admin
    user_id = auth.uid()
    and public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[])
  )
);

-- Wallets UPDATE Policy
-- Personal Space: owner only
-- Managed Space: active owner or admin
create policy "Users can update wallets" on public.wallets
for update using (
  (
    -- Personal Space: owner only
    user_id = auth.uid()
    and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())
  )
  or
  (
    -- Managed Space: active owner or admin
    public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[])
  )
);

-- Wallets DELETE Policy
-- Personal Space: owner only
-- Managed Space: active owner or admin
create policy "Users can delete wallets" on public.wallets
for delete using (
  (
    -- Personal Space: owner only
    user_id = auth.uid()
    and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())
  )
  or
  (
    -- Managed Space: active owner or admin
    public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[])
  )
);

-- Update delete_wallet_permanently RPC to support Managed Space owner/admin
create or replace function public.delete_wallet_permanently(p_wallet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet_record public.wallets;
  v_current_balance numeric;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;

  select * into v_wallet_record from public.wallets where id = p_wallet_id for update;
  
  if v_wallet_record.id is null then raise exception 'Wallet not found'; end if;
  
  if not (
    (v_wallet_record.user_id = v_user_id and v_wallet_record.space_id in (select id from public.financial_spaces where owner_user_id = v_user_id))
    or
    (v_wallet_record.space_id is not null and public.user_has_managed_space_role(v_wallet_record.space_id, array['owner', 'admin']::public.managed_space_role[]))
  ) then 
    raise exception 'Unauthorized'; 
  end if;

  -- 1. Check if authoritative current_balance is exactly 0
  select current_balance into v_current_balance from public.wallet_balance_view where wallet_id = p_wallet_id;
  if v_current_balance is null then v_current_balance := 0; end if;
  
  if v_current_balance <> 0 then
    raise exception 'Wallet cannot be deleted because it has a non-zero current balance. Please keep it archived.';
  end if;

  -- 2. Check if wallet is referenced by an active/cancelled goal
  if exists (select 1 from public.goals where wallet_id = p_wallet_id) then
    raise exception 'Wallet is referenced by a Goal. Delete the goal first.';
  end if;

  -- 3. Check for any transactions referencing the wallet (as source or destination), regardless of status
  if exists (select 1 from public.transactions where wallet_id = p_wallet_id or destination_wallet_id = p_wallet_id) then
    raise exception 'Wallet cannot be deleted because it has transaction history. Please keep it archived.';
  end if;

  -- 4. Check goal_contributions
  if exists (select 1 from public.goal_contributions where wallet_id = p_wallet_id) then
    raise exception 'Wallet cannot be deleted because it has goal contribution history.';
  end if;

  -- 5. Check debt_payments
  if exists (select 1 from public.debt_payments where wallet_id = p_wallet_id) then
    raise exception 'Wallet cannot be deleted because it is referenced by debt payments.';
  end if;

  -- 6. Check recurring_obligations
  if exists (select 1 from public.recurring_obligations where default_wallet_id = p_wallet_id) then
    raise exception 'Wallet cannot be deleted because it is referenced by recurring obligations.';
  end if;

  -- 7. Check recurring_payments
  if exists (select 1 from public.recurring_payments where wallet_id = p_wallet_id) then
    raise exception 'Wallet cannot be deleted because it is referenced by recurring payments.';
  end if;

  -- 8. Check budgets
  if exists (select 1 from public.budgets where wallet_id = p_wallet_id) then
    raise exception 'Wallet cannot be deleted because it is referenced by a budget.';
  end if;

  -- 9. Check investment_activities
  if exists (select 1 from public.investment_activities where wallet_id = p_wallet_id) then
    raise exception 'Wallet cannot be deleted because it has investment activity history.';
  end if;

  -- 10. Check investment_valuations
  if exists (select 1 from public.investment_valuations where wallet_id = p_wallet_id) then
    raise exception 'Wallet cannot be deleted because it has investment valuation history.';
  end if;

  -- All checks passed, safe to permanently delete
  delete from public.wallets where id = p_wallet_id;
end;
$$;


-- ------------------------------------------------------------
-- 2. Categories RLS Policy Cleanup & Write Policies
-- ------------------------------------------------------------

-- Drop all legacy and previous category policies
drop policy if exists "Users can read system and own categories" on public.categories;
drop policy if exists "Users can read own categories and system categories" on public.categories;
drop policy if exists "Users can view categories" on public.categories;

drop policy if exists "Users can create own custom categories" on public.categories;
drop policy if exists "Users can insert own categories" on public.categories;
drop policy if exists "Users can insert categories" on public.categories;

drop policy if exists "Users can update own custom categories" on public.categories;
drop policy if exists "Users can update own categories" on public.categories;
drop policy if exists "Users can update categories" on public.categories;

drop policy if exists "Users can delete own custom categories" on public.categories;
drop policy if exists "Users can delete own categories" on public.categories;
drop policy if exists "Users can delete categories" on public.categories;

-- Categories SELECT Policy (preserve canonical Phase 5A.3a read access)
create policy "Users can read own categories and system categories" on public.categories
for select using (
  (user_id is null)
  or
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  (space_id is not null and public.user_has_managed_space_access(space_id))
);

-- Categories INSERT Policy
-- Custom category only (is_system = false)
-- Personal Space: owner only
-- Managed Space: active owner or admin
create policy "Users can insert categories" on public.categories
for insert with check (
  is_system = false
  and user_id = auth.uid()
  and (
    (
      -- Personal Space: owner only
      space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())
    )
    or
    (
      -- Managed Space: active owner or admin
      public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[])
    )
  )
);

-- Categories UPDATE Policy
-- Custom category only (is_system = false)
-- Personal Space: owner only
-- Managed Space: active owner or admin
create policy "Users can update categories" on public.categories
for update using (
  is_system = false
  and (
    (
      -- Personal Space: owner only
      user_id = auth.uid()
      and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())
    )
    or
    (
      -- Managed Space: active owner or admin
      public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[])
    )
  )
);

-- Categories DELETE Policy
-- Custom category only (is_system = false)
-- Personal Space: owner only
-- Managed Space: active owner or admin
create policy "Users can delete categories" on public.categories
for delete using (
  is_system = false
  and (
    (
      -- Personal Space: owner only
      user_id = auth.uid()
      and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())
    )
    or
    (
      -- Managed Space: active owner or admin
      public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[])
    )
  )
);

-- Update delete_custom_category RPC to support Managed Space owner/admin
create or replace function public.delete_custom_category(p_category_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cat record;
  v_tx_count integer;
  v_budget_count integer;
  v_ro_count integer;
begin
  if v_user_id is null then
    raise exception 'User must be authenticated.';
  end if;

  select * into v_cat
  from public.categories
  where id = p_category_id;

  if not found then
    raise exception 'Kategori tidak ditemukan.';
  end if;

  if v_cat.is_system then
    raise exception 'Kategori sistem bawaan tidak dapat dihapus.';
  end if;

  if not (
    (v_cat.user_id = v_user_id and v_cat.space_id in (select id from public.financial_spaces where owner_user_id = v_user_id))
    or
    (v_cat.space_id is not null and public.user_has_managed_space_role(v_cat.space_id, array['owner', 'admin']::public.managed_space_role[]))
  ) then
    raise exception 'Anda tidak memiliki izin untuk menghapus kategori ini.';
  end if;

  -- 1. Check transactions
  select count(*) into v_tx_count
  from public.transactions
  where category_id = p_category_id;

  if v_tx_count > 0 then
    raise exception 'Kategori "%" sudah digunakan dalam % transaksi. Silakan gunakan fitur Arsipkan agar tidak muncul di form tanpa merusak riwayat transaksi Anda.', v_cat.name, v_tx_count;
  end if;

  -- 2. Check category budgets
  select count(*) into v_budget_count
  from public.budgets
  where category_id = p_category_id;

  if v_budget_count > 0 then
    raise exception 'Kategori "%" sedang digunakan pada Budget Kategori aktif. Hapus atau arsipkan budget tersebut terlebih dahulu.', v_cat.name;
  end if;

  -- 3. Check recurring obligations
  select count(*) into v_ro_count
  from public.recurring_obligations
  where category_id = p_category_id;

  if v_ro_count > 0 then
    raise exception 'Kategori "%" sedang digunakan pada Tagihan/Langganan aktif. Ubah kategori tagihan tersebut terlebih dahulu.', v_cat.name;
  end if;

  -- 4. Clean envelope category memberships
  delete from public.budget_envelope_categories
  where category_id = p_category_id;

  -- 5. Delete category
  delete from public.categories
  where id = p_category_id;

  return true;
end;
$$;
