-- Serialize source-wallet debits and reject cash outflows that would make the
-- authoritative wallet balance negative. Walletless Managed spending and
-- non-debit ledger rows remain unchanged.

create or replace function public.enforce_transaction_wallet_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_required numeric := 0;
  v_current_balance numeric;
  v_old_wallet_effect numeric := 0;
  v_spendable_balance numeric;
begin
  if new.wallet_id is null or new.status <> 'completed' then
    return new;
  end if;

  v_required := case
    when new.type = 'expense' then new.amount
    when new.type = 'transfer' then new.amount + coalesce(new.transfer_fee, 0)
    when new.type = 'adjustment' and new.amount < 0 then -new.amount
    else 0
  end;

  if v_required <= 0 then
    return new;
  end if;

  -- Every authoritative debit path takes this same row lock. A balance read
  -- after the lock sees any debit that completed while this statement waited.
  perform 1
  from public.wallets w
  where w.id = new.wallet_id
  for update;

  if not found then
    raise exception 'Transaction source wallet was not found.';
  end if;

  select wb.current_balance
  into v_current_balance
  from public.wallet_balance_view wb
  where wb.wallet_id = new.wallet_id;

  if v_current_balance is null then
    raise exception 'Transaction source wallet balance could not be resolved.';
  end if;

  if tg_op = 'UPDATE' and old.wallet_id = new.wallet_id then
    v_old_wallet_effect := case
      when old.status <> 'completed' then 0
      when old.type = 'income' then old.amount
      when old.type = 'expense' then -old.amount
      when old.type = 'transfer' then -(old.amount + coalesce(old.transfer_fee, 0))
      when old.type = 'adjustment' then old.amount
      else 0
    end;
  end if;

  v_spendable_balance := v_current_balance - v_old_wallet_effect;

  if v_spendable_balance < v_required then
    raise exception 'Insufficient wallet balance for this transaction.';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_enforce_wallet_balance on public.transactions;
create trigger transactions_enforce_wallet_balance
before insert or update
on public.transactions
for each row
execute function public.enforce_transaction_wallet_balance();

revoke execute on function public.enforce_transaction_wallet_balance() from public;

-- This is the first row written by record_cross_space_settlement. Checking in
-- its BEFORE INSERT trigger keeps the existing RPC contract intact while
-- guaranteeing that an insufficient settlement creates no settlement,
-- payment, allocation, debt-status, or ledger rows.
create or replace function public.enforce_cross_space_settlement_wallet_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_managed_space_id uuid;
  v_current_balance numeric;
begin
  if new.amount is null or new.amount <= 0 then
    raise exception 'Settlement amount must be greater than zero';
  end if;

  select e.managed_space_id
  into v_managed_space_id
  from public.cross_space_events e
  where e.id = new.event_id;

  if not found then
    raise exception 'Cross-space reimbursement event not found';
  end if;

  perform 1
  from public.wallets w
  where w.id = new.managed_wallet_id
    and w.space_id = v_managed_space_id
    and w.is_archived = false
  for update;

  if not found then
    raise exception 'Selected Managed wallet is not active or does not belong to this Managed Space';
  end if;

  select wb.current_balance
  into v_current_balance
  from public.wallet_balance_view wb
  where wb.wallet_id = new.managed_wallet_id;

  if v_current_balance is null then
    raise exception 'Selected Managed wallet balance could not be resolved';
  end if;

  if v_current_balance < new.amount then
    raise exception 'Insufficient wallet balance for this payment.';
  end if;

  return new;
end;
$$;

drop trigger if exists cross_space_settlements_enforce_wallet_balance
  on public.cross_space_settlements;
create trigger cross_space_settlements_enforce_wallet_balance
before insert on public.cross_space_settlements
for each row
execute function public.enforce_cross_space_settlement_wallet_balance();

revoke execute on function public.enforce_cross_space_settlement_wallet_balance() from public;
