import type { Category, Envelope, Transaction } from "../types/domain";

/** A presentation-only ownership group. Transaction category metadata is never changed. */
export type SpendingBreakdownGroup = {
  groupType: "category" | "envelope";
  groupId: string;
  groupName: string;
  amount: number;
  transactionCount: number;
};
export type SpendingDrilldownScope = { mode: "hybrid" | "category"; groupType: "category" | "envelope"; groupId: string };

type GroupOptions = { categories: Pick<Category, "id" | "name">[]; envelopes?: Pick<Envelope, "id" | "name">[] };
export type SpendingTransaction = Pick<Transaction, "amount" | "category_id" | "envelope_id" | "status" | "type">;

function principal(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function eligibleExpense(transaction: SpendingTransaction) {
  return transaction.status === "completed" && transaction.type === "expense";
}

function categoryIdentity(transaction: SpendingTransaction, categories: Map<string, Pick<Category, "id" | "name">>) {
  const category = transaction.category_id ? categories.get(transaction.category_id) : undefined;
  return { id: category?.id ?? "uncategorized", name: category?.name ?? "Uncategorized" };
}

/**
 * Hybrid budget-context breakdown: envelope transactions appear once under their
 * envelope; other eligible expense principal appears under its category.
 */
export function buildSpendingBreakdown(transactions: SpendingTransaction[], { categories, envelopes = [] }: GroupOptions): SpendingBreakdownGroup[] {
  const categoriesById = new Map(categories.map((item) => [item.id, item]));
  const envelopesById = new Map(envelopes.map((item) => [item.id, item]));
  const groups = new Map<string, SpendingBreakdownGroup>();

  for (const transaction of transactions) {
    if (!eligibleExpense(transaction)) continue;
    const hasEnvelope = Boolean(transaction.envelope_id);
    const groupType = hasEnvelope ? "envelope" : "category";
    const fallbackCategory = categoryIdentity(transaction, categoriesById);
    const envelope = transaction.envelope_id ? envelopesById.get(transaction.envelope_id) : undefined;
    const groupId = hasEnvelope ? transaction.envelope_id! : fallbackCategory.id;
    const groupName = hasEnvelope ? envelope?.name ?? "Unknown Envelope" : fallbackCategory.name;
    const key = `${groupType}:${groupId}`;
    const current = groups.get(key) ?? { groupType, groupId, groupName, amount: 0, transactionCount: 0 };
    current.amount += principal(transaction.amount);
    current.transactionCount += 1;
    groups.set(key, current);
  }

  return [...groups.values()].sort((first, second) => second.amount - first.amount || first.groupName.localeCompare(second.groupName));
}

/** Pure classification analysis: envelope ownership is intentionally ignored. */
export function buildCategoryBreakdown(transactions: SpendingTransaction[], { categories }: GroupOptions): SpendingBreakdownGroup[] {
  const categoriesById = new Map(categories.map((item) => [item.id, item]));
  const groups = new Map<string, SpendingBreakdownGroup>();
  for (const transaction of transactions) {
    if (!eligibleExpense(transaction)) continue;
    const category = categoryIdentity(transaction, categoriesById);
    const current = groups.get(category.id) ?? { groupType: "category", groupId: category.id, groupName: category.name, amount: 0, transactionCount: 0 };
    current.amount += principal(transaction.amount);
    current.transactionCount += 1;
    groups.set(category.id, current);
  }
  return [...groups.values()].sort((first, second) => second.amount - first.amount || first.groupName.localeCompare(second.groupName));
}

/** Uses the same eligible transaction definition as the two top-level views. */
export function filterSpendingDrilldown<T extends SpendingTransaction>(transactions: T[], scope: SpendingDrilldownScope): T[] {
  return transactions.filter((transaction) => {
    if (!eligibleExpense(transaction)) return false;
    if (scope.mode === "category") return scope.groupType === "category" && transaction.category_id === scope.groupId;
    return scope.groupType === "envelope"
      ? transaction.envelope_id === scope.groupId
      : transaction.category_id === scope.groupId && !transaction.envelope_id;
  });
}
