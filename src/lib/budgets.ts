import type {
  BudgetWithProgress,
  MonthlyBudgetOverview,
  Transaction,
} from "../types/domain";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "./money";
import { supabase } from "./supabase";

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
  categoryIds: string[];
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
  categoryIds?: string[];
};

/**
 * Fetch all active budgets and envelope allocations with authoritative progress for the requested month.
 */
export async function getMonthlyBudgets(periodStart?: string): Promise<BudgetWithProgress[]> {
  const { data, error } = await supabase.rpc("get_monthly_budget_progress" as any, {
    p_period_start: periodStart || null,
  });

  if (error) throw error;

  const rows = (data as any[]) ?? [];

  return rows.map((row: any) => ({
    budget_id: row.budget_id,
    name: row.name,
    type: row.type,
    category_id: row.category_id,
    category_name: row.category_name,
    category_icon: row.category_icon,
    category_color: row.category_color,
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
  }));
}

/**
 * Fetch monthly overview aggregate totals (Total Budget, Spent, Remaining, Usage %).
 */
export async function getMonthlyBudgetOverview(periodStart?: string): Promise<MonthlyBudgetOverview> {
  const { data, error } = await supabase.rpc("get_monthly_budget_overview" as any, {
    p_period_start: periodStart || null,
  });

  if (error) throw error;

  const rows = (data as any[]) ?? [];
  const row = rows[0] || {};

  return {
    period_start: row.period_start ?? (periodStart || ""),
    total_budget: toNumber(row.total_budget ?? 0),
    total_spent: toNumber(row.total_spent ?? 0),
    total_remaining: toNumber(row.total_remaining ?? 0),
    overall_usage_percentage: Number(row.overall_usage_percentage) || 0,
    total_budgets_count: Number(row.total_budgets_count) || 0,
    healthy_count: Number(row.healthy_count) || 0,
    near_limit_count: Number(row.near_limit_count) || 0,
    over_budget_count: Number(row.over_budget_count) || 0,
  };
}

/**
 * Fetch single budget detail by ID for a specific month with multi-tier fallback.
 */
export async function getBudgetDetail(
  budgetId: string,
  periodStart?: string,
): Promise<BudgetWithProgress | null> {
  const normPeriod = periodStart
    ? `${periodStart.substring(0, 7)}-01`
    : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;

  // 1. Try finding in the specified month's progress RPC
  try {
    const list = await getMonthlyBudgets(normPeriod);
    const found = list.find((b) => b.budget_id === budgetId);
    if (found) return found;
  } catch (err) {
    console.warn("getMonthlyBudgets RPC error in getBudgetDetail:", err);
  }

  // 2. Fallback: Query budget record directly from database
  const { data: budgetRow, error: budgetError } = await supabase
    .from("budgets")
    .select("*, category:categories(*)")
    .eq("id", budgetId)
    .maybeSingle();

  if (budgetError || !budgetRow) {
    return null;
  }

  // If budget start_period is different from requested month, try fetching with its start_period
  if (budgetRow.start_period && budgetRow.start_period !== normPeriod) {
    try {
      const fallbackList = await getMonthlyBudgets(budgetRow.start_period);
      const foundInStart = fallbackList.find((b) => b.budget_id === budgetId);
      if (foundInStart) return foundInStart;
    } catch {
      // Continue to direct build
    }
  }

  // 3. Direct Construction Fallback: Fetch latest version & category mappings
  const [{ data: versionRows }, { data: envelopeCategories }] = await Promise.all([
    supabase
      .from("budget_versions")
      .select("*")
      .eq("budget_id", budgetId)
      .order("effective_from_period", { ascending: false })
      .limit(1),
    budgetRow.type === "envelope"
      ? supabase
          .from("budget_envelope_categories")
          .select("category_id, category:categories(id, name)")
          .eq("envelope_id", budgetId)
      : Promise.resolve({ data: [] }),
  ]);

  const latestVersion = versionRows?.[0];
  const baseAmount = latestVersion ? toNumber(latestVersion.amount) : 0;
  const rolloverEnabled = Boolean(latestVersion?.rollover_enabled);

  const includedCategoryIds: string[] =
    budgetRow.type === "category"
      ? budgetRow.category_id
        ? [budgetRow.category_id]
        : []
      : ((envelopeCategories as any[]) ?? []).map((ec) => ec.category_id);

  const includedCategoryNames: string[] =
    budgetRow.type === "category"
      ? (budgetRow as any).category?.name
        ? [(budgetRow as any).category.name]
        : []
      : ((envelopeCategories as any[]) ?? []).map((ec) => ec.category?.name).filter(Boolean);

  // Compute spending for this month
  const startDate = `${normPeriod.substring(0, 7)}-01`;
  const [year, month] = startDate.split("-").map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  let spent = 0;
  if (includedCategoryIds.length > 0) {
    const { data: txRows } = await supabase
      .from("transactions")
      .select("amount")
      .eq("type", "expense")
      .eq("status", "completed")
      .in("category_id", includedCategoryIds)
      .gte("transaction_date", `${startDate}T00:00:00`)
      .lt("transaction_date", `${endDate}T00:00:00`);

    spent = (txRows ?? []).reduce((acc, row) => acc + toNumber(row.amount), 0);
  }

  const effectiveBudget = baseAmount;
  const remaining = effectiveBudget - spent;
  const usagePercentage = effectiveBudget > 0 ? (spent / effectiveBudget) * 100 : 0;
  const status =
    spent >= effectiveBudget && effectiveBudget > 0
      ? "over_budget"
      : effectiveBudget > 0 && spent / effectiveBudget >= 0.8
      ? "near_limit"
      : "healthy";

  return {
    budget_id: budgetRow.id,
    name: budgetRow.name,
    type: budgetRow.type,
    category_id: budgetRow.category_id,
    category_name: (budgetRow as any).category?.name ?? null,
    category_icon: (budgetRow as any).category?.icon ?? null,
    category_color: (budgetRow as any).category?.color ?? null,
    note: budgetRow.note,
    repeat_monthly: budgetRow.repeat_monthly,
    start_period: budgetRow.start_period,
    end_period: budgetRow.end_period,
    base_amount: baseAmount,
    rollover_enabled: rolloverEnabled,
    rollover_amount: 0,
    effective_budget: effectiveBudget,
    spent,
    remaining,
    usage_percentage: usagePercentage,
    status,
    included_category_ids: includedCategoryIds,
    included_category_names: includedCategoryNames,
  };
}

/**
 * Create a new Category Budget.
 */
export async function createCategoryBudget(input: CreateCategoryBudgetInput): Promise<string> {
  const rawAmount = parseMoneyInputDigits(input.amount);
  const amountNumber = toNumber(rawAmount);

  if (amountNumber <= 0) {
    throw new Error("Nominal anggaran harus lebih dari 0.");
  }

  const { data, error } = await supabase.rpc("create_category_budget" as any, {
    p_name: input.name.trim(),
    p_category_id: input.categoryId,
    p_amount: amountNumber,
    p_start_period: input.startPeriod,
    p_repeat_monthly: input.repeatMonthly ?? true,
    p_rollover_enabled: input.rolloverEnabled ?? false,
    p_note: input.note?.trim() || null,
  });

  if (error) throw error;
  return data as string;
}

/**
 * Create a new Envelope Budget with multiple expense categories.
 */
export async function createEnvelopeBudget(input: CreateEnvelopeBudgetInput): Promise<string> {
  const rawAmount = parseMoneyInputDigits(input.amount);
  const amountNumber = toNumber(rawAmount);

  if (amountNumber <= 0) {
    throw new Error("Nominal anggaran amplop harus lebih dari 0.");
  }
  if (!input.categoryIds || input.categoryIds.length === 0) {
    throw new Error("Pilih minimal satu kategori pengeluaran untuk amplop.");
  }

  const { data, error } = await supabase.rpc("create_envelope_budget" as any, {
    p_name: input.name.trim(),
    p_category_ids: input.categoryIds,
    p_amount: amountNumber,
    p_start_period: input.startPeriod,
    p_repeat_monthly: input.repeatMonthly ?? true,
    p_rollover_enabled: input.rolloverEnabled ?? false,
    p_note: input.note?.trim() || null,
  });

  if (error) throw error;
  return data as string;
}

/**
 * Update budget metadata, amount version, or envelope categories.
 */
export async function updateBudget(budgetId: string, input: UpdateBudgetInput): Promise<boolean> {
  let parsedAmount: number | null = null;
  if (input.amount !== undefined) {
    const raw = parseMoneyInputDigits(input.amount);
    parsedAmount = toNumber(raw);
  }

  const { data, error } = await supabase.rpc("update_budget" as any, {
    p_budget_id: budgetId,
    p_name: input.name.trim(),
    p_note: input.note?.trim() || null,
    p_effective_period: input.effectivePeriod,
    p_amount: parsedAmount,
    p_rollover_enabled: input.rolloverEnabled ?? null,
    p_category_ids: input.categoryIds ?? null,
  });

  if (error) throw error;
  return Boolean(data);
}

/**
 * Archive / End a budget period.
 */
export async function archiveBudget(budgetId: string, endPeriod: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("archive_budget" as any, {
    p_budget_id: budgetId,
    p_end_period: endPeriod,
  });

  if (error) throw error;
  return Boolean(data);
}

/**
 * Permanently delete a budget definition.
 */
export async function deleteBudget(budgetId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("delete_budget" as any, {
    p_budget_id: budgetId,
  });

  if (error) throw error;
  return Boolean(data);
}

/**
 * Fetch matching expense transactions for a budget in a specific month.
 */
export async function getBudgetMatchingTransactions(
  budgetId: string,
  periodStart: string,
): Promise<Transaction[]> {
  const budget = await getBudgetDetail(budgetId, periodStart);
  if (!budget || !budget.included_category_ids || budget.included_category_ids.length === 0) {
    return [];
  }

  // Calculate local month start and end
  const startDate = `${periodStart.substring(0, 7)}-01`;
  const [year, month] = periodStart.split("-").map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const { data, error } = await supabase
    .from("transactions")
    .select("*, category:categories(*), wallet:wallets(*)")
    .eq("type", "expense")
    .eq("status", "completed")
    .in("category_id", budget.included_category_ids)
    .gte("transaction_date", `${startDate}T00:00:00`)
    .lt("transaction_date", `${endDate}T00:00:00`)
    .order("transaction_date", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as Transaction[];
}
