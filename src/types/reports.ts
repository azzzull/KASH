import type { Category, FinancialSpace, TransactionStatus, TransactionType, Wallet } from "./domain";
import type { TransactionWithMeta } from "../lib/transactions";
import type { BudgetPerformance, BudgetPerformanceKind } from "../lib/budgetPerformance";

export type ReportPeriodPreset = "this_month" | "last_month" | "specific_month" | "this_year" | "custom_range";

export type ReportPeriod = {
  label: string;
  start: string;
  end: string;
  preset: ReportPeriodPreset;
  month?: number;
  year?: number;
};

export type ReportTransactionTypeFilter = "all" | TransactionType | "external_transfer";

export type TransactionRecapFilters = {
  type: ReportTransactionTypeFilter;
  walletId: string;
  categoryId: string;
  status: "all" | TransactionStatus;
};

export type TransactionRecapSummary = {
  income: number;
  expensePrincipal: number;
  adminFees: number;
  totalExpense: number;
  netCashFlow: number;
  transactionCount: number;
};

export type ReportCategoryBreakdown = {
  categoryId: string | null;
  categoryName: string;
  amount: number;
  transactionCount: number;
  percentage: number;
};

export type ReportSpendingBreakdown = {
  groupType: "category" | "envelope";
  groupId: string;
  groupName: string;
  amount: number;
  transactionCount: number;
  percentage: number;
};

export type ReportWalletBreakdown = {
  wallet: Wallet;
  cashIn: number;
  cashOut: number;
  netMovement: number;
  transactionCount: number;
};

export type TransactionRecapData = {
  space: FinancialSpace;
  period: ReportPeriod;
  filters: TransactionRecapFilters;
  summary: TransactionRecapSummary;
  transactions: TransactionWithMeta[];
  categoryBreakdown: ReportCategoryBreakdown[];
  spendingBreakdown: ReportSpendingBreakdown[];
  walletBreakdown: ReportWalletBreakdown[];
  wallets: Wallet[];
  categories: Category[];
};

export type FinancialReportData = {
  space: FinancialSpace;
  period: ReportPeriod;
  transactionRecap: TransactionRecapData;
  currentBalance: number;
  financialHealth?: FinancialHealthReportData;
  budgetVsActual?: BudgetVsActualReportData;
  incomeBreakdown?: ReportCategoryBreakdown[];
  unbudgetedSpending?: ReportCategoryBreakdown[];
  budgetCoverage?: { budgeted: number; unbudgeted: number; percentage: number };
  financialAllocation?: { savings: number; goals: number; debt: number; total: number };
  planningInsights?: PlanningInsight[];
};

export type PlanningInsight = { type: "outside_budget" | "over_budget" | "target_shortfall" | "target_ahead" | "coverage"; priority: number; title: string; message: string; suggestedAction: string };

export type BudgetVsActualItem = BudgetPerformance & { id: string; name: string; kind: BudgetPerformanceKind; periodStart: string };
export type BudgetVsActualReportData = { spending: BudgetVsActualItem[]; targets: BudgetVsActualItem[] };

export type FinancialHealthReportData = {
  position?: { beginningNetWorth: number; endingNetWorth: number; change: number; changePercent: number | null; investmentValuationLimited: boolean };
  budgets: Array<{ id: string; name: string; periodStart: string; budgeted: number; spent: number; remaining: number; utilizationPercent: number; status: "on_track" | "near_limit" | "over_budget"; targetType: "category" | "envelope" | "debt" | "goal"; goalId: string | null; categoryId: string | null; envelopeId: string | null }>;
  goals: Array<{ id: string; name: string; target: number; progress: number; progressPercent: number; remaining: number; contributedDuringPeriod: number; progressAtPeriodEnd: boolean }>;
  receivables: { outstanding: number; collectedDuringPeriod: number };
  debts: { outstanding: number; paidDuringPeriod: number };
};
