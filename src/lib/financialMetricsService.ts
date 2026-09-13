import type { DebtProgress, RecurringPayment, Wallet } from "../types/domain";
import { getActiveSpaceId } from "./spaces";
import { calculateSpendableCash, type FinancialMetricsWallet, type MandatoryObligation } from "./financialMetrics";
import { toNumber } from "./money";
import { supabase } from "./supabase";

async function getAuthenticatedUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("You need to be signed in to view spendable cash.");
  return user.id;
}

/**
 * Loads only authoritative inputs for the canonical Spendable Cash primitive.
 * `wallet_balance_view` supplies live balances; budgets are intentionally not
 * queried because a budget is a plan rather than a cash reservation.
 */
export async function getSpendableCash(input: { dueBy: string | Date; spaceId?: string; operatingBuffer?: number }) {
  const userId = await getAuthenticatedUserId();
  const spaceId = input.spaceId ?? getActiveSpaceId();
  let walletsQuery = supabase.from("wallets").select("*").eq("is_archived", false);
  let goalsQuery = supabase.from("goals").select("wallet_id").neq("status", "cancelled");
  let obligationsQuery = supabase.from("recurring_obligations").select("id, name").eq("status", "active");
  let debtsQuery = supabase.from("debts").select("id, title, due_date").eq("type", "debt").in("status", ["active", "partially_paid"]);

  if (spaceId) {
    walletsQuery = walletsQuery.eq("space_id", spaceId);
    goalsQuery = goalsQuery.eq("space_id", spaceId);
    obligationsQuery = obligationsQuery.eq("space_id", spaceId);
    debtsQuery = debtsQuery.eq("space_id", spaceId);
  } else {
    walletsQuery = walletsQuery.eq("user_id", userId);
    goalsQuery = goalsQuery.eq("user_id", userId);
    obligationsQuery = obligationsQuery.eq("user_id", userId);
    debtsQuery = debtsQuery.eq("user_id", userId);
  }

  const [walletsResult, balancesResult, goalsResult, obligationsResult, debtsResult] = await Promise.all([
    walletsQuery,
    supabase.from("wallet_balance_view").select("wallet_id, current_balance"),
    goalsQuery,
    obligationsQuery,
    debtsQuery,
  ]);
  if (walletsResult.error) throw walletsResult.error;
  if (balancesResult.error) throw balancesResult.error;
  if (goalsResult.error) throw goalsResult.error;
  if (obligationsResult.error) throw obligationsResult.error;
  if (debtsResult.error) throw debtsResult.error;

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
  const debtNames = new Map((debtsResult.data ?? []).map((debt) => [debt.id, { dueDate: debt.due_date, name: debt.title }]));
  const debtIds = Array.from(debtNames.keys());
  const [paymentsResult, progressResult] = await Promise.all([
    obligationIds.length > 0
      ? supabase.from("recurring_payments").select("id, obligation_id, amount, due_date").in("obligation_id", obligationIds).in("status", ["pending", "overdue"])
      : Promise.resolve({ data: [], error: null }),
    debtIds.length > 0
      ? supabase.from("debt_progress_view").select("debt_id, remaining_amount").in("debt_id", debtIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (paymentsResult.error) throw paymentsResult.error;
  if (progressResult.error) throw progressResult.error;

  const obligations: MandatoryObligation[] = [
    ...((paymentsResult.data ?? []) as Pick<RecurringPayment, "id" | "obligation_id" | "amount" | "due_date">[]).map((payment) => ({
      id: payment.id,
      kind: "recurring" as const,
      amount: payment.amount,
      dueDate: payment.due_date,
      name: obligationNames.get(payment.obligation_id),
    })),
    ...((progressResult.data ?? []) as Pick<DebtProgress, "debt_id" | "remaining_amount">[]).flatMap((progress) => {
      const debt = debtNames.get(progress.debt_id);
      return debt && toNumber(progress.remaining_amount) > 0 ? [{
        id: progress.debt_id,
        kind: "debt" as const,
        amount: progress.remaining_amount,
        dueDate: debt.dueDate,
        name: debt.name ?? undefined,
      }] : [];
    }),
  ];

  return calculateSpendableCash({ wallets: metricWallets, obligations, dueBy: input.dueBy, spaceId: spaceId ?? undefined, goalWalletIds, operatingBuffer: input.operatingBuffer });
}
