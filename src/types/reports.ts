import type { Category, FinancialSpace, TransactionStatus, TransactionType, Wallet } from "./domain";
import type { TransactionWithMeta } from "../lib/transactions";

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
};

export type FinancialHealthReportData = {
  position?: { beginningNetWorth: number; endingNetWorth: number; change: number; changePercent: number | null; investmentValuationLimited: boolean };
  budgets: Array<{ id: string; name: string; periodStart: string; budgeted: number; spent: number; remaining: number; utilizationPercent: number; status: "on_track" | "near_limit" | "over_budget" }>;
  goals: Array<{ id: string; name: string; target: number; progress: number; progressPercent: number; remaining: number; contributedDuringPeriod: number; progressAtPeriodEnd: boolean }>;
  receivables: { outstanding: number; collectedDuringPeriod: number };
  debts: { outstanding: number; paidDuringPeriod: number };
};
