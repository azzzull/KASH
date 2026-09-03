import type { Category, Debt, DebtPayment, DebtPaymentAllocation, FinancialSpace, Goal, GoalContribution, Transaction, Wallet } from "../types/domain";
import type {
  FinancialReportData,
  FinancialHealthReportData,
  ReportCategoryBreakdown,
  ReportPeriod,
  ReportWalletBreakdown,
  TransactionRecapData,
  TransactionRecapFilters,
} from "../types/reports";
import { toNumber } from "./money";
import { isExternalTransfer, type TransactionWithMeta } from "./transactions";
import { supabase } from "./supabase";
import { addLocalDays, reportQueryRange } from "./reportPeriod";
import { getMonthlyBudgets } from "./budgets";

const REPORT_PAGE_SIZE = 500;

function defaultFilters(): TransactionRecapFilters {
  return { type: "all", walletId: "all", categoryId: "all", status: "completed" };
}

function matchesFilters(transaction: Transaction, filters: TransactionRecapFilters) {
  if (filters.status !== "all" && transaction.status !== filters.status) return false;
  if (filters.type === "external_transfer" && !isExternalTransfer(transaction)) return false;
  if (filters.type !== "all" && filters.type !== "external_transfer" && transaction.type !== filters.type) return false;
  if (filters.walletId !== "all" && transaction.wallet_id !== filters.walletId && transaction.destination_wallet_id !== filters.walletId) return false;
  return filters.categoryId === "all" || transaction.category_id === filters.categoryId;
}

async function getAllTransactions(spaceId: string, period: ReportPeriod) {
  const range = reportQueryRange(period);
  const rows: Transaction[] = [];
  for (let start = 0; ; start += REPORT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("space_id", spaceId)
      .gte("transaction_date", range.start)
      .lt("transaction_date", range.endExclusive)
      .order("transaction_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + REPORT_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as Transaction[];
    rows.push(...page);
    if (page.length < REPORT_PAGE_SIZE) return rows;
  }
}

async function getTransactionsBefore(spaceId: string, endExclusive: string) {
  const rows: Transaction[] = [];
  for (let start = 0; ; start += REPORT_PAGE_SIZE) {
    const { data, error } = await supabase.from("transactions").select("*").eq("space_id", spaceId).lt("transaction_date", endExclusive).order("transaction_date", { ascending: true }).order("created_at", { ascending: true }).order("id", { ascending: true }).range(start, start + REPORT_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as Transaction[]; rows.push(...page);
    if (page.length < REPORT_PAGE_SIZE) return rows;
  }
}

function monthStarts(period: ReportPeriod) {
  const result: string[] = []; const cursor = new Date(`${period.start}T00:00:00`); cursor.setDate(1);
  const end = new Date(`${period.end}T00:00:00`);
  while (cursor <= end) { result.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-01`); cursor.setMonth(cursor.getMonth() + 1); }
  return result;
}

function walletBalanceAt(wallet: Wallet, transactions: Transaction[], endExclusive: string) {
  const initial = new Date(wallet.created_at).toISOString() < endExclusive ? toNumber(wallet.initial_balance) : 0;
  return transactions.reduce((total, transaction) => {
    if (transaction.status !== "completed" || transaction.transaction_date >= endExclusive) return total;
    const amount = toNumber(transaction.amount); const fee = feeOf(transaction);
    if (transaction.type === "income" && transaction.wallet_id === wallet.id) return total + amount;
    if (transaction.type === "expense" && transaction.wallet_id === wallet.id) return total - amount - fee;
    if (transaction.type === "adjustment" && transaction.wallet_id === wallet.id) return total + amount;
    if (transaction.type === "transfer" && transaction.wallet_id === wallet.id) return total - amount - fee;
    if (transaction.type === "transfer" && transaction.destination_wallet_id === wallet.id) return total + amount;
    return total;
  }, initial);
}

async function getFinancialHealth(space: FinancialSpace, period: ReportPeriod, wallets: Wallet[]) {
  if (space.space_type === "managed") return undefined;
  const range = reportQueryRange(period); const beginningExclusive = range.start;
  const [historicalTransactions, goalsResult, contributionsResult, debtsResult] = await Promise.all([
    getTransactionsBefore(space.id, range.endExclusive),
    supabase.from("goals").select("*").eq("space_id", space.id).neq("status", "cancelled"),
    supabase.from("goal_contributions").select("*").gte("contribution_date", period.start).lte("contribution_date", period.end),
    supabase.from("debts").select("*").eq("space_id", space.id),
  ]);
  if (goalsResult.error) throw goalsResult.error;
  if (contributionsResult.error) throw contributionsResult.error;
  if (debtsResult.error) throw debtsResult.error;
  const goals = (goalsResult.data ?? []) as Goal[]; const contributions = (contributionsResult.data ?? []) as GoalContribution[]; const debts = (debtsResult.data ?? []) as Debt[];
  const debtIds = debts.map((debt) => debt.id);
  const { data: allocationsRaw, error: allocationError } = debtIds.length ? await supabase.from("debt_payment_allocations").select("*").in("debt_id", debtIds) : { data: [], error: null };
  if (allocationError) throw allocationError;
  const allocations = (allocationsRaw ?? []) as DebtPaymentAllocation[]; const paymentIds = [...new Set(allocations.map((item) => item.debt_payment_id))];
  const { data: paymentsRaw, error: paymentError } = paymentIds.length ? await supabase.from("debt_payments").select("*").in("id", paymentIds) : { data: [], error: null };
  if (paymentError) throw paymentError;
  const payments = (paymentsRaw ?? []) as DebtPayment[]; const paymentsById = new Map(payments.map((payment) => [payment.id, payment]));
  const outstandingAt = (type: Debt["type"], cutoff: string) => debts.filter((debt) => debt.type === type && debt.status !== "cancelled" && debt.created_at < cutoff).reduce((sum, debt) => sum + Math.max(0, toNumber(debt.original_amount) - allocations.filter((allocation) => allocation.debt_id === debt.id && (paymentsById.get(allocation.debt_payment_id)?.payment_date ?? "") < cutoff).reduce((paid, allocation) => paid + toNumber(allocation.allocated_amount), 0)), 0);
  const paidInPeriod = (type: Debt["type"]) => allocations.reduce((sum, allocation) => {
    const payment = paymentsById.get(allocation.debt_payment_id); const debt = debts.find((item) => item.id === allocation.debt_id);
    return debt?.type === type && payment && payment.payment_date >= period.start && payment.payment_date <= period.end ? sum + toNumber(allocation.allocated_amount) : sum;
  }, 0);
  const budgetRows = (await Promise.all(monthStarts(period).map(async (periodStart) => (await getMonthlyBudgets(periodStart, space.id)).map((budget) => ({ ...budget, periodStart }))))).flat();
  const budgets: FinancialHealthReportData["budgets"] = budgetRows.map((budget) => ({ id: `${budget.budget_id}:${budget.periodStart}`, name: budget.name, periodStart: budget.periodStart, budgeted: toNumber(budget.effective_budget), spent: toNumber(budget.spent), remaining: toNumber(budget.remaining), utilizationPercent: budget.usage_percentage, status: budget.status === "healthy" ? "on_track" : budget.status === "near_limit" ? "near_limit" : "over_budget" }));
  const goalWallets = new Map(wallets.map((wallet) => [wallet.id, wallet]));
  const goalData = goals.filter((goal) => goal.wallet_id && new Date(goal.created_at).toISOString() < range.endExclusive).map((goal) => {
    const wallet = goal.wallet_id ? goalWallets.get(goal.wallet_id) : undefined; const progress = wallet ? walletBalanceAt(wallet, historicalTransactions, range.endExclusive) : 0; const target = toNumber(goal.target_amount);
    const contributedDuringPeriod = contributions.filter((item) => item.goal_id === goal.id).reduce((sum, item) => sum + toNumber(item.amount), 0);
    return { id: goal.id, name: goal.name, target, progress, progressPercent: target > 0 ? Math.min(100, progress / target * 100) : 0, remaining: Math.max(0, target - progress), contributedDuringPeriod, progressAtPeriodEnd: true };
  });
  const investmentValuationLimited = wallets.some((wallet) => wallet.wallet_type === "investment" && wallet.current_market_value !== null);
  const netWorthAt = (cutoff: string) => wallets.filter((wallet) => wallet.include_in_net_worth).reduce((sum, wallet) => sum + walletBalanceAt(wallet, historicalTransactions, cutoff), 0) + outstandingAt("receivable", cutoff) - outstandingAt("debt", cutoff);
  const beginningNetWorth = netWorthAt(beginningExclusive); const endingNetWorth = netWorthAt(range.endExclusive); const change = endingNetWorth - beginningNetWorth;
  return { position: { beginningNetWorth, endingNetWorth, change, changePercent: beginningNetWorth === 0 ? null : change / Math.abs(beginningNetWorth) * 100, investmentValuationLimited }, budgets, goals: goalData, receivables: { outstanding: outstandingAt("receivable", range.endExclusive), collectedDuringPeriod: paidInPeriod("receivable") }, debts: { outstanding: outstandingAt("debt", range.endExclusive), paidDuringPeriod: paidInPeriod("debt") } };
}

function isEconomicDebtOrGoalMovement(transaction: Transaction) {
  return ["debt_creation", "receivable_creation", "debt_payment", "receivable_payment", "goal_contribution", "goal_refund"].includes(
    transaction.related_entity_type ?? "",
  );
}

function feeOf(transaction: Transaction) {
  return transaction.type === "expense" || transaction.type === "transfer" ? toNumber(transaction.transfer_fee) : 0;
}

function attachMeta(transactions: Transaction[], wallets: Wallet[], categories: Category[]): TransactionWithMeta[] {
  const walletsById = new Map(wallets.map((wallet) => [wallet.id, wallet]));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  return transactions.map((transaction) => ({
    ...transaction,
    category: transaction.category_id ? categoriesById.get(transaction.category_id) ?? null : null,
    wallet: transaction.wallet_id ? walletsById.get(transaction.wallet_id) ?? null : null,
    destinationWallet: transaction.destination_wallet_id ? walletsById.get(transaction.destination_wallet_id) ?? null : null,
  }));
}

function calculateSummary(transactions: Transaction[]): TransactionRecapData["summary"] {
  const completed = transactions.filter((transaction) => transaction.status === "completed");
  const income = completed.reduce((total, transaction) => total + (transaction.type === "income" && !isEconomicDebtOrGoalMovement(transaction) ? toNumber(transaction.amount) : 0), 0);
  const expensePrincipal = completed.reduce((total, transaction) => total + (transaction.type === "expense" && !isEconomicDebtOrGoalMovement(transaction) ? toNumber(transaction.amount) : 0), 0);
  const adminFees = completed.reduce((total, transaction) => total + feeOf(transaction), 0);
  const totalExpense = expensePrincipal + adminFees;
  return { income, expensePrincipal, adminFees, totalExpense, netCashFlow: income - totalExpense, transactionCount: completed.length };
}

function buildCategoryBreakdown(transactions: TransactionWithMeta[], totalExpense: number): ReportCategoryBreakdown[] {
  const grouped = new Map<string, ReportCategoryBreakdown>();
  transactions.filter((transaction) => transaction.status === "completed" && transaction.type === "expense" && !isEconomicDebtOrGoalMovement(transaction)).forEach((transaction) => {
    const key = transaction.category_id ?? "uncategorized";
    const current = grouped.get(key) ?? { categoryId: transaction.category_id, categoryName: transaction.category?.name ?? "Uncategorized", amount: 0, transactionCount: 0, percentage: 0 };
    current.amount += toNumber(transaction.amount);
    current.transactionCount += 1;
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).map((item) => ({ ...item, percentage: totalExpense > 0 ? (item.amount / totalExpense) * 100 : 0 })).sort((a, b) => b.amount - a.amount);
}

function buildWalletBreakdown(transactions: Transaction[], wallets: Wallet[]): ReportWalletBreakdown[] {
  const data = new Map(wallets.map((wallet) => [wallet.id, { wallet, cashIn: 0, cashOut: 0, netMovement: 0, transactionCount: 0 }]));
  const apply = (walletId: string | null, incoming: number, outgoing: number) => {
    if (!walletId) return;
    const item = data.get(walletId);
    if (!item) return;
    item.cashIn += incoming;
    item.cashOut += outgoing;
    item.netMovement += incoming - outgoing;
    item.transactionCount += 1;
  };
  transactions.filter((transaction) => transaction.status === "completed").forEach((transaction) => {
    const amount = toNumber(transaction.amount);
    const fee = feeOf(transaction);
    if (transaction.type === "income") apply(transaction.wallet_id, amount, 0);
    else if (transaction.type === "expense") apply(transaction.wallet_id, 0, amount + fee);
    else if (transaction.type === "adjustment") apply(transaction.wallet_id, Math.max(amount, 0), Math.max(-amount, 0));
    else { apply(transaction.wallet_id, 0, amount + fee); apply(transaction.destination_wallet_id, amount, 0); }
  });
  return Array.from(data.values()).filter((item) => item.transactionCount > 0);
}

export async function getTransactionRecapData({ space, period, filters: partialFilters }: { space: FinancialSpace; period: ReportPeriod; filters?: Partial<TransactionRecapFilters> }): Promise<TransactionRecapData> {
  const filters = { ...defaultFilters(), ...partialFilters };
  const [allTransactions, walletResult, categoryResult] = await Promise.all([
    getAllTransactions(space.id, period),
    supabase.from("wallets").select("*").eq("space_id", space.id).order("created_at", { ascending: true }),
    supabase.from("categories").select("*").or(`is_system.eq.true,space_id.eq.${space.id}`).order("name", { ascending: true }),
  ]);
  if (walletResult.error) throw walletResult.error;
  if (categoryResult.error) throw categoryResult.error;
  const wallets = (walletResult.data ?? []) as Wallet[];
  const categories = (categoryResult.data ?? []) as Category[];
  const filteredTransactions = allTransactions.filter((transaction) => matchesFilters(transaction, filters));
  const transactions = attachMeta(filteredTransactions, wallets, categories);
  const summary = calculateSummary(filteredTransactions);
  return { space, period, filters, summary, transactions, categoryBreakdown: buildCategoryBreakdown(transactions, summary.expensePrincipal), walletBreakdown: buildWalletBreakdown(filteredTransactions, wallets), wallets, categories };
}

export async function getFinancialReportData({ space, period }: { space: FinancialSpace; period: ReportPeriod }): Promise<FinancialReportData> {
  const transactionRecap = await getTransactionRecapData({ space, period });
  const walletIds = transactionRecap.wallets.map((wallet) => wallet.id);
  if (!walletIds.length) return { space, period, transactionRecap, currentBalance: 0, financialHealth: await getFinancialHealth(space, period, transactionRecap.wallets) };
  const { data: balances, error } = await supabase
    .from("wallet_balance_view")
    .select("wallet_id, current_balance")
    .in("wallet_id", walletIds);
  if (error) {
    console.error("[KASH Financial Report Export][financial-balance]", error);
    throw error;
  }
  const currentBalance = (balances ?? []).reduce((total, row) => total + toNumber(row.current_balance), 0);
  return { space, period, transactionRecap, currentBalance, financialHealth: await getFinancialHealth(space, period, transactionRecap.wallets) };
}
