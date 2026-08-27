-- Allow walletless transactions in consistency trigger
create or replace function public.enforce_transaction_space_consistency()
returns trigger as $$
declare
  v_source_space_id uuid;
  v_dest_space_id uuid;
begin
  -- Bypass wallet check for cross-space managed spending
  if new.wallet_id is null and new.cross_space_role = 'managed_spending' then
    if new.space_id is null then
      raise exception 'Transaction space_id is required for walletless transactions.';
    end if;
    return new;
  end if;

  select space_id into v_source_space_id from public.wallets where id = new.wallet_id;
  
  if v_source_space_id is null then
    raise exception 'Wallet not found or missing space_id.';
  end if;

  if new.space_id is null then
    new.space_id := v_source_space_id;
  else
    if new.space_id <> v_source_space_id then
      raise exception 'Transaction space_id must match its source wallet space_id.';
    end if;
  end if;

  if new.type = 'transfer' and new.destination_wallet_id is not null then
    select space_id into v_dest_space_id from public.wallets where id = new.destination_wallet_id;
    if v_dest_space_id <> v_source_space_id then
      raise exception 'Internal transfers must occur within the same financial space.';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;
