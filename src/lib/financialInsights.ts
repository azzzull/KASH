import type { FinancialMetrics, MoneyFlowReconciliation, SpendableCashBreakdown } from "./financialMetrics";
import type { BudgetTargetType } from "../types/domain";

export type FinancialInsightType =
  | "POSITIVE_CASH_FLOW" | "SURPLUS_MOVED_ELSEWHERE" | "PRIMARY_WALLET_LOW"
  | "LOW_SPENDABLE_CASH" | "HIGH_INTERNAL_TRANSFER_ACTIVITY" | "HIGH_UNBUDGETED_SPENDING"
  | "BUDGET_CATEGORY_OVERSPEND" | "SAVINGS_AHEAD_OF_TARGET" | "SAVINGS_BEHIND_TARGET"
  | "GOAL_AHEAD_OF_TARGET" | "GOAL_BEHIND_TARGET" | "DEBT_PAYMENT_AHEAD"
  | "RECEIVABLE_LOCKING_CASH" | "SPENDING_SPIKE" | "BUDGET_REALLOCATION_OPPORTUNITY";

export type FinancialInsight = {
  id: string;
  type: FinancialInsightType;
  severity: "positive" | "info" | "warning" | "critical";
  priority: number;
  confidence: number;
  evidence: Record<string, number | string | boolean | null>;
  relatedEntityIds?: string[];
  recommendedAction?: { type: string; targetId?: string };
};

export type InsightTargetProgress = {
  id: string;
  kind: "savings" | "goal" | "debt";
  plannedAmount: number;
  actualAmount: number;
  spaceId?: string;
};

export type InsightBudgetProgress = {
  id: string;
  targetType: BudgetTargetType;
  name: string;
  coveredCategoryIds: string[];
  coveredEnvelopeId: string | null;
  effectiveBudget: number;
  spent: number;
  remaining: number;
  spaceId?: string;
};

export type InsightSpendingRecord = {
  amount: number;
  categoryId: string | null;
  categoryName: string;
  envelopeId: string | null;
};

export type UnbudgetedSpendingEvidence = {
  amount: number;
  totalOrdinarySpending: number;
  topCategoryName: string | null;
  topCategoryAmount: number;
  transactionCount: number;
};

export type FinancialInsightInput = {
  metrics: FinancialMetrics;
  spendableCash?: SpendableCashBreakdown;
  moneyFlow?: MoneyFlowReconciliation;
  primaryWallet?: { id: string; currentBalance: number; spaceId?: string };
  unbudgetedSpending?: UnbudgetedSpendingEvidence;
  budgets?: InsightBudgetProgress[];
  targets?: InsightTargetProgress[];
  receivableOutstanding?: number;
  historicalAverageSpending?: number;
  spaceId?: string;
  metricsSpaceId?: string;
};

const severityWeight = { positive: 100, info: 130, warning: 220, critical: 320 } as const;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function createInsight(
  type: FinancialInsightType,
  severity: FinancialInsight["severity"],
  impactRatio: number,
  evidence: FinancialInsight["evidence"],
  options: Omit<FinancialInsight, "id" | "type" | "severity" | "priority" | "confidence" | "evidence"> & { confidence?: number } = {},
): FinancialInsight {
  const confidence = options.confidence ?? 1;
  // A small, reusable score: severity dominates; impact, actionability, and
  // confidence provide deterministic tie-breaking without model-like tuning.
  const priority = Math.round(severityWeight[severity] + clamp(impactRatio) * 80 + 30 + confidence * 20);
  return { id: type.toLowerCase(), type, severity, priority, confidence, evidence, relatedEntityIds: options.relatedEntityIds, recommendedAction: options.recommendedAction };
}

function scoped<T extends { spaceId?: string }>(items: T[] | undefined, spaceId?: string) {
  return (items ?? []).filter((item) => !spaceId || item.spaceId === undefined || item.spaceId === spaceId);
}

/**
 * Deterministic coverage evidence for the insight engine. A spending record is
 * covered when its category or envelope is represented by the canonical
 * monthly-budget progress result.
 */
export function summarizeUnbudgetedSpending(
  spending: InsightSpendingRecord[],
  budgets: InsightBudgetProgress[],
): UnbudgetedSpendingEvidence {
  const coveredCategoryIds = new Set<string>();
  const coveredEnvelopeIds = new Set<string>();
  for (const budget of budgets) {
    for (const categoryId of budget.coveredCategoryIds) coveredCategoryIds.add(categoryId);
    if (budget.coveredEnvelopeId) coveredEnvelopeIds.add(budget.coveredEnvelopeId);
  }

  const uncovered = spending.filter((item) =>
    (item.categoryId === null || !coveredCategoryIds.has(item.categoryId))
    && (item.envelopeId === null || !coveredEnvelopeIds.has(item.envelopeId))
  );
  const grouped = new Map<string, number>();
  for (const item of uncovered) grouped.set(item.categoryName, (grouped.get(item.categoryName) ?? 0) + item.amount);
  const [topCategoryName, topCategoryAmount] = [...grouped.entries()].sort((first, second) => second[1] - first[1])[0] ?? [null, 0];
  const amount = uncovered.reduce((sum, item) => sum + item.amount, 0);
  return {
    amount,
    totalOrdinarySpending: spending.reduce((sum, item) => sum + item.amount, 0),
    topCategoryName,
    topCategoryAmount,
    transactionCount: uncovered.length,
  };
}

export function rankFinancialInsights(insights: FinancialInsight[], limit?: number) {
  const ranked = [...insights].sort((a, b) => b.priority - a.priority || a.type.localeCompare(b.type));
  return limit === undefined ? ranked : ranked.slice(0, limit);
}

export function deduplicateFinancialInsights(insights: FinancialInsight[]) {
  const lowSpendable = insights.find((insight) => insight.type === "LOW_SPENDABLE_CASH");
  return insights.filter((insight) => !(lowSpendable && insight.type === "PRIMARY_WALLET_LOW"));
}

export function detectFinancialInsights(input: FinancialInsightInput, limit?: number): FinancialInsight[] {
  if (input.spaceId && input.metricsSpaceId && input.spaceId !== input.metricsSpaceId) return [];
  const insights: FinancialInsight[] = [];
  const { metrics } = input;
  const spendingBase = Math.max(metrics.expensePrincipal, 1);

  if (metrics.netCashFlow > 0) {
    insights.push(createInsight("POSITIVE_CASH_FLOW", "positive", metrics.netCashFlow / Math.max(metrics.income, 1), {
      income: metrics.income, totalExpense: metrics.totalExpense, netCashFlow: metrics.netCashFlow,
    }));
  }

  if (input.moneyFlow && metrics.netCashFlow > 0) {
    const movedElsewhere = input.moneyFlow.savingsAllocation + input.moneyFlow.goalContributions + input.moneyFlow.investmentContribution + Math.max(0, -input.moneyFlow.otherAssetMovement);
    if (movedElsewhere >= metrics.netCashFlow * 0.3) insights.push(createInsight("SURPLUS_MOVED_ELSEWHERE", "info", movedElsewhere / metrics.netCashFlow, {
      netCashFlow: metrics.netCashFlow, movedElsewhere, savingsAllocation: input.moneyFlow.savingsAllocation, goalContributions: input.moneyFlow.goalContributions, investmentContribution: input.moneyFlow.investmentContribution,
    }));
  }

  if (input.spendableCash) {
    const { spendableCash, mandatoryObligations, liquidCash } = input.spendableCash;
    if (spendableCash < 0 || (mandatoryObligations > 0 && spendableCash < mandatoryObligations * 0.25)) insights.push(createInsight("LOW_SPENDABLE_CASH", spendableCash < 0 ? "critical" : "warning", mandatoryObligations > 0 ? 1 - clamp(spendableCash / mandatoryObligations) : 1, {
      spendableCash, mandatoryObligations, liquidCash,
    }, { recommendedAction: { type: "review_upcoming_obligations" } }));
    else if (input.primaryWallet && input.primaryWallet.currentBalance < mandatoryObligations) insights.push(createInsight("PRIMARY_WALLET_LOW", "warning", mandatoryObligations > 0 ? 1 - clamp(input.primaryWallet.currentBalance / mandatoryObligations) : 0, {
      primaryWalletBalance: input.primaryWallet.currentBalance, mandatoryObligations, spendableCash,
    }, { relatedEntityIds: [input.primaryWallet.id], recommendedAction: { type: "fund_primary_wallet", targetId: input.primaryWallet.id } }));
  }

  if (metrics.internalTransfers > Math.max(metrics.income, metrics.expensePrincipal) * 0.5 && metrics.internalTransfers > 0) insights.push(createInsight("HIGH_INTERNAL_TRANSFER_ACTIVITY", "info", metrics.internalTransfers / Math.max(metrics.income, metrics.expensePrincipal, 1), {
    internalTransfers: metrics.internalTransfers, income: metrics.income, ordinarySpending: metrics.expensePrincipal,
  }));

  if (input.unbudgetedSpending && input.unbudgetedSpending.totalOrdinarySpending > 0) {
    const ratio = input.unbudgetedSpending.amount / input.unbudgetedSpending.totalOrdinarySpending;
    if (ratio >= 0.25) insights.push(createInsight("HIGH_UNBUDGETED_SPENDING", "warning", ratio, {
      unbudgetedSpending: input.unbudgetedSpending.amount, totalOrdinarySpending: input.unbudgetedSpending.totalOrdinarySpending, unbudgetedRatio: ratio,
      topCategoryName: input.unbudgetedSpending.topCategoryName, topCategoryAmount: input.unbudgetedSpending.topCategoryAmount, transactionCount: input.unbudgetedSpending.transactionCount,
    }, { recommendedAction: { type: "review_budget_coverage" } }));
  }

  for (const budget of scoped(input.budgets, input.spaceId)) {
    if ((budget.targetType === "category" || budget.targetType === "envelope") && budget.effectiveBudget > 0 && budget.spent > budget.effectiveBudget) insights.push(createInsight("BUDGET_CATEGORY_OVERSPEND", "warning", (budget.spent - budget.effectiveBudget) / budget.effectiveBudget, {
      budgetName: budget.name, spent: budget.spent, effectiveBudget: budget.effectiveBudget, overBy: budget.spent - budget.effectiveBudget,
      usagePercent: Math.round((budget.spent / budget.effectiveBudget) * 100),
    }, { relatedEntityIds: [budget.id], recommendedAction: { type: "review_budget", targetId: budget.id } }));
  }

  // A low-use spending budget can fund a category that is already at risk of
  // exceeding its limit. This is a next-period planning suggestion only: it
  // does not move money or rewrite the current budget.
  const spendingBudgets = scoped(input.budgets, input.spaceId)
    .filter((budget) => budget.effectiveBudget > 0 && (budget.targetType === "category" || budget.targetType === "envelope"));
  const budgetNeedingMore = [...spendingBudgets]
    .filter((budget) => budget.spent / budget.effectiveBudget >= 0.9)
    .sort((first, second) => second.spent / second.effectiveBudget - first.spent / first.effectiveBudget)[0];
  const budgetWithCapacity = [...spendingBudgets]
    .filter((budget) => budget.id !== budgetNeedingMore?.id && budget.spent / budget.effectiveBudget <= 0.5 && budget.remaining > 0)
    .sort((first, second) => second.remaining - first.remaining)[0];
  if (budgetNeedingMore && budgetWithCapacity) {
    insights.push(createInsight("BUDGET_REALLOCATION_OPPORTUNITY", "info", budgetWithCapacity.remaining / budgetWithCapacity.effectiveBudget, {
      sourceBudgetName: budgetWithCapacity.name,
      destinationBudgetName: budgetNeedingMore.name,
      sourceBudgetRemaining: budgetWithCapacity.remaining,
      destinationBudgetUsagePercent: Math.round((budgetNeedingMore.spent / budgetNeedingMore.effectiveBudget) * 100),
    }, { relatedEntityIds: [budgetWithCapacity.id, budgetNeedingMore.id], recommendedAction: { type: "rebalance_next_budget", targetId: budgetNeedingMore.id } }));
  }

  for (const target of scoped(input.targets, input.spaceId)) {
    if (target.plannedAmount <= 0) continue;
    const ratio = target.actualAmount / target.plannedAmount;
    const type = target.kind === "savings" ? (ratio >= 1 ? "SAVINGS_AHEAD_OF_TARGET" : "SAVINGS_BEHIND_TARGET") : target.kind === "goal" ? (ratio >= 1 ? "GOAL_AHEAD_OF_TARGET" : "GOAL_BEHIND_TARGET") : "DEBT_PAYMENT_AHEAD";
    if (target.kind === "debt" && ratio < 1) continue;
    insights.push(createInsight(type, ratio >= 1 ? "positive" : "info", Math.abs(ratio - 1), {
      plannedAmount: target.plannedAmount, actualAmount: target.actualAmount, progressRatio: ratio,
    }, { relatedEntityIds: [target.id], recommendedAction: { type: "view_target", targetId: target.id } }));
  }

  if (input.receivableOutstanding !== undefined && input.spendableCash && input.receivableOutstanding > input.spendableCash.liquidCash * 0.5) insights.push(createInsight("RECEIVABLE_LOCKING_CASH", "info", input.receivableOutstanding / Math.max(input.spendableCash.liquidCash, 1), {
    receivableOutstanding: input.receivableOutstanding, liquidCash: input.spendableCash.liquidCash, receivableToLiquidRatio: input.receivableOutstanding / Math.max(input.spendableCash.liquidCash, 1),
  }, { recommendedAction: { type: "review_receivables" } }));

  if (input.historicalAverageSpending !== undefined && input.historicalAverageSpending > 0 && metrics.expensePrincipal > input.historicalAverageSpending * 1.25) insights.push(createInsight("SPENDING_SPIKE", "warning", (metrics.expensePrincipal - input.historicalAverageSpending) / input.historicalAverageSpending, {
    currentSpending: metrics.expensePrincipal, historicalAverage: input.historicalAverageSpending, differencePercent: (metrics.expensePrincipal - input.historicalAverageSpending) / input.historicalAverageSpending,
  }, { recommendedAction: { type: "review_spending" } }));

  return rankFinancialInsights(deduplicateFinancialInsights(insights), limit);
}
