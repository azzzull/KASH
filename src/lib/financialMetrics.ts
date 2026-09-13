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

export type FinancialMetricsWallet = Pick<Wallet, "id" | "wallet_type" | "is_archived" | "space_id"> & {
  currentBalance: number | string;
  name?: string;
};

export type MandatoryObligation = {
  id: string;
  amount: number | string;
  dueDate: string | null;
  kind: "recurring" | "debt_allocation" | "other";
  status?: "pending" | "overdue" | "paid";
  currentPeriod?: boolean;
  name?: string;
};

export type SpendableCashComponent = {
  id: string;
  kind: "liquid_wallet" | "protected_wallet" | "scheduled_bill" | "debt_allocation" | "other_mandatory" | "operating_buffer";
  amount: number;
  name?: string;
  alreadyExcludedFromLiquidCash?: boolean;
};

export type SpendableCashBreakdown = {
  liquidCash: number;
  unpaidScheduledBills: number;
  remainingDebtAllocation: number;
  otherMandatoryObligations: number;
  totalRemainingObligations: number;
  availableToSpend: number;
  reminder: { unpaidObligationCount: number; nearestDueDate: string | null; nearestDueAmount: number | null; overdueCount: number };
  // Compatibility aliases for the existing Phase 2 consumer contract.
  mandatoryObligations: number;
  protectedAmounts: number;
  operatingBuffer: number;
  spendableCash: number;
  components: SpendableCashComponent[];
  limitations: string[];
};

export type MoneyFlowReconciliation = {
  genuineIncome: number;
  ordinarySpending: number;
  savingsAllocation: number;
  goalContributions: number;
  debtPrincipalPayments: number;
  debtPrincipalInflow: number;
  receivableOutflow: number;
  receivableCollection: number;
  investmentContribution: number;
  investmentWithdrawal: number;
  transferFees: number;
  internalWalletMovement: number;
  otherAssetMovement: number;
  balanceAdjustments: number;
  resultingLiquidityChange: number;
  explainedLiquidityChange: number;
  unreconciledAmount: number;
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

export function remainingDebtAllocationThisPeriod(currentPeriodDebtTarget: number | string | null | undefined, qualifyingDebtPaymentsThisPeriod: number | string | null | undefined) {
  return Math.max(moneyValue(currentPeriodDebtTarget) - moneyValue(qualifyingDebtPaymentsThisPeriod), 0);
}

function isLiquidWalletType(walletType: Wallet["wallet_type"]) {
  return walletType === "bank" || walletType === "digital_bank" || walletType === "ewallet" || walletType === "cash";
}

function isDateInCurrentPeriod(dueDate: string | null, periodStart: string | Date, periodEnd: string | Date, status?: MandatoryObligation["status"]) {
  if (!dueDate) return false;
  const dueTime = new Date(dueDate).getTime();
  const startTime = new Date(periodStart).getTime();
  const endTime = new Date(periodEnd).getTime();
  if (!Number.isFinite(dueTime) || !Number.isFinite(startTime) || !Number.isFinite(endTime)) return false;
  return status === "overdue" ? dueTime <= endTime : dueTime >= startTime && dueTime <= endTime;
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

/**
 * Calculates money that remains safe to use from authoritative current wallet
 * balances supplied by `wallet_balance_view`. Budgets are intentionally not
 * subtracted: they are planning values and have no guaranteed cash reserve.
 */
export function calculateSpendableCash(input: {
  wallets: FinancialMetricsWallet[];
  obligations?: MandatoryObligation[];
  periodStart: string | Date;
  periodEnd: string | Date;
  spaceId?: string;
  goalWalletIds?: string[];
  operatingBuffer?: number;
}): SpendableCashBreakdown {
  const goalWalletIds = new Set(input.goalWalletIds ?? []);
  const spaceWallets = input.wallets.filter((wallet) => !wallet.is_archived && (!input.spaceId || wallet.space_id === input.spaceId));
  const protectedWallets = spaceWallets.filter((wallet) => wallet.wallet_type === "savings" || goalWalletIds.has(wallet.id));
  const liquidWallets = spaceWallets.filter((wallet) => isLiquidWalletType(wallet.wallet_type) && !goalWalletIds.has(wallet.id));
  const dueObligations = (input.obligations ?? []).filter((obligation) => {
    if (obligation.status === "paid") return false;
    if (obligation.kind === "debt_allocation") return obligation.currentPeriod === true;
    return isDateInCurrentPeriod(obligation.dueDate, input.periodStart, input.periodEnd, obligation.status);
  });
  const liquidCash = liquidWallets.reduce((sum, wallet) => sum + moneyValue(wallet.currentBalance), 0);
  const protectedAmounts = protectedWallets.reduce((sum, wallet) => sum + moneyValue(wallet.currentBalance), 0);
  const unpaidScheduledBills = dueObligations.filter((obligation) => obligation.kind === "recurring").reduce((sum, obligation) => sum + Math.max(0, moneyValue(obligation.amount)), 0);
  const remainingDebtAllocation = dueObligations.filter((obligation) => obligation.kind === "debt_allocation").reduce((sum, obligation) => sum + Math.max(0, moneyValue(obligation.amount)), 0);
  const otherMandatoryObligations = dueObligations.filter((obligation) => obligation.kind === "other").reduce((sum, obligation) => sum + Math.max(0, moneyValue(obligation.amount)), 0);
  const totalRemainingObligations = unpaidScheduledBills + remainingDebtAllocation + otherMandatoryObligations;
  const operatingBuffer = input.operatingBuffer ?? 0;
  const limitations = [
    ...(input.operatingBuffer === undefined ? ["Operating buffer is not configured in KASH and is therefore zero."] : []),
    ...((input.obligations ?? []).some((obligation) => obligation.kind !== "debt_allocation" && !obligation.dueDate) ? ["Undated scheduled obligations are not reserved because KASH has no reliable payment horizon for them."] : []),
  ];
  const components: SpendableCashComponent[] = [
    ...liquidWallets.map((wallet) => ({ id: wallet.id, kind: "liquid_wallet" as const, amount: moneyValue(wallet.currentBalance), name: wallet.name })),
    ...protectedWallets.map((wallet) => ({ id: wallet.id, kind: "protected_wallet" as const, amount: moneyValue(wallet.currentBalance), name: wallet.name, alreadyExcludedFromLiquidCash: true })),
    ...dueObligations.map((obligation) => ({ id: obligation.id, kind: obligation.kind === "recurring" ? "scheduled_bill" as const : obligation.kind === "debt_allocation" ? "debt_allocation" as const : "other_mandatory" as const, amount: Math.max(0, moneyValue(obligation.amount)), name: obligation.name })),
    ...(operatingBuffer > 0 ? [{ id: "operating-buffer", kind: "operating_buffer" as const, amount: operatingBuffer }] : []),
  ];

  return {
    liquidCash,
    unpaidScheduledBills,
    remainingDebtAllocation,
    otherMandatoryObligations,
    totalRemainingObligations,
    availableToSpend: liquidCash - totalRemainingObligations - operatingBuffer,
    reminder: (() => {
      const dated = dueObligations.filter((obligation) => obligation.dueDate).sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
      const nearest = dated[0];
      const now = new Date(input.periodStart).getTime();
      return { unpaidObligationCount: dueObligations.length, nearestDueDate: nearest?.dueDate ?? null, nearestDueAmount: nearest ? Math.max(0, moneyValue(nearest.amount)) : null, overdueCount: dueObligations.filter((obligation) => obligation.status === "overdue" || (obligation.dueDate !== null && new Date(obligation.dueDate).getTime() < now)).length };
    })(),
    mandatoryObligations: totalRemainingObligations,
    protectedAmounts,
    operatingBuffer,
    spendableCash: liquidCash - totalRemainingObligations - operatingBuffer,
    components,
    limitations,
  };
}

/**
 * Reconciles period movement in liquid wallets. Transfers are retained as an
 * informational component but never treated as ordinary spending.
 */
export function calculateMoneyFlowReconciliation(input: {
  transactions: Transaction[];
  wallets: Pick<FinancialMetricsWallet, "id" | "wallet_type" | "is_archived" | "space_id">[];
  spaceId?: string;
}): MoneyFlowReconciliation {
  const walletsById = new Map(input.wallets.filter((wallet) => !wallet.is_archived && (!input.spaceId || wallet.space_id === input.spaceId)).map((wallet) => [wallet.id, wallet]));
  const liquidWalletIds = new Set(Array.from(walletsById.values()).filter((wallet) => isLiquidWalletType(wallet.wallet_type)).map((wallet) => wallet.id));
  const result: MoneyFlowReconciliation = {
    genuineIncome: 0, ordinarySpending: 0, savingsAllocation: 0, goalContributions: 0,
    debtPrincipalPayments: 0, debtPrincipalInflow: 0, receivableOutflow: 0, receivableCollection: 0,
    investmentContribution: 0, investmentWithdrawal: 0, transferFees: 0, internalWalletMovement: 0,
    otherAssetMovement: 0, balanceAdjustments: 0, resultingLiquidityChange: 0,
    explainedLiquidityChange: 0, unreconciledAmount: 0,
  };

  for (const transaction of input.transactions) {
    if (transaction.status !== "completed" || (input.spaceId && transaction.space_id !== input.spaceId)) continue;
    const amount = moneyValue(transaction.amount);
    const fee = transactionFee(transaction);
    const sourceIsLiquid = transaction.wallet_id ? liquidWalletIds.has(transaction.wallet_id) : false;
    const destinationIsLiquid = transaction.destination_wallet_id ? liquidWalletIds.has(transaction.destination_wallet_id) : false;
    const destination = transaction.destination_wallet_id ? walletsById.get(transaction.destination_wallet_id) : undefined;

    if (transaction.wallet_id && sourceIsLiquid) result.resultingLiquidityChange += walletMovementForTransaction(transaction, transaction.wallet_id).netMovement;
    if (transaction.destination_wallet_id && destinationIsLiquid) result.resultingLiquidityChange += walletMovementForTransaction(transaction, transaction.destination_wallet_id).netMovement;

    if (transaction.type === "income" && sourceIsLiquid && isEconomicIncomeOrExpense(transaction)) result.genuineIncome += amount;
    if (transaction.type === "expense" && sourceIsLiquid && isEconomicIncomeOrExpense(transaction)) result.ordinarySpending += amount;
    if (sourceIsLiquid) result.transferFees += fee;

    if (transaction.type === "adjustment" && sourceIsLiquid) {
      if (transaction.related_entity_type === "debt_payment") result.debtPrincipalPayments += Math.max(-amount, 0);
      else if (transaction.related_entity_type === "debt_creation") result.debtPrincipalInflow += Math.max(amount, 0);
      else if (transaction.related_entity_type === "receivable_creation") result.receivableOutflow += Math.max(-amount, 0);
      else if (transaction.related_entity_type === "receivable_payment") result.receivableCollection += Math.max(amount, 0);
      else result.balanceAdjustments += amount;
    }

    if (transaction.type === "transfer") {
      result.internalWalletMovement += amount;
      if (sourceIsLiquid && transaction.related_entity_type === "goal_contribution") result.goalContributions += amount;
      else if (sourceIsLiquid && destination?.wallet_type === "savings") result.savingsAllocation += amount;
      else if (sourceIsLiquid && destination?.wallet_type === "investment") result.investmentContribution += amount;
      else if (!sourceIsLiquid && destinationIsLiquid && walletsById.get(transaction.wallet_id ?? "")?.wallet_type === "investment") result.investmentWithdrawal += amount;
      else if (sourceIsLiquid && !destinationIsLiquid) result.otherAssetMovement -= amount;
      else if (!sourceIsLiquid && destinationIsLiquid) result.otherAssetMovement += amount;
    }
  }

  result.explainedLiquidityChange = result.genuineIncome - result.ordinarySpending - result.savingsAllocation - result.goalContributions - result.debtPrincipalPayments + result.debtPrincipalInflow - result.receivableOutflow + result.receivableCollection - result.investmentContribution + result.investmentWithdrawal - result.transferFees + result.otherAssetMovement + result.balanceAdjustments;
  result.unreconciledAmount = result.resultingLiquidityChange - result.explainedLiquidityChange;
  return result;
}
