-- ============================================================
-- Migration: 202608260001_atomic_space_creation.sql
-- Atomically create a Managed Space with a Starter Wallet,
-- and harden RLS to enforce canonical creation.
-- ============================================================

-- 1. Drop old trigger
drop trigger if exists financial_spaces_create_managed_starter_wallet_trigger on public.financial_spaces;
drop function if exists public.financial_spaces_create_managed_starter_wallet();

-- 2. Harden financial_spaces insert RLS
-- Normal insert via client is only allowed for 'personal' spaces.
drop policy if exists "Users can insert their own financial spaces" on public.financial_spaces;
create policy "Users can insert their own financial spaces" on public.financial_spaces
for insert with check (owner_user_id = auth.uid() and space_type = 'personal');

-- 3. Atomic RPC for Managed Space Creation
create or replace function public.create_managed_space_with_wallet(
  p_space_name text,
  p_wallet_name text,
  p_wallet_type public.wallet_type
) returns public.financial_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_currency text;
  v_new_space public.financial_spaces;
  v_space_name_trimmed text := trim(p_space_name);
  v_wallet_name_trimmed text := trim(p_wallet_name);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if v_space_name_trimmed = '' then
    raise exception 'Space name cannot be empty';
  end if;

  if v_wallet_name_trimmed = '' then
    raise exception 'Wallet name cannot be empty';
  end if;

  -- Validate wallet_type is a valid normal type
  if p_wallet_type not in ('cash', 'bank', 'ewallet', 'digital_bank', 'custom') then
    raise exception 'Invalid starter wallet type %', p_wallet_type;
  end if;

  select coalesce(default_currency, 'IDR') into v_user_currency
  from public.profiles
  where id = auth.uid();

  -- Insert space (bypasses RLS due to security definer)
  insert into public.financial_spaces (owner_user_id, name, space_type, is_archived)
  values (auth.uid(), v_space_name_trimmed, 'managed', false)
  returning * into v_new_space;

  -- Insert wallet
  insert into public.wallets (
    user_id,
    space_id,
    name,
    wallet_type,
    initial_balance,
    currency,
    include_in_net_worth,
    is_archived
  ) values (
    auth.uid(),
    v_new_space.id,
    v_wallet_name_trimmed,
    p_wallet_type,
    0,
    coalesce(v_user_currency, 'IDR'),
    true,
    false
  );

  return v_new_space;
end;
$$;
