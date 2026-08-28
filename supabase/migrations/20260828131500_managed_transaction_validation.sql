-- ============================================================
-- Migration: 20260828131500_managed_transaction_validation.sql
-- KASH: Fix Transaction Source/Destination Wallet & Category Validation for Managed Spaces
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_transaction_relationships()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  source_wallet_user_id uuid;
  source_wallet_space_id uuid;
  destination_wallet_user_id uuid;
  destination_wallet_space_id uuid;
  category_owner_id uuid;
  category_space_id uuid;
  category_is_system boolean;
  category_kind text;
begin
  if new.wallet_id is not null then
    select user_id, space_id into source_wallet_user_id, source_wallet_space_id
    from public.wallets
    where id = new.wallet_id;

    if new.space_id is not null then
      -- Managed Space: Wallet must belong to the same space
      if source_wallet_space_id is null or source_wallet_space_id <> new.space_id then
        raise exception 'Transaction source wallet must belong to the transaction space.';
      end if;
    else
      -- Personal Space: Wallet must belong to the transaction user
      if source_wallet_user_id is null or source_wallet_user_id <> new.user_id then
        raise exception 'Transaction source wallet must belong to the transaction user.';
      end if;
    end if;
  else
    if new.cross_space_role != 'managed_spending' then
      raise exception 'Transaction source wallet cannot be null except for managed_spending.';
    end if;
  end if;

  if new.destination_wallet_id is not null then
    select user_id, space_id into destination_wallet_user_id, destination_wallet_space_id
    from public.wallets
    where id = new.destination_wallet_id;

    if new.space_id is not null then
      if destination_wallet_space_id is null or destination_wallet_space_id <> new.space_id then
        raise exception 'Transaction destination wallet must belong to the transaction space.';
      end if;
    else
      if destination_wallet_user_id is null or destination_wallet_user_id <> new.user_id then
        raise exception 'Transaction destination wallet must belong to the transaction user.';
      end if;
    end if;
  end if;

  if new.category_id is not null then
    select user_id, space_id, is_system, category_type
    into category_owner_id, category_space_id, category_is_system, category_kind
    from public.categories
    where id = new.category_id;

    if category_kind is null then
      raise exception 'Transaction category does not exist.';
    end if;

    if category_is_system = false then
      if new.space_id is not null then
        if category_space_id is null or category_space_id <> new.space_id then
          raise exception 'Transaction category must belong to the transaction space.';
        end if;
      else
        if category_owner_id <> new.user_id then
          raise exception 'Transaction category must belong to the transaction user.';
        end if;
      end if;
    end if;

    if new.type in ('income', 'expense') and category_kind <> new.type::text then
      raise exception 'Transaction category type must match income or expense transaction type.';
    end if;

    if new.type in ('transfer', 'adjustment') then
      raise exception 'Transfer and adjustment transactions must not use income or expense categories.';
    end if;
  end if;

  return new;
end;
$function$;
