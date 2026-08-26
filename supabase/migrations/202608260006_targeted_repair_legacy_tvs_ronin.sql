-- Targeted Repair for Orphan Legacy TVS Ronin Goal Pocket
-- This migration repairs a specific, confirmed corrupted state where a Goal Pocket transfer 
-- survived the improper deletion of its parent Goal and Goal Contribution records.
-- It strictly guards against generalizing this cleanup to any other records.

DO $$
DECLARE
  v_wallet_id uuid := '3f3a8c0a-91e4-400f-ad86-51520ed7d1bf';
  v_transaction_id uuid := 'cd4525ae-f134-4e23-9326-159728c8b4ce';
  v_source_wallet_id uuid := '83c591c4-9ea8-433b-8d3a-14ee0fcc3ef7';
  
  v_wallet_name text;
  v_wallet_type text;
  v_initial_balance numeric;
  v_current_balance numeric;
  
  v_goal_count int;
  v_goal_contrib_count int;
  v_transaction_count int;
  
  v_tx_type text;
  v_tx_status text;
  v_tx_amount numeric;
  v_tx_source uuid;
  v_tx_dest uuid;
  v_tx_related_type text;
  v_tx_related_id text;
  
  v_related_gc_exists boolean;
  
  v_tx_debt_count int;
  v_tx_gc_count int;
  v_tx_recurring_count int;
  v_tx_shared_savings_count int;
BEGIN
  -- 1. Pre-check: Ensure wallet exists. Skip gracefully if not found (e.g. local dev / reset).
  IF NOT EXISTS (SELECT 1 FROM public.wallets WHERE id = v_wallet_id) THEN
    RAISE NOTICE 'Target pocket % not found. Skipping repair.', v_wallet_id;
    RETURN;
  END IF;

  -- 2. Wallet Property Assertions
  SELECT name, wallet_type, initial_balance 
  INTO v_wallet_name, v_wallet_type, v_initial_balance
  FROM public.wallets WHERE id = v_wallet_id;
  
  IF v_wallet_name != 'Tvs ronin Pocket' THEN
    RAISE EXCEPTION 'Wallet name mismatch. Expected "Tvs ronin Pocket", got "%"', v_wallet_name;
  END IF;
  
  IF v_wallet_type != 'savings' THEN
    RAISE EXCEPTION 'Wallet type mismatch. Expected "savings", got "%"', v_wallet_type;
  END IF;
  
  IF v_initial_balance != 0 THEN
    RAISE EXCEPTION 'Initial balance mismatch. Expected 0, got %', v_initial_balance;
  END IF;
  
  -- 3. Authoritative Balance Assertion
  SELECT current_balance INTO v_current_balance
  FROM public.wallet_balance_view WHERE wallet_id = v_wallet_id;
  
  IF v_current_balance != 100000 THEN
    RAISE EXCEPTION 'Current balance mismatch. Expected 100000, got %', v_current_balance;
  END IF;
  
  -- 4. Dependency Assertions
  SELECT count(*) INTO v_goal_count FROM public.goals WHERE wallet_id = v_wallet_id;
  IF v_goal_count != 0 THEN
    RAISE EXCEPTION 'Wallet has % goals referencing it. Expected 0.', v_goal_count;
  END IF;
  
  SELECT count(*) INTO v_goal_contrib_count FROM public.goal_contributions WHERE wallet_id = v_wallet_id;
  IF v_goal_contrib_count != 0 THEN
    RAISE EXCEPTION 'Wallet has % goal_contributions referencing it. Expected 0.', v_goal_contrib_count;
  END IF;
  
  SELECT count(*) INTO v_transaction_count FROM public.transactions 
  WHERE wallet_id = v_wallet_id OR destination_wallet_id = v_wallet_id;
  IF v_transaction_count != 1 THEN
    RAISE EXCEPTION 'Wallet has % transactions. Expected exactly 1.', v_transaction_count;
  END IF;
  
  -- 5. Exact Transaction Assertions
  IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = v_transaction_id) THEN
    RAISE EXCEPTION 'Target transaction % not found.', v_transaction_id;
  END IF;
  
  SELECT type, status, amount, wallet_id, destination_wallet_id, related_entity_type, related_entity_id
  INTO v_tx_type, v_tx_status, v_tx_amount, v_tx_source, v_tx_dest, v_tx_related_type, v_tx_related_id
  FROM public.transactions WHERE id = v_transaction_id;
  
  IF v_tx_type != 'transfer' THEN RAISE EXCEPTION 'Tx type mismatch: %', v_tx_type; END IF;
  IF v_tx_status != 'completed' THEN RAISE EXCEPTION 'Tx status mismatch: %', v_tx_status; END IF;
  IF v_tx_amount != 100000 THEN RAISE EXCEPTION 'Tx amount mismatch: %', v_tx_amount; END IF;
  IF v_tx_source != v_source_wallet_id THEN RAISE EXCEPTION 'Tx source mismatch: %', v_tx_source; END IF;
  IF v_tx_dest != v_wallet_id THEN RAISE EXCEPTION 'Tx dest mismatch: %', v_tx_dest; END IF;
  IF v_tx_related_type != 'goal_contribution' THEN RAISE EXCEPTION 'Tx related type mismatch: %', v_tx_related_type; END IF;
  IF v_tx_related_id != 'ea3e238d-9710-44a1-ba2b-a0296cab14fb' THEN RAISE EXCEPTION 'Tx related id mismatch: %', v_tx_related_id; END IF;
  
  -- 6. Verify the related entity (goal_contribution) is indeed missing
  SELECT EXISTS (
    SELECT 1 FROM public.goal_contributions WHERE id = v_tx_related_id::uuid
  ) INTO v_related_gc_exists;
  
  IF v_related_gc_exists THEN
    RAISE EXCEPTION 'Referenced goal_contribution % STILL EXISTS. Aborting.', v_tx_related_id;
  END IF;

  -- 7. Transaction Dependency Guards (Assert no surviving FK references to this transaction)
  SELECT count(*) INTO v_tx_debt_count FROM public.debt_payments WHERE transaction_id = v_transaction_id;
  IF v_tx_debt_count != 0 THEN RAISE EXCEPTION 'Tx has % debt_payments dependencies', v_tx_debt_count; END IF;

  SELECT count(*) INTO v_tx_gc_count FROM public.goal_contributions WHERE transaction_id = v_transaction_id;
  IF v_tx_gc_count != 0 THEN RAISE EXCEPTION 'Tx has % goal_contributions dependencies', v_tx_gc_count; END IF;

  SELECT count(*) INTO v_tx_recurring_count FROM public.recurring_payments WHERE transaction_id = v_transaction_id;
  IF v_tx_recurring_count != 0 THEN RAISE EXCEPTION 'Tx has % recurring_payments dependencies', v_tx_recurring_count; END IF;

  SELECT count(*) INTO v_tx_shared_savings_count FROM public.shared_savings_requests WHERE transaction_id = v_transaction_id;
  IF v_tx_shared_savings_count != 0 THEN RAISE EXCEPTION 'Tx has % shared_savings_requests dependencies', v_tx_shared_savings_count; END IF;

  -- ========================================================================
  -- REPAIR SEMANTICS
  -- ========================================================================
  
  -- A. Remove the invalid orphan transfer. 
  --    This automatically restores the 100,000 back to the source wallet ledger.
  DELETE FROM public.transactions WHERE id = v_transaction_id;
  
  -- B. Verify pocket balance dropped to 0
  SELECT current_balance INTO v_current_balance
  FROM public.wallet_balance_view WHERE wallet_id = v_wallet_id;
  
  IF v_current_balance != 0 THEN
    RAISE EXCEPTION 'Repair failed: Pocket balance is % after transaction deletion. Expected 0.', v_current_balance;
  END IF;
  
  -- C. Safely delete the pocket
  DELETE FROM public.wallets WHERE id = v_wallet_id;
  
  RAISE NOTICE 'Targeted repair successful. Orphan transfer (%) and pocket (%) permanently deleted.', v_transaction_id, v_wallet_id;
END $$;
