-- ============================================================
-- Drop overloaded 7-argument record_counterparty_settlement
-- Leaves only the single canonical 8-argument version with p_debt_id default null
-- ============================================================

drop function if exists public.record_counterparty_settlement(
  uuid,
  public.debt_type,
  public.payment_mode,
  numeric,
  uuid,
  timestamptz,
  text
);
