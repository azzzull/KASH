import type { Category, FinancialSpace, Transaction, Wallet } from "../types/domain";
import type {
  FinancialReportData,
  ReportCategoryBreakdown,
  ReportPeriod,
  ReportWalletBreakdown,
  TransactionRecapData,
  TransactionRecapFilters,
} from "../types/reports";
import { toNumber } from "./money";
import { isExternalTransfer, type TransactionWithMeta } from "./transactions";
import { supabase } from "./supabase";

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
  const rows: Transaction[] = [];
  for (let start = 0; ; start += REPORT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("space_id", spaceId)
      .gte("transaction_date", period.start)
      .lt("transaction_date", period.end)
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
  const [transactionRecap, balanceResult] = await Promise.all([
    getTransactionRecapData({ space, period }),
    supabase.from("wallet_balance_view").select("current_balance, wallets!inner(space_id)").eq("wallets.space_id", space.id),
  ]);
  if (balanceResult.error) throw balanceResult.error;
  const currentBalance = (balanceResult.data ?? []).reduce((total, row) => total + toNumber(row.current_balance), 0);
  return { space, period, transactionRecap, currentBalance };
}
