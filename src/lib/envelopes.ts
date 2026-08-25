import type { Envelope, MoneyAmount } from "../types/domain";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "./money";
import { getActiveSpaceId } from "./spaces";
import { supabase } from "./supabase";

export type CreateEnvelopeInput = {
  name: string;
  icon?: string | null;
  color?: string | null;
  targetAmount?: string | null;
  note?: string | null;
};

export type UpdateEnvelopeInput = {
  name: string;
  icon?: string | null;
  color?: string | null;
  targetAmount?: string | null;
  note?: string | null;
  isArchived?: boolean;
};

export async function getEnvelopes(includeArchived = false, spaceId?: string): Promise<{ data: Envelope[] | null; error: Error | null }> {
  try {
    const targetSpaceId = spaceId ?? getActiveSpaceId();
    let query = supabase
      .from("envelopes")
      .select("*")
      .order("name", { ascending: true });

    if (targetSpaceId) {
      query = query.eq("space_id", targetSpaceId);
    }

    if (!includeArchived) {
      query = query.eq("is_archived", false);
    }

    const { data, error } = await query;
    if (error) throw error;

    return { data: (data ?? []) as Envelope[], error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function getEnvelopeById(id: string): Promise<{ data: Envelope | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("envelopes")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return { data: data as Envelope, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function createEnvelope(input: CreateEnvelopeInput, spaceId?: string): Promise<{ data: Envelope | null; error: Error | null }> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const targetSpaceId = spaceId ?? getActiveSpaceId() ?? undefined;
    const rawTarget = input.targetAmount ? parseMoneyInputDigits(input.targetAmount) : null;
    const numTarget = rawTarget ? toNumber(rawTarget) : null;

    const { data, error } = await supabase
      .from("envelopes")
      .insert({
        user_id: user.id,
        space_id: targetSpaceId,
        name: input.name.trim(),
        icon: input.icon ?? "layers",
        color: input.color ?? "#10B981",
        target_amount: numTarget && numTarget > 0 ? rawTarget : null,
        note: input.note?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;
    return { data: data as Envelope, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function updateEnvelope(id: string, input: UpdateEnvelopeInput): Promise<{ data: Envelope | null; error: Error | null }> {
  try {
    const rawTarget = input.targetAmount ? parseMoneyInputDigits(input.targetAmount) : null;
    const numTarget = rawTarget ? toNumber(rawTarget) : null;

    const { data, error } = await supabase
      .from("envelopes")
      .update({
        name: input.name.trim(),
        icon: input.icon,
        color: input.color,
        target_amount: numTarget && numTarget > 0 ? rawTarget : null,
        note: input.note?.trim() || null,
        is_archived: input.isArchived ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return { data: data as Envelope, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function deleteEnvelope(id: string): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase.from("envelopes").delete().eq("id", id);
    if (error) throw error;
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err };
  }
}

export type EnvelopeCategoryBreakdownItem = {
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  categoryColor: string | null;
  totalSpent: number;
  transactionCount: number;
  percentage: number;
};

export type EnvelopeMonthlyAnalytics = {
  envelope: Envelope;
  periodStart: string; // YYYY-MM-DD
  totalSpent: number;
  transactionCount: number;
  categoryBreakdown: EnvelopeCategoryBreakdownItem[];
  transactions: any[];
  activeBudget: any | null;
};

/**
 * Fetch monthly analytics and dynamic category breakdown for an envelope.
 */
export async function getEnvelopeMonthlyAnalytics(
  envelopeId: string,
  periodStart?: string,
): Promise<EnvelopeMonthlyAnalytics | null> {
  const normPeriod = periodStart
    ? `${periodStart.substring(0, 7)}-01`
    : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;

  const [year, month] = normPeriod.split("-").map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  // 1. Fetch envelope definition
  const { data: envelope, error: envError } = await getEnvelopeById(envelopeId);
  if (envError || !envelope) return null;

  // 2. Fetch all completed expense transactions tagged with this envelope in the month
  const { data: txs, error: txError } = await supabase
    .from("transactions")
    .select("*, category:categories(*), wallet:wallets!wallet_id(*)")
    .eq("envelope_id", envelopeId)
    .eq("type", "expense")
    .eq("status", "completed")
    .gte("transaction_date", `${normPeriod}T00:00:00`)
    .lt("transaction_date", `${endDate}T00:00:00`)
    .order("transaction_date", { ascending: false });

  if (txError) throw txError;

  const transactionList = txs ?? [];
  const totalSpent = transactionList.reduce((acc, t) => acc + toNumber(t.amount), 0);

  // 3. Dynamically group and derive category breakdown
  const categoryMap = new Map<
    string,
    {
      categoryId: string;
      categoryName: string;
      categoryIcon: string | null;
      categoryColor: string | null;
      totalSpent: number;
      transactionCount: number;
    }
  >();

  for (const t of transactionList) {
    const rawTx = t as any;
    const catId = rawTx.category_id || "__uncategorized__";
    const catName = rawTx.category?.name || "Tanpa Kategori";
    const catIcon = rawTx.category?.icon || "tag";
    const catColor = rawTx.category?.color || "#91A3BB";
    const amount = toNumber(rawTx.amount);

    const existing = categoryMap.get(catId);
    if (existing) {
      existing.totalSpent += amount;
      existing.transactionCount += 1;
    } else {
      categoryMap.set(catId, {
        categoryId: catId,
        categoryName: catName,
        categoryIcon: catIcon,
        categoryColor: catColor,
        totalSpent: amount,
        transactionCount: 1,
      });
    }
  }

  const categoryBreakdown: EnvelopeCategoryBreakdownItem[] = Array.from(categoryMap.values())
    .map((item) => ({
      ...item,
      percentage: totalSpent > 0 ? (item.totalSpent / totalSpent) * 100 : 0,
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent);

  // 4. Check if there is an active Envelope Budget for this period
  let activeBudget: any | null = null;
  try {
    const { data: budgetData } = await supabase.rpc("get_monthly_budget_progress" as any, {
      p_period_start: normPeriod,
      p_space_id: envelope.space_id ?? getActiveSpaceId() ?? null,
    });
    if (budgetData && Array.isArray(budgetData)) {
      activeBudget = budgetData.find(
        (b: any) => b.target_type === "envelope" && b.envelope_id === envelopeId
      ) || null;
    }
  } catch (err) {
    console.warn("Could not check active budget for envelope:", err);
  }

  return {
    envelope,
    periodStart: normPeriod,
    totalSpent,
    transactionCount: transactionList.length,
    categoryBreakdown,
    transactions: transactionList,
    activeBudget,
  };
}
