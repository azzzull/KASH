import type { Category, Transaction, TransactionType, Wallet } from "../types/domain";
import { toNumber } from "./money";
import { getActiveSpaceId } from "./spaces";
import { supabase } from "./supabase";
import { getTransactionSupportData, type TransactionWithMeta } from "./transactions";

export type CalendarDaySummary = {
  expense: number;
  income: number;
  net: number;
  transactionCount: number;
};

export type CalendarDayData = {
  dateKey: string;
  summary: CalendarDaySummary;
  transactions: TransactionWithMeta[];
  types: TransactionType[];
};

export type CalendarMonthData = {
  categories: Category[];
  days: Map<string, CalendarDayData>;
  transactions: TransactionWithMeta[];
  wallets: Wallet[];
};

export function localDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function startOfLocalMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function buildCalendarCells(monthDate: Date) {
  const monthStart = startOfLocalMonth(monthDate);
  const mondayIndex = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate() - mondayIndex);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      date,
      dateKey: localDateKey(date),
      isCurrentMonth: date.getMonth() === monthStart.getMonth(),
    };
  });
}

export function getCalendarQueryRange(monthDate: Date) {
  const cells = buildCalendarCells(monthDate);
  const start = cells[0].date;
  const lastCell = cells[cells.length - 1].date;
  const end = new Date(lastCell.getFullYear(), lastCell.getMonth(), lastCell.getDate() + 1);

  return {
    end,
    start,
  };
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

export function calculateDaySummary(transactions: TransactionWithMeta[]): CalendarDaySummary {
  const completedTransactions = transactions.filter((transaction) => transaction.status === "completed");
  const income = completedTransactions.reduce((total, transaction) => {
    if (transaction.type !== "income") return total;
    return total + toNumber(transaction.amount);
  }, 0);
  const expense = completedTransactions.reduce((total, transaction) => {
    if (transaction.type === "expense") return total + toNumber(transaction.amount);
    if (transaction.type === "transfer") return total + toNumber(transaction.transfer_fee);
    return total;
  }, 0);

  return {
    expense,
    income,
    net: income - expense,
    transactionCount: completedTransactions.length,
  };
}

export function groupTransactionsByDate(transactions: TransactionWithMeta[]) {
  const grouped = new Map<string, CalendarDayData>();

  transactions.forEach((transaction) => {
    if (transaction.status !== "completed") return;

    const dateKey = localDateKey(transaction.transaction_date);
    const current = grouped.get(dateKey) ?? {
      dateKey,
      summary: { expense: 0, income: 0, net: 0, transactionCount: 0 },
      transactions: [],
      types: [],
    };
    const transactionsForDay = [...current.transactions, transaction].sort(
      (a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime(),
    );
    const types = Array.from(new Set(transactionsForDay.map((item) => item.type)));

    grouped.set(dateKey, {
      dateKey,
      summary: calculateDaySummary(transactionsForDay),
      transactions: transactionsForDay,
      types,
    });
  });

  return grouped;
}

export async function getCalendarMonthTransactions(monthDate: Date, spaceId?: string): Promise<CalendarMonthData> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You need to be signed in to view the calendar.");
  }

  const targetSpaceId = spaceId ?? getActiveSpaceId();
  const range = getCalendarQueryRange(monthDate);
  const supportData = await getTransactionSupportData(targetSpaceId ?? undefined);

  let query = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .gte("transaction_date", range.start.toISOString())
    .lt("transaction_date", range.end.toISOString())
    .order("transaction_date", { ascending: true });

  if (targetSpaceId) {
    query = query.eq("space_id", targetSpaceId);
  }

  const { data, error } = await query;

  if (error) throw error;

  const transactions = attachTransactionMeta(data ?? [], supportData.wallets, supportData.categories);

  return {
    categories: supportData.categories,
    days: groupTransactionsByDate(transactions),
    transactions,
    wallets: supportData.wallets,
  };
}
