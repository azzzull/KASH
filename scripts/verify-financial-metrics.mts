import assert from "node:assert/strict";
import { calculateMoneyFlowReconciliation, calculateSpendableCash, financialMetrics, walletNetWorthAt } from "../src/lib/financialMetrics.ts";
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

const currentWallet = (id: string, walletType: Wallet["wallet_type"], balance: number, spaceId = spaceA) => ({
  id, wallet_type: walletType, currentBalance: balance, is_archived: false, space_id: spaceId,
});
const dueBy = "2026-09-30T23:59:59.999Z";

// Spendable cash: liquid-only, protected savings/goal wallets, due obligations, zero and insufficient liquidity.
let spendable = calculateSpendableCash({ wallets: [currentWallet(sourceWallet, "bank", 1000)], dueBy, spaceId: spaceA });
assert.deepEqual({ liquid: spendable.liquidCash, protected: spendable.protectedAmounts, spendable: spendable.spendableCash }, { liquid: 1000, protected: 0, spendable: 1000 });
spendable = calculateSpendableCash({ wallets: [currentWallet(sourceWallet, "bank", 600), currentWallet("savings", "savings", 400)], dueBy, spaceId: spaceA });
assert.deepEqual({ liquid: spendable.liquidCash, protected: spendable.protectedAmounts, spendable: spendable.spendableCash }, { liquid: 600, protected: 400, spendable: 600 });
spendable = calculateSpendableCash({ wallets: [currentWallet(sourceWallet, "bank", 600), currentWallet("goal-pocket", "bank", 400)], goalWalletIds: ["goal-pocket"], dueBy, spaceId: spaceA });
assert.deepEqual({ liquid: spendable.liquidCash, protected: spendable.protectedAmounts, spendable: spendable.spendableCash }, { liquid: 600, protected: 400, spendable: 600 });
spendable = calculateSpendableCash({ wallets: [currentWallet(sourceWallet, "bank", 1000)], obligations: [{ id: "bill", kind: "recurring", amount: 250, dueDate: "2026-09-15", name: "Internet" }, { id: "debt", kind: "debt", amount: 300, dueDate: "2026-09-20", name: "Loan" }, { id: "later", kind: "recurring", amount: 500, dueDate: "2026-10-01" }], dueBy, spaceId: spaceA });
assert.deepEqual({ obligations: spendable.mandatoryObligations, spendable: spendable.spendableCash }, { obligations: 550, spendable: 450 });
spendable = calculateSpendableCash({ wallets: [currentWallet(sourceWallet, "bank", 200), currentWallet(destinationWallet, "cash", 300)], obligations: [{ id: "too-much", kind: "debt", amount: 500, dueDate: "2026-09-20" }], dueBy, spaceId: spaceA });
assert.equal(spendable.spendableCash, 0);
spendable = calculateSpendableCash({ wallets: [currentWallet(sourceWallet, "bank", 100), currentWallet("other-space", "bank", 1000, spaceB)], obligations: [{ id: "short", kind: "recurring", amount: 250, dueDate: "2026-09-20" }], dueBy, spaceId: spaceA });
assert.equal(spendable.spendableCash, -150);

const liquidWallets = [currentWallet(sourceWallet, "bank", 0), currentWallet("liquid-2", "cash", 0), currentWallet(destinationWallet, "savings", 0), currentWallet("investment", "investment", 0)];
const reconcile = (transactions: Transaction[]) => calculateMoneyFlowReconciliation({ transactions, wallets: liquidWallets, spaceId: spaceA });

// Money flow: consumption and each allocation remain distinct, and reconcile to liquid movement.
let flow = reconcile([transaction({ id: "income-flow", type: "income", amount: "1000" }), transaction({ id: "expense-flow", type: "expense", amount: "250" })]);
assert.deepEqual({ income: flow.genuineIncome, spending: flow.ordinarySpending, residual: flow.unreconciledAmount }, { income: 1000, spending: 250, residual: 0 });
flow = reconcile([transaction({ id: "repeat-1", type: "transfer", amount: "100", destination_wallet_id: "liquid-2" }), transaction({ id: "repeat-2", type: "transfer", amount: "100", destination_wallet_id: "liquid-2" })]);
assert.deepEqual({ spending: flow.ordinarySpending, internal: flow.internalWalletMovement, residual: flow.unreconciledAmount }, { spending: 0, internal: 200, residual: 0 });
flow = reconcile([transaction({ id: "fee-flow", type: "transfer", amount: "500", transfer_fee: "10", destination_wallet_id: "liquid-2" })]);
assert.deepEqual({ fees: flow.transferFees, residual: flow.unreconciledAmount }, { fees: 10, residual: 0 });
flow = reconcile([transaction({ id: "save-flow", type: "transfer", amount: "300", destination_wallet_id: destinationWallet }), transaction({ id: "goal-flow", type: "transfer", amount: "200", destination_wallet_id: destinationWallet, related_entity_type: "goal_contribution" })]);
assert.deepEqual({ savings: flow.savingsAllocation, goals: flow.goalContributions, residual: flow.unreconciledAmount }, { savings: 300, goals: 200, residual: 0 });
flow = reconcile([transaction({ id: "debt-flow", type: "adjustment", amount: "-150", related_entity_type: "debt_payment" }), transaction({ id: "lend-flow", type: "adjustment", amount: "-80", related_entity_type: "receivable_creation" }), transaction({ id: "collect-flow", type: "adjustment", amount: "80", related_entity_type: "receivable_payment" })]);
assert.deepEqual({ debt: flow.debtPrincipalPayments, lent: flow.receivableOutflow, collected: flow.receivableCollection, residual: flow.unreconciledAmount }, { debt: 150, lent: 80, collected: 80, residual: 0 });
flow = reconcile([transaction({ id: "invest-in", type: "transfer", amount: "400", destination_wallet_id: "investment" }), transaction({ id: "invest-out", type: "transfer", amount: "50", wallet_id: "investment", destination_wallet_id: sourceWallet })]);
assert.deepEqual({ contribution: flow.investmentContribution, withdrawal: flow.investmentWithdrawal, residual: flow.unreconciledAmount }, { contribution: 400, withdrawal: 50, residual: 0 });
flow = reconcile([transaction({ id: "mixed-income", type: "income", amount: "2000" }), transaction({ id: "mixed-spend", type: "expense", amount: "500" }), transaction({ id: "mixed-goal", type: "transfer", amount: "400", destination_wallet_id: destinationWallet, related_entity_type: "goal_contribution" }), transaction({ id: "mixed-debt", type: "adjustment", amount: "-300", related_entity_type: "debt_payment" }), transaction({ id: "mixed-fee", type: "transfer", amount: "100", transfer_fee: "5", destination_wallet_id: "liquid-2" })]);
assert.deepEqual({ liquidity: flow.resultingLiquidityChange, explained: flow.explainedLiquidityChange, residual: flow.unreconciledAmount }, { liquidity: 795, explained: 795, residual: 0 });

console.log("financial metrics: PASS");
