import type { Transaction, Wallet } from "../types/domain";

/**
 * Canonical transaction-derived metrics. Live wallet balances remain
 * authoritative in `wallet_balance_view`; this layer keeps reporting and
 * dashboard projections aligned with the same event classification.
 */
export type FinancialMetrics = {
  income: number;
  expensePrincipal: number;
  transferFees: number;
  expense: number;
  totalExpense: number;
  internalTransfers: number;
  walletInflow: number;
  walletOutflow: number;
  walletNetMovement: number;
  netCashFlow: number;
  transactionCount: number;
};

const NON_ECONOMIC_EVENT_TYPES = new Set([
  "debt_creation",
  "receivable_creation",
  "debt_payment",
  "receivable_payment",
  "goal_contribution",
  "goal_refund",
  "shared_savings_contribution",
  "shared_savings_withdrawal",
]);

function moneyValue(value: string | number | null | undefined) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function isEconomicIncomeOrExpense(transaction: Transaction) {
  return !NON_ECONOMIC_EVENT_TYPES.has(transaction.related_entity_type ?? "");
}

export function transactionFee(transaction: Transaction) {
  return transaction.type === "expense" || transaction.type === "transfer"
    ? moneyValue(transaction.transfer_fee)
    : 0;
}

export function walletMovementForTransaction(transaction: Transaction, walletId: string) {
  if (transaction.status !== "completed") return { inflow: 0, outflow: 0, netMovement: 0, involved: false };

  const amount = moneyValue(transaction.amount);
  const fee = transactionFee(transaction);
  let inflow = 0;
  let outflow = 0;

  if (transaction.wallet_id === walletId) {
    if (transaction.type === "income") inflow += amount;
    else if (transaction.type === "adjustment") {
      inflow += Math.max(amount, 0);
      outflow += Math.max(-amount, 0);
    } else outflow += amount + fee;
  }
  if (transaction.type === "transfer" && transaction.destination_wallet_id === walletId) inflow += amount;

  return { inflow, outflow, netMovement: inflow - outflow, involved: inflow > 0 || outflow > 0 };
}

export function calculateFinancialMetrics(transactions: Transaction[], walletId?: string, spaceId?: string): FinancialMetrics {
  return transactions.reduce<FinancialMetrics>((metrics, transaction) => {
    if (spaceId && transaction.space_id !== spaceId) return metrics;
    if (transaction.status !== "completed") return metrics;
    const amount = moneyValue(transaction.amount);
    const fee = transactionFee(transaction);

    if (transaction.type === "income" && isEconomicIncomeOrExpense(transaction)) metrics.income += amount;
    if (transaction.type === "expense" && isEconomicIncomeOrExpense(transaction)) metrics.expensePrincipal += amount;
    metrics.transferFees += fee;
    if (transaction.type === "transfer") metrics.internalTransfers += amount;

    if (walletId) {
      const movement = walletMovementForTransaction(transaction, walletId);
      metrics.walletInflow += movement.inflow;
      metrics.walletOutflow += movement.outflow;
      metrics.walletNetMovement += movement.netMovement;
      if (movement.involved) metrics.transactionCount += 1;
    } else {
      // A transfer is deliberately represented on both participating wallets.
      const source = transaction.wallet_id ? walletMovementForTransaction(transaction, transaction.wallet_id) : null;
      const destination = transaction.destination_wallet_id ? walletMovementForTransaction(transaction, transaction.destination_wallet_id) : null;
      metrics.walletInflow += (source?.inflow ?? 0) + (destination?.inflow ?? 0);
      metrics.walletOutflow += (source?.outflow ?? 0) + (destination?.outflow ?? 0);
      metrics.walletNetMovement += (source?.netMovement ?? 0) + (destination?.netMovement ?? 0);
      metrics.transactionCount += 1;
    }
    return metrics;
  }, { income: 0, expensePrincipal: 0, transferFees: 0, expense: 0, totalExpense: 0, internalTransfers: 0, walletInflow: 0, walletOutflow: 0, walletNetMovement: 0, netCashFlow: 0, transactionCount: 0 });
}

export function finalizeFinancialMetrics(metrics: Omit<FinancialMetrics, "expense" | "totalExpense" | "netCashFlow">): FinancialMetrics {
  const totalExpense = metrics.expensePrincipal + metrics.transferFees;
  return { ...metrics, expense: totalExpense, totalExpense, netCashFlow: metrics.income - totalExpense };
}

export function financialMetrics(transactions: Transaction[], walletId?: string, spaceId?: string) {
  return finalizeFinancialMetrics(calculateFinancialMetrics(transactions, walletId, spaceId));
}

export function walletBalanceAt(wallet: Pick<Wallet, "id" | "created_at" | "initial_balance">, transactions: Transaction[], endExclusive: string | Date) {
  const cutoff = typeof endExclusive === "string" ? endExclusive : endExclusive.toISOString();
  const initial = new Date(wallet.created_at).toISOString() < cutoff ? moneyValue(wallet.initial_balance) : 0;
  return initial + financialMetrics(transactions.filter((transaction) => transaction.transaction_date < cutoff), wallet.id).walletNetMovement;
}

export function walletNetWorthAt(wallets: Pick<Wallet, "id" | "created_at" | "initial_balance" | "include_in_net_worth" | "is_archived">[], transactions: Transaction[], endExclusive: Date) {
  return wallets
    .filter((wallet) => wallet.include_in_net_worth && !wallet.is_archived)
    .reduce((total, wallet) => total + walletBalanceAt(wallet, transactions, endExclusive), 0);
}
