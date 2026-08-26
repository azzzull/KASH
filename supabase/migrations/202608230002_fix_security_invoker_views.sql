-- ============================================================
-- KASH: Fix Security Invoker on User-Scoped Views
-- ============================================================

alter view public.wallet_balance_view
set (security_invoker = true);

alter view public.recurring_obligations_summary_view
set (security_invoker = true);
