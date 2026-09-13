import type { RecurringPayment, Wallet } from "../types/domain";
import { getActiveSpaceId } from "./spaces";
import { calculateSpendableCash, remainingDebtAllocationThisPeriod, type FinancialMetricsWallet, type MandatoryObligation } from "./financialMetrics";
import { getMonthlyBudgets } from "./budgets";
import { supabase } from "./supabase";

async function getAuthenticatedUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("You need to be signed in to view spendable cash.");
  return user.id;
}

/**
 * Loads only authoritative inputs for the canonical Spendable Cash primitive.
 * `wallet_balance_view` supplies live balances. Only current-period debt
 * targets from the budget RPC are reservations; spending budgets remain plans.
 */
export async function getSpendableCash(input: { periodStart?: string; periodEnd?: string; spaceId?: string; operatingBuffer?: number; referenceDate?: Date }) {
  const userId = await getAuthenticatedUserId();
  const spaceId = input.spaceId ?? getActiveSpaceId();
  const referenceDate = input.referenceDate ?? new Date();
  const periodStart = input.periodStart ?? new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1).toISOString();
  const periodEnd = input.periodEnd ?? new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
  let walletsQuery = supabase.from("wallets").select("*").eq("is_archived", false);
  let goalsQuery = supabase.from("goals").select("wallet_id").neq("status", "cancelled");
  let obligationsQuery = supabase.from("recurring_obligations").select("id, name").eq("status", "active");

  if (spaceId) {
    walletsQuery = walletsQuery.eq("space_id", spaceId);
    goalsQuery = goalsQuery.eq("space_id", spaceId);
    obligationsQuery = obligationsQuery.eq("space_id", spaceId);
  } else {
    walletsQuery = walletsQuery.eq("user_id", userId);
    goalsQuery = goalsQuery.eq("user_id", userId);
    obligationsQuery = obligationsQuery.eq("user_id", userId);
  }

  const [walletsResult, balancesResult, goalsResult, obligationsResult, budgets] = await Promise.all([
    walletsQuery,
    supabase.from("wallet_balance_view").select("wallet_id, current_balance"),
    goalsQuery,
    obligationsQuery,
    getMonthlyBudgets(periodStart, spaceId ?? undefined),
  ]);
  if (walletsResult.error) throw walletsResult.error;
  if (balancesResult.error) throw balancesResult.error;
  if (goalsResult.error) throw goalsResult.error;
  if (obligationsResult.error) throw obligationsResult.error;

  const wallets = (walletsResult.data ?? []) as Wallet[];
  const balancesByWalletId = new Map((balancesResult.data ?? []).map((balance) => [balance.wallet_id, balance.current_balance]));
  const metricWallets: FinancialMetricsWallet[] = wallets.map((wallet) => ({
    id: wallet.id,
    name: wallet.name,
    wallet_type: wallet.wallet_type,
    is_archived: wallet.is_archived,
    space_id: wallet.space_id,
    currentBalance: balancesByWalletId.get(wallet.id) ?? "0",
  }));
  const goalWalletIds = (goalsResult.data ?? []).map((goal) => goal.wallet_id).filter((walletId): walletId is string => Boolean(walletId));
  const obligationNames = new Map((obligationsResult.data ?? []).map((obligation) => [obligation.id, obligation.name]));
  const obligationIds = Array.from(obligationNames.keys());
  const paymentsResult = await (
    obligationIds.length > 0
      ? supabase.from("recurring_payments").select("id, obligation_id, amount, due_date, status").in("obligation_id", obligationIds).in("status", ["pending", "overdue"])
      : Promise.resolve({ data: [], error: null })
  );
  if (paymentsResult.error) throw paymentsResult.error;

  const obligations: MandatoryObligation[] = [
    ...((paymentsResult.data ?? []) as Pick<RecurringPayment, "id" | "obligation_id" | "amount" | "due_date" | "status">[]).map((payment) => ({
      id: payment.id,
      kind: "recurring" as const,
      amount: payment.amount,
      dueDate: payment.due_date,
      status: payment.status === "overdue" ? "overdue" as const : "pending" as const,
      name: obligationNames.get(payment.obligation_id),
    })),
    ...budgets.filter((budget) => budget.target_type === "debt").map((budget) => ({ id: budget.budget_id, kind: "debt_allocation" as const, amount: remainingDebtAllocationThisPeriod(budget.effective_budget, budget.spent), dueDate: null, currentPeriod: true, name: budget.name })),
  ];

  return calculateSpendableCash({ wallets: metricWallets, obligations, periodStart, periodEnd, spaceId: spaceId ?? undefined, goalWalletIds, operatingBuffer: input.operatingBuffer });
}
