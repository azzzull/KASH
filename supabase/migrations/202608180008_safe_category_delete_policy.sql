-- ============================================================
-- Migration: 202608180008_safe_category_delete_policy.sql
-- Description: Enable secure category deletion with RLS & validation RPC
-- ============================================================

-- 1. RLS Policy for custom category deletion
drop policy if exists "Users can delete own custom categories" on public.categories;
create policy "Users can delete own custom categories"
on public.categories for delete
to authenticated
using (
  auth.uid() = user_id
  and is_system = false
  and not exists (
    select 1 from public.transactions t where t.category_id = categories.id
  )
  and not exists (
    select 1 from public.budgets b where b.category_id = categories.id
  )
  and not exists (
    select 1 from public.recurring_obligations ro where ro.category_id = categories.id
  )
);

-- 2. Safe Category Delete RPC with detailed validation feedback
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

  if v_cat.user_id <> v_user_id then
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
  where id = p_category_id and user_id = v_user_id;

  return true;
end;
$$;
