import type {
  Category,
  PaymentMode,
  RecurringFrequency,
  RecurringObligation,
  RecurringObligationStatus,
  RecurringObligationSummary,
  RecurringObligationType,
  RecurringPayment,
  Wallet,
} from "../types/domain";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "./money";
import { getActiveSpaceId } from "./spaces";
import { supabase } from "./supabase";

export type CreateRecurringObligationInput = {
  type: RecurringObligationType;
  name: string;
  amount: string;
  startDate: string;
  frequency?: RecurringFrequency;
  provider?: string;
  categoryId?: string | null;
  defaultWalletId?: string | null;
  reminderOffsets?: number[];
  overdueReminderEnabled?: boolean;
  installmentTotalAmount?: string | null;
  installmentCount?: number | null;
  alreadyPaidCount?: number;
  note?: string;
};

export type UpdateRecurringObligationInput = {
  name: string;
  provider?: string | null;
  amount: string;
  categoryId?: string | null;
  defaultWalletId?: string | null;
  reminderOffsets?: number[];
  overdueReminderEnabled?: boolean;
  note?: string | null;
};

export type RecordRecurringPaymentInput = {
  paymentId: string;
  paymentMode: PaymentMode;
  walletId?: string | null;
  paidAt?: string;
  note?: string | null;
};

export type SettleRemainingInstallmentInput = {
  obligationId: string;
  paymentMode: PaymentMode;
  walletId?: string | null;
  paidAt?: string;
  note?: string | null;
};

export type RecurringObligationWithMeta = RecurringObligationSummary & {
  category: Category | null;
  defaultWallet: Wallet | null;
  currentPayment?: RecurringPayment | null;
};

async function getAuthenticatedUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("You need to be signed in.");

  return user.id;
}

/**
 * Fetch all recurring obligations for the user with calculated summary metrics.
 */
export async function getRecurringObligations(spaceId?: string): Promise<{
  data: RecurringObligationWithMeta[];
  error: Error | null;
}> {
  try {
    const userId = await getAuthenticatedUserId();
    const targetSpaceId = spaceId ?? getActiveSpaceId();

    let obligationsQuery = supabase
      .from("recurring_obligations_summary_view")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (targetSpaceId) {
      obligationsQuery = obligationsQuery.eq("space_id", targetSpaceId);
    }

    let walletsQuery = supabase.from("wallets").select("*").eq("user_id", userId);
    if (targetSpaceId) {
      walletsQuery = walletsQuery.eq("space_id", targetSpaceId);
    }

    let categoriesQuery = supabase.from("categories").select("*");
    if (targetSpaceId) {
      categoriesQuery = categoriesQuery.or(`is_system.eq.true,space_id.eq.${targetSpaceId}`);
    } else {
      categoriesQuery = categoriesQuery.or(`is_system.eq.true,space_id.is.null`);
    }

    const [obligationsRes, categoriesRes, walletsRes, openPaymentsRes] = await Promise.all([
      obligationsQuery,
      categoriesQuery,
      walletsQuery,
      supabase
        .from("recurring_payments")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["pending", "overdue"])
        .order("due_date", { ascending: true }),
    ]);

    if (obligationsRes.error) throw obligationsRes.error;
    if (categoriesRes.error) throw categoriesRes.error;
    if (walletsRes.error) throw walletsRes.error;

    const categoriesMap = new Map((categoriesRes.data ?? []).map((c) => [c.id, c]));
    const walletsMap = new Map((walletsRes.data ?? []).map((w) => [w.id, w]));

    // Group open pending payment by obligation_id (first upcoming payment)
    const openPaymentsMap = new Map<string, RecurringPayment>();
    for (const p of (openPaymentsRes.data ?? []) as RecurringPayment[]) {
      if (!openPaymentsMap.has(p.obligation_id)) {
        openPaymentsMap.set(p.obligation_id, p);
      }
    }

    const data: RecurringObligationWithMeta[] = (obligationsRes.data ?? []).map((row) => ({
      ...row,
      category: row.category_id ? categoriesMap.get(row.category_id) ?? null : null,
      defaultWallet: row.default_wallet_id ? walletsMap.get(row.default_wallet_id) ?? null : null,
      currentPayment: openPaymentsMap.get(row.id) ?? null,
    }));

    return { data, error: null };
  } catch (error) {
    return { data: [], error: error as Error };
  }
}

/**
 * Fetch a single recurring obligation with full payment history.
 */
export async function getRecurringObligationById(id: string): Promise<{
  data: {
    obligation: RecurringObligationWithMeta;
    payments: RecurringPayment[];
  } | null;
  error: Error | null;
}> {
  try {
    const userId = await getAuthenticatedUserId();

    const [obligationRes, paymentsRes, categoriesRes, walletsRes] = await Promise.all([
      supabase
        .from("recurring_obligations_summary_view")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single(),
      supabase
        .from("recurring_payments")
        .select("*")
        .eq("obligation_id", id)
        .eq("user_id", userId)
        .order("due_date", { ascending: true }),
      supabase.from("categories").select("*"),
      supabase.from("wallets").select("*").eq("user_id", userId),
    ]);

    if (obligationRes.error) throw obligationRes.error;
    if (paymentsRes.error) throw paymentsRes.error;

    const categoriesMap = new Map((categoriesRes.data ?? []).map((c) => [c.id, c]));
    const walletsMap = new Map((walletsRes.data ?? []).map((w) => [w.id, w]));

    const obligation: RecurringObligationWithMeta = {
      ...obligationRes.data,
      category: obligationRes.data.category_id ? categoriesMap.get(obligationRes.data.category_id) ?? null : null,
      defaultWallet: obligationRes.data.default_wallet_id ? walletsMap.get(obligationRes.data.default_wallet_id) ?? null : null,
    };

    return {
      data: {
        obligation,
        payments: (paymentsRes.data ?? []) as RecurringPayment[],
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Create a new recurring obligation via atomic RPC.
 */
export async function createRecurringObligation(
  input: CreateRecurringObligationInput,
): Promise<{ id: string | null; error: Error | null }> {
  try {
    const rawAmount = parseMoneyInputDigits(input.amount);
    if (!rawAmount || toNumber(rawAmount) <= 0) {
      throw new Error("Amount must be greater than zero.");
    }

    let rawTotal: string | null = null;
    if (input.type === "paylater" || input.type === "installment") {
      if (!input.installmentCount || input.installmentCount <= 0) {
        throw new Error("Number of installments is required.");
      }
      rawTotal = input.installmentTotalAmount
        ? parseMoneyInputDigits(input.installmentTotalAmount)
        : String(toNumber(rawAmount) * input.installmentCount);
    }

    const { data, error } = await supabase.rpc("create_recurring_obligation", {
      p_type: input.type,
      p_name: input.name.trim(),
      p_amount: rawAmount,
      p_start_date: input.startDate,
      p_frequency: input.frequency ?? "monthly",
      p_provider: input.provider?.trim() || null,
      p_category_id: input.categoryId || null,
      p_default_wallet_id: input.defaultWalletId || null,
      p_reminder_offsets: input.reminderOffsets ?? [7, 3, 1, 0],
      p_overdue_reminder_enabled: input.overdueReminderEnabled ?? true,
      p_installment_total_amount: rawTotal,
      p_installment_count: input.installmentCount || null,
      p_already_paid_count: input.alreadyPaidCount || 0,
      p_note: input.note?.trim() || null,
    });

    if (error) throw error;

    return { id: data, error: null };
  } catch (error) {
    return { id: null, error: error as Error };
  }
}

/**
 * Update metadata of an existing recurring obligation.
 */
export async function updateRecurringObligation(
  id: string,
  input: UpdateRecurringObligationInput,
): Promise<{ error: Error | null }> {
  try {
    const userId = await getAuthenticatedUserId();
    const rawAmount = parseMoneyInputDigits(input.amount);

    const { error } = await supabase
      .from("recurring_obligations")
      .update({
        name: input.name.trim(),
        provider: input.provider?.trim() || null,
        amount: rawAmount,
        category_id: input.categoryId || null,
        default_wallet_id: input.defaultWalletId || null,
        reminder_offsets: input.reminderOffsets ?? [7, 3, 1, 0],
        overdue_reminder_enabled: input.overdueReminderEnabled ?? true,
        note: input.note?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Record payment for an active occurrence via atomic RPC.
 */
export async function recordRecurringPayment(
  input: RecordRecurringPaymentInput,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.rpc("record_recurring_payment", {
      p_payment_id: input.paymentId,
      p_payment_mode: input.paymentMode,
      p_wallet_id: input.paymentMode === "wallet" ? input.walletId || null : null,
      p_paid_at: input.paidAt || new Date().toISOString(),
      p_note: input.note?.trim() || null,
    });

    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Settle full remaining balance for installment/PayLater via atomic RPC.
 */
export async function settleRemainingInstallment(
  input: SettleRemainingInstallmentInput,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.rpc("settle_remaining_installment", {
      p_obligation_id: input.obligationId,
      p_payment_mode: input.paymentMode,
      p_wallet_id: input.paymentMode === "wallet" ? input.walletId || null : null,
      p_paid_at: input.paidAt || new Date().toISOString(),
      p_note: input.note?.trim() || null,
    });

    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Cancel future recurrence for subscription or bill.
 */
export async function cancelRecurringObligation(
  id: string,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.rpc("cancel_recurring_obligation", {
      p_obligation_id: id,
    });

    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Delete recurring obligation and its child occurrences/logs cleanly.
 */
export async function deleteRecurringObligation(
  id: string,
): Promise<{ error: Error | null }> {
  try {
    const { error: rpcError } = await (supabase.rpc as any)("delete_recurring_obligation", {
      p_obligation_id: id,
    });

    if (rpcError) {
      // Fallback: direct table deletion
      const userId = await getAuthenticatedUserId();
      await supabase
        .from("notification_reminder_logs")
        .delete()
        .eq("obligation_id", id)
        .eq("user_id", userId);

      await supabase
        .from("recurring_payments")
        .delete()
        .eq("obligation_id", id)
        .eq("user_id", userId);

      const { error: obErr } = await supabase
        .from("recurring_obligations")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (obErr) throw obErr;
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}
