import assert from "node:assert/strict";
import { financialMetrics, walletNetWorthAt } from "../src/lib/financialMetrics.ts";
import type { Transaction, TransactionType, Wallet } from "../src/types/domain.ts";

const spaceA = "space-a";
const spaceB = "space-b";
const sourceWallet = "wallet-source";
const destinationWallet = "wallet-destination";

function transaction(overrides: Partial<Transaction> & Pick<Transaction, "id" | "type" | "amount">): Transaction {
  return {
    id: overrides.id,
    user_id: "user-a",
    space_id: spaceA,
    type: overrides.type as TransactionType,
    transaction_subtype: null,
    amount: overrides.amount,
    wallet_id: sourceWallet,
    category_id: null,
    envelope_id: null,
    destination_wallet_id: null,
    transfer_fee: "0",
    transaction_date: "2026-09-01T00:00:00.000Z",
    title: null,
    note: null,
    attachment_url: null,
    status: "completed",
    related_entity_type: null,
    related_entity_id: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function wallet(id: string, spaceId: string, initialBalance = "0"): Wallet {
  return {
    id, user_id: "user-a", space_id: spaceId, name: id, wallet_type: "bank", initial_balance: initialBalance,
    currency: "IDR", color: null, icon: null, institution_name: null, account_number: null,
    include_in_net_worth: true, is_archived: false, current_market_value: null, last_valuation_at: null,
    created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
  };
}

// Salary + expense
let metrics = financialMetrics([transaction({ id: "salary", type: "income", amount: "1000" }), transaction({ id: "food", type: "expense", amount: "250" })]);
assert.deepEqual({ income: metrics.income, expense: metrics.totalExpense, net: metrics.netCashFlow }, { income: 1000, expense: 250, net: 750 });

// Wallet transfer remains an internal movement, not income/expense.
const transfer = transaction({ id: "transfer", type: "transfer", amount: "500", destination_wallet_id: destinationWallet });
metrics = financialMetrics([transfer]);
assert.deepEqual({ income: metrics.income, expense: metrics.totalExpense, transfers: metrics.internalTransfers }, { income: 0, expense: 0, transfers: 500 });
assert.deepEqual(financialMetrics([transfer], sourceWallet).walletNetMovement, -500);
assert.deepEqual(financialMetrics([transfer], destinationWallet).walletNetMovement, 500);

// Transfer fee is a real expense and source-wallet outflow.
metrics = financialMetrics([transaction({ ...transfer, id: "fee-transfer", transfer_fee: "10" })]);
assert.deepEqual({ expense: metrics.totalExpense, fees: metrics.transferFees, net: metrics.walletNetMovement }, { expense: 10, fees: 10, net: -10 });

// Receivable collection and debt principal repayment are not income/ordinary expense.
metrics = financialMetrics([
  transaction({ id: "collect", type: "adjustment", amount: "300", related_entity_type: "receivable_payment" }),
  transaction({ id: "debt-payment", type: "adjustment", amount: "-200", related_entity_type: "debt_payment" }),
]);
assert.deepEqual({ income: metrics.income, expense: metrics.expensePrincipal, net: metrics.netCashFlow }, { income: 0, expense: 0, net: 0 });

// Goal/savings allocation is an internal transfer, not ordinary spending.
metrics = financialMetrics([transaction({ id: "goal", type: "transfer", amount: "400", destination_wallet_id: destinationWallet, related_entity_type: "goal_contribution" })]);
assert.deepEqual({ expense: metrics.expensePrincipal, transfers: metrics.internalTransfers }, { expense: 0, transfers: 400 });

// Voids have no active metric effect.
metrics = financialMetrics([transaction({ id: "void", type: "income", amount: "999", status: "void" })]);
assert.deepEqual({ income: metrics.income, count: metrics.transactionCount, net: metrics.walletNetMovement }, { income: 0, count: 0, net: 0 });

// A Space filter prevents unrelated financial events from entering a metric.
const spaceATransactions = [transaction({ id: "a-income", type: "income", amount: "100" })];
const spaceBTransaction = transaction({ id: "b-income", type: "income", amount: "900", space_id: spaceB, wallet_id: "wallet-b" });
assert.equal(walletNetWorthAt([wallet(sourceWallet, spaceA)], spaceATransactions, new Date("2026-10-01T00:00:00.000Z")), 100);
assert.equal(financialMetrics([...spaceATransactions, spaceBTransaction], undefined, spaceA).income, 100);

console.log("financial metrics: PASS");
