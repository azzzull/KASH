-- Fix debt_payments constraint for cross space settlements
ALTER TABLE public.debt_payments DROP CONSTRAINT IF EXISTS debt_payments_mode_invariant;
ALTER TABLE public.debt_payments ADD CONSTRAINT debt_payments_mode_invariant CHECK (
  (((payment_mode = 'wallet'::payment_mode) AND (wallet_id IS NOT NULL) AND (transaction_id IS NOT NULL)) OR 
   ((payment_mode = 'historical'::payment_mode) AND (wallet_id IS NULL) AND (transaction_id IS NULL)) OR
   ((cross_space_role IS NOT NULL) AND (wallet_id IS NULL) AND (transaction_id IS NULL) AND (payment_mode = 'wallet'::payment_mode)))
);
