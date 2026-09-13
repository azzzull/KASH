import type { FinancialMetrics, MoneyFlowReconciliation, SpendableCashBreakdown } from "./financialMetrics";

export type FinancialInsightType =
  | "POSITIVE_CASH_FLOW" | "SURPLUS_MOVED_ELSEWHERE" | "PRIMARY_WALLET_LOW"
  | "LOW_SPENDABLE_CASH" | "HIGH_INTERNAL_TRANSFER_ACTIVITY" | "HIGH_UNBUDGETED_SPENDING"
  | "BUDGET_CATEGORY_OVERSPEND" | "SAVINGS_AHEAD_OF_TARGET" | "SAVINGS_BEHIND_TARGET"
  | "GOAL_AHEAD_OF_TARGET" | "GOAL_BEHIND_TARGET" | "DEBT_PAYMENT_AHEAD"
  | "RECEIVABLE_LOCKING_CASH" | "SPENDING_SPIKE";

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
  targetType: "category" | "envelope";
  effectiveBudget: number;
  spent: number;
  spaceId?: string;
};

export type FinancialInsightInput = {
  metrics: FinancialMetrics;
  spendableCash?: SpendableCashBreakdown;
  moneyFlow?: MoneyFlowReconciliation;
  primaryWallet?: { id: string; currentBalance: number; spaceId?: string };
  unbudgetedSpending?: { amount: number; totalOrdinarySpending: number };
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
    }, { recommendedAction: { type: "review_budget_coverage" } }));
  }

  for (const budget of scoped(input.budgets, input.spaceId)) {
    if (budget.effectiveBudget > 0 && budget.spent > budget.effectiveBudget) insights.push(createInsight("BUDGET_CATEGORY_OVERSPEND", "warning", (budget.spent - budget.effectiveBudget) / budget.effectiveBudget, {
      spent: budget.spent, effectiveBudget: budget.effectiveBudget, overBy: budget.spent - budget.effectiveBudget,
    }, { relatedEntityIds: [budget.id], recommendedAction: { type: "review_budget", targetId: budget.id } }));
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
