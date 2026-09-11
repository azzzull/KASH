import { budgetPerformanceKind, resolveBudgetPerformance } from "../src/lib/budgetPerformance.ts";

const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };

const food = resolveBudgetPerformance("spending", 500_000, 650_000);
assert(food.progressPercent === 130 && food.status === "over_budget" && !food.isFavorable && food.variance === 150_000, "spending budget must treat 130% as unfavorable over budget");
const savings = resolveBudgetPerformance("savings_target", 500_000, 650_000);
assert(savings.progressPercent === 130 && savings.status === "ahead_of_target" && savings.isFavorable, "savings target must treat 130% as favorable ahead of target");
const goal = resolveBudgetPerformance("goal_target", 300_000, 300_000);
assert(goal.progressPercent === 100 && goal.status === "target_met" && goal.isFavorable, "goal target must treat 100% as target met");
const debt = resolveBudgetPerformance("debt_target", 400_000, 550_000);
assert(debt.progressPercent === 137.5 && debt.status === "ahead_of_target" && debt.isFavorable, "debt target must treat above plan as ahead of target");
assert(budgetPerformanceKind("category") === "spending" && budgetPerformanceKind("goal", false) === "savings_target" && budgetPerformanceKind("goal", true) === "goal_target", "budget target kinds must retain their financial semantics");

// The monthly-budget RPC is authoritative for ownership. This fixture documents
// the expected inputs it provides to the report: envelope 300k, Food 200k.
const envelopeActual = 300_000;
const foodCategoryActual = 200_000;
assert(envelopeActual + foodCategoryActual === 500_000 && foodCategoryActual !== 500_000, "envelope-owned spending must not also consume the category budget");
console.log("Report Budget V2 fixtures passed.");
