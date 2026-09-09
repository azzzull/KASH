import { buildCategoryBreakdown, buildSpendingBreakdown, filterSpendingDrilldown, type SpendingTransaction } from "../src/lib/spendingBreakdown.ts";

const categories = [
  { id: "food", name: "Food" },
  { id: "transport", name: "Transport" },
];
const envelopes = [{ id: "date", name: "Date" }, { id: "holiday", name: "Holiday" }];
const transactions: SpendingTransaction[] = [
  { amount: "100000", category_id: "food", envelope_id: null, status: "completed", type: "expense" },
  { amount: "300000", category_id: "food", envelope_id: "date", status: "completed", type: "expense" },
  { amount: "200000", category_id: "transport", envelope_id: "date", status: "completed", type: "expense" },
  { amount: "150000", category_id: "transport", envelope_id: null, status: "completed", type: "expense" },
  // External transfers are expenses: their principal belongs in the category total.
  { amount: "50000", category_id: "food", envelope_id: null, status: "completed", type: "expense" },
  { amount: "99000", category_id: "food", envelope_id: null, status: "void", type: "expense" },
  { amount: "2500", category_id: "food", envelope_id: null, status: "completed", type: "transfer" },
];

const hybrid = buildSpendingBreakdown(transactions, { categories, envelopes });
const category = buildCategoryBreakdown(transactions, { categories, envelopes });
const asMap = (items: typeof hybrid) => new Map(items.map((item) => [`${item.groupType}:${item.groupId}`, item.amount]));
const hybridTotals = asMap(hybrid);
const categoryTotals = asMap(category);
const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };

assert(hybridTotals.get("envelope:date") === 500000, "hybrid envelope total must include both categories once");
assert(hybridTotals.get("category:food") === 150000 && hybridTotals.get("category:transport") === 150000, "hybrid categories must exclude envelope transactions while retaining external-transfer principal");
assert(categoryTotals.get("category:food") === 450000 && categoryTotals.get("category:transport") === 350000, "pure category totals must include envelope transactions");
assert(hybrid.reduce((sum, item) => sum + item.amount, 0) === 800000, "hybrid total must reconcile");
assert(category.reduce((sum, item) => sum + item.amount, 0) === 800000, "category total must reconcile");
assert(filterSpendingDrilldown(transactions, { mode: "hybrid", groupType: "envelope", groupId: "date" }).reduce((sum, item) => sum + Number(item.amount), 0) === 500000, "envelope drill-down must reconcile");
assert(filterSpendingDrilldown(transactions, { mode: "hybrid", groupType: "category", groupId: "food" }).reduce((sum, item) => sum + Number(item.amount), 0) === 150000, "hybrid category drill-down must exclude envelopes");
assert(filterSpendingDrilldown(transactions, { mode: "category", groupType: "category", groupId: "food" }).reduce((sum, item) => sum + Number(item.amount), 0) === 450000, "pure category drill-down must include envelopes");
console.log("Spending breakdown fixtures passed.");
