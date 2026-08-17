import { toNumber } from "./money";
import { supabase } from "./supabase";
import { getWalletTypeOption, isLiquidWallet } from "./walletMeta";
import { localDateKey } from "./calendar";
import { createCategoryColorResolver } from "./chartColors";
import type { Category, Transaction, TransactionType, Wallet, WalletBalance, WalletType } from "../types/domain";

const WALLET_TYPE_COLORS: Record<WalletType, string> = {
  bank: "#10B981",
  cash: "#475569",
  custom: "#475569",
  digital_bank: "#10B981",
  ewallet: "#4F7DF3",
  investment: "#8B5CF6",
  savings: "#F5B82E",
};

export type DashboardMetric = {
  amount: number;
};

export type DashboardMetricChange = {
  current: number;
  previous: number;
  percent: number | null;
  state: "increase" | "decrease" | "new" | "flat" | "none";
};

export type DashboardMonthlyComparison = {
  income: DashboardMetricChange;
  expense: DashboardMetricChange;
  netCashFlow: DashboardMetricChange;
};

export type DashboardCashflowPoint = {
  day: number;
  label: string;
  income: number;
  expense: number;
};

export type DashboardCategorySpend = {
  id: string;
  name: string;
  amount: number;
  percent: number;
  color: string;
};

export type DashboardWalletItem = {
  id: string;
  name: string;
  walletType: WalletType;
  walletTypeLabel: string;
  color: string;
  balance: number;
  includeInNetWorth: boolean;
};

export type DashboardWalletDistribution = {
  type: WalletType;
  label: string;
  amount: number;
  percent: number;
  color: string;
};

export type DashboardRecentTransaction = {
  categoryName: string;
  id: string;
  type: TransactionType;
  title: string;
  subtitle: string;
  amount: number;
  transferFee: number;
  date: string;
  walletName: string;
};

export type DashboardCalendarActivity = {
  dateKey: string;
  types: TransactionType[];
};

export type DashboardSummary = {
  period: {
    label: string;
    start: string;
    end: string;
    daysInMonth: number;
  };
  netWorth: DashboardMetric;
  availableBalance: DashboardMetric;
  monthlyIncome: DashboardMetric;
  monthlyExpense: DashboardMetric;
  netCashFlow: DashboardMetric;
  monthComparison: DashboardMonthlyComparison;
  transferFees: DashboardMetric;
  walletCount: number;
  cashflow: DashboardCashflowPoint[];
  spendingByCategory: DashboardCategorySpend[];
  walletDistribution: DashboardWalletDistribution[];
  wallets: DashboardWalletItem[];
  recentTransactions: DashboardRecentTransaction[];
  calendarActivity: DashboardCalendarActivity[];
};

export type DashboardSummaryOptions = {
  referenceDate?: Date;
};

type WalletWithBalance = Wallet & {
  balance: WalletBalance | null;
};

function currentMonthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  return {
    start,
    end,
    daysInMonth,
    label: new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(start),
  };
}

function previousMonthRange(now = new Date()) {
  return currentMonthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

async function getAuthenticatedUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("You need to be signed in to view the dashboard.");

  return user.id;
}

function moneyValue(value: unknown) {
  return toNumber(typeof value === "string" || typeof value === "number" || value == null ? value : 0);
}

function walletCurrentBalance(wallet: WalletWithBalance) {
  return moneyValue(wallet.balance?.current_balance ?? wallet.initial_balance);
}

function walletVisualColor(type: WalletType) {
  return WALLET_TYPE_COLORS[type];
}

function buildCashflow(daysInMonth: number, transactions: Transaction[]) {
  const daily = Array.from({ length: daysInMonth }, (_, index) => ({
    day: index + 1,
    label: String(index + 1),
    income: 0,
    expense: 0,
  }));

  transactions.forEach((transaction) => {
    const day = new Date(transaction.transaction_date).getDate();
    const bucket = daily[day - 1];
    if (!bucket) return;

    if (transaction.type === "income") {
      bucket.income += moneyValue(transaction.amount);
      return;
    }

    if (transaction.type === "expense") {
      bucket.expense += moneyValue(transaction.amount);
      return;
    }

    if (transaction.type === "transfer") {
      bucket.expense += moneyValue(transaction.transfer_fee);
    }
  });

  return daily;
}

function buildCalendarActivity(transactions: Transaction[]) {
  const grouped = new Map<string, Set<TransactionType>>();

  transactions.forEach((transaction) => {
    const key = localDateKey(transaction.transaction_date);
    const types = grouped.get(key) ?? new Set<TransactionType>();
    types.add(transaction.type);
    grouped.set(key, types);
  });

  return Array.from(grouped.entries())
    .map(([dateKey, types]) => ({ dateKey, types: Array.from(types) }))
    .sort((first, second) => first.dateKey.localeCompare(second.dateKey));
}

function buildSpendingByCategory(transactions: Transaction[], categories: Category[]) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const resolveCategoryColor = createCategoryColorResolver(categories);
  const totals = new Map<string, { name: string; amount: number; color: string }>();

  transactions
    .filter((transaction) => transaction.type === "expense")
    .forEach((transaction) => {
      const category = transaction.category_id ? categoryById.get(transaction.category_id) : null;
      const id = category?.id ?? "uncategorized";
      const previous = totals.get(id);

      totals.set(id, {
        name: category?.name ?? "Uncategorized",
        amount: (previous?.amount ?? 0) + moneyValue(transaction.amount),
        color: previous?.color ?? resolveCategoryColor(category),
      });
    });

  const totalAmount = Array.from(totals.values()).reduce((sum, item) => sum + item.amount, 0);

  return Array.from(totals.entries())
    .map(([id, item]) => ({
      id,
      name: item.name,
      amount: item.amount,
      percent: totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0,
      color: item.color,
    }))
    .sort((a, b) => b.amount - a.amount);
}

function calculateMonthlyMetrics(transactions: Transaction[]) {
  const income = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + moneyValue(transaction.amount), 0);
  const expensePrincipal = transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + moneyValue(transaction.amount), 0);
  const transferFees = transactions
    .filter((transaction) => transaction.type === "transfer")
    .reduce((sum, transaction) => sum + moneyValue(transaction.transfer_fee), 0);
  const expense = expensePrincipal + transferFees;

  return {
    income,
    expense,
    expensePrincipal,
    netCashFlow: income - expense,
    transferFees,
  };
}

function calculateMetricChange(current: number, previous: number): DashboardMetricChange {
  if (previous > 0) {
    const percent = ((current - previous) / previous) * 100;
    return {
      current,
      previous,
      percent,
      state: percent > 0 ? "increase" : percent < 0 ? "decrease" : "flat",
    };
  }

  if (current > 0) {
    return {
      current,
      previous,
      percent: null,
      state: "new",
    };
  }

  return {
    current,
    previous,
    percent: null,
    state: "none",
  };
}

function buildWalletDistribution(wallets: DashboardWalletItem[]) {
  const byType = new Map<WalletType, { amount: number; color: string }>();

  wallets.forEach((wallet) => {
    const previous = byType.get(wallet.walletType);
    byType.set(wallet.walletType, {
      amount: (previous?.amount ?? 0) + wallet.balance,
      color: previous?.color ?? walletVisualColor(wallet.walletType),
    });
  });

  const positiveTotal = Array.from(byType.values()).reduce((sum, item) => sum + Math.max(item.amount, 0), 0);

  return Array.from(byType.entries())
    .map(([type, item]) => ({
      type,
      label: getWalletTypeOption(type).label,
      amount: item.amount,
      percent: positiveTotal > 0 ? (Math.max(item.amount, 0) / positiveTotal) * 100 : 0,
      color: item.color,
    }))
    .sort((a, b) => b.amount - a.amount);
}

function describeTransaction(transaction: Transaction, walletsById: Map<string, Wallet>, categoriesById: Map<string, Category>) {
  const sourceWallet = walletsById.get(transaction.wallet_id);
  const destinationWallet = transaction.destination_wallet_id ? walletsById.get(transaction.destination_wallet_id) : null;
  const category = transaction.category_id ? categoriesById.get(transaction.category_id) : null;
  const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(
    new Date(transaction.transaction_date),
  );

  if (transaction.type === "transfer") {
    return {
      categoryName: "Transfer",
      title: transaction.title ?? `${sourceWallet?.name ?? "Wallet"} to ${destinationWallet?.name ?? "Wallet"}`,
      subtitle: `${date} - Transfer${moneyValue(transaction.transfer_fee) > 0 ? " with fee" : ""}`,
      walletName: sourceWallet && destinationWallet ? `${sourceWallet.name} -> ${destinationWallet.name}` : sourceWallet?.name ?? "Wallet",
    };
  }

  if (transaction.type === "adjustment") {
    return {
      categoryName: "Adjustment",
      title: transaction.title ?? "Balance adjustment",
      subtitle: `${date} - ${sourceWallet?.name ?? "Wallet"}`,
      walletName: sourceWallet?.name ?? "Wallet",
    };
  }

  return {
    categoryName: category?.name ?? (transaction.type === "income" ? "Income" : "Expense"),
    title: transaction.title ?? category?.name ?? (transaction.type === "income" ? "Income" : "Expense"),
    subtitle: `${date} - ${sourceWallet?.name ?? "Wallet"}`,
    walletName: sourceWallet?.name ?? "Wallet",
  };
}

export async function getDashboardSummary(options: DashboardSummaryOptions = {}): Promise<DashboardSummary> {
  const userId = await getAuthenticatedUserId();
  const month = currentMonthRange(options.referenceDate);
  const previousMonth = previousMonthRange(options.referenceDate);

  const [walletResult, balanceResult, categoryResult, monthTransactionResult, previousMonthTransactionResult, recentTransactionResult] = await Promise.all([
    supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("created_at", { ascending: true }),
    supabase.from("wallet_balance_view").select("*").eq("user_id", userId),
    supabase
      .from("categories")
      .select("*")
      .eq("is_archived", false)
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order("category_type", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("transaction_date", month.start.toISOString())
      .lt("transaction_date", month.end.toISOString())
      .order("transaction_date", { ascending: true }),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("transaction_date", previousMonth.start.toISOString())
      .lt("transaction_date", previousMonth.end.toISOString())
      .order("transaction_date", { ascending: true }),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("transaction_date", { ascending: false })
      .limit(12),
  ]);

  if (walletResult.error) throw walletResult.error;
  if (balanceResult.error) throw balanceResult.error;
  if (categoryResult.error) throw categoryResult.error;
  if (monthTransactionResult.error) throw monthTransactionResult.error;
  if (previousMonthTransactionResult.error) throw previousMonthTransactionResult.error;
  if (recentTransactionResult.error) throw recentTransactionResult.error;

  const balancesByWalletId = new Map((balanceResult.data ?? []).map((balance) => [balance.wallet_id, balance]));
  const wallets = (walletResult.data ?? []).map((wallet) => ({
    ...wallet,
    balance: balancesByWalletId.get(wallet.id) ?? null,
  }));
  const categories = categoryResult.data ?? [];
  const monthTransactions = monthTransactionResult.data ?? [];
  const previousMonthTransactions = previousMonthTransactionResult.data ?? [];
  const recentTransactions = (recentTransactionResult.data ?? []).filter((transaction) => transaction.status !== "void").slice(0, 6);
  const walletsById = new Map(wallets.map((wallet) => [wallet.id, wallet]));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  const dashboardWallets = wallets
    .map((wallet): DashboardWalletItem => ({
      id: wallet.id,
      name: wallet.name,
      walletType: wallet.wallet_type,
      walletTypeLabel: getWalletTypeOption(wallet.wallet_type).label,
      color: walletVisualColor(wallet.wallet_type),
      balance: walletCurrentBalance(wallet),
      includeInNetWorth: wallet.include_in_net_worth,
    }))
    .sort((a, b) => b.balance - a.balance);

  const currentMonthMetrics = calculateMonthlyMetrics(monthTransactions);
  const previousMonthMetrics = calculateMonthlyMetrics(previousMonthTransactions);
  const netWorth = dashboardWallets
    .filter((wallet) => wallet.includeInNetWorth)
    .reduce((sum, wallet) => sum + wallet.balance, 0);
  const availableBalance = dashboardWallets
    .filter((wallet) => wallet.includeInNetWorth && isLiquidWallet(wallet.walletType))
    .reduce((sum, wallet) => sum + wallet.balance, 0);

  return {
    period: {
      label: month.label,
      start: month.start.toISOString(),
      end: month.end.toISOString(),
      daysInMonth: month.daysInMonth,
    },
    netWorth: { amount: netWorth },
    availableBalance: { amount: availableBalance },
    monthlyIncome: { amount: currentMonthMetrics.income },
    monthlyExpense: { amount: currentMonthMetrics.expense },
    netCashFlow: { amount: currentMonthMetrics.netCashFlow },
    monthComparison: {
      income: calculateMetricChange(currentMonthMetrics.income, previousMonthMetrics.income),
      expense: calculateMetricChange(currentMonthMetrics.expense, previousMonthMetrics.expense),
      netCashFlow: calculateMetricChange(currentMonthMetrics.netCashFlow, previousMonthMetrics.netCashFlow),
    },
    transferFees: { amount: currentMonthMetrics.transferFees },
    walletCount: dashboardWallets.length,
    cashflow: buildCashflow(month.daysInMonth, monthTransactions),
    spendingByCategory: buildSpendingByCategory(monthTransactions, categories),
    walletDistribution: buildWalletDistribution(dashboardWallets),
    wallets: dashboardWallets,
    calendarActivity: buildCalendarActivity(monthTransactions),
    recentTransactions: recentTransactions.map((transaction) => {
      const description = describeTransaction(transaction, walletsById, categoriesById);

      return {
        categoryName: description.categoryName,
        id: transaction.id,
        type: transaction.type,
        title: description.title,
        subtitle: description.subtitle,
        amount: moneyValue(transaction.amount),
        transferFee: moneyValue(transaction.transfer_fee),
        date: transaction.transaction_date,
        walletName: description.walletName,
      };
    }),
  };
}
