import assert from "node:assert/strict";
import { detectFinancialInsights, rankFinancialInsights } from "../src/lib/financialInsights.ts";
import type { FinancialMetrics, MoneyFlowReconciliation } from "../src/lib/financialMetrics.ts";

function metrics(overrides: Partial<FinancialMetrics> = {}): FinancialMetrics {
  return { income: 0, expensePrincipal: 0, transferFees: 0, expense: 0, totalExpense: 0, internalTransfers: 0, walletInflow: 0, walletOutflow: 0, walletNetMovement: 0, netCashFlow: 0, transactionCount: 0, ...overrides };
}

const spendable = (amount: number, obligations = 0) => ({ liquidCash: Math.max(amount, 0) + obligations, mandatoryObligations: obligations, protectedAmounts: 0, operatingBuffer: 0, spendableCash: amount, components: [], limitations: [] });
const moneyFlow = (overrides: Partial<MoneyFlowReconciliation> = {}): MoneyFlowReconciliation => ({ genuineIncome: 0, ordinarySpending: 0, savingsAllocation: 0, goalContributions: 0, debtPrincipalPayments: 0, debtPrincipalInflow: 0, receivableOutflow: 0, receivableCollection: 0, investmentContribution: 0, investmentWithdrawal: 0, transferFees: 0, internalWalletMovement: 0, otherAssetMovement: 0, balanceAdjustments: 0, resultingLiquidityChange: 0, explainedLiquidityChange: 0, unreconciledAmount: 0, ...overrides });
const types = (items: ReturnType<typeof detectFinancialInsights>) => items.map((item) => item.type);

// Healthy cash flow and allocations surface different evidence-backed insights.
let insights = detectFinancialInsights({ metrics: metrics({ income: 2000, expensePrincipal: 600, totalExpense: 600, netCashFlow: 1400 }), metricsSpaceId: "a", spaceId: "a" });
assert(types(insights).includes("POSITIVE_CASH_FLOW"));
insights = detectFinancialInsights({ metrics: metrics({ income: 2000, expensePrincipal: 600, totalExpense: 600, netCashFlow: 1400 }), moneyFlow: moneyFlow({ savingsAllocation: 500 }) });
assert(types(insights).includes("SURPLUS_MOVED_ELSEWHERE"));

// Low spendable cash takes precedence over the overlapping primary-wallet risk.
insights = detectFinancialInsights({ metrics: metrics(), spendableCash: spendable(-50, 200), primaryWallet: { id: "primary", currentBalance: 20 } });
assert.deepEqual(types(insights), ["LOW_SPENDABLE_CASH"]);

insights = detectFinancialInsights({ metrics: metrics({ income: 1000, expensePrincipal: 200, internalTransfers: 700 }) });
assert(types(insights).includes("HIGH_INTERNAL_TRANSFER_ACTIVITY"));
insights = detectFinancialInsights({ metrics: metrics(), unbudgetedSpending: { amount: 400, totalOrdinarySpending: 1000 }, budgets: [{ id: "food", targetType: "category", effectiveBudget: 300, spent: 400 }] });
assert(types(insights).includes("HIGH_UNBUDGETED_SPENDING") && types(insights).includes("BUDGET_CATEGORY_OVERSPEND"));

// Savings, goals, and debt use supplied authoritative target progress.
insights = detectFinancialInsights({ metrics: metrics(), targets: [
  { id: "save-ahead", kind: "savings", plannedAmount: 100, actualAmount: 120 },
  { id: "save-behind", kind: "savings", plannedAmount: 100, actualAmount: 40 },
  { id: "goal-ahead", kind: "goal", plannedAmount: 100, actualAmount: 110 },
  { id: "goal-behind", kind: "goal", plannedAmount: 100, actualAmount: 50 },
  { id: "debt-ahead", kind: "debt", plannedAmount: 100, actualAmount: 130 },
] });
for (const type of ["SAVINGS_AHEAD_OF_TARGET", "SAVINGS_BEHIND_TARGET", "GOAL_AHEAD_OF_TARGET", "GOAL_BEHIND_TARGET", "DEBT_PAYMENT_AHEAD"] as const) assert(types(insights).includes(type));

insights = detectFinancialInsights({ metrics: metrics({ expensePrincipal: 1500 }), spendableCash: spendable(100), receivableOutstanding: 600, historicalAverageSpending: 900 });
assert(types(insights).includes("RECEIVABLE_LOCKING_CASH") && types(insights).includes("SPENDING_SPIKE"));

// Different profiles and Spaces produce different, scoped sets.
const healthy = detectFinancialInsights({ metrics: metrics({ income: 1000, totalExpense: 400, netCashFlow: 600 }), metricsSpaceId: "a", spaceId: "a" });
const mismatchedSpace = detectFinancialInsights({ metrics: metrics({ income: 1000, totalExpense: 400, netCashFlow: 600 }), metricsSpaceId: "b", spaceId: "a" });
assert(healthy.length > 0 && mismatchedSpace.length === 0);
assert.deepEqual(types(detectFinancialInsights({ metrics: metrics(), budgets: [{ id: "other", targetType: "category", effectiveBudget: 10, spent: 50, spaceId: "b" }], spaceId: "a" })), []);

// Ranking is deterministic and callers can request the future dashboard limit.
const ranked = rankFinancialInsights([
  { id: "info", type: "HIGH_INTERNAL_TRANSFER_ACTIVITY", severity: "info", priority: 100, confidence: 1, evidence: {} },
  { id: "critical", type: "LOW_SPENDABLE_CASH", severity: "critical", priority: 350, confidence: 1, evidence: {} },
], 1);
assert.deepEqual(types(ranked), ["LOW_SPENDABLE_CASH"]);

console.log("financial insights: PASS");
