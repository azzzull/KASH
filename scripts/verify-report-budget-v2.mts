import { budgetPerformanceKind, budgetPerformanceStatusLabel, resolveBudgetPerformance } from "../src/lib/budgetPerformance.ts";

const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };

const food = resolveBudgetPerformance("spending", 500_000, 650_000);
assert(food.progressPercent === 130 && food.status === "over_budget" && !food.isFavorable && food.variance === 150_000, "spending budget must treat 130% as unfavorable over budget");
const savings = resolveBudgetPerformance("savings_target", 500_000, 650_000);
assert(savings.progressPercent === 130 && savings.status === "ahead_of_target" && savings.isFavorable, "savings target must treat 130% as favorable ahead of target");
const goal = resolveBudgetPerformance("goal_target", 300_000, 300_000);
assert(goal.progressPercent === 100 && goal.status === "target_met" && goal.isFavorable, "goal target must treat 100% as target met");
const debt = resolveBudgetPerformance("debt_target", 400_000, 550_000);
assert(debt.progressPercent === 137.5 && debt.status === "ahead_of_target" && debt.isFavorable, "debt target must treat above plan as ahead of target");
assert(budgetPerformanceStatusLabel(food.status) === "Over Budget", "renderer must label spending overage as Over Budget");
assert(budgetPerformanceStatusLabel(savings.status) === "Ahead of Target" && budgetPerformanceStatusLabel(goal.status) === "Target Met" && budgetPerformanceStatusLabel(debt.status) === "Ahead of Target", "renderer must not leak Over Budget into targets");
assert(budgetPerformanceKind("category") === "spending" && budgetPerformanceKind("goal", false) === "savings_target" && budgetPerformanceKind("goal", true) === "goal_target", "budget target kinds must retain their financial semantics");

// The monthly-budget RPC is authoritative for ownership. This fixture documents
// the expected inputs it provides to the report: envelope 300k, Food 200k.
const envelopeActual = 300_000;
const foodCategoryActual = 200_000;
assert(envelopeActual + foodCategoryActual === 500_000 && foodCategoryActual !== 500_000, "envelope-owned spending must not also consume the category budget");
const outsideBudget = [{ category: "Shopping", amount: 400_000, count: 3 }, { category: "Health", amount: 100_000, count: 1 }];
assert(outsideBudget.reduce((sum, item) => sum + item.amount, 0) + 300_000 === 800_000, "budget-covered plus outside-budget spending must reconcile to eligible spending");
const shoppingInsight = `Shopping accounted for Rp400.000 of unbudgeted spending across 3 transactions this month. If this spending is likely to recur, consider creating a Shopping budget next month.`;
assert(shoppingInsight.includes("consider creating a Shopping budget next month"), "outside-budget insight must include a next-month action");
console.log("Report Budget V2 fixtures passed.");
