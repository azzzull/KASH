import type { Database } from "../types/database";
import type {
  Counterparty,
  Debt,
  DebtPayment,
  DebtPaymentAllocation,
  DebtProgress,
  DebtStatus,
  DebtType,
  PaymentMode,
  Wallet,
} from "../types/domain";
import { addMoneyValues, formatMoneyDigits, parseMoneyInputDigits, toNumber } from "./money";
import { supabase } from "./supabase";

export type CounterpartyWithSummary = Counterparty & {
  debtTotal: number;
  receivableTotal: number;
  activeDebtCount: number;
  activeReceivableCount: number;
  settledDebtCount: number;
  settledReceivableCount: number;
  totalItemCount: number;
};

export type DebtPaymentWithMeta = DebtPayment & {
  allocations: (DebtPaymentAllocation & {
    debtTitle?: string;
  })[];
  wallet: Wallet | null;
};

export type CounterpartyDetail = {
  counterparty: Counterparty;
  debts: DebtProgress[];
  payments: DebtPaymentWithMeta[];
  summary: {
    totalDebtOriginal: number;
    totalDebtPaid: number;
    totalDebtRemaining: number;
    activeDebtCount: number;
    settledDebtCount: number;
    totalReceivableOriginal: number;
    totalReceivablePaid: number;
    totalReceivableRemaining: number;
    activeReceivableCount: number;
    settledReceivableCount: number;
  };
};

export type CreateDebtInput = {
  counterpartyId: string;
  type: DebtType;
  title: string;
  originalAmount: string;
  dueDate?: string | null;
  note?: string | null;
};

export type UpdateDebtInput = {
  title: string;
  originalAmount?: string;
  dueDate?: string | null;
  note?: string | null;
};

export type RecordSettlementInput = {
  counterpartyId: string;
  debtType: DebtType;
  paymentMode: PaymentMode;
  amount: string;
  walletId?: string | null;
  paymentDate?: string;
  note?: string | null;
  debtId?: string | null;
};

async function getAuthenticatedUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("You need to be signed in to manage debt and receivables.");
  }

  return user.id;
}

export async function getCounterparties(filters?: {
  type?: "all" | DebtType;
  status?: "all" | "active" | "settled";
  query?: string;
}) {
  const userId = await getAuthenticatedUserId();

  const [counterpartiesResult, progressResult] = await Promise.all([
    supabase.from("counterparties").select("*").eq("user_id", userId).order("name", { ascending: true }),
    supabase.from("debt_progress_view").select("*").eq("user_id", userId),
  ]);

  if (counterpartiesResult.error) throw counterpartiesResult.error;
  if (progressResult.error) throw progressResult.error;

  const counterparties = counterpartiesResult.data ?? [];
  const progressItems = (progressResult.data ?? []) as DebtProgress[];

  const progressByCounterparty = new Map<string, DebtProgress[]>();
  for (const item of progressItems) {
    const list = progressByCounterparty.get(item.counterparty_id) ?? [];
    list.push(item);
    progressByCounterparty.set(item.counterparty_id, list);
  }

  let totalDebt = 0;
  let totalReceivable = 0;

  for (const item of progressItems) {
    if (item.status !== "cancelled") {
      const remaining = toNumber(item.remaining_amount);
      if (item.type === "debt") {
        totalDebt += remaining;
      } else {
        totalReceivable += remaining;
      }
    }
  }

  const summaries: CounterpartyWithSummary[] = counterparties.map((c) => {
    const items = progressByCounterparty.get(c.id) ?? [];
    let debtTotal = 0;
    let receivableTotal = 0;
    let activeDebtCount = 0;
    let activeReceivableCount = 0;
    let settledDebtCount = 0;
    let settledReceivableCount = 0;

    for (const item of items) {
      if (item.status === "cancelled") continue;
      const remaining = toNumber(item.remaining_amount);

      if (item.type === "debt") {
        debtTotal += remaining;
        if (item.status === "settled") settledDebtCount++;
        else activeDebtCount++;
      } else {
        receivableTotal += remaining;
        if (item.status === "settled") settledReceivableCount++;
        else activeReceivableCount++;
      }
    }

    return {
      ...c,
      debtTotal,
      receivableTotal,
      activeDebtCount,
      activeReceivableCount,
      settledDebtCount,
      settledReceivableCount,
      totalItemCount: items.filter((i) => i.status !== "cancelled").length,
    };
  });

  // Apply filters
  let filtered = summaries;

  if (filters?.type === "debt") {
    filtered = filtered.filter((s) => s.debtTotal > 0 || s.activeDebtCount > 0 || s.settledDebtCount > 0);
  } else if (filters?.type === "receivable") {
    filtered = filtered.filter((s) => s.receivableTotal > 0 || s.activeReceivableCount > 0 || s.settledReceivableCount > 0);
  }

  if (filters?.status === "active") {
    filtered = filtered.filter((s) => s.activeDebtCount > 0 || s.activeReceivableCount > 0);
  } else if (filters?.status === "settled") {
    filtered = filtered.filter((s) => (s.settledDebtCount > 0 || s.settledReceivableCount > 0) && s.activeDebtCount === 0 && s.activeReceivableCount === 0);
  }

  if (filters?.query) {
    const q = filters.query.toLowerCase().trim();
    filtered = filtered.filter((s) => s.name.toLowerCase().includes(q));
  }

  return {
    counterparties: filtered,
    allCounterparties: counterparties,
    totalDebt,
    totalReceivable,
  };
}

export async function getActiveDebts(): Promise<DebtProgress[]> {
  const userId = await getAuthenticatedUserId();
  const { data, error } = await supabase
    .from("debt_progress_view")
    .select("*")
    .eq("user_id", userId)
    .eq("type", "debt")
    .neq("status", "settled")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as DebtProgress[]) ?? [];
}

export async function getCounterpartyDetail(counterpartyId: string): Promise<CounterpartyDetail> {
  const userId = await getAuthenticatedUserId();

  const [counterpartyResult, progressResult, paymentsResult, allocationsResult, walletsResult] = await Promise.all([
    supabase.from("counterparties").select("*").eq("id", counterpartyId).eq("user_id", userId).single(),
    supabase
      .from("debt_progress_view")
      .select("*")
      .eq("counterparty_id", counterpartyId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("debt_payments")
      .select("*")
      .eq("counterparty_id", counterpartyId)
      .eq("user_id", userId)
      .order("payment_date", { ascending: false }),
    supabase.from("debt_payment_allocations").select("*").eq("user_id", userId),
    supabase.from("wallets").select("*").eq("user_id", userId),
  ]);

  if (counterpartyResult.error) throw counterpartyResult.error;
  if (progressResult.error) throw progressResult.error;
  if (paymentsResult.error) throw paymentsResult.error;
  if (allocationsResult.error) throw allocationsResult.error;
  if (walletsResult.error) throw walletsResult.error;

  const counterparty = counterpartyResult.data as Counterparty;
  const debts = (progressResult.data ?? []) as DebtProgress[];
  const payments = (paymentsResult.data ?? []) as DebtPayment[];
  const allocations = (allocationsResult.data ?? []) as DebtPaymentAllocation[];
  const wallets = (walletsResult.data ?? []) as Wallet[];

  const walletById = new Map<string, Wallet>(wallets.map((w) => [w.id, w]));
  const debtById = new Map<string, DebtProgress>(debts.map((d) => [d.debt_id, d]));

  const allocationsByPaymentId = new Map<string, (DebtPaymentAllocation & { debtTitle?: string })[]>();
  for (const alloc of allocations) {
    const list = allocationsByPaymentId.get(alloc.debt_payment_id) ?? [];
    list.push({
      ...alloc,
      debtTitle: debtById.get(alloc.debt_id)?.title ?? "Obligation Item",
    });
    allocationsByPaymentId.set(alloc.debt_payment_id, list);
  }

  const paymentsWithMeta: DebtPaymentWithMeta[] = payments.map((p) => ({
    ...p,
    allocations: allocationsByPaymentId.get(p.id) ?? [],
    wallet: p.wallet_id ? walletById.get(p.wallet_id) ?? null : null,
  }));

  let totalDebtOriginal = 0;
  let totalDebtPaid = 0;
  let totalDebtRemaining = 0;
  let activeDebtCount = 0;
  let settledDebtCount = 0;

  let totalReceivableOriginal = 0;
  let totalReceivablePaid = 0;
  let totalReceivableRemaining = 0;
  let activeReceivableCount = 0;
  let settledReceivableCount = 0;

  for (const d of debts) {
    if (d.status === "cancelled") continue;

    const original = toNumber(d.original_amount);
    const paid = toNumber(d.total_paid);
    const remaining = toNumber(d.remaining_amount);

    if (d.type === "debt") {
      totalDebtOriginal += original;
      totalDebtPaid += paid;
      totalDebtRemaining += remaining;
      if (d.status === "settled") settledDebtCount++;
      else activeDebtCount++;
    } else {
      totalReceivableOriginal += original;
      totalReceivablePaid += paid;
      totalReceivableRemaining += remaining;
      if (d.status === "settled") settledReceivableCount++;
      else activeReceivableCount++;
    }
  }

  return {
    counterparty,
    debts,
    payments: paymentsWithMeta,
    summary: {
      totalDebtOriginal,
      totalDebtPaid,
      totalDebtRemaining,
      activeDebtCount,
      settledDebtCount,
      totalReceivableOriginal,
      totalReceivablePaid,
      totalReceivableRemaining,
      activeReceivableCount,
      settledReceivableCount,
    },
  };
}

export async function findOrCreateCounterparty(name: string): Promise<{ data: Counterparty | null; error: any }> {
  const userId = await getAuthenticatedUserId();
  const trimmed = name.trim();
  if (!trimmed) {
    return { data: null, error: new Error("Counterparty name is required.") };
  }

  // Check if existing exists (case-insensitive)
  const { data: existing, error: findError } = await supabase
    .from("counterparties")
    .select("*")
    .eq("user_id", userId)
    .ilike("name", trimmed)
    .maybeSingle();

  if (existing) {
    return { data: existing as Counterparty, error: null };
  }

  // Attempt insert
  const { data: inserted, error: insertError } = await supabase
    .from("counterparties")
    .insert({
      name: trimmed,
      user_id: userId,
    })
    .select("*")
    .single();

  if (!insertError && inserted) {
    return { data: inserted as Counterparty, error: null };
  }

  // Handle unique expression index race condition (fetch existing)
  const { data: fallback, error: fallbackError } = await supabase
    .from("counterparties")
    .select("*")
    .eq("user_id", userId)
    .ilike("name", trimmed)
    .maybeSingle();

  if (fallback) {
    return { data: fallback as Counterparty, error: null };
  }

  return { data: null, error: insertError || fallbackError };
}

export async function renameCounterparty(id: string, name: string): Promise<{ data: Counterparty | null; error: any }> {
  const userId = await getAuthenticatedUserId();
  const trimmed = name.trim();
  if (!trimmed) {
    return { data: null, error: new Error("Counterparty name is required.") };
  }

  return supabase
    .from("counterparties")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
}

export async function createDebt(
  input: CreateDebtInput,
  options?: { walletId?: string | null; counterpartyName?: string },
): Promise<{ data: Debt | null; error: any }> {
  const res = await createMultipleDebts([input], options);
  return { data: res.data ? res.data[0] ?? null : null, error: res.error };
}

export async function createMultipleDebts(
  inputs: CreateDebtInput[],
  options?: { walletId?: string | null; counterpartyName?: string },
): Promise<{ data: Debt[] | null; error: any }> {
  if (inputs.length === 0) {
    return { data: [], error: null };
  }

  const userId = await getAuthenticatedUserId();
  const payloads: Database["public"]["Tables"]["debts"]["Insert"][] = [];
  let totalAmountNumber = 0;

  for (const input of inputs) {
    const rawDigits = parseMoneyInputDigits(input.originalAmount);
    if (!rawDigits || toNumber(rawDigits) <= 0) {
      return { data: null, error: new Error(`Amount for "${input.title || "item"}" must be greater than zero.`) };
    }
    if (!input.title.trim()) {
      return { data: null, error: new Error("Every item must have a title / description.") };
    }

    totalAmountNumber += toNumber(rawDigits);

    payloads.push({
      user_id: userId,
      counterparty_id: input.counterpartyId,
      type: input.type,
      title: input.title.trim(),
      original_amount: rawDigits,
      due_date: input.dueDate?.trim() || null,
      note: input.note?.trim() || null,
      status: "active",
    });
  }

  // If a wallet is chosen for initial money movement:
  // Debt -> money received into wallet (+adjustment)
  // Receivable -> money paid/lent from wallet (-adjustment)
  if (options?.walletId) {
    const type = inputs[0].type;
    const cpName = options.counterpartyName?.trim() || "Counterparty";

    const { error: txError } = await supabase.from("transactions").insert({
      user_id: userId,
      type: "adjustment",
      amount: type === "debt" ? totalAmountNumber.toString() : (-totalAmountNumber).toString(),
      wallet_id: options.walletId,
      destination_wallet_id: null,
      transfer_fee: "0",
      transaction_date: new Date().toISOString(),
      title: type === "debt" ? `Debt Inflow: ${cpName}` : `Receivable Outflow: ${cpName}`,
      note: inputs.length === 1 ? inputs[0].note?.trim() || null : `${inputs.length} items tracked`,
      status: "completed",
      related_entity_type: type === "debt" ? "debt_creation" : "receivable_creation",
      related_entity_id: inputs[0].counterpartyId,
    });

    if (txError) {
      return { data: null, error: txError };
    }
  }

  return supabase.from("debts").insert(payloads).select("*");
}

export async function updateDebt(id: string, input: UpdateDebtInput): Promise<{ data: Debt | null; error: any }> {
  const userId = await getAuthenticatedUserId();

  // Check if allocations exist
  const { count, error: countError } = await supabase
    .from("debt_payment_allocations")
    .select("*", { count: "exact", head: true })
    .eq("debt_id", id)
    .eq("user_id", userId);

  if (countError) return { data: null, error: countError };

  const hasAllocations = (count ?? 0) > 0;

  const payload: Database["public"]["Tables"]["debts"]["Update"] = {
    title: input.title.trim(),
    due_date: input.dueDate?.trim() || null,
    note: input.note?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  // Original amount can ONLY be changed if ZERO allocations exist
  if (!hasAllocations && input.originalAmount) {
    const rawDigits = parseMoneyInputDigits(input.originalAmount);
    if (rawDigits && toNumber(rawDigits) > 0) {
      payload.original_amount = rawDigits;
    }
  }

  return supabase.from("debts").update(payload).eq("id", id).eq("user_id", userId).select("*").single();
}

export async function deleteOrCancelDebt(id: string): Promise<{ data: any; error: any }> {
  const userId = await getAuthenticatedUserId();

  // Check if allocations exist
  const { count, error: countError } = await supabase
    .from("debt_payment_allocations")
    .select("*", { count: "exact", head: true })
    .eq("debt_id", id)
    .eq("user_id", userId);

  if (countError) return { data: null, error: countError };

  const hasAllocations = (count ?? 0) > 0;

  if (hasAllocations) {
    // Cannot hard delete -> cancel obligation
    return supabase
      .from("debts")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .single();
  }

  // Safe hard delete
  return supabase.from("debts").delete().eq("id", id).eq("user_id", userId);
}

export async function recordCounterpartySettlement(input: RecordSettlementInput): Promise<{ data: any; error: any }> {
  await getAuthenticatedUserId();
  const rawDigits = parseMoneyInputDigits(input.amount);
  if (!rawDigits || toNumber(rawDigits) <= 0) {
    return { data: null, error: new Error("Settlement amount must be greater than zero.") };
  }

  return supabase.rpc("record_counterparty_settlement", {
    p_counterparty_id: input.counterpartyId,
    p_debt_type: input.debtType,
    p_payment_mode: input.paymentMode,
    p_amount: rawDigits,
    p_wallet_id: input.paymentMode === "wallet" ? input.walletId ?? null : null,
    p_payment_date: input.paymentDate ? new Date(input.paymentDate).toISOString() : new Date().toISOString(),
    p_note: input.note?.trim() || null,
    p_debt_id: input.debtId ?? null,
  });
}

export async function getOpenDebtItems(counterpartyId: string, debtType: DebtType): Promise<DebtProgress[]> {
  const userId = await getAuthenticatedUserId();
  const { data, error } = await supabase
    .from("debt_progress_view")
    .select("*")
    .eq("counterparty_id", counterpartyId)
    .eq("user_id", userId)
    .eq("type", debtType)
    .in("status", ["active", "partially_paid"])
    .gt("remaining_amount", 0)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as DebtProgress[];
}

