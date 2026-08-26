import { createCategoryColorResolver } from "./chartColors";
import { toNumber } from "./money";
import { getActiveSpaceId } from "./spaces";
import { supabase } from "./supabase";
import { getWalletTypeOption, isLiquidWallet } from "./walletMeta";
import type { Category, Transaction, Wallet, WalletBalance } from "../types/domain";

export type AnalyticsPeriodKey = "this_month" | "last_month" | "3_months" | "6_months" | "this_year" | "custom";
export type AnalyticsAggregation = "daily" | "monthly";

export type AnalyticsMetricChange = {
  current: number;
  percent: number | null;
  previous: number;
  state: "increase" | "decrease" | "flat" | "new" | "none";
};

export type AnalyticsPeriod = {
  aggregation: AnalyticsAggregation;
  comparisonLabel: string;
  end: string;
  key: AnalyticsPeriodKey;
  label: string;
  previousEnd: string;
  previousStart: string;
  start: string;
};

export type AnalyticsMetric = {
  amount: number;
  change: AnalyticsMetricChange;
};

export type AnalyticsTrendPoint = {
  end: string;
  expense: number;
  income: number;
  key: string;
  label: string;
  start: string;
};

export type AnalyticsCategorySpend = {
  amount: number;
  change: AnalyticsMetricChange;
  color: string;
  id: string;
  name: string;
  percent: number;
};

export type AnalyticsWalletDistribution = {
  amount: number;
  color: string;
  id: string;
  label: string;
  percent: number;
};

export type AnalyticsNetWorthPoint = {
  amount: number;
  key: string;
  label: string;
};

export type AnalyticsSummary = {
  categorySpending: AnalyticsCategorySpend[];
  expense: AnalyticsMetric;
  income: AnalyticsMetric;
  incomeExpenseTrend: AnalyticsTrendPoint[];
  netCashFlow: AnalyticsMetric;
  netWorthTrend: AnalyticsNetWorthPoint[];
  period: AnalyticsPeriod;
  transferFees: number;
  transferFeesChange: AnalyticsMetricChange;
  walletDistribution: AnalyticsWalletDistribution[];
  walletNetWorth: number;
  walletNetWorthChange: AnalyticsMetricChange;
};

export type AnalyticsSummaryOptions = {
  customEndDate?: string;
  customStartDate?: string;
  period: AnalyticsPeriodKey;
  referenceDate?: Date;
};

type WalletWithBalance = Wallet & {
  balance: WalletBalance | null;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getAuthenticatedUserId() {
  return supabase.auth.getUser().then(({ data, error }) => {
    if (error) throw error;
    if (!data.user) throw new Error("You need to be signed in to view analytics.");
    return data.user.id;
  });
}

function startOfLocalMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(value: Date) {
  return new Intl.DateTimeFormat("id-ID", { month: "short" }).format(value);
}

function formatPeriodLabel(start: Date, endExclusive: Date) {
  const endInclusive = new Date(endExclusive.getTime() - ONE_DAY_MS);
  const sameMonth = start.getFullYear() === endInclusive.getFullYear() && start.getMonth() === endInclusive.getMonth();

  if (sameMonth) {
    return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(start);
  }

  return `${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(start)} - ${new Intl.DateTimeFormat(
    "id-ID",
    { day: "numeric", month: "short", year: "numeric" },
  ).format(endInclusive)}`;
}

function dayCount(start: Date, endExclusive: Date) {
  return Math.max(1, Math.round((endExclusive.getTime() - start.getTime()) / ONE_DAY_MS));
}

function resolvePeriod(options: AnalyticsSummaryOptions): AnalyticsPeriod {
  const now = options.referenceDate ?? new Date();
  let key = options.period;
  let start: Date;
  let end: Date;
  let comparisonLabel = "vs previous period";

  if (key === "custom") {
    if (!options.customStartDate || !options.customEndDate) {
      throw new Error("Choose both start and end dates for a custom range.");
    }

    start = parseLocalDate(options.customStartDate);
    end = new Date(parseLocalDate(options.customEndDate).getTime() + ONE_DAY_MS);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      throw new Error("Custom range must have a start date before or equal to the end date.");
    }
  } else if (key === "last_month") {
    start = addMonths(startOfLocalMonth(now), -1);
    end = startOfLocalMonth(now);
    comparisonLabel = "vs month before";
  } else if (key === "3_months") {
    end = addMonths(startOfLocalMonth(now), 1);
    start = addMonths(end, -3);
    comparisonLabel = "vs previous 3 months";
  } else if (key === "6_months") {
    end = addMonths(startOfLocalMonth(now), 1);
    start = addMonths(end, -6);
    comparisonLabel = "vs previous 6 months";
  } else if (key === "this_year") {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear() + 1, 0, 1);
    comparisonLabel = "vs last year";
  } else {
    key = "this_month";
    start = startOfLocalMonth(now);
    end = addMonths(start, 1);
    comparisonLabel = "vs last month";
  }

  let previousStart: Date;
  let previousEnd: Date;

  if (key === "this_month" || key === "last_month" || key === "3_months" || key === "6_months") {
    const monthSpan = key === "3_months" ? 3 : key === "6_months" ? 6 : 1;
    previousEnd = start;
    previousStart = addMonths(start, -monthSpan);
  } else if (key === "this_year") {
    previousStart = new Date(start.getFullYear() - 1, 0, 1);
    previousEnd = new Date(start.getFullYear(), 0, 1);
  } else {
    const duration = end.getTime() - start.getTime();
    previousEnd = start;
    previousStart = new Date(start.getTime() - duration);
  }

  const days = dayCount(start, end);

  return {
    aggregation: days <= 45 ? "daily" : "monthly",
    comparisonLabel,
    end: end.toISOString(),
    key,
    label: formatPeriodLabel(start, end),
    previousEnd: previousEnd.toISOString(),
    previousStart: previousStart.toISOString(),
    start: start.toISOString(),
  };
}

function moneyValue(value: unknown) {
  return toNumber(typeof value === "string" || typeof value === "number" || value == null ? value : 0);
}

function calculateCashFlowMetrics(transactions: Transaction[]) {
  const completed = transactions.filter((transaction) => transaction.status === "completed");
  const income = completed.reduce((sum, transaction) => (transaction.type === "income" ? sum + moneyValue(transaction.amount) : sum), 0);
  const expensePrincipal = completed.reduce((sum, transaction) => (transaction.type === "expense" ? sum + moneyValue(transaction.amount) : sum), 0);
  const transferFees = completed.reduce((sum, transaction) => (transaction.type === "transfer" ? sum + moneyValue(transaction.transfer_fee) : sum), 0);
  const expense = expensePrincipal + transferFees;

  return {
    expense,
    expensePrincipal,
    income,
    netCashFlow: income - expense,
    transferFees,
  };
}

function calculateMetricChange(current: number, previous: number): AnalyticsMetricChange {
  if (previous > 0) {
    const percent = ((current - previous) / previous) * 100;
    return {
      current,
      percent,
      previous,
      state: percent > 0 ? "increase" : percent < 0 ? "decrease" : "flat",
    };
  }

  if (current > 0) {
    return { current, percent: null, previous, state: "new" };
  }

  return { current, percent: null, previous, state: "none" };
}

function periodBucketRanges(period: AnalyticsPeriod) {
  const start = new Date(period.start);
  const end = new Date(period.end);

  if (period.aggregation === "daily") {
    return Array.from({ length: dayCount(start, end) }, (_, index) => {
      const bucketStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const bucketEnd = new Date(bucketStart.getFullYear(), bucketStart.getMonth(), bucketStart.getDate() + 1);

      return {
        end: bucketEnd,
        key: formatLocalDate(bucketStart),
        label: String(bucketStart.getDate()),
        start: bucketStart,
      };
    });
  }

  const ranges = [];
  let cursor = startOfLocalMonth(start);

  while (cursor < end) {
    const bucketStart = cursor < start ? start : cursor;
    const nextMonth = addMonths(cursor, 1);
    const bucketEnd = nextMonth > end ? end : nextMonth;
    ranges.push({
      end: bucketEnd,
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      label: formatMonthLabel(cursor),
      start: bucketStart,
    });
    cursor = nextMonth;
  }

  return ranges;
}

function transactionInRange(transaction: Transaction, start: Date, end: Date) {
  const time = new Date(transaction.transaction_date).getTime();
  return time >= start.getTime() && time < end.getTime();
}

function buildIncomeExpenseTrend(period: AnalyticsPeriod, transactions: Transaction[]): AnalyticsTrendPoint[] {
  return periodBucketRanges(period).map((bucket) => {
    const metrics = calculateCashFlowMetrics(transactions.filter((transaction) => transactionInRange(transaction, bucket.start, bucket.end)));

    return {
      end: bucket.end.toISOString(),
      expense: metrics.expense,
      income: metrics.income,
      key: bucket.key,
      label: bucket.label,
      start: bucket.start.toISOString(),
    };
  });
}

function buildSpendingByCategory(transactions: Transaction[], categories: Category[], previousTransactions: Transaction[] = []): AnalyticsCategorySpend[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const resolveCategoryColor = createCategoryColorResolver(categories);
  const totals = new Map<string, { amount: number; color: string; name: string }>();
  const previousTotals = new Map<string, number>();

  transactions
    .filter((transaction) => transaction.status === "completed" && transaction.type === "expense")
    .forEach((transaction) => {
      const category = transaction.category_id ? categoryById.get(transaction.category_id) : null;
      const id = category?.id ?? "uncategorized";
      const previous = totals.get(id);

      totals.set(id, {
        amount: (previous?.amount ?? 0) + moneyValue(transaction.amount),
        color: previous?.color ?? resolveCategoryColor(category),
        name: category?.name ?? "Uncategorized",
      });
    });

  previousTransactions
    .filter((transaction) => transaction.status === "completed" && transaction.type === "expense")
    .forEach((transaction) => {
      const category = transaction.category_id ? categoryById.get(transaction.category_id) : null;
      const id = category?.id ?? "uncategorized";
      previousTotals.set(id, (previousTotals.get(id) ?? 0) + moneyValue(transaction.amount));
    });

  const totalAmount = Array.from(totals.values()).reduce((sum, item) => sum + item.amount, 0);

  return Array.from(totals.entries())
    .map(([id, item]) => ({
      amount: item.amount,
      change: calculateMetricChange(item.amount, previousTotals.get(id) ?? 0),
      color: item.color,
      id,
      name: item.name,
      percent: totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0,
    }))
    .sort((first, second) => second.amount - first.amount);
}

function walletCurrentBalance(wallet: WalletWithBalance) {
  return moneyValue(wallet.balance?.current_balance ?? wallet.initial_balance);
}

function walletDistributionGroup(wallet: Wallet) {
  if (isLiquidWallet(wallet.wallet_type)) return { color: "#10B981", id: "liquid", label: "Liquid (Cash + Bank + E-Wallet)" };
  if (wallet.wallet_type === "investment") return { color: "#8B5CF6", id: "investment", label: "Investments" };
  if (wallet.wallet_type === "savings") return { color: "#F5B82E", id: "savings", label: "Savings" };

  return { color: "#475569", id: wallet.wallet_type, label: getWalletTypeOption(wallet.wallet_type).label };
}

function buildWalletDistribution(wallets: WalletWithBalance[]): AnalyticsWalletDistribution[] {
  const totals = new Map<string, { amount: number; color: string; label: string }>();

  wallets
    .filter((wallet) => wallet.include_in_net_worth && !wallet.is_archived)
    .forEach((wallet) => {
      const group = walletDistributionGroup(wallet);
      const previous = totals.get(group.id);
      totals.set(group.id, {
        amount: (previous?.amount ?? 0) + walletCurrentBalance(wallet),
        color: group.color,
        label: group.label,
      });
    });

  const positiveTotal = Array.from(totals.values()).reduce((sum, item) => sum + Math.max(item.amount, 0), 0);

  return Array.from(totals.entries())
    .map(([id, item]) => ({
      amount: item.amount,
      color: item.color,
      id,
      label: item.label,
      percent: positiveTotal > 0 ? (Math.max(item.amount, 0) / positiveTotal) * 100 : 0,
    }))
    .sort((first, second) => second.amount - first.amount);
}

function walletInitialBalanceAt(wallet: Wallet, cutoffExclusive: Date) {
  const createdAt = new Date(wallet.created_at);
  return createdAt < cutoffExclusive ? moneyValue(wallet.initial_balance) : 0;
}

function transactionNetWorthEffect(transaction: Transaction, includedWalletIds: Set<string>) {
  if (transaction.status === "void") return 0;

  const sourceIncluded = includedWalletIds.has(transaction.wallet_id || "");
  const destinationIncluded = transaction.destination_wallet_id ? includedWalletIds.has(transaction.destination_wallet_id) : false;

  if (transaction.type === "income") return sourceIncluded ? moneyValue(transaction.amount) : 0;
  if (transaction.type === "expense") return sourceIncluded ? -moneyValue(transaction.amount) : 0;
  if (transaction.type === "adjustment") {
    if (
      transaction.related_entity_type === "debt_creation" ||
      transaction.related_entity_type === "receivable_creation" ||
      transaction.related_entity_type === "debt_payment" ||
      transaction.related_entity_type === "receivable_payment"
    ) {
      return 0; // Asset/Liability 1:1 exchange doesn't affect Net Worth
    }
    return sourceIncluded ? moneyValue(transaction.amount) : 0;
  }
  if (transaction.type === "transfer") {
    const outgoing = sourceIncluded ? -(moneyValue(transaction.amount) + moneyValue(transaction.transfer_fee)) : 0;
    const incoming = destinationIncluded ? moneyValue(transaction.amount) : 0;
    return outgoing + incoming;
  }

  return 0;
}

function netWorthAtCutoff(wallets: WalletWithBalance[], transactions: Transaction[], cutoffExclusive: Date) {
  const includedWallets = wallets.filter((wallet) => wallet.include_in_net_worth && !wallet.is_archived);
  const includedWalletIds = new Set(includedWallets.map((wallet) => wallet.id));
  const initialBalance = includedWallets.reduce((sum, wallet) => sum + walletInitialBalanceAt(wallet, cutoffExclusive), 0);
  const ledgerEffect = transactions
    .filter((transaction) => new Date(transaction.transaction_date) < cutoffExclusive)
    .reduce((sum, transaction) => sum + transactionNetWorthEffect(transaction, includedWalletIds), 0);

  return initialBalance + ledgerEffect;
}

function buildNetWorthTrend(period: AnalyticsPeriod, wallets: WalletWithBalance[], transactionsUntilEnd: Transaction[]): AnalyticsNetWorthPoint[] {
  return periodBucketRanges(period).map((bucket) => ({
    amount: netWorthAtCutoff(wallets, transactionsUntilEnd, bucket.end),
    key: bucket.key,
    label: bucket.label,
  }));
}

export function getEmptyAnalyticsSummary(options: AnalyticsSummaryOptions): AnalyticsSummary {
  const period = resolvePeriod(options);

  return {
    categorySpending: [],
    expense: {
      amount: 0,
      change: calculateMetricChange(0, 0),
    },
    income: {
      amount: 0,
      change: calculateMetricChange(0, 0),
    },
    incomeExpenseTrend: periodBucketRanges(period).map((bucket) => ({
      end: bucket.end.toISOString(),
      expense: 0,
      income: 0,
      key: bucket.key,
      label: bucket.label,
      start: bucket.start.toISOString(),
    })),
    netCashFlow: {
      amount: 0,
      change: calculateMetricChange(0, 0),
    },
    netWorthTrend: periodBucketRanges(period).map((bucket) => ({
      amount: 0,
      key: bucket.key,
      label: bucket.label,
    })),
    period,
    transferFees: 0,
    transferFeesChange: calculateMetricChange(0, 0),
    walletDistribution: [],
    walletNetWorth: 0,
    walletNetWorthChange: calculateMetricChange(0, 0),
  };
}

export async function getAnalyticsSummary(
  options: AnalyticsSummaryOptions,
  spaceId?: string
): Promise<AnalyticsSummary> {
  const userId = await getAuthenticatedUserId();
  const targetSpaceId = spaceId ?? getActiveSpaceId();
  const period = resolvePeriod(options);
  const currentStart = period.start;
  const currentEnd = period.end;

  let walletQuery = supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .order("created_at", { ascending: true });
  if (targetSpaceId) walletQuery = walletQuery.eq("space_id", targetSpaceId);

  let categoryQuery = supabase
    .from("categories")
    .select("*")
    .eq("is_archived", false)
    .order("category_type", { ascending: true })
    .order("name", { ascending: true });
  if (targetSpaceId) {
    categoryQuery = categoryQuery.or(`is_system.eq.true,space_id.eq.${targetSpaceId}`);
  } else {
    categoryQuery = categoryQuery.or(`is_system.eq.true,space_id.is.null`);
  }

  let currentTxnQuery = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("transaction_date", currentStart)
    .lt("transaction_date", currentEnd)
    .order("transaction_date", { ascending: true });
  if (targetSpaceId) currentTxnQuery = currentTxnQuery.eq("space_id", targetSpaceId);

  let prevTxnQuery = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("transaction_date", period.previousStart)
    .lt("transaction_date", period.previousEnd)
    .order("transaction_date", { ascending: true });
  if (targetSpaceId) prevTxnQuery = prevTxnQuery.eq("space_id", targetSpaceId);

  let histTxnQuery = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .lt("transaction_date", currentEnd)
    .order("transaction_date", { ascending: true });
  if (targetSpaceId) histTxnQuery = histTxnQuery.eq("space_id", targetSpaceId);

  const [walletResult, balanceResult, categoryResult, currentTransactionResult, previousTransactionResult, historicalTransactionResult] =
    await Promise.all([
      walletQuery,
      supabase.from("wallet_balance_view").select("*").eq("user_id", userId),
      categoryQuery,
      currentTxnQuery,
      prevTxnQuery,
      histTxnQuery,
    ]);

  if (walletResult.error) throw walletResult.error;
  if (balanceResult.error) throw balanceResult.error;
  if (categoryResult.error) throw categoryResult.error;
  if (currentTransactionResult.error) throw currentTransactionResult.error;
  if (previousTransactionResult.error) throw previousTransactionResult.error;
  if (historicalTransactionResult.error) throw historicalTransactionResult.error;

  const balancesByWalletId = new Map((balanceResult.data ?? []).map((balance) => [balance.wallet_id, balance]));
  const wallets = (walletResult.data ?? []).map((wallet) => ({
    ...wallet,
    balance: balancesByWalletId.get(wallet.id) ?? null,
  }));
  const categories = categoryResult.data ?? [];
  const currentTransactions = currentTransactionResult.data ?? [];
  const previousTransactions = previousTransactionResult.data ?? [];
  const historicalTransactions = historicalTransactionResult.data ?? [];
  const currentMetrics = calculateCashFlowMetrics(currentTransactions);
  const previousMetrics = calculateCashFlowMetrics(previousTransactions);
  const netWorthTrend = buildNetWorthTrend(period, wallets, historicalTransactions);
  const walletNetWorth = netWorthTrend.length > 0 ? netWorthTrend[netWorthTrend.length - 1].amount : 0;
  const previousWalletNetWorth = netWorthAtCutoff(wallets, historicalTransactions, new Date(period.previousEnd));

  return {
    categorySpending: buildSpendingByCategory(currentTransactions, categories, previousTransactions),
    income: {
      amount: currentMetrics.income,
      change: calculateMetricChange(currentMetrics.income, previousMetrics.income),
    },
    incomeExpenseTrend: buildIncomeExpenseTrend(period, currentTransactions),
    netCashFlow: {
      amount: currentMetrics.netCashFlow,
      change: calculateMetricChange(currentMetrics.netCashFlow, previousMetrics.netCashFlow),
    },
    netWorthTrend,
    period,
    transferFees: currentMetrics.transferFees,
    transferFeesChange: calculateMetricChange(currentMetrics.transferFees, previousMetrics.transferFees),
    walletDistribution: buildWalletDistribution(wallets),
    walletNetWorth,
    walletNetWorthChange: calculateMetricChange(walletNetWorth, previousWalletNetWorth),
    expense: {
      amount: currentMetrics.expense,
      change: calculateMetricChange(currentMetrics.expense, previousMetrics.expense),
    },
  };
}
