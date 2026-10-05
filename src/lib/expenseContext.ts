import type { ExpenseContext, Transaction } from "../types/domain";

/**
 * Central policy for how an expense is interpreted. Wallet movement is kept
 * separate: every completed expense can still move real cash regardless of
 * this classification.
 */
export function expenseContextOf(
  transaction: Pick<Transaction, "expense_context">,
): ExpenseContext {
  return transaction.expense_context ?? "personal";
}

export function isPersonalExpenseContext(
  transaction: Pick<Transaction, "expense_context">,
) {
  return expenseContextOf(transaction) === "personal";
}

export function isWorkExpenseContext(
  transaction: Pick<Transaction, "expense_context">,
) {
  return expenseContextOf(transaction) === "work";
}

export function isReimbursableExpenseContext(
  transaction: Pick<Transaction, "expense_context">,
) {
  return expenseContextOf(transaction) === "reimbursable";
}

export function isPersonalConsumptionExpense(
  transaction: Pick<Transaction, "type" | "status" | "related_entity_type" | "expense_context">,
) {
  return transaction.status === "completed"
    && transaction.type === "expense"
    && transaction.related_entity_type == null
    && isPersonalExpenseContext(transaction);
}

export function expenseContextLabelKey(context: ExpenseContext) {
  return `expenseContext.${context}` as const;
}
