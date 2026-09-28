import assert from "node:assert/strict";
import {
  buildSmartEntryDraft,
  detectMultipleFinancialActions,
  validateSmartEntryRawDraft,
  type SmartEntryRawDraft,
  type SmartEntryResources,
} from "../src/lib/smartEntry.ts";

const resources: SmartEntryResources = {
  categories: [
    { id: "food", kind: "expense", name: "Food & Drink" },
    { id: "transfer-expense", kind: "expense", name: "Transfer" },
    { id: "salary", kind: "income", name: "Salary" },
  ],
  envelopes: [{ id: "date", name: "Date" }],
  managedSpaces: [{ id: "office", name: "Office Petty Cash" }],
  obligations: [
    { counterpartyId: "cp-dimas", counterpartyName: "Dimas", id: "debt-dimas", remainingAmount: 500_000, title: "Personal Loan A", type: "debt" },
    { counterpartyId: "cp-raka", counterpartyName: "Raka", id: "receivable-raka", remainingAmount: 300_000, title: "Lunch advance", type: "receivable" },
    { counterpartyId: "cp-office", counterpartyName: "Ayu", crossSpaceEventId: "event-office", id: "managed-payable", remainingAmount: 180_000, title: "Office cable", type: "debt" },
  ],
  wallets: [
    { id: "bca", name: "myBCA" },
    { id: "gopay", name: "GoPay" },
    { id: "cash", name: "Cash" },
  ],
};

function raw(overrides: Partial<SmartEntryRawDraft>): SmartEntryRawDraft {
  return {
    amount: null,
    category: null,
    confidence: {},
    counterparty: null,
    description: "Test entry",
    destinationWallet: null,
    envelope: null,
    intent: "unknown",
    managedSpace: null,
    message: null,
    missingFields: [],
    multipleActions: false,
    reimbursement: null,
    settlementSource: null,
    sourceWallet: null,
    transactionDate: "2026-09-28",
    transactionTime: null,
    wallet: null,
    ...overrides,
  };
}

const fallbackDate = "2026-09-28";

// 1–4: transaction intents route only to typed, existing transaction services.
let draft = buildSmartEntryDraft(raw({ amount: 35_000, category: "Food & Drink", intent: "expense", wallet: "myBCA" }), resources, fallbackDate);
assert.deepEqual({ amount: draft.amount, category: draft.categoryId, wallet: draft.walletId, missing: draft.missingFields }, { amount: 35_000, category: "food", wallet: "bca", missing: [] });
draft = buildSmartEntryDraft(raw({ amount: 750_000, category: "Salary", intent: "income", wallet: "myBCA" }), resources, fallbackDate);
assert.deepEqual({ category: draft.categoryId, intent: draft.intent, wallet: draft.walletId }, { category: "salary", intent: "income", wallet: "bca" });
draft = buildSmartEntryDraft(raw({ amount: 500_000, destinationWallet: "GoPay", intent: "internal_transfer", sourceWallet: "myBCA" }), resources, fallbackDate);
assert.deepEqual({ destination: draft.destinationWalletId, missing: draft.missingFields, source: draft.sourceWalletId }, { destination: "gopay", missing: [], source: "bca" });
draft = buildSmartEntryDraft(raw({ amount: 200_000, category: "Transfer", counterparty: "Promoter", intent: "external_transfer", sourceWallet: "myBCA" }), resources, fallbackDate);
assert.deepEqual({ category: draft.categoryId, source: draft.sourceWalletId }, { category: "transfer-expense", source: "bca" });

// 5–10: debt, receivable, reimbursement and settlement resolve no parser-provided IDs.
draft = buildSmartEntryDraft(raw({ amount: 500_000, counterparty: "Dimas", intent: "debt_borrow", wallet: "myBCA" }), resources, fallbackDate);
assert.equal(draft.missingFields.length, 0);
draft = buildSmartEntryDraft(raw({ amount: 300_000, counterparty: "Raka", intent: "receivable_lend", wallet: "GoPay" }), resources, fallbackDate);
assert.equal(draft.missingFields.length, 0);
draft = buildSmartEntryDraft(raw({ amount: 200_000, counterparty: "Dimas", intent: "debt_payment", wallet: "myBCA" }), resources, fallbackDate);
assert.equal(draft.obligationId, "debt-dimas");
draft = buildSmartEntryDraft(raw({ amount: 150_000, counterparty: "Raka", intent: "receivable_collection", wallet: "GoPay" }), resources, fallbackDate);
assert.equal(draft.obligationId, "receivable-raka");
draft = buildSmartEntryDraft(raw({ amount: 180_000, intent: "reimbursable_expense", managedSpace: "Office Petty Cash", wallet: "myBCA" }), resources, fallbackDate);
assert.equal(draft.managedSpaceId, "office");
draft = buildSmartEntryDraft(raw({ amount: 180_000, intent: "reimbursement_settlement", reimbursement: "Office cable" }), resources, fallbackDate);
assert.equal(draft.reimbursementEventId, "event-office");

// 11–18: ambiguity, invalid resources, unsupported input, and V1 one-action guard.
draft = buildSmartEntryDraft(raw({ intent: "unknown", missingFields: ["direction"] }), resources, fallbackDate);
assert.ok(draft.missingFields.includes("intent"));
const ambiguousResources: SmartEntryResources = { ...resources, wallets: [...resources.wallets, { id: "bca-tabungan", name: "BCA Tabungan" }] };
draft = buildSmartEntryDraft(raw({ amount: 25_000, category: "Food & Drink", intent: "expense", wallet: "BCA" }), ambiguousResources, fallbackDate);
assert.ok(draft.missingFields.includes("wallet"));
draft = buildSmartEntryDraft(raw({ category: "Food & Drink", intent: "expense", wallet: "myBCA" }), resources, fallbackDate);
assert.ok(draft.missingFields.includes("amount"));
draft = buildSmartEntryDraft(raw({ amount: 35_000, category: "Food & Drink", intent: "expense" }), resources, fallbackDate);
assert.ok(draft.missingFields.includes("wallet"));
draft = buildSmartEntryDraft(raw({ amount: 35_000, category: "Food & Drink", intent: "expense", missingFields: ["date"], wallet: "myBCA" }), resources, fallbackDate);
assert.ok(draft.missingFields.includes("date"));
draft = buildSmartEntryDraft(raw({ amount: 35_000, category: "Food & Drink", intent: "expense", wallet: "Unknown Wallet" }), resources, fallbackDate);
assert.ok(draft.missingFields.includes("wallet"));
assert.equal(buildSmartEntryDraft(raw({ intent: "unknown" }), resources, fallbackDate).intent, "unknown");
assert.equal(detectMultipleFinancialActions("Tadi beli kopi 25 ribu pakai GoPay, terus makan 50 ribu pakai BCA."), true);
assert.equal(detectMultipleFinancialActions("Pindahkan 500 ribu dari myBCA ke GoPay."), false);
assert.equal(validateSmartEntryRawDraft({ intent: "expense", amount: "35k" }), null);

console.log("smart entry resolver fixtures: PASS");
