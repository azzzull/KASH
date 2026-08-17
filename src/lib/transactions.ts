import type { Category, CategoryType, Transaction, TransactionStatus, TransactionType, Wallet } from "../types/domain";
import type { Database } from "../types/database";
import { addMoneyValues, isMoneyGreaterThan } from "./money";
import { supabase } from "./supabase";

type BaseTransactionInput = {
  amount: string;
  walletId: string;
  transactionDate: string;
  note: string | null;
};

type CategoryTransactionInput = BaseTransactionInput & {
  categoryId: string;
  title: string | null;
};

type TransferInput = BaseTransactionInput & {
  destinationWalletId: string;
  transferFee: string;
};

type AdjustmentInput = Pick<BaseTransactionInput, "transactionDate" | "walletId"> & {
  amount: string;
  reason: string;
};

export type TransactionSort = "latest" | "oldest" | "amount_high" | "amount_low";
export type TransactionTypeFilter = "all" | TransactionType;
export type TransactionStatusFilter = "all" | TransactionStatus;
export type TransactionPeriodFilter = "all" | "this_month" | "last_month" | "this_year";

export type TransactionFilters = {
  categoryId?: string;
  dateKey?: string;
  page?: number;
  pageSize?: number;
  period?: TransactionPeriodFilter;
  query?: string;
  sort?: TransactionSort;
  status?: TransactionStatusFilter;
  type?: TransactionTypeFilter;
  walletId?: string;
};

export type TransactionWithMeta = Transaction & {
  category: Category | null;
  destinationWallet: Wallet | null;
  wallet: Wallet | null;
};

export type UpdateTransactionInput = {
  amount: string;
  categoryId?: string | null;
  destinationWalletId?: string | null;
  note: string | null;
  title: string | null;
  transactionDate: string;
  transferFee?: string;
  walletId: string;
};

const INSUFFICIENT_BALANCE_MESSAGE = "Wallet balance is not enough. Check the amount again.";

async function getAuthenticatedUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("You need to be signed in to create transactions.");
  }

  return user.id;
}

function toTransactionDate(value: string) {
  return new Date(value).toISOString();
}

function periodRange(period: TransactionPeriodFilter = "all") {
  if (period === "all") return null;

  const now = new Date();
  const start =
    period === "this_month"
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : period === "last_month"
        ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
        : new Date(now.getFullYear(), 0, 1);
  const end =
    period === "this_month"
      ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
      : period === "last_month"
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : new Date(now.getFullYear() + 1, 0, 1);

  return { end: end.toISOString(), start: start.toISOString() };
}

function localDayRange(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);

  return { end: end.toISOString(), start: start.toISOString() };
}

function searchMatches(transaction: TransactionWithMeta, query: string) {
  if (!query.trim()) return true;
  const normalizedQuery = query.toLowerCase().trim();
  const haystack = [
    transaction.title,
    transaction.note,
    transaction.category?.name,
    transaction.wallet?.name,
    transaction.destinationWallet?.name,
    transaction.type,
    transaction.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function attachTransactionMeta(transactions: Transaction[], wallets: Wallet[], categories: Category[]): TransactionWithMeta[] {
  const walletsById = new Map(wallets.map((wallet) => [wallet.id, wallet]));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  return transactions.map((transaction) => ({
    ...transaction,
    category: transaction.category_id ? categoriesById.get(transaction.category_id) ?? null : null,
    destinationWallet: transaction.destination_wallet_id ? walletsById.get(transaction.destination_wallet_id) ?? null : null,
    wallet: walletsById.get(transaction.wallet_id) ?? null,
  }));
}

function outgoingAmountFor(type: TransactionType, amount: string | number, transferFee: string | number = "0") {
  if (type === "expense") return String(amount);
  if (type === "transfer") return addMoneyValues(amount, transferFee);
  return null;
}

async function getWalletCurrentBalance(userId: string, walletId: string) {
  const { data, error } = await supabase
    .from("wallet_balance_view")
    .select("current_balance")
    .eq("user_id", userId)
    .eq("wallet_id", walletId)
    .single();

  if (error) throw error;
  return data.current_balance;
}

async function assertWalletCanCover(userId: string, walletId: string, outgoingAmount: string, restoredAmount = "0") {
  const currentBalance = await getWalletCurrentBalance(userId, walletId);
  const spendableBalance = addMoneyValues(currentBalance, restoredAmount);

  if (isMoneyGreaterThan(outgoingAmount, spendableBalance)) {
    throw new Error(INSUFFICIENT_BALANCE_MESSAGE);
  }
}

async function createTransaction(payload: {
  amount: string;
  category_id?: string | null;
  destination_wallet_id?: string | null;
  note?: string | null;
  title?: string | null;
  transfer_fee?: string;
  transaction_date: string;
  type: TransactionType;
  wallet_id: string;
}) {
  const userId = await getAuthenticatedUserId();
  const outgoingAmount = outgoingAmountFor(payload.type, payload.amount, payload.transfer_fee ?? "0");

  if (outgoingAmount) {
    await assertWalletCanCover(userId, payload.wallet_id, outgoingAmount);
  }

  return supabase
    .from("transactions")
    .insert({
      user_id: userId,
      type: payload.type,
      amount: payload.amount,
      wallet_id: payload.wallet_id,
      category_id: payload.category_id ?? null,
      destination_wallet_id: payload.destination_wallet_id ?? null,
      transfer_fee: payload.transfer_fee ?? "0",
      transaction_date: toTransactionDate(payload.transaction_date),
      title: payload.title ?? null,
      note: payload.note ?? null,
      status: "completed",
    })
    .select("*")
    .single();
}

export async function createIncome(input: CategoryTransactionInput) {
  return createTransaction({
    amount: input.amount,
    category_id: input.categoryId,
    note: input.note,
    title: input.title,
    transaction_date: input.transactionDate,
    type: "income",
    wallet_id: input.walletId,
  });
}

export async function createExpense(input: CategoryTransactionInput) {
  return createTransaction({
    amount: input.amount,
    category_id: input.categoryId,
    note: input.note,
    title: input.title,
    transaction_date: input.transactionDate,
    type: "expense",
    wallet_id: input.walletId,
  });
}

export async function createTransfer(input: TransferInput) {
  return createTransaction({
    amount: input.amount,
    destination_wallet_id: input.destinationWalletId,
    note: input.note,
    transaction_date: input.transactionDate,
    transfer_fee: input.transferFee,
    type: "transfer",
    wallet_id: input.walletId,
  });
}

export async function createAdjustment(input: AdjustmentInput) {
  return createTransaction({
    amount: input.amount,
    note: input.reason,
    title: "Balance Adjustment",
    transaction_date: input.transactionDate,
    type: "adjustment",
    wallet_id: input.walletId,
  });
}

export async function getTransactionSupportData() {
  const userId = await getAuthenticatedUserId();
  const [walletResult, categoryResult] = await Promise.all([
    supabase.from("wallets").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    supabase
      .from("categories")
      .select("*")
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order("category_type", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (walletResult.error) throw walletResult.error;
  if (categoryResult.error) throw categoryResult.error;

  return {
    categories: categoryResult.data ?? [],
    wallets: walletResult.data ?? [],
  };
}

export async function getTransactions(filters: TransactionFilters = {}) {
  const userId = await getAuthenticatedUserId();
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 30;
  const sort = filters.sort ?? "latest";
  const exactDayRange = filters.dateKey ? localDayRange(filters.dateKey) : null;
  const range = exactDayRange ?? periodRange(filters.period);
  const supportData = await getTransactionSupportData();

  let query = supabase.from("transactions").select("*", { count: "exact" }).eq("user_id", userId);

  if (filters.type && filters.type !== "all") query = query.eq("type", filters.type);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.walletId) query = query.or(`wallet_id.eq.${filters.walletId},destination_wallet_id.eq.${filters.walletId}`);
  if (range) query = query.gte("transaction_date", range.start).lt("transaction_date", range.end);

  query =
    sort === "oldest"
      ? query.order("transaction_date", { ascending: true })
      : sort === "amount_high"
        ? query.order("amount", { ascending: false })
        : sort === "amount_low"
          ? query.order("amount", { ascending: true })
          : query.order("transaction_date", { ascending: false });

  const { data, error, count } = await query.range(page * pageSize, page * pageSize + pageSize - 1);

  if (error) throw error;

  const rows = attachTransactionMeta(data ?? [], supportData.wallets, supportData.categories);
  const filteredRows = filters.query ? rows.filter((transaction) => searchMatches(transaction, filters.query ?? "")) : rows;

  return {
    categories: supportData.categories,
    count: filters.query ? filteredRows.length : count ?? filteredRows.length,
    hasMore: filters.query ? false : (count ?? 0) > (page + 1) * pageSize,
    transactions: filteredRows,
    wallets: supportData.wallets,
  };
}

export async function getTransactionById(id: string) {
  const userId = await getAuthenticatedUserId();
  const [transactionResult, supportData] = await Promise.all([
    supabase.from("transactions").select("*").eq("id", id).eq("user_id", userId).single(),
    getTransactionSupportData(),
  ]);

  if (transactionResult.error) throw transactionResult.error;

  return attachTransactionMeta([transactionResult.data], supportData.wallets, supportData.categories)[0];
}

export async function updateTransaction(transaction: Transaction, input: UpdateTransactionInput) {
  const userId = await getAuthenticatedUserId();

  if (transaction.related_entity_type === "goal_contribution" || transaction.related_entity_type === "goal_refund") {
    throw new Error("Goal transfers are managed from Goals and cannot be edited here.");
  }

  if (transaction.status === "void") {
    throw new Error("Voided transactions cannot be edited.");
  }

  const nextOutgoingAmount = outgoingAmountFor(transaction.type, input.amount, input.transferFee ?? "0");

  if (nextOutgoingAmount) {
    const restoredOutgoingAmount =
      transaction.wallet_id === input.walletId
        ? outgoingAmountFor(transaction.type, transaction.amount, transaction.transfer_fee) ?? "0"
        : "0";

    await assertWalletCanCover(userId, input.walletId, nextOutgoingAmount, restoredOutgoingAmount);
  }

  const payload: Database["public"]["Tables"]["transactions"]["Update"] = {
    amount: input.amount,
    note: input.note,
    title: input.title,
    transaction_date: toTransactionDate(input.transactionDate),
    wallet_id: input.walletId,
  };

  if (transaction.type === "income" || transaction.type === "expense") {
    payload.category_id = input.categoryId ?? null;
    payload.destination_wallet_id = null;
    payload.transfer_fee = "0";
  }

  if (transaction.type === "transfer") {
    payload.category_id = null;
    payload.destination_wallet_id = input.destinationWalletId ?? null;
    payload.transfer_fee = input.transferFee ?? "0";
  }

  if (transaction.type === "adjustment") {
    payload.category_id = null;
    payload.destination_wallet_id = null;
    payload.transfer_fee = "0";
  }

  return supabase.from("transactions").update(payload).eq("id", transaction.id).eq("user_id", userId).select("*").single();
}

export async function voidTransaction(id: string) {
  const userId = await getAuthenticatedUserId();
  const { data: transaction, error: loadError } = await supabase
    .from("transactions")
    .select("related_entity_type")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (loadError) {
    return { data: null, error: loadError };
  }

  if (transaction.related_entity_type === "goal_contribution" || transaction.related_entity_type === "goal_refund") {
    throw new Error("Goal transfers are managed from Goals and cannot be voided here.");
  }

  return supabase
    .from("transactions")
    .update({ status: "void" })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
}

export function filterCategoriesByType<T extends { category_type: CategoryType; is_archived: boolean }>(
  categories: T[],
  categoryType: CategoryType,
) {
  return categories.filter((category) => category.category_type === categoryType && !category.is_archived);
}
