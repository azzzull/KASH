import assert from "node:assert/strict";
import {
  buildSmartEntryDraft,
  detectMultipleFinancialActions,
  parseLocalSmartEntry,
  parseRupiahAmount,
  validateSmartEntryRawDraft,
  type SmartEntryParserContext,
  type SmartEntryRawDraft,
  type SmartEntryResources,
} from "../src/lib/smartEntry.ts";

const resources: SmartEntryResources = {
  categories: [
    { id: "food", kind: "expense", name: "Food & Drink" },
    { id: "transport", kind: "expense", name: "Transportation" },
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
    { id: "blu", name: "Blu" },
    { id: "cash", name: "Cash" },
  ],
};

function raw(overrides: Partial<SmartEntryRawDraft>): SmartEntryRawDraft {
  return {
    amount: null,
    category: null,
  clarification: null,
    confidence: {},
    counterparty: null,
    description: "Test entry",
    destinationWallet: null,
    envelope: null,
    expenseContext: null,
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
const parserContext: SmartEntryParserContext = {
  activeSpace: null,
  categories: resources.categories.map((item) => item.name),
  contextDate: fallbackDate,
  envelopes: resources.envelopes.map((item) => item.name),
  locale: "id",
  managedSpaces: resources.managedSpaces.map((item) => item.name),
  obligations: resources.obligations.map((item) => ({
    counterpartyName: item.counterpartyName,
    title: item.title,
    type: item.type,
  })),
  timezone: "Asia/Jakarta",
  wallets: resources.wallets.map((item) => item.name),
};

// 1–4: transaction intents route only to typed, existing transaction services.
let draft = buildSmartEntryDraft(raw({ amount: 35_000, category: "Food & Drink", intent: "expense", wallet: "myBCA" }), resources, fallbackDate);
assert.deepEqual({ amount: draft.amount, category: draft.categoryId, wallet: draft.walletId, missing: draft.missingFields }, { amount: 35_000, category: "food", wallet: "bca", missing: [] });
draft = buildSmartEntryDraft(raw({ amount: 35_000, category: "Food & Drink", counterparty: "PT KASH", expenseContext: "reimbursable", intent: "expense", wallet: "myBCA" }), resources, fallbackDate);
assert.deepEqual({ context: draft.expenseContext, counterparty: draft.counterparty, missing: draft.missingFields }, { context: "reimbursable", counterparty: "PT KASH", missing: [] });
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

// 19–25: hybrid local parser — no network or provider credential is involved.
assert.equal(parseRupiahAmount("35rb").amount, 35_000);
assert.equal(parseRupiahAmount("Rp35.000").amount, 35_000);
assert.equal(parseRupiahAmount("1,5 juta").amount, 1_500_000);
assert.equal(parseRupiahAmount("35").ambiguous, true);
assert.deepEqual(parseRupiahAmount("makan bakso 1 porsi harga 15 ribu"), { amount: 15_000, ambiguous: false });

const detailedMeal = parseLocalSmartEntry("Tadi saya makan bakso 1 porsi dengan harga 15 ribu menggunakan bca", parserContext, resources);
assert.deepEqual(
  { amount: detailedMeal.draft.amount, description: detailedMeal.draft.description, wallet: detailedMeal.draft.wallet },
  { amount: 15_000, description: "makan bakso 1 porsi", wallet: "myBCA" },
);

for (const phrase of [
  "tadi makan 35rb pake gopay",
  "makan siang 35 ribu bayar gopay",
  "keluar 35k buat makan dari gopay",
  "gue tadi makan nasi goreng 35000 pake gopay",
]) {
  const result = parseLocalSmartEntry(phrase, parserContext, resources);
  assert.deepEqual(
    { amount: result.draft.amount, category: result.draft.category, intent: result.draft.intent, wallet: result.draft.wallet },
    { amount: 35_000, category: "Food & Drink", intent: "expense", wallet: "GoPay" },
  );
  assert.equal(result.shouldUseAiFallback, false);
}

for (const phrase of [
  "dapet freelance 750rb masuk mybca",
  "freelance masuk 750 ribu ke mybca",
  "client bayar aku 750k ke mybca",
]) {
  const result = parseLocalSmartEntry(phrase, parserContext, resources);
  assert.deepEqual(
    { amount: result.draft.amount, intent: result.draft.intent, wallet: result.draft.wallet },
    { amount: 750_000, intent: "income", wallet: "myBCA" },
  );
  assert.equal(result.shouldUseAiFallback, false);
}

for (const phrase of [
  "pindahin 500rb dari mybca ke gopay",
  "transfer 500 ribu mybca ke gopay",
  "500k dari mybca masukin ke gopay",
]) {
  const result = parseLocalSmartEntry(phrase, parserContext, resources);
  assert.deepEqual(
    { amount: result.draft.amount, destination: result.draft.destinationWallet, intent: result.draft.intent, source: result.draft.sourceWallet },
    { amount: 500_000, destination: "GoPay", intent: "internal_transfer", source: "myBCA" },
  );
  assert.equal(result.shouldUseAiFallback, false);
}

const reverseTransfer = parseLocalSmartEntry("pindahin 500rb dari gopay ke mybca", parserContext, resources);
assert.deepEqual(
  { destination: reverseTransfer.draft.destinationWallet, source: reverseTransfer.draft.sourceWallet },
  { destination: "myBCA", source: "GoPay" },
);

assert.equal(parseLocalSmartEntry("aku pinjam 500rb dari Dimas", parserContext, resources).draft.intent, "debt_borrow");
assert.equal(parseLocalSmartEntry("Dimas minjem 500rb dari aku", parserContext, resources).draft.intent, "receivable_lend");
assert.equal(parseLocalSmartEntry("aku bayar utang Dimas 200rb", parserContext, resources).draft.intent, "debt_payment");
assert.equal(parseLocalSmartEntry("Dimas balikin utang 150rb", parserContext, resources).draft.intent, "receivable_collection");
assert.equal(parseLocalSmartEntry("aku pinjam Dimas 500rb", parserContext, resources).draft.clarification, "pinjam_direction");
assert.equal(parseLocalSmartEntry("makan 35 pake gopay", parserContext, resources).draft.clarification, "amount_ambiguous");
assert.deepEqual(
  (() => { const result = parseLocalSmartEntry("transport pake KRL aja", parserContext, resources); return { category: result.draft.category, intent: result.draft.intent, amount: result.draft.amount }; })(),
  { category: "Transportation", intent: "expense", amount: null },
);
assert.deepEqual(
  (() => { const result = parseLocalSmartEntry("meeting kantor 120rb pake myBCA", parserContext, resources); return { context: result.draft.expenseContext, intent: result.draft.intent }; })(),
  { context: "work", intent: "expense" },
);
assert.deepEqual(
  (() => { const result = parseLocalSmartEntry("beli makan 120rb pake myBCA nanti direimburse PT KASH", parserContext, resources); return { context: result.draft.expenseContext, intent: result.draft.intent }; })(),
  { context: "reimbursable", intent: "expense" },
);
assert.equal(
  parseLocalSmartEntry("kemarin habis kantor aku nombokin kabel buat teknisi 275rb pake BCA yang biasa, katanya nanti diganti bos", parserContext, resources).shouldUseAiFallback,
  true,
);

console.log("smart entry resolver fixtures: PASS");
