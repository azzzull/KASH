import type {
  BudgetTargetType,
  BudgetType,
  BudgetWithProgress,
  MonthlyBudgetOverview,
  Transaction,
} from "../types/domain";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "./money";
import { getActiveSpaceId } from "./spaces";
import { supabase } from "./supabase";

export type CreateBudgetTargetInput = {
  name: string;
  targetType: BudgetTargetType;
  amount: string;
  startPeriod: string; // YYYY-MM-DD
  repeatMonthly?: boolean;
  rolloverEnabled?: boolean;
  categoryId?: string | null;
  envelopeId?: string | null;
  counterpartyId?: string | null;
  debtId?: string | null;
  goalId?: string | null;
  walletId?: string | null;
  note?: string | null;
};

export type CreateCategoryBudgetInput = {
  name: string;
  categoryId: string;
  amount: string;
  startPeriod: string; // YYYY-MM-DD
  repeatMonthly?: boolean;
  rolloverEnabled?: boolean;
  note?: string | null;
};

export type CreateEnvelopeBudgetInput = {
  name: string;
  envelopeId?: string;
  categoryIds?: string[];
  amount: string;
  startPeriod: string; // YYYY-MM-DD
  repeatMonthly?: boolean;
  rolloverEnabled?: boolean;
  note?: string | null;
};

export type UpdateBudgetInput = {
  name: string;
  note?: string | null;
  effectivePeriod: string; // YYYY-MM-DD
  amount?: string;
  rolloverEnabled?: boolean;
};

/**
 * Fetch monthly budgets with enriched progress and spending breakdown.
 */
export async function getMonthlyBudgets(periodStart?: string, spaceId?: string): Promise<BudgetWithProgress[]> {
  const targetSpaceId = spaceId ?? getActiveSpaceId() ?? null;
  const { data, error } = await supabase.rpc("get_monthly_budget_progress", {
    p_period_start: periodStart ?? null,
    p_space_id: targetSpaceId,
  });

  if (error) {
    console.error("Failed to fetch monthly budget progress:", error);
    return [];
  }

  const rows = (data as any[]) ?? [];

  return rows.map((row: any) => ({
    budget_id: row.budget_id,
    name: row.name,
    type: row.type,
    target_type: row.target_type ?? (row.type === "envelope" ? "envelope" : "category"),
    category_id: row.category_id,
    category_name: row.category_name,
    category_icon: row.category_icon,
    category_color: row.category_color,
    envelope_id: row.envelope_id,
    envelope_name: row.envelope_name,
    envelope_icon: row.envelope_icon ?? null,
    envelope_color: row.envelope_color ?? null,
    counterparty_id: row.counterparty_id,
    counterparty_name: row.counterparty_name,
    debt_id: row.debt_id,
    debt_title: row.debt_title,
    goal_id: row.goal_id,
    goal_name: row.goal_name,
    goal_icon: row.goal_icon ?? null,
    wallet_id: row.wallet_id ?? null,
    wallet_name: row.wallet_name ?? null,
    wallet_icon: row.wallet_icon ?? null,
    wallet_color: row.wallet_color ?? null,
    note: row.note,
    repeat_monthly: row.repeat_monthly,
    start_period: row.start_period,
    end_period: row.end_period,
    base_amount: toNumber(row.base_amount),
    rollover_enabled: row.rollover_enabled,
    rollover_amount: toNumber(row.rollover_amount),
    effective_budget: toNumber(row.effective_budget),
    spent: toNumber(row.spent),
    remaining: toNumber(row.remaining),
    usage_percentage: Number(row.usage_percentage) || 0,
    status: row.status,
    included_category_ids: row.included_category_ids ?? [],
    included_category_names: row.included_category_names ?? [],
  })).sort((first, second) => {
    // Surface budgets that need attention first, consistently on the Budget page
    // and in dashboard highlights. The raw percentage can exceed 100% when
    // overspent, which correctly keeps those budgets above all others.
    const usageDifference = second.usage_percentage - first.usage_percentage;
    if (usageDifference !== 0) return usageDifference;

    // When usage is equal, prioritize the larger actual realization instead of
    // falling back to an alphabetical name order.
    return second.spent - first.spent;
  });
}

/**
 * Fetch monthly overview aggregate totals (Unified Monthly Financial Plan with Zero Cross-Budget Double-Counting).
 */
export async function getMonthlyBudgetOverview(periodStart?: string, spaceId?: string): Promise<MonthlyBudgetOverview> {
  const targetSpaceId = spaceId ?? getActiveSpaceId() ?? null;
  const { data, error } = await supabase.rpc("get_monthly_budget_overview" as any, {
    p_period_start: periodStart || null,
    p_space_id: targetSpaceId,
  });

  if (error) throw error;

  const raw = data as any;
  const row = Array.isArray(raw) ? (raw[0] || {}) : (raw || {});

  const totalAllocated = toNumber(row.total_allocated ?? row.total_budget ?? 0);
  const actualExpenses = toNumber(row.actual_expenses ?? row.total_spent ?? 0);
  const actualDebtPayments = toNumber(row.actual_debt_payments ?? 0);
  const actualGoalContributions = toNumber(row.actual_goal_contributions ?? 0);
  const totalActualCashOutflow = toNumber(row.total_actual_cash_outflow ?? (actualExpenses + actualDebtPayments + actualGoalContributions));
  const totalEconomicRealization = toNumber(row.total_economic_realization ?? totalActualCashOutflow);
  const remainingAllocation = toNumber(row.remaining_allocation ?? Math.max(totalAllocated - totalActualCashOutflow, 0));

  return {
    period_start: row.period_start ?? (periodStart || ""),
    total_allocated: totalAllocated,
    total_category_budget: toNumber(row.total_category_budget ?? 0),
    total_envelope_budget: toNumber(row.total_envelope_budget ?? 0),
    total_debt_budget: toNumber(row.total_debt_budget ?? 0),
    total_goal_budget: toNumber(row.total_goal_budget ?? 0),
    actual_expenses: actualExpenses,
    actual_debt_payments: actualDebtPayments,
    actual_goal_contributions: actualGoalContributions,
    total_actual_cash_outflow: totalActualCashOutflow,
    total_economic_realization: totalEconomicRealization,
    remaining_allocation: remainingAllocation,
    overall_usage_percentage: Number(row.overall_usage_percentage) || 0,
    budget_count: Number(row.budget_count ?? row.total_budgets_count) || 0,
    healthy_count: Number(row.healthy_count) || 0,
    near_limit_count: Number(row.near_limit_count) || 0,
    over_budget_count: Number(row.over_budget_count) || 0,
    // Aliases for backwards compatibility
    total_budget: totalAllocated,
    total_spent: totalActualCashOutflow,
    total_remaining: remainingAllocation,
    total_budgets_count: Number(row.budget_count ?? row.total_budgets_count) || 0,
  };
}

/**
 * Fetch single budget detail by ID for a specific month.
 */
export async function getBudgetDetail(
  budgetId: string,
  periodStart?: string,
  spaceId?: string,
): Promise<BudgetWithProgress | null> {
  const targetSpaceId = spaceId ?? getActiveSpaceId() ?? null;
  const normPeriod = periodStart
    ? `${periodStart.substring(0, 7)}-01`
    : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;

  try {
    const list = await getMonthlyBudgets(normPeriod, targetSpaceId ?? undefined);
    const found = list.find((b) => b.budget_id === budgetId);
    if (found) return found;
  } catch (err) {
    console.warn("getMonthlyBudgets RPC error in getBudgetDetail:", err);
  }

  // Fallback direct fetch
  const { data: budgetRow, error: budgetError } = await supabase
    .from("budgets")
    .select("*, category:categories(*), envelope:envelopes(*), counterparty:counterparties(*), debt:debts(*), goal:goals(*), wallet:wallets(*)")
    .eq("id", budgetId)
    .maybeSingle();

  if (budgetError || !budgetRow) return null;

  return {
    budget_id: budgetRow.id,
    name: budgetRow.name,
    type: budgetRow.type,
    target_type: budgetRow.target_type ?? "category",
    category_id: budgetRow.category_id,
    category_name: (budgetRow as any).category?.name ?? null,
    category_icon: (budgetRow as any).category?.icon ?? null,
    category_color: (budgetRow as any).category?.color ?? null,
    envelope_id: budgetRow.envelope_id,
    envelope_name: (budgetRow as any).envelope?.name ?? null,
    envelope_icon: (budgetRow as any).envelope?.icon ?? null,
    envelope_color: (budgetRow as any).envelope?.color ?? null,
    counterparty_id: budgetRow.counterparty_id,
    counterparty_name: (budgetRow as any).counterparty?.name ?? null,
    debt_id: budgetRow.debt_id,
    debt_title: (budgetRow as any).debt?.title ?? null,
    goal_id: budgetRow.goal_id,
    goal_name: (budgetRow as any).goal?.name ?? null,
    goal_icon: (budgetRow as any).goal?.icon ?? null,
    wallet_id: (budgetRow as any).wallet_id ?? null,
    wallet_name: (budgetRow as any).wallet?.name ?? null,
    wallet_icon: (budgetRow as any).wallet?.icon ?? null,
    wallet_color: (budgetRow as any).wallet?.color ?? null,
    note: budgetRow.note,
    repeat_monthly: budgetRow.repeat_monthly,
    start_period: budgetRow.start_period,
    end_period: budgetRow.end_period,
    base_amount: 0,
    rollover_enabled: false,
    rollover_amount: 0,
    effective_budget: 0,
    spent: 0,
    remaining: 0,
    usage_percentage: 0,
    status: "healthy",
    included_category_ids: budgetRow.category_id ? [budgetRow.category_id] : [],
    included_category_names: (budgetRow as any).category?.name ? [(budgetRow as any).category.name] : [],
  };
}

/**
 * Universal Atomic Budget Creator (supports Category, Envelope, Debt, and Goal targets).
 */
export async function createBudgetTarget(input: CreateBudgetTargetInput, spaceId?: string): Promise<string> {
  const targetSpaceId = spaceId ?? getActiveSpaceId() ?? null;
  const rawAmount = parseMoneyInputDigits(input.amount);
  const amountNumber = toNumber(rawAmount);

  if (amountNumber <= 0) {
    throw new Error("Nominal target budget harus lebih dari 0.");
  }

  const { data, error } = await supabase.rpc("create_budget_target" as any, {
    p_name: (input.name || "").trim(),
    p_target_type: input.targetType,
    p_amount: amountNumber,
    p_start_period: input.startPeriod,
    p_repeat_monthly: input.repeatMonthly ?? true,
    p_rollover_enabled: input.rolloverEnabled ?? false,
    p_category_id: input.categoryId || null,
    p_envelope_id: input.envelopeId || null,
    p_counterparty_id: input.counterpartyId || null,
    p_debt_id: input.debtId || null,
    p_goal_id: input.goalId || null,
    p_wallet_id: input.walletId || null,
    p_note: input.note?.trim() || null,
    p_space_id: targetSpaceId,
  });

  if (error) throw error;
  return data as string;
}

/**
 * Create a new Category Budget.
 */
export async function createCategoryBudget(input: CreateCategoryBudgetInput): Promise<string> {
  return createBudgetTarget({
    name: input.name,
    targetType: "category",
    categoryId: input.categoryId,
    amount: input.amount,
    startPeriod: input.startPeriod,
    repeatMonthly: input.repeatMonthly,
    rolloverEnabled: input.rolloverEnabled,
    note: input.note,
  });
}

/**
 * Create a new Envelope Budget.
 */
export async function createEnvelopeBudget(input: CreateEnvelopeBudgetInput): Promise<string> {
  return createBudgetTarget({
    name: input.name,
    targetType: "envelope",
    envelopeId: input.envelopeId,
    amount: input.amount,
    startPeriod: input.startPeriod,
    repeatMonthly: input.repeatMonthly,
    rolloverEnabled: input.rolloverEnabled,
    note: input.note,
  });
}

/**
 * Update budget metadata and amount version.
 */
export async function updateBudget(budgetId: string, input: UpdateBudgetInput): Promise<boolean> {
  let parsedAmount: number | null = null;
  if (input.amount !== undefined) {
    const raw = parseMoneyInputDigits(input.amount);
    parsedAmount = toNumber(raw);
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Unauthorized");

  // 1. Update basic budget metadata
  const { error: budgetUpdateError } = await supabase
    .from("budgets")
    .update({
      name: input.name.trim(),
      note: input.note?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", budgetId);

  if (budgetUpdateError) throw budgetUpdateError;

  // 2. If amount or rollover changed, upsert budget version for the effective month
  if (parsedAmount !== null && parsedAmount > 0) {
    const normPeriod = `${input.effectivePeriod.substring(0, 7)}-01`;
    const { error: versionError } = await supabase
      .from("budget_versions")
      .upsert(
        {
          budget_id: budgetId,
          user_id: user.id,
          effective_from_period: normPeriod,
          amount: parsedAmount,
          rollover_enabled: input.rolloverEnabled ?? false,
        },
        { onConflict: "budget_id,effective_from_period" }
      );

    if (versionError) throw versionError;
  }

  return true;
}

/**
 * Archive / End a budget period.
 */
export async function archiveBudget(budgetId: string, endPeriod: string): Promise<boolean> {
  const normEnd = `${endPeriod.substring(0, 7)}-01`;
  const { error } = await supabase
    .from("budgets")
    .update({
      end_period: normEnd,
      repeat_monthly: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", budgetId);

  if (error) throw error;
  return true;
}

/**
 * Permanently delete a budget definition.
 */
export async function deleteBudget(budgetId: string): Promise<boolean> {
  const { error } = await supabase.from("budgets").delete().eq("id", budgetId);
  if (error) throw error;
  return true;
}

/**
 * Fetch matching financial events for a budget in a specific month (transactions, debt payments, or goal contributions).
 */
export async function getBudgetMatchingTransactions(
  budgetId: string,
  periodStart: string,
): Promise<any[]> {
  const budget = await getBudgetDetail(budgetId, periodStart);
  if (!budget) return [];

  const normPeriod = periodStart
    ? `${periodStart.substring(0, 7)}-01`
    : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;

  const [year, month] = normPeriod.split("-").map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  // 1. Debt Target
  if (budget.target_type === "debt") {
    if (budget.debt_id) {
      const { data: allocations, error: allocErr } = await supabase
        .from("debt_payment_allocations")
        .select("allocated_amount, payment:debt_payments(*, wallet:wallets(*))")
        .eq("debt_id", budget.debt_id)
        .gte("created_at", `${normPeriod}T00:00:00`)
        .lt("created_at", `${endDate}T00:00:00`);

      if (allocErr) throw allocErr;

      return (allocations ?? []).map((a: any) => ({
        id: a.payment?.id || Math.random().toString(),
        title: `Pelunasan: ${budget.debt_title || "Utang"}`,
        amount: a.allocated_amount,
        type: "debt_payment",
        transaction_date: a.payment?.payment_date || a.payment?.created_at,
        note: a.payment?.note,
        wallet: a.payment?.wallet,
        category: { name: "Pelunasan Utang", color: "#F28C45", icon: "hand-coins" },
      }));
    }

    let paymentQuery = supabase
      .from("debt_payments")
      .select("*, counterparty:counterparties(*), wallet:wallets(*)")
      .eq("debt_type", "debt")
      .gte("payment_date", `${normPeriod}T00:00:00`)
      .lt("payment_date", `${endDate}T00:00:00`)
      .order("payment_date", { ascending: false });

    if (budget.counterparty_id) {
      paymentQuery = paymentQuery.eq("counterparty_id", budget.counterparty_id);
    }

    const { data: payments, error } = await paymentQuery;
    if (error) throw error;

    return (payments ?? []).map((p: any) => ({
      id: p.id,
      title: p.counterparty?.name ? `Cicil Utang: ${p.counterparty.name}` : "Pelunasan Utang",
      amount: p.total_amount,
      type: "debt_payment",
      transaction_date: p.payment_date,
      note: p.note,
      wallet: p.wallet,
      category: { name: "Pelunasan Utang", color: "#F28C45", icon: "hand-coins" },
    }));
  }

  // 2. Goal or Savings Pocket Target
  if (budget.target_type === "goal") {
    if (budget.goal_id) {
      const { data: contributions, error } = await supabase
        .from("goal_contributions")
        .select("*, goal:goals(*), wallet:wallets(*)")
        .eq("goal_id", budget.goal_id)
        .gte("contribution_date", `${normPeriod}T00:00:00`)
        .lt("contribution_date", `${endDate}T00:00:00`)
        .order("contribution_date", { ascending: false });

      if (error) throw error;

      return (contributions ?? []).map((gc) => ({
        id: gc.id,
        title: `Alokasi: ${(gc as any).goal?.name || "Tabungan"}`,
        amount: gc.amount,
        type: "goal_contribution",
        transaction_date: gc.contribution_date,
        note: gc.note,
        wallet: (gc as any).wallet,
        category: { name: "Tabungan / Goal", color: "#F5B82E", icon: "piggy-bank" },
      }));
    }

    if (budget.wallet_id) {
      const { data: txs, error } = await supabase
        .from("transactions")
        .select("*, wallet:wallets!wallet_id(*), destination_wallet:wallets!destination_wallet_id(*)")
        .eq("status", "completed")
        .or(`and(type.eq.transfer,destination_wallet_id.eq.${budget.wallet_id}),and(type.eq.income,wallet_id.eq.${budget.wallet_id})`)
        .gte("transaction_date", `${normPeriod}T00:00:00`)
        .lt("transaction_date", `${endDate}T00:00:00`)
        .order("transaction_date", { ascending: false });

      if (error) throw error;

      return (txs ?? []).map((t) => ({
        id: t.id,
        title: t.type === "transfer" ? `Transfer ke ${(t as any).destination_wallet?.name || "Kantong"}` : t.title || "Alokasi Dana",
        amount: t.amount,
        type: t.type,
        transaction_date: t.transaction_date,
        note: t.note,
        wallet: (t as any).destination_wallet || (t as any).wallet,
        category: { name: "Alokasi Kantong Tabungan", color: budget.wallet_color || "#10B981", icon: budget.wallet_icon || "landmark" },
      }));
    }
  }

  // 3. Category or Envelope Target
  let txQuery = supabase
    .from("transactions")
    .select("*, category:categories(*), envelope:envelopes(*), wallet:wallets!wallet_id(*)")
    .eq("type", "expense")
    .eq("status", "completed")
    .gte("transaction_date", `${normPeriod}T00:00:00`)
    .lt("transaction_date", `${endDate}T00:00:00`)
    .order("transaction_date", { ascending: false });

  const effectiveTargetType = budget.target_type ?? (budget.type === "envelope" ? "envelope" : "category");

  if (effectiveTargetType === "category" && budget.category_id) {
    txQuery = txQuery.eq("category_id", budget.category_id).is("envelope_id", null);
  } else if (effectiveTargetType === "envelope" && budget.envelope_id) {
    txQuery = txQuery.eq("envelope_id", budget.envelope_id);
  }

  const { data: txRows, error: txError } = await txQuery;
  if (txError) throw txError;

  return txRows ?? [];
}
