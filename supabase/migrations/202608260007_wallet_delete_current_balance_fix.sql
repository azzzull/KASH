-- 1. Update delete_wallet_permanently RPC to use authoritative current balance
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
  if v_wallet_record.user_id <> v_user_id then raise exception 'Unauthorized'; end if;

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
