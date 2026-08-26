-- Migration: 202608200005_investment_activities_and_performance_accounting.sql
-- Refines Investment Wallet accounting for realized/unrealized performance metadata.

-- 1. Create investment_activity_type ENUM
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'investment_activity_type') THEN
    CREATE TYPE investment_activity_type AS ENUM ('realized_gain', 'realized_loss');
  END IF;
END $$;

-- 2. Create investment_activities table
CREATE TABLE IF NOT EXISTS public.investment_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  activity_type investment_activity_type NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  activity_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_investment_activities_wallet_date 
  ON public.investment_activities(wallet_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_investment_activities_user 
  ON public.investment_activities(user_id);

-- 4. Validation Trigger to enforce server-side user_id & investment wallet type
CREATE OR REPLACE FUNCTION public.validate_investment_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_wallet_type wallet_type;
  v_wallet_user_id UUID;
BEGIN
  -- Force user_id to auth.uid() if authenticated
  IF auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid();
  END IF;

  SELECT wallet_type, user_id INTO v_wallet_type, v_wallet_user_id
  FROM public.wallets
  WHERE id = NEW.wallet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found.';
  END IF;

  IF v_wallet_user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'You do not own this wallet.';
  END IF;

  IF v_wallet_type <> 'investment' THEN
    RAISE EXCEPTION 'Investment activities can only be recorded on Investment wallets.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_investment_activity ON public.investment_activities;
CREATE TRIGGER trg_validate_investment_activity
  BEFORE INSERT OR UPDATE ON public.investment_activities
  FOR EACH ROW EXECUTE FUNCTION public.validate_investment_activity();

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.investment_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own investment activities" ON public.investment_activities;
CREATE POLICY "Users can view their own investment activities"
  ON public.investment_activities FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own investment activities" ON public.investment_activities;
CREATE POLICY "Users can insert their own investment activities"
  ON public.investment_activities FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own investment activities" ON public.investment_activities;
CREATE POLICY "Users can update their own investment activities"
  ON public.investment_activities FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own investment activities" ON public.investment_activities;
CREATE POLICY "Users can delete their own investment activities"
  ON public.investment_activities FOR DELETE
  USING (user_id = auth.uid());

-- 6. Update wallet_balance_view maintaining existing columns and appending new performance metrics
CREATE OR REPLACE VIEW public.wallet_balance_view
WITH (security_invoker = true) AS
WITH transaction_totals AS (
  SELECT w_1.id AS wallet_id,
    COALESCE(sum(
      CASE
        WHEN t.status <> 'completed'::transaction_status THEN 0::numeric
        WHEN t.type = 'income'::transaction_type AND t.wallet_id = w_1.id THEN t.amount
        WHEN t.type = 'expense'::transaction_type AND t.wallet_id = w_1.id THEN -t.amount
        WHEN t.type = 'adjustment'::transaction_type AND t.wallet_id = w_1.id THEN t.amount
        WHEN t.type = 'transfer'::transaction_type AND t.wallet_id = w_1.id THEN -(t.amount + t.transfer_fee)
        WHEN t.type = 'transfer'::transaction_type AND t.destination_wallet_id = w_1.id THEN t.amount
        ELSE 0::numeric
      END
    ), 0::numeric)::numeric(18,2) AS transaction_total
  FROM wallets w_1
  LEFT JOIN transactions t ON t.wallet_id = w_1.id OR t.destination_wallet_id = w_1.id
  GROUP BY w_1.id
),
activity_totals AS (
  SELECT a.wallet_id,
    COALESCE(sum(
      CASE
        WHEN a.activity_type = 'realized_gain' THEN a.amount
        WHEN a.activity_type = 'realized_loss' THEN -a.amount
        ELSE 0::numeric
      END
    ), 0::numeric)::numeric(18,2) AS realized_pnl
  FROM investment_activities a
  GROUP BY a.wallet_id
)
SELECT 
  w.id AS wallet_id,
  w.user_id,
  w.initial_balance,
  COALESCE(tt.transaction_total, 0::numeric)::numeric(18,2) AS transaction_total,
  CASE
    WHEN w.wallet_type = 'investment'::wallet_type AND w.current_market_value IS NOT NULL THEN w.current_market_value
    ELSE (w.initial_balance + COALESCE(tt.transaction_total, 0::numeric))
  END::numeric(18,2) AS current_balance,
  0::numeric(18,2) AS allocated_to_goals,
  CASE
    WHEN w.wallet_type = 'investment'::wallet_type AND w.current_market_value IS NOT NULL THEN w.current_market_value
    ELSE (w.initial_balance + COALESCE(tt.transaction_total, 0::numeric))
  END::numeric(18,2) AS available_balance,
  -- 8. cost_basis (retained for backward compatibility, represents Net Contributions)
  (w.initial_balance + COALESCE(tt.transaction_total, 0::numeric))::numeric(18,2) AS cost_basis,
  -- 9. unrealized_gain_loss (Total P/L - Realized P/L)
  CASE
    WHEN w.wallet_type = 'investment'::wallet_type AND w.current_market_value IS NOT NULL 
      THEN (w.current_market_value - (w.initial_balance + COALESCE(tt.transaction_total, 0::numeric))) - COALESCE(act.realized_pnl, 0::numeric)
    ELSE 0::numeric
  END::numeric(18,2) AS unrealized_gain_loss,
  -- 10. return_percentage (Total P/L / Net Contributions only when Net Contributions > 0, else NULL)
  CASE
    WHEN w.wallet_type = 'investment'::wallet_type AND w.current_market_value IS NOT NULL AND (w.initial_balance + COALESCE(tt.transaction_total, 0::numeric)) > 0
      THEN round((((w.current_market_value - (w.initial_balance + COALESCE(tt.transaction_total, 0::numeric))) / (w.initial_balance + COALESCE(tt.transaction_total, 0::numeric))) * 100::numeric), 2)
    ELSE NULL::numeric(8,2)
  END::numeric(8,2) AS return_percentage,
  -- 11. last_valuation_at
  w.last_valuation_at,
  -- 12. net_contributions (Canonical naming)
  (w.initial_balance + COALESCE(tt.transaction_total, 0::numeric))::numeric(18,2) AS net_contributions,
  -- 13. realized_pnl
  COALESCE(act.realized_pnl, 0::numeric)::numeric(18,2) AS realized_pnl,
  -- 14. total_pnl (Current Equity - Net Contributions)
  CASE
    WHEN w.wallet_type = 'investment'::wallet_type AND w.current_market_value IS NOT NULL 
      THEN (w.current_market_value - (w.initial_balance + COALESCE(tt.transaction_total, 0::numeric)))
    ELSE 0::numeric
  END::numeric(18,2) AS total_pnl,
  -- 15. unrealized_pnl (Canonical naming for Unrealized P/L)
  CASE
    WHEN w.wallet_type = 'investment'::wallet_type AND w.current_market_value IS NOT NULL 
      THEN (w.current_market_value - (w.initial_balance + COALESCE(tt.transaction_total, 0::numeric))) - COALESCE(act.realized_pnl, 0::numeric)
    ELSE 0::numeric
  END::numeric(18,2) AS unrealized_pnl
FROM wallets w
LEFT JOIN transaction_totals tt ON tt.wallet_id = w.id
LEFT JOIN activity_totals act ON act.wallet_id = w.id;
