export type BudgetPerformanceKind = "spending" | "savings_target" | "goal_target" | "debt_target";
export type BudgetPerformanceStatus = "within_budget" | "on_budget" | "over_budget" | "below_target" | "target_met" | "ahead_of_target";

export type BudgetPerformance = {
  actual: number;
  planned: number;
  variance: number;
  progressPercent: number;
  performanceDirection: "maximum" | "minimum";
  status: BudgetPerformanceStatus;
  isFavorable: boolean;
};

/** Resolves report-facing semantics; positive variance is not universally good. */
export function resolveBudgetPerformance(kind: BudgetPerformanceKind, planned: number, actual: number): BudgetPerformance {
  const safePlanned = Math.max(0, planned);
  const safeActual = Math.max(0, actual);
  const variance = safeActual - safePlanned;
  const progressPercent = safePlanned > 0 ? safeActual / safePlanned * 100 : 0;
  if (kind === "spending") {
    const status = variance < 0 ? "within_budget" : variance === 0 ? "on_budget" : "over_budget";
    return { actual: safeActual, planned: safePlanned, variance, progressPercent, performanceDirection: "maximum", status, isFavorable: status !== "over_budget" };
  }
  const status = variance < 0 ? "below_target" : variance === 0 ? "target_met" : "ahead_of_target";
  return { actual: safeActual, planned: safePlanned, variance, progressPercent, performanceDirection: "minimum", status, isFavorable: status !== "below_target" };
}

export function budgetPerformanceKind(targetType: "category" | "envelope" | "debt" | "goal", hasGoal = false): BudgetPerformanceKind {
  if (targetType === "category" || targetType === "envelope") return "spending";
  if (targetType === "debt") return "debt_target";
  return hasGoal ? "goal_target" : "savings_target";
}
