import { toNumber } from "./money";
import { getActiveSpaceId } from "./spaces";
import { supabase } from "./supabase";
import { getWalletTypeOption, isLiquidWallet } from "./walletMeta";
import { localDateKey } from "./calendar";
import { createCategoryColorResolver } from "./chartColors";
import type { Category, Counterparty, DebtProgress, Goal, GoalProgress, Transaction, TransactionType, Wallet, WalletBalance, WalletType } from "../types/domain";

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
  availableBalance: number;
  includeInNetWorth: boolean;
  costBasis?: number;
  unrealizedGainLoss?: number;
  returnPercentage?: number;
  lastValuationAt?: string | null;
};

export type DashboardWalletDistribution = {
  type: WalletType;
  label: string;
  amount: number;
  percent: number;
  color: string;
};

export type DashboardGoalItem = {
  id: string;
  name: string;
  currentAmount: number;
  targetAmount: number;
  percentage: number;
  deadline: string | null;
};

export type DashboardRecentTransaction = {
  categoryColor: string | null;
  categoryIcon: string | null;
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

export type DashboardDebtSummary = {
  totalDebt: number;
  totalReceivable: number;
  activeDebtCount: number;
  activeReceivableCount: number;
  counterparties: {
    id: string;
    name: string;
    debtTotal: number;
    receivableTotal: number;
    activeItemCount: number;
  }[];
};

export type DashboardSharedSavingsSummary = {
  totalShare: number;
  spaceCount: number;
};

export type DashboardNetWorthBreakdown = {
  availableCash: number;
  savings: number;
  investments: number;
  debt: number;
  receivables: number;
  other: number;
};

export type DashboardSummary = {
  period: {
    label: string;
    start: string;
    end: string;
    daysInMonth: number;
  };
  netWorth: DashboardMetric;
  netWorthComparison: DashboardMetricChange;
  netWorthBreakdown: DashboardNetWorthBreakdown;
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
  goals: DashboardGoalItem[];
  debts: DashboardDebtSummary;
  sharedSavings: DashboardSharedSavingsSummary;
  calendarActivity: DashboardCalendarActivity[];
  recentTransactions: DashboardRecentTransaction[];
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

function walletAvailableBalance(wallet: WalletWithBalance) {
  return moneyValue(wallet.balance?.available_balance ?? wallet.balance?.current_balance ?? wallet.initial_balance);
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
  const previousMagnitude = Math.abs(previous);

  if (previousMagnitude > 0) {
    const percent = ((current - previous) / previousMagnitude) * 100;
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

function walletInitialBalanceAt(wallet: Wallet, cutoffExclusive: Date) {
  const createdAt = new Date(wallet.created_at);
  return createdAt < cutoffExclusive ? moneyValue(wallet.initial_balance) : 0;
}

function transactionNetWorthEffect(transaction: Transaction, includedWalletIds: Set<string>) {
  if (transaction.status === "void") return 0;

  const sourceIncluded = includedWalletIds.has(transaction.wallet_id);
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
      return 0;
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

function netWorthAtCutoff(wallets: Wallet[], transactions: Transaction[], cutoffExclusive: Date) {
  const includedWallets = wallets.filter((wallet) => wallet.include_in_net_worth && !wallet.is_archived);
  const includedWalletIds = new Set(includedWallets.map((wallet) => wallet.id));
  const initialBalance = includedWallets.reduce((sum, wallet) => sum + walletInitialBalanceAt(wallet, cutoffExclusive), 0);
  const ledgerEffect = transactions
    .filter((transaction) => new Date(transaction.transaction_date) < cutoffExclusive)
    .reduce((sum, transaction) => sum + transactionNetWorthEffect(transaction, includedWalletIds), 0);

  return initialBalance + ledgerEffect;
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

function buildDashboardGoals(goals: Goal[], progressRows: GoalProgress[]) {
  const progressByGoalId = new Map(progressRows.map((progress) => [progress.goal_id, progress]));

  return goals
    .map((goal): DashboardGoalItem => {
      const progress = progressByGoalId.get(goal.id);
      const currentAmount = moneyValue(progress?.current_amount ?? 0);
      const targetAmount = moneyValue(goal.target_amount);

      return {
        currentAmount,
        deadline: goal.deadline,
        id: goal.id,
        name: goal.name,
        percentage: targetAmount > 0 ? Math.min((currentAmount / targetAmount) * 100, 100) : 0,
        targetAmount,
      };
    })
    .sort((first, second) => second.percentage - first.percentage);
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

export async function getDashboardSummary(
  options: DashboardSummaryOptions = {},
  spaceId?: string
): Promise<DashboardSummary> {
  const userId = await getAuthenticatedUserId();
  const targetSpaceId = spaceId ?? getActiveSpaceId();
  const month = currentMonthRange(options.referenceDate);
  const previousMonth = previousMonthRange(options.referenceDate);

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

  let monthTxnQuery = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("transaction_date", month.start.toISOString())
    .lt("transaction_date", month.end.toISOString())
    .order("transaction_date", { ascending: true });
  if (targetSpaceId) monthTxnQuery = monthTxnQuery.eq("space_id", targetSpaceId);

  let prevMonthTxnQuery = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("transaction_date", previousMonth.start.toISOString())
    .lt("transaction_date", previousMonth.end.toISOString())
    .order("transaction_date", { ascending: true });
  if (targetSpaceId) prevMonthTxnQuery = prevMonthTxnQuery.eq("space_id", targetSpaceId);

  let recentTxnQuery = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("transaction_date", { ascending: false })
    .limit(12);
  if (targetSpaceId) recentTxnQuery = recentTxnQuery.eq("space_id", targetSpaceId);

  let netWorthTxnQuery = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .lt("transaction_date", month.end.toISOString())
    .order("transaction_date", { ascending: true });
  if (targetSpaceId) netWorthTxnQuery = netWorthTxnQuery.eq("space_id", targetSpaceId);

  let goalQuery = supabase
    .from("goals")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (targetSpaceId) goalQuery = goalQuery.eq("space_id", targetSpaceId);

  let cpQuery = supabase.from("counterparties").select("*").eq("user_id", userId).order("name", { ascending: true });
  if (targetSpaceId) cpQuery = cpQuery.eq("space_id", targetSpaceId);

  const [
    walletResult,
    balanceResult,
    categoryResult,
    monthTransactionResult,
    previousMonthTransactionResult,
    recentTransactionResult,
    netWorthTransactionResult,
    goalResult,
    goalProgressResult,
    counterpartiesResult,
    debtProgressResult,
    sharedSavingsResult,
  ] = await Promise.all([
    walletQuery,
    supabase.from("wallet_balance_view").select("*").eq("user_id", userId),
    categoryQuery,
    monthTxnQuery,
    prevMonthTxnQuery,
    recentTxnQuery,
    netWorthTxnQuery,
    goalQuery,
    supabase.from("goal_progress_view").select("*").eq("user_id", userId),
    cpQuery,
    supabase.from("debt_progress_view").select("*").eq("user_id", userId),
    supabase.from("shared_savings_member_shares_view").select("*").eq("user_id", userId),
  ]);

  if (walletResult.error) throw walletResult.error;
  if (balanceResult.error) throw balanceResult.error;
  if (categoryResult.error) throw categoryResult.error;
  if (monthTransactionResult.error) throw monthTransactionResult.error;
  if (previousMonthTransactionResult.error) throw previousMonthTransactionResult.error;
  if (recentTransactionResult.error) throw recentTransactionResult.error;
  if (netWorthTransactionResult.error) throw netWorthTransactionResult.error;
  if (goalResult.error) throw goalResult.error;
  if (goalProgressResult.error) throw goalProgressResult.error;
  if (counterpartiesResult.error) throw counterpartiesResult.error;
  if (debtProgressResult.error) throw debtProgressResult.error;
  if (sharedSavingsResult.error) throw sharedSavingsResult.error;

  const balancesByWalletId = new Map((balanceResult.data ?? []).map((balance) => [balance.wallet_id, balance]));
  const wallets = (walletResult.data ?? []).map((wallet) => ({
    ...wallet,
    balance: balancesByWalletId.get(wallet.id) ?? null,
  }));
  const categories = categoryResult.data ?? [];
  const monthTransactions = monthTransactionResult.data ?? [];
  const previousMonthTransactions = previousMonthTransactionResult.data ?? [];
  const netWorthTransactions = netWorthTransactionResult.data ?? [];
  const recentTransactions = (recentTransactionResult.data ?? []).filter((transaction) => transaction.status !== "void").slice(0, 6);

  const validGoalIds = new Set((goalResult.data ?? []).map((g) => g.id));
  const goalProgressItems = ((goalProgressResult.data ?? []) as GoalProgress[]).filter((item) =>
    validGoalIds.has(item.goal_id)
  );
  const dashboardGoals = buildDashboardGoals(goalResult.data ?? [], goalProgressItems);

  const walletsById = new Map(wallets.map((wallet) => [wallet.id, wallet]));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  const counterparties = (counterpartiesResult.data ?? []) as Counterparty[];
  const validCpIds = new Set(counterparties.map((cp) => cp.id));
  const debtProgressItems = ((debtProgressResult.data ?? []) as DebtProgress[]).filter((item) =>
    validCpIds.has(item.counterparty_id)
  );

  let totalDebt = 0;
  let totalReceivable = 0;
  let activeDebtCount = 0;
  let activeReceivableCount = 0;

  const debtItemsByCounterparty = new Map<string, DebtProgress[]>();
  for (const item of debtProgressItems) {
    if (item.status !== "cancelled") {
      const remaining = moneyValue(item.remaining_amount);
      if (item.type === "debt") {
        totalDebt += remaining;
        if (item.status !== "settled") activeDebtCount++;
      } else {
        totalReceivable += remaining;
        if (item.status !== "settled") activeReceivableCount++;
      }
    }
    const list = debtItemsByCounterparty.get(item.counterparty_id) ?? [];
    list.push(item);
    debtItemsByCounterparty.set(item.counterparty_id, list);
  }

  const dashboardCounterparties = counterparties
    .map((cp: Counterparty) => {
      const items = debtItemsByCounterparty.get(cp.id) ?? [];
      let cpDebt = 0;
      let cpReceivable = 0;
      let activeCount = 0;

      for (const item of items) {
        if (item.status === "cancelled") continue;
        const rem = moneyValue(item.remaining_amount);
        if (item.type === "debt") {
          cpDebt += rem;
        } else {
          cpReceivable += rem;
        }
        if (item.status !== "settled") activeCount++;
      }

      return {
        id: cp.id,
        name: cp.name,
        debtTotal: cpDebt,
        receivableTotal: cpReceivable,
        activeItemCount: activeCount,
      };
    })
    .filter((cp) => cp.debtTotal > 0 || cp.receivableTotal > 0 || cp.activeItemCount > 0)
    .sort((a, b) => (b.debtTotal + b.receivableTotal) - (a.debtTotal + a.receivableTotal));

  const dashboardWallets = wallets
    .map((wallet): DashboardWalletItem => ({
      id: wallet.id,
      name: wallet.name,
      walletType: wallet.wallet_type,
      walletTypeLabel: getWalletTypeOption(wallet.wallet_type).label,
      color: walletVisualColor(wallet.wallet_type),
      balance: walletCurrentBalance(wallet),
      availableBalance: walletAvailableBalance(wallet),
      includeInNetWorth: wallet.include_in_net_worth,
      costBasis: wallet.balance?.cost_basis !== undefined ? moneyValue(wallet.balance.cost_basis) : undefined,
      unrealizedGainLoss: wallet.balance?.unrealized_gain_loss !== undefined ? moneyValue(wallet.balance.unrealized_gain_loss) : undefined,
      returnPercentage: wallet.balance?.return_percentage !== undefined ? Number(wallet.balance.return_percentage) : undefined,
      lastValuationAt: wallet.balance?.last_valuation_at ?? null,
    }))
    .sort((a, b) => b.balance - a.balance);

  let isManagedSpace = false;
  if (targetSpaceId) {
    const { data: spaceData } = await supabase
      .from("financial_spaces")
      .select("space_type")
      .eq("id", targetSpaceId)
      .maybeSingle();
    isManagedSpace = spaceData?.space_type === "managed";
  }

  const rawSharedSavingsShares = (sharedSavingsResult.data ?? []).reduce((sum, row: any) => {
    const s = moneyValue(row.current_share);
    return s > 0 ? sum + s : sum;
  }, 0);
  const rawSharedSavingsSpaceCount = (sharedSavingsResult.data ?? []).filter((row: any) => row.member_status === "active").length;
  const sharedSavingsShares = isManagedSpace ? 0 : rawSharedSavingsShares;
  const sharedSavingsSpaceCount = isManagedSpace ? 0 : rawSharedSavingsSpaceCount;

  const currentMonthMetrics = calculateMonthlyMetrics(monthTransactions);
  const previousMonthMetrics = calculateMonthlyMetrics(previousMonthTransactions);

  const availableCash = dashboardWallets
    .filter((wallet) => wallet.includeInNetWorth && isLiquidWallet(wallet.walletType))
    .reduce((sum, wallet) => sum + wallet.availableBalance, 0);

  const savingsTotal =
    dashboardWallets
      .filter((wallet) => wallet.includeInNetWorth && wallet.walletType === "savings")
      .reduce((sum, wallet) => sum + wallet.balance, 0) + sharedSavingsShares;

  const investmentsTotal = dashboardWallets
    .filter((wallet) => wallet.includeInNetWorth && wallet.walletType === "investment")
    .reduce((sum, wallet) => sum + wallet.balance, 0);

  const otherWalletsTotal = dashboardWallets
    .filter((wallet) => wallet.includeInNetWorth && !isLiquidWallet(wallet.walletType) && wallet.walletType !== "savings" && wallet.walletType !== "investment")
    .reduce((sum, wallet) => sum + wallet.balance, 0);

  const netWorth = availableCash + savingsTotal + investmentsTotal + otherWalletsTotal + totalReceivable - totalDebt;
  const previousPeriodNetWorth =
    netWorthAtCutoff(wallets, netWorthTransactions, previousMonth.end) +
    sharedSavingsShares +
    totalReceivable -
    totalDebt;

  return {
    period: {
      label: month.label,
      start: month.start.toISOString(),
      end: month.end.toISOString(),
      daysInMonth: month.daysInMonth,
    },
    netWorth: { amount: netWorth },
    netWorthComparison: calculateMetricChange(netWorth, previousPeriodNetWorth),
    netWorthBreakdown: {
      availableCash,
      savings: savingsTotal,
      investments: investmentsTotal,
      debt: totalDebt,
      receivables: totalReceivable,
      other: otherWalletsTotal,
    },
    availableBalance: { amount: availableCash },
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
    goals: dashboardGoals,
    debts: {
      totalDebt,
      totalReceivable,
      activeDebtCount,
      activeReceivableCount,
      counterparties: dashboardCounterparties,
    },
    sharedSavings: {
      totalShare: sharedSavingsShares,
      spaceCount: sharedSavingsSpaceCount,
    },
    calendarActivity: buildCalendarActivity(monthTransactions),
    recentTransactions: recentTransactions.map((transaction) => {
      const description = describeTransaction(transaction, walletsById, categoriesById);
      const category = transaction.category_id
        ? categoriesById.get(transaction.category_id) ?? null
        : null;

      return {
        categoryColor: category?.color ?? null,
        categoryIcon: category?.icon ?? null,
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
