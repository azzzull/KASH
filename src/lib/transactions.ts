import type {
  Category,
  CategoryType,
  Envelope,
  FinancialSpace,
  ManagedSpaceMemberItem,
  ManagedSpaceRole,
  Transaction,
  TransactionStatus,
  TransactionType,
  Wallet,
} from "../types/domain";
import type { Database } from "../types/database";
import { addMoneyValues, isMoneyGreaterThan, toNumber } from "./money";
import { toUtcIsoString } from "./datetime";
import { getActiveSpaceId, getManagedSpaceMemberIdentities, getManagedSpaceMembers } from "./spaces";
import { supabase } from "./supabase";

type BaseTransactionInput = {
  amount: string;
  walletId: string;
  transactionDate: string;
  note: string | null;
  envelopeId?: string | null;
  spaceId?: string;
};

type CategoryTransactionInput = BaseTransactionInput & {
  categoryId: string;
  title: string | null;
};

type TransferInput = BaseTransactionInput & {
  destinationWalletId: string;
  transferFee: string;
};

type ExternalTransferInput = BaseTransactionInput & {
  categoryId: string;
  recipient: string;
  transferFee: string;
};

type AdjustmentInput = Pick<BaseTransactionInput, "transactionDate" | "walletId" | "spaceId"> & {
  amount: string;
  reason: string;
};

export type TransactionSort = "latest" | "oldest" | "amount_high" | "amount_low";
export type TransactionTypeFilter = "all" | TransactionType;
export type TransactionStatusFilter = "all" | TransactionStatus;
export type TransactionPeriodFilter = "all" | "this_month" | "last_month" | "this_year";

export type TransactionFilters = {
  categoryId?: string;
  envelopeId?: string;
  dateKey?: string;
  monthDate?: Date | string;
  page?: number;
  pageSize?: number;
  period?: TransactionPeriodFilter;
  query?: string;
  sort?: TransactionSort;
  status?: TransactionStatusFilter;
  type?: TransactionTypeFilter;
  walletId?: string;
  spaceId?: string;
};

export type CrossSpaceEventMeta = {
  id: string;
  event_type: "managed_expense_paid_personally" | "personal_advance_to_managed";
  managed_space_id: string;
  personal_space_id: string;
  managedSpaceName?: string;
  personalSpaceName?: string;
  amount: number;
  status: string;
  payerName?: string | null;
};

export type TransactionWithMeta = Transaction & {
  category: Category | null;
  envelope?: Envelope | null;
  destinationWallet: Wallet | null;
  wallet: Wallet | null;
  crossSpaceEvent?: CrossSpaceEventMeta | null;
  creatorName?: string | null;
};

export function canEditTransaction(
  transaction: { user_id?: string; created_by_user_id?: string | null } | null | undefined,
  activeSpace: FinancialSpace | null,
  currentUserId: string | null | undefined,
  userRole?: ManagedSpaceRole | "owner" | null
): boolean {
  if (!transaction || !currentUserId) return false;

  if (!activeSpace || activeSpace.space_type === "personal") {
    return transaction.user_id === currentUserId;
  }

  const isOwner = activeSpace.owner_user_id === currentUserId || userRole === "owner";
  if (isOwner || userRole === "admin") {
    return true;
  }

  if (userRole === "member") {
    const creatorId = transaction.created_by_user_id || transaction.user_id;
    return creatorId === currentUserId;
  }

  return false;
}

export function canCreateTransaction(
  activeSpace: FinancialSpace | null,
  userRole?: ManagedSpaceRole | "owner" | null
): boolean {
  if (!activeSpace || activeSpace.space_type === "personal") {
    return true;
  }
  return userRole === "owner" || userRole === "admin" || userRole === "member";
}

export type UpdateTransactionInput = {
  amount: string;
  categoryId?: string | null;
  envelopeId?: string | null;
  destinationWalletId?: string | null;
  note: string | null;
  title: string | null;
  transactionDate: string;
  transferFee?: string;
  walletId: string;
};

const INSUFFICIENT_BALANCE_MESSAGE = "Wallet balance is not enough. Check the amount again.";

async function getAuthenticatedUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("You need to be signed in to create transactions.");
  }

  return user.id;
}

function toTransactionDate(value: string) {
  return new Date(value).toISOString();
}

function periodRange(period: TransactionPeriodFilter = "all") {
  if (period === "all") return null;

  const now = new Date();
  const start =
    period === "this_month"
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : period === "last_month"
        ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
        : new Date(now.getFullYear(), 0, 1);
  const end =
    period === "this_month"
      ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
      : period === "last_month"
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : new Date(now.getFullYear() + 1, 0, 1);

  return { end: end.toISOString(), start: start.toISOString() };
}

function localDayRange(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);

  return { end: end.toISOString(), start: start.toISOString() };
}

function searchMatches(transaction: TransactionWithMeta, query: string) {
  if (!query.trim()) return true;
  const normalizedQuery = query.toLowerCase().trim();
  const haystack = [
    transaction.title,
    transaction.note,
    transaction.category?.name,
    transaction.wallet?.name,
    transaction.destinationWallet?.name,
    transaction.type,
    transaction.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function attachTransactionMeta(
  transactions: Transaction[],
  wallets: Wallet[],
  categories: Category[],
  envelopes: Envelope[] = [],
  crossSpaceEvents: CrossSpaceEventMeta[] = [],
  members: { user_id: string; full_name?: string | null }[] = []
): TransactionWithMeta[] {
  const walletsById = new Map(wallets.map((wallet) => [wallet.id, wallet]));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const envelopesById = new Map(envelopes.map((envelope) => [envelope.id, envelope]));
  const crossSpaceEventsById = new Map(crossSpaceEvents.map((e) => [e.id, e]));
  const membersById = new Map(members.map((m) => [m.user_id, m]));

  return transactions.map((transaction) => {
    const creatorUserId = transaction.created_by_user_id || transaction.user_id;
    const member = creatorUserId ? membersById.get(creatorUserId) : null;
    const crossSpaceEvent = transaction.cross_space_event_id
      ? crossSpaceEventsById.get(transaction.cross_space_event_id) ?? null
      : null;
    return {
      ...transaction,
      category: transaction.category_id ? categoriesById.get(transaction.category_id) ?? null : null,
      envelope: transaction.envelope_id ? envelopesById.get(transaction.envelope_id) ?? null : null,
      destinationWallet: transaction.destination_wallet_id ? walletsById.get(transaction.destination_wallet_id) ?? null : null,
      wallet: walletsById.get(transaction.wallet_id || "") ?? null,
      crossSpaceEvent,
      creatorName: crossSpaceEvent?.payerName || member?.full_name || null,
    };
  });
}

function outgoingAmountFor(type: TransactionType, amount: string | number, transferFee: string | number = "0") {
  if (type === "expense") return addMoneyValues(amount, transferFee);
  if (type === "transfer") return addMoneyValues(amount, transferFee);
  return null;
}

export function isExternalTransfer(transaction: Pick<Transaction, "type" | "transaction_subtype">) {
  return transaction.type === "expense" && transaction.transaction_subtype === "external_transfer";
}

async function getWalletCurrentBalance(walletId: string) {
  const { data, error } = await supabase
    .from("wallet_balance_view")
    .select("current_balance")
    .eq("wallet_id", walletId)
    .single();

  if (error) throw new Error(error.message || "Failed to retrieve wallet balance");
  return data?.current_balance ?? "0";
}

async function assertWalletCanCover(walletId: string, outgoingAmount: string, restoredAmount = "0") {
  const currentBalance = await getWalletCurrentBalance(walletId);
  const spendableBalance = addMoneyValues(currentBalance, restoredAmount);

  if (isMoneyGreaterThan(outgoingAmount, spendableBalance)) {
    throw new Error(INSUFFICIENT_BALANCE_MESSAGE);
  }
}

async function createTransaction(payload: {
  amount: string;
  category_id?: string | null;
  envelope_id?: string | null;
  destination_wallet_id?: string | null;
  note?: string | null;
  title?: string | null;
  transaction_subtype?: Transaction["transaction_subtype"];
  transfer_fee?: string;
  transaction_date: string;
  type: TransactionType;
  wallet_id: string;
  space_id?: string;
}) {
  const userId = await getAuthenticatedUserId();
  const targetSpaceId = payload.space_id ?? getActiveSpaceId() ?? undefined;
  const outgoingAmount = outgoingAmountFor(payload.type, payload.amount, payload.transfer_fee ?? "0");

  if (outgoingAmount) {
    await assertWalletCanCover(payload.wallet_id, outgoingAmount);
  }

  return supabase
    .from("transactions")
    .insert({
      user_id: userId,
      space_id: targetSpaceId,
      type: payload.type,
      transaction_subtype: payload.transaction_subtype ?? null,
      amount: payload.amount,
      wallet_id: payload.wallet_id,
      category_id: payload.category_id ?? null,
      envelope_id: payload.envelope_id ?? null,
      destination_wallet_id: payload.destination_wallet_id ?? null,
      transfer_fee: payload.transfer_fee ?? "0",
      transaction_date: toUtcIsoString(payload.transaction_date),
      title: payload.title ?? null,
      note: payload.note ?? null,
      status: "completed",
    })
    .select("*")
    .single();
}

export async function createIncome(input: CategoryTransactionInput) {
  return createTransaction({
    amount: input.amount,
    category_id: input.categoryId,
    note: input.note,
    title: input.title,
    transaction_date: input.transactionDate,
    type: "income",
    wallet_id: input.walletId,
    space_id: input.spaceId,
  });
}

export async function createExpense(input: CategoryTransactionInput) {
  return createTransaction({
    amount: input.amount,
    category_id: input.categoryId,
    envelope_id: input.envelopeId,
    note: input.note,
    title: input.title,
    transaction_date: input.transactionDate,
    type: "expense",
    wallet_id: input.walletId,
    space_id: input.spaceId,
  });
}

export async function createExternalTransfer(input: ExternalTransferInput) {
  const recipient = input.recipient.trim();

  return createTransaction({
    amount: input.amount,
    category_id: input.categoryId,
    note: input.note,
    title: recipient ? `Transfer ke ${recipient}` : "Transfer Keluar",
    transaction_date: input.transactionDate,
    transaction_subtype: "external_transfer",
    transfer_fee: input.transferFee,
    type: "expense",
    wallet_id: input.walletId,
    space_id: input.spaceId,
  });
}

export async function createCrossSpaceExpense(input: {
  amount: string;
  categoryId?: string | null;
  note?: string | null;
  title?: string | null;
  transactionDate: string;
  personalWalletId: string;
  personalSpaceId: string;
  managedSpaceId: string;
}) {
  const { data, error } = await supabase.rpc("record_cross_space_expense", {
    p_client_request_id: crypto.randomUUID(),
    p_personal_space_id: input.personalSpaceId,
    p_managed_space_id: input.managedSpaceId,
    p_amount: toNumber(input.amount),
    p_personal_wallet_id: input.personalWalletId,
    p_managed_category_id: input.categoryId || null,
    p_title: input.title ?? "Pengeluaran Reimburse",
    p_note: input.note ?? null,
    p_event_date: toUtcIsoString(input.transactionDate),
  });
  if (error) throw error;
  return { data, error: null };
}

export async function recordCrossSpaceAdvance(input: {
  amount: string;
  managedSpaceId: string;
  managedWalletId: string;
  personalSpaceId: string;
  personalWalletId: string;
  title: string;
  transactionDate: string;
  note?: string | null;
}) {
  const { data, error } = await supabase.rpc("record_cross_space_advance" as any, {
    p_client_request_id: crypto.randomUUID(),
    p_personal_space_id: input.personalSpaceId,
    p_managed_space_id: input.managedSpaceId,
    p_amount: toNumber(input.amount),
    p_personal_wallet_id: input.personalWalletId,
    p_managed_wallet_id: input.managedWalletId,
    p_title: input.title,
    p_note: input.note ?? null,
    p_event_date: toUtcIsoString(input.transactionDate),
  });
  if (error) throw error;
  return { data, error: null };
}

export async function recordCrossSpaceSettlement(input: {
  eventId: string;
  amount: number;
  managedWalletId: string;
  personalWalletId?: string | null;
  settlementDate: string;
  note?: string;
}) {
  await getAuthenticatedUserId();
  const { data, error } = await supabase.rpc("record_cross_space_settlement", {
    p_client_request_id: crypto.randomUUID(),
    p_event_id: input.eventId,
    p_amount: input.amount,
    p_managed_wallet_id: input.managedWalletId,
    p_personal_wallet_id: null,
    p_settlement_date: input.settlementDate,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return { data, error: null };
}

export async function createTransfer(input: TransferInput) {
  return createTransaction({
    amount: input.amount,
    destination_wallet_id: input.destinationWalletId,
    note: input.note,
    transaction_date: input.transactionDate,
    transfer_fee: input.transferFee,
    type: "transfer",
    wallet_id: input.walletId,
    space_id: input.spaceId,
  });
}

export async function createAdjustment(input: AdjustmentInput) {
  return createTransaction({
    amount: input.amount,
    note: input.reason,
    title: "Balance Adjustment",
    transaction_date: input.transactionDate,
    type: "adjustment",
    wallet_id: input.walletId,
    space_id: input.spaceId,
  });
}

export async function getTransactionSupportData(spaceId?: string) {
  const userId = await getAuthenticatedUserId();
  const targetSpaceId = spaceId ?? getActiveSpaceId();

  let walletQuery = supabase.from("wallets").select("*").order("created_at", { ascending: true });
  if (targetSpaceId) {
    walletQuery = walletQuery.eq("space_id", targetSpaceId);
  } else {
    walletQuery = walletQuery.eq("user_id", userId);
  }

  let categoryQuery = supabase
    .from("categories")
    .select("*")
    .order("category_type", { ascending: true })
    .order("name", { ascending: true });
  if (targetSpaceId) {
    categoryQuery = categoryQuery.or(`is_system.eq.true,space_id.eq.${targetSpaceId}`);
  } else {
    categoryQuery = categoryQuery.or(`is_system.eq.true,space_id.is.null`);
  }

  let envelopeQuery = supabase.from("envelopes").select("*").eq("is_archived", false).order("name", { ascending: true });
  if (targetSpaceId) {
    envelopeQuery = envelopeQuery.eq("space_id", targetSpaceId);
  } else {
    envelopeQuery = envelopeQuery.eq("user_id", userId);
  }

  const [walletResult, categoryResult, envelopeResult] = await Promise.all([
    walletQuery,
    categoryQuery,
    envelopeQuery,
  ]);

  if (walletResult.error) throw walletResult.error;
  if (categoryResult.error) throw categoryResult.error;

  return {
    categories: categoryResult.data ?? [],
    envelopes: envelopeResult.data ?? [],
    wallets: walletResult.data ?? [],
  };
}

function monthRange(monthInput: Date | string) {
  const date = typeof monthInput === "string" ? new Date(monthInput) : monthInput;
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);

  return { end: end.toISOString(), start: start.toISOString() };
}

export async function getTransactions(filters: TransactionFilters = {}) {
  const userId = await getAuthenticatedUserId();
  const targetSpaceId = filters.spaceId ?? getActiveSpaceId();
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 30;
  const sort = filters.sort ?? "latest";
  const exactDayRange = filters.dateKey ? localDayRange(filters.dateKey) : null;
  const range = exactDayRange ?? (filters.monthDate ? monthRange(filters.monthDate) : periodRange(filters.period));
  const supportData = await getTransactionSupportData(targetSpaceId ?? undefined);

  let query = supabase.from("transactions").select("*", { count: "exact" });
  if (targetSpaceId) {
    query = query.eq("space_id", targetSpaceId);
  } else {
    query = query.eq("user_id", userId);
  }
  if (filters.type && filters.type !== "all") query = query.eq("type", filters.type);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.categoryId === "uncategorized") {
    query = query.is("category_id", null);
  } else if (filters.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }
  if (filters.envelopeId) query = query.eq("envelope_id", filters.envelopeId);
  if (filters.walletId) query = query.or(`wallet_id.eq.${filters.walletId},destination_wallet_id.eq.${filters.walletId}`);
  if (range) query = query.gte("transaction_date", range.start).lt("transaction_date", range.end);

  query =
    sort === "oldest"
      ? query.order("transaction_date", { ascending: true })
      : sort === "amount_high"
        ? query.order("amount", { ascending: false })
        : sort === "amount_low"
          ? query.order("amount", { ascending: true })
          : query.order("transaction_date", { ascending: false });

  const { data, error, count } = await query.range(page * pageSize, page * pageSize + pageSize - 1);

  if (error) throw error;

  const crossSpaceEventIds = Array.from(
    new Set(
      (data ?? [])
        .map((tx) => tx.cross_space_event_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  let crossSpaceEventsMeta: CrossSpaceEventMeta[] = [];
  if (crossSpaceEventIds.length > 0) {
    const { data: eventsData } = await supabase
      .from("cross_space_events")
      .select("id, event_type, managed_space_id, personal_space_id, amount, status")
      .in("id", crossSpaceEventIds);

    if (eventsData && eventsData.length > 0) {
      const payerNames = new Map<string, string>();
      await Promise.all(
        eventsData
          .filter((event) => event.event_type === "managed_expense_paid_personally")
          .map(async (event) => {
            const { data: payer } = await supabase
              .rpc("get_cross_space_payer_profile", { p_event_id: event.id })
              .maybeSingle();
            if (payer?.full_name) payerNames.set(event.id, payer.full_name);
          })
      );

      const spaceIds = Array.from(
        new Set(eventsData.flatMap((e) => [e.managed_space_id, e.personal_space_id]).filter(Boolean))
      );
      const { data: spacesData } = await supabase
        .from("financial_spaces")
        .select("id, name, space_type, deleted_at")
        .in("id", spaceIds);

      const spacesById = new Map(
        (spacesData ?? []).map((s) => [
          s.id,
          s.deleted_at ? `${s.name} (Dihapus)` : s.name,
        ])
      );

      crossSpaceEventsMeta = eventsData.map((e) => ({
        id: e.id,
        event_type: e.event_type as "managed_expense_paid_personally" | "personal_advance_to_managed",
        managed_space_id: e.managed_space_id,
        personal_space_id: e.personal_space_id,
        managedSpaceName: spacesById.get(e.managed_space_id) ?? "Managed Space",
        personalSpaceName: spacesById.get(e.personal_space_id) ?? "Personal Space",
        amount: toNumber(e.amount),
        status: e.status,
        payerName: payerNames.get(e.id) ?? null,
      }));
    }
  }

  let members: { user_id: string; full_name: string | null }[] = [];
  if (targetSpaceId) {
    const { data: space } = await supabase
      .from("financial_spaces")
      .select("space_type")
      .eq("id", targetSpaceId)
      .maybeSingle();

    if (space?.space_type === "managed") {
      const { data: memberData } = await getManagedSpaceMemberIdentities(targetSpaceId);
      if (memberData) {
        members = memberData;
      }
    }
  }

  const rows = attachTransactionMeta(data ?? [], supportData.wallets, supportData.categories, supportData.envelopes, crossSpaceEventsMeta, members);
  const filteredRows = filters.query ? rows.filter((transaction) => searchMatches(transaction, filters.query ?? "")) : rows;

  return {
    categories: supportData.categories,
    envelopes: supportData.envelopes,
    count: filters.query ? filteredRows.length : count ?? filteredRows.length,
    hasMore: filters.query ? false : (count ?? 0) > (page + 1) * pageSize,
    transactions: filteredRows,
    wallets: supportData.wallets,
  };
}

export async function getTransactionById(id: string) {
  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .single();

  if (txError || !transaction) throw txError || new Error("Transaction not found");

  const supportData = await getTransactionSupportData(transaction.space_id ?? undefined);

  let crossSpaceEventsMeta: CrossSpaceEventMeta[] = [];
  if (transaction.cross_space_event_id) {
    const { data: eventData } = await supabase
      .from("cross_space_events")
      .select("id, event_type, managed_space_id, personal_space_id, amount, status")
      .eq("id", transaction.cross_space_event_id)
      .single();

    if (eventData) {
      const { data: payer } = eventData.event_type === "managed_expense_paid_personally"
        ? await supabase.rpc("get_cross_space_payer_profile", { p_event_id: eventData.id }).maybeSingle()
        : { data: null };
      const spaceIds = [eventData.managed_space_id, eventData.personal_space_id].filter(Boolean);
      const { data: spacesData } = await supabase
        .from("financial_spaces")
        .select("id, name, space_type, deleted_at")
        .in("id", spaceIds);

      const spacesById = new Map(
        (spacesData ?? []).map((s) => [
          s.id,
          s.deleted_at ? `${s.name} (Dihapus)` : s.name,
        ])
      );

      crossSpaceEventsMeta = [
        {
          id: eventData.id,
          event_type: eventData.event_type as "managed_expense_paid_personally" | "personal_advance_to_managed",
          managed_space_id: eventData.managed_space_id,
          personal_space_id: eventData.personal_space_id,
          managedSpaceName: spacesById.get(eventData.managed_space_id) ?? "Managed Space",
          personalSpaceName: spacesById.get(eventData.personal_space_id) ?? "Personal Space",
          amount: toNumber(eventData.amount),
          status: eventData.status,
          payerName: payer?.full_name ?? null,
        },
      ];
    }
  }

  let members: { user_id: string; full_name: string | null }[] = [];
  if (transaction.space_id) {
    const { data: space } = await supabase
      .from("financial_spaces")
      .select("space_type")
      .eq("id", transaction.space_id)
      .maybeSingle();

    if (space?.space_type === "managed") {
      const { data: memberData } = await getManagedSpaceMemberIdentities(transaction.space_id);
      if (memberData) {
        members = memberData;
      }
    }
  }

  return attachTransactionMeta([transaction], supportData.wallets, supportData.categories, supportData.envelopes, crossSpaceEventsMeta, members)[0];
}

export async function updateTransaction(transaction: Transaction, input: UpdateTransactionInput) {
  const userId = await getAuthenticatedUserId();

  if (transaction.related_entity_type === "goal_contribution" || transaction.related_entity_type === "goal_refund") {
    throw new Error("Goal transfers are managed from Goals and cannot be edited here.");
  }

  if (
    transaction.related_entity_type === "debt_payment" ||
    transaction.related_entity_type === "receivable_payment" ||
    transaction.related_entity_type === "debt_creation" ||
    transaction.related_entity_type === "receivable_creation"
  ) {
    throw new Error("Debt & Receivable transactions are managed from Debt & Receivable and cannot be edited here.");
  }

  if (
    transaction.related_entity_type === "shared_savings_contribution" ||
    transaction.related_entity_type === "shared_savings_withdrawal"
  ) {
    throw new Error("Transaksi Tabungan Bersama dikelola langsung dari ruang Tabungan Bersama dan tidak dapat diedit di sini.");
  }

  if (transaction.status === "void") {
    throw new Error("Voided transactions cannot be edited.");
  }

  const nextOutgoingAmount = outgoingAmountFor(transaction.type, input.amount, input.transferFee ?? "0");

  if (nextOutgoingAmount) {
    const restoredOutgoingAmount =
      transaction.wallet_id === input.walletId
        ? outgoingAmountFor(transaction.type, transaction.amount, transaction.transfer_fee ?? "0") ?? "0"
        : "0";

    await assertWalletCanCover(input.walletId, nextOutgoingAmount, restoredOutgoingAmount);
  }

  const updatePayload: Database["public"]["Tables"]["transactions"]["Update"] = {
    amount: input.amount,
    category_id: input.categoryId ?? null,
    envelope_id: input.envelopeId !== undefined ? input.envelopeId : transaction.envelope_id,
    destination_wallet_id: input.destinationWalletId ?? null,
    note: input.note?.trim() || null,
    title: (input.title ?? transaction.title ?? "").trim(),
    transaction_subtype: transaction.transaction_subtype ?? null,
    transaction_date: toUtcIsoString(input.transactionDate ?? transaction.transaction_date),
    transfer_fee: input.transferFee ?? "0",
    wallet_id: input.walletId,
  };

  return supabase
    .from("transactions")
    .update(updatePayload)
    .eq("id", transaction.id)
    .select("*")
    .single();
}

export async function voidTransaction(id: string) {
  const { data: transaction, error: loadError } = await supabase
    .from("transactions")
    .select("related_entity_type")
    .eq("id", id)
    .single();

  if (loadError) {
    return { data: null, error: loadError };
  }

  if (transaction.related_entity_type === "goal_contribution" || transaction.related_entity_type === "goal_refund") {
    throw new Error("Goal transfers are managed from Goals and cannot be voided here.");
  }

  if (
    transaction.related_entity_type === "debt_payment" ||
    transaction.related_entity_type === "receivable_payment" ||
    transaction.related_entity_type === "debt_creation" ||
    transaction.related_entity_type === "receivable_creation"
  ) {
    throw new Error("Debt & Receivable transactions are managed from Debt & Receivable and cannot be voided here.");
  }

  if (
    transaction.related_entity_type === "shared_savings_contribution" ||
    transaction.related_entity_type === "shared_savings_withdrawal"
  ) {
    throw new Error("Transaksi Tabungan Bersama dikelola langsung dari ruang Tabungan Bersama dan tidak dapat dibatalkan di sini.");
  }

  return supabase
    .from("transactions")
    .update({ status: "void" })
    .eq("id", id)
    .select("*")
    .single();
}

export function filterCategoriesByType<T extends { category_type: CategoryType; is_archived: boolean }>(
  categories: T[],
  categoryType: CategoryType,
) {
  return categories.filter((category) => category.category_type === categoryType && !category.is_archived);
}
