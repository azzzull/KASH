-- 1. Create delete_wallet_permanently RPC
create or replace function public.delete_wallet_permanently(p_wallet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet_record public.wallets;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;

  select * into v_wallet_record from public.wallets where id = p_wallet_id for update;
  
  if v_wallet_record.id is null then raise exception 'Wallet not found'; end if;
  if v_wallet_record.user_id <> v_user_id then raise exception 'Unauthorized'; end if;

  -- 1. Check if initial_balance is exactly 0
  if v_wallet_record.initial_balance <> 0 then
    raise exception 'Wallet cannot be deleted because it has a non-zero initial balance. Please keep it archived.';
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

-- 2. Update delete_goal_if_empty RPC to cascade safely
create or replace function public.delete_goal_if_empty(p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_goal_record public.goals;
  v_contributions_count integer;
  v_refunds_count integer;
  v_pocket_wallet_id uuid;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  
  select * into v_goal_record from public.goals where id = p_goal_id and user_id = v_user_id for update;
  if v_goal_record.id is null then raise exception 'Goal not found'; end if;

  select count(*) into v_contributions_count from public.goal_contributions where goal_id = p_goal_id;
  if v_contributions_count > 0 then
    raise exception 'Goal cannot be deleted because it has contribution history. Please cancel it instead.';
  end if;

  select count(*) into v_refunds_count from public.transactions where related_entity_type = 'goal_refund' and related_entity_id = p_goal_id;
  if v_refunds_count > 0 then
    raise exception 'Goal cannot be deleted because it has refund history. Please cancel it instead.';
  end if;

  v_pocket_wallet_id := v_goal_record.wallet_id;

  -- Clear the Goal FK to the wallet so we can delete the Goal first
  -- This breaks the cycle and allows the canonical safe wallet deletion to run next
  if v_pocket_wallet_id is not null then
    update public.goals set wallet_id = null where id = p_goal_id;
  end if;

  -- Safely delete the Goal
  delete from public.goals where id = p_goal_id;

  -- Finally, permanently delete its dedicated Pocket Wallet using the canonical rule.
  -- This ensures the Pocket Wallet is checked against the same dependency rules as any other wallet.
  if v_pocket_wallet_id is not null then
    perform public.delete_wallet_permanently(v_pocket_wallet_id);
  end if;
end;
$$;
