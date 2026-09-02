import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpRight,
  Copy,
  CreditCard,
  Edit3,
  Trash2,
} from "lucide-react";
import { useI18n } from "../../i18n";
import { formatCurrency, toNumber } from "../../lib/money";
import { Modal } from "../ui/Modal";
import { useActiveSpace } from "../../context/ActiveSpaceContext";
import { useAuth } from "../../context/AuthContext";
import { useSpaceTerminology } from "../../hooks/useSpaceTerminology";
import { supabase } from "../../lib/supabase";
import type { TransactionType } from "../../types/domain";
import { canCreateTransaction, canEditTransaction, isExternalTransfer, type TransactionWithMeta } from "../../lib/transactions";

export const transactionTone: Record<TransactionType, string> = {
  adjustment: "text-slate-700",
  expense: "text-[#E50914]",
  income: "text-kash-emerald",
  transfer: "text-kash-transfer",
};

export function transactionIcon(type: TransactionType) {
  if (type === "income") return ArrowDownLeft;
  if (type === "expense") return ArrowUpRight;
  if (type === "transfer") return ArrowRightLeft;
  if (type === "adjustment") return CreditCard;
  return ArrowDown;
}

export function transactionTitle(transaction: TransactionWithMeta) {
  if (transaction.title) return transaction.title;
  if (isExternalTransfer(transaction)) return "Transfer Keluar";
  if (transaction.type === "transfer") return `Transfer to ${transaction.destinationWallet?.name ?? "Wallet"}`;
  if (transaction.type === "adjustment") {
    if (transaction.related_entity_type === "debt_payment") return "Debt Payment";
    if (transaction.related_entity_type === "receivable_payment") return "Receivable Collection";
    if (transaction.related_entity_type === "shared_savings_contribution") return "Shared Savings Contribution";
    if (transaction.related_entity_type === "shared_savings_withdrawal") return "Shared Savings Withdrawal";
    if (transaction.related_entity_type === "goal_contribution") return "Goal Contribution";
    if (transaction.related_entity_type === "goal_refund") return "Goal Refund";
    return "Balance Adjustment";
  }
  return transaction.category?.name ?? "Uncategorized";
}

export function transactionCategoryLabel(transaction: TransactionWithMeta) {
  if (isExternalTransfer(transaction)) return transaction.category?.name ?? "Uncategorized";
  if (transaction.type === "transfer") return "Transfer";
  if (transaction.type === "adjustment") {
    if (transaction.related_entity_type === "debt_payment" || transaction.related_entity_type === "debt_creation") return "Debt";
    if (transaction.related_entity_type === "receivable_payment" || transaction.related_entity_type === "receivable_creation") return "Receivable";
    if (
      transaction.related_entity_type === "shared_savings_contribution" ||
      transaction.related_entity_type === "shared_savings_withdrawal"
    ) {
      return "Shared Savings";
    }
    if (
      transaction.related_entity_type === "goal_contribution" ||
      transaction.related_entity_type === "goal_refund"
    ) {
      return "Goal";
    }
    return "Adjustment";
  }
  return transaction.category?.name ?? "Uncategorized";
}

export function transactionWalletLabel(transaction: TransactionWithMeta) {
  if (transaction.type === "transfer") {
    return `${transaction.wallet?.name ?? "Wallet"} -> ${transaction.destinationWallet?.name ?? "Wallet"}`;
  }
  if (transaction.wallet_id === null && transaction.cross_space_role === "managed_spending") {
    return "Paid with personal funds";
  }
  return transaction.wallet?.name ?? "Wallet";
}

export function signedTransactionAmount(transaction: TransactionWithMeta) {
  const amount = toNumber(transaction.amount);
  if (transaction.type === "income") return amount;
  if (isExternalTransfer(transaction)) return -(amount + toNumber(transaction.transfer_fee));
  if (transaction.type === "expense" || transaction.cross_space_role === "personal_cash_out") return -amount;
  return amount;
}

export function displayTransactionAmount(transaction: TransactionWithMeta, currency = "IDR") {
  if (transaction.type === "transfer") return formatCurrency(transaction.amount, currency);
  if (transaction.cross_space_role === "personal_cash_out") {
    const amount = toNumber(transaction.amount);
    return formatCurrency(-amount, currency);
  }
  if (transaction.type === "adjustment") {
    const amount = toNumber(transaction.amount);
    return `${amount > 0 ? "+" : ""}${formatCurrency(amount, currency)}`;
  }
  return formatCurrency(signedTransactionAmount(transaction), currency);
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-4 py-3 text-sm">
      <dt className="font-bold text-slate-600">{label}</dt>
      <dd className="break-words font-bold text-slate-900">{value}</dd>
    </div>
  );
}

export function TransactionDetailModal({
  currency,
  isOpen,
  onClose,
  onDuplicate,
  onEdit,
  onVoid,
  transaction,
}: {
  currency: string;
  isOpen: boolean;
  onClose: () => void;
  onDuplicate?: () => void;
  onEdit?: () => void;
  onVoid?: () => void;
  transaction: TransactionWithMeta | null;
}) {
  const { t, formatDate, formatCurrency } = useI18n();
  const { user } = useAuth();
  const { activeSpace, userRole } = useActiveSpace();
  const isManaged = activeSpace?.space_type === "managed";
  const terms = useSpaceTerminology();
  const canCreate = canCreateTransaction(activeSpace, userRole);
  const canEdit = Boolean(onEdit && canEditTransaction(transaction, activeSpace, user?.id, userRole));
  const canDuplicate = Boolean(onDuplicate && canCreate);
  const canVoid = Boolean(onVoid && canEditTransaction(transaction, activeSpace, user?.id, userRole));

  const [crossSpaceDetails, setCrossSpaceDetails] = useState<{
    eventType: string;
    managedSpaceName: string;
    categoryName?: string;
    originalAmount: number;
    totalPaid: number;
    remainingAmount: number;
    statusLabel: string;
  } | null>(null);

  // Load cross space event & debt details if present
  useEffect(() => {
    const eventId = transaction?.cross_space_event_id;
    const relatedEntityId = transaction?.related_entity_id;

    if (!isOpen || !transaction || !eventId) {
      setCrossSpaceDetails(null);
      return;
    }

    let isMounted = true;

    async function loadCrossSpaceData() {
      try {
        const [eventRes, debtRes] = await Promise.all([
          supabase
            .from("cross_space_events")
            .select("id, event_type, managed_space_id, personal_space_id, amount, status, managed_category_id")
            .eq("id", eventId as string)
            .maybeSingle(),
          relatedEntityId
            ? supabase
                .from("debt_progress_view")
                .select("*")
                .eq("debt_id", relatedEntityId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (!isMounted || !eventRes.data) return;

        const [spaceRes, catRes] = await Promise.all([
          supabase.from("financial_spaces").select("name, deleted_at").eq("id", eventRes.data.managed_space_id).maybeSingle(),
          eventRes.data.managed_category_id
            ? supabase.from("categories").select("name").eq("id", eventRes.data.managed_category_id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (!isMounted) return;

        const managedSpaceName = spaceRes.data
          ? (spaceRes.data.deleted_at ? `${spaceRes.data.name} (Dihapus)` : spaceRes.data.name)
          : (t("spaces.managed") || "Managed Space");
        const categoryName = catRes.data?.name ?? undefined;
        const origAmount = debtRes.data ? toNumber(debtRes.data.original_amount) : toNumber(eventRes.data.amount);
        const totalPaid = debtRes.data ? toNumber(debtRes.data.total_paid) : 0;
        const remaining = debtRes.data ? toNumber(debtRes.data.remaining_amount) : toNumber(eventRes.data.amount);

        let statusLabel: string;
        if (debtRes.data?.status === "settled" || remaining === 0) {
          statusLabel = t("reimbursable.reimbursed") || "Sudah direimburse";
        } else if (debtRes.data?.status === "partially_paid" || totalPaid > 0) {
          statusLabel = t("reimbursable.partiallyReimbursed") || "Direimburse sebagian";
        } else {
          statusLabel = t("reimbursable.awaitingReimbursement") || "Menunggu reimbursement";
        }

        setCrossSpaceDetails({
          eventType: eventRes.data.event_type,
          managedSpaceName,
          categoryName,
          originalAmount: origAmount,
          totalPaid,
          remainingAmount: remaining,
          statusLabel,
        });
      } catch (err) {
        console.error("Failed to load cross-space details", err);
      }
    }

    void loadCrossSpaceData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, transaction?.id, transaction?.cross_space_event_id, transaction?.related_entity_id, t]);

  if (!transaction) return null;

  const Icon = transactionIcon(transaction.type);
  const dateLabel = formatDate(new Date(transaction.transaction_date));
  const isVoid = transaction.status === "void";
  const amount = toNumber(transaction.amount);
  const fee = toNumber(transaction.transfer_fee);
  const externalTransfer = isExternalTransfer(transaction);

  const isReimbursableEvent = crossSpaceDetails?.eventType === "managed_expense_paid_personally";
  const isAdvanceEvent = crossSpaceDetails?.eventType === "personal_advance_to_managed";

  const getTranslatedTitle = () => {
    if (transaction.title) return transaction.title;
    if (isReimbursableEvent) return t("reimbursable.title") || "Pengeluaran Reimburse";
    if (isAdvanceEvent) return t("spaces.personalAdvance") || "Talangan ke Managed";
    if (externalTransfer) return t("transactions.outgoingTransfer") || "Transfer Keluar";
    if (transaction.type === "transfer") return `${t("transactions.transferTo") || "Transfer ke"} ${transaction.destinationWallet?.name ?? (t("wallets.title") || "Dompet")}`;
    if (transaction.type === "adjustment") {
      if (transaction.related_entity_type === "debt_payment") return t("debts.debtPayment") || "Pembayaran Utang";
      if (transaction.related_entity_type === "receivable_payment") return t("debts.receivableCollection") || "Pelunasan Piutang";
      if (transaction.related_entity_type === "shared_savings_contribution") return t("sharedSavings.contribution") || "Setoran Tabungan Bersama";
      if (transaction.related_entity_type === "shared_savings_withdrawal") return t("sharedSavings.withdrawal") || "Penarikan Tabungan Bersama";
      if (transaction.related_entity_type === "goal_contribution") return t("goals.contribution") || "Setoran Target";
      if (transaction.related_entity_type === "goal_refund") return t("goals.refund") || "Pengembalian Target";
      return t("wallets.balanceAdjustment") || "Penyesuaian Saldo";
    }
    return transaction.category?.name ?? (t("categories.uncategorized") || "Tanpa Kategori");
  };

  const getTranslatedCategoryLabel = () => {
    if (isReimbursableEvent) return t("reimbursable.title") || "Pengeluaran Reimburse";
    if (isAdvanceEvent) return t("spaces.personalAdvance") || "Talangan ke Managed";
    if (externalTransfer) return transaction.category?.name ?? (t("categories.uncategorized") || "Tanpa Kategori");
    if (transaction.type === "transfer") return t("transactions.transfer") || "Transfer";
    if (transaction.type === "adjustment") {
      if (transaction.related_entity_type === "debt_payment" || transaction.related_entity_type === "debt_creation") return t("debts.debt") || "Utang";
      if (transaction.related_entity_type === "receivable_payment" || transaction.related_entity_type === "receivable_creation") return t("debts.receivable") || "Piutang";
      if (
        transaction.related_entity_type === "shared_savings_contribution" ||
        transaction.related_entity_type === "shared_savings_withdrawal"
      ) {
        return t("sharedSavings.title") || "Tabungan Bersama";
      }
      if (
        transaction.related_entity_type === "goal_contribution" ||
        transaction.related_entity_type === "goal_refund"
      ) {
        return t("goals.title") || "Target";
      }
      return t("wallets.adjustment") || "Penyesuaian";
    }
    return transaction.category?.name ?? (t("categories.uncategorized") || "Tanpa Kategori");
  };

  const isLinked =
    transaction.related_entity_type === "goal_contribution" ||
    transaction.related_entity_type === "goal_refund" ||
    transaction.related_entity_type === "debt_payment" ||
    transaction.related_entity_type === "receivable_payment" ||
    transaction.related_entity_type === "debt_creation" ||
    transaction.related_entity_type === "receivable_creation" ||
    transaction.related_entity_type === "shared_savings_contribution" ||
    transaction.related_entity_type === "shared_savings_withdrawal";

  const linkedMessage =
    transaction.related_entity_type === "shared_savings_contribution" ||
    transaction.related_entity_type === "shared_savings_withdrawal"
      ? (t("transactions.linkedSharedSavings") || "Transaksi Tabungan Bersama. Dikelola langsung dari ruang Tabungan Bersama.")
      : transaction.related_entity_type === "debt_payment" ||
        transaction.related_entity_type === "receivable_payment" ||
        transaction.related_entity_type === "debt_creation" ||
        transaction.related_entity_type === "receivable_creation"
        ? (t("transactions.linkedDebt") || "Transaksi terhubung dengan Utang & Piutang. Dikelola langsung dari halaman Utang & Piutang.")
        : terms.linkedGoalMessage;

  const amountTone = isVoid
    ? "text-slate-600 line-through"
    : transaction.cross_space_role === "personal_cash_out"
      ? "text-[#E50914]"
      : transactionTone[transaction.type];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 ${amountTone}`}>
            <Icon aria-hidden="true" size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {transaction.type === "transfer" ? (t("transactions.transfer") || "Transfer") : getTranslatedCategoryLabel()}
            </p>
            <h2 className="text-lg font-extrabold text-slate-900 truncate">
              {getTranslatedTitle()}
            </h2>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className={`break-words text-3xl font-extrabold ${amountTone}`}>
            {displayTransactionAmount(transaction, currency)}
          </p>
          {isVoid ? <p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-600">{t("transactions.voided") || "Dibatalkan"}</p> : null}
        </div>

        {isLinked && !isReimbursableEvent && !isAdvanceEvent ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs font-semibold text-amber-900">
            {linkedMessage}
          </div>
        ) : null}

        <dl className="divide-y divide-slate-100 border-y border-slate-100">
          <DetailLine label={t("common.date") || "Tanggal"} value={dateLabel} />
          
          {isReimbursableEvent && crossSpaceDetails ? (
            <>
              <DetailLine label={t("reimbursable.paidFrom") || "Dibayar dari"} value={transaction.wallet?.name ?? (t("wallets.title") || "Dompet")} />
              <DetailLine label={t("reimbursable.reimbursedBy") || "Direimburse oleh"} value={crossSpaceDetails.managedSpaceName} />
              <DetailLine label={t("reimbursable.expenseCategory") || "Kategori pengeluaran"} value={crossSpaceDetails.categoryName ?? (t("categories.uncategorized") || "Tanpa Kategori")} />
              <DetailLine label={t("common.status") || "Status"} value={crossSpaceDetails.statusLabel} />
              {crossSpaceDetails.totalPaid > 0 ? (
                <DetailLine label={t("reimbursable.reimbursedAmount") || "Sudah direimburse"} value={formatCurrency(crossSpaceDetails.totalPaid, currency)} />
              ) : null}
              <DetailLine label={t("reimbursable.outstanding") || "Sisa reimbursement"} value={formatCurrency(crossSpaceDetails.remainingAmount, currency)} />
            </>
          ) : isAdvanceEvent && crossSpaceDetails ? (
            <>
              <DetailLine label={t("reimbursable.paidFrom") || "Dibayar dari"} value={transaction.wallet?.name ?? (t("wallets.title") || "Dompet")} />
              <DetailLine label={t("spaces.managed") || "Space Tujuan"} value={crossSpaceDetails.managedSpaceName} />
              <DetailLine label={t("common.status") || "Status"} value={crossSpaceDetails.statusLabel} />
              {crossSpaceDetails.totalPaid > 0 ? (
                <DetailLine label={t("reimbursable.reimbursedAmount") || "Sudah dikembalikan"} value={formatCurrency(crossSpaceDetails.totalPaid, currency)} />
              ) : null}
              <DetailLine label={t("reimbursable.outstanding") || "Sisa talangan"} value={formatCurrency(crossSpaceDetails.remainingAmount, currency)} />
            </>
          ) : (
            <>
              <DetailLine label={t("transactions.type") || "Tipe Transaksi"} value={externalTransfer ? (t("transactions.outgoingTransfer") || "Transfer Keluar") : terms.getTransactionTypeLabel(transaction.type)} />
              {externalTransfer ? <DetailLine label={t("transactions.transferAmount") || "Nominal Transfer"} value={formatCurrency(amount, currency)} /> : null}
              {externalTransfer ? <DetailLine label={t("transactions.adminFee") || "Biaya Admin"} value={fee > 0 ? formatCurrency(fee, currency) : "-"} /> : null}
              {externalTransfer ? <DetailLine label={t("transactions.totalOutgoing") || "Total Keluar"} value={formatCurrency(amount + fee, currency)} /> : null}
              <DetailLine label={transaction.type === "transfer" ? (t("transactions.from") || "Dari") : (t("wallets.title") || "Dompet")} value={transaction.wallet_id === null && transaction.cross_space_role === "managed_spending" ? (t("transactions.paidWithPersonalFunds") || "Dibayar dengan dana pribadi") : transaction.wallet?.name ?? (t("wallets.title") || "Dompet")} />
              {transaction.type === "transfer" ? <DetailLine label={t("transactions.to") || "Ke"} value={transaction.destinationWallet?.name ?? (t("wallets.title") || "Dompet")} /> : null}
              {transaction.type !== "transfer" && transaction.type !== "adjustment" ? <DetailLine label={t("categories.title") || "Kategori"} value={getTranslatedCategoryLabel()} /> : null}
              {transaction.envelope ? <DetailLine label={t("envelopes.title") || "Amplop"} value={transaction.envelope.name} /> : null}
              {transaction.type === "transfer" ? <DetailLine label={t("transactions.transferFee") || "Biaya Transfer"} value={fee > 0 ? formatCurrency(fee, currency) : "-"} /> : null}
              {transaction.type === "transfer" ? <DetailLine label={t("transactions.totalDeducted") || "Total Terpotong"} value={formatCurrency(amount + fee, currency)} /> : null}
              {transaction.type === "transfer" ? <DetailLine label={t("transactions.destinationReceived") || "Diterima Tujuan"} value={formatCurrency(amount, currency)} /> : null}
              <DetailLine label={t("common.status") || "Status"} value={isVoid ? (t("transactions.voided") || "Dibatalkan") : (t("transactions.completed") || "Selesai")} />
            </>
          )}

          {transaction.creatorName ? (
            <DetailLine label={t("transactions.createdBy") || "Dibuat oleh"} value={transaction.creatorName} />
          ) : null}
          <DetailLine label={t("transactions.note") || "Catatan"} value={transaction.note || "-"} />
          <DetailLine label={t("transactions.transactionId") || "ID Transaksi"} value={transaction.id} />
        </dl>

        {canEdit || canDuplicate || canVoid ? (
          <div
            className={`grid ${
              [canEdit, canDuplicate, canVoid].filter(Boolean).length === 3
                ? "grid-cols-3"
                : [canEdit, canDuplicate, canVoid].filter(Boolean).length === 2
                  ? "grid-cols-2"
                  : "grid-cols-1"
            } gap-2 rounded-lg border border-slate-200 p-2`}
          >
            {canEdit ? (
              <button disabled={isVoid || isLinked} type="button" onClick={onEdit} className="flex flex-col items-center gap-1 rounded-lg px-2 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:text-slate-600">
                <Edit3 size={17} />
                {t("common.edit") || "Edit"}
              </button>
            ) : null}
            {canDuplicate ? (
              <button type="button" onClick={onDuplicate} className="flex flex-col items-center gap-1 rounded-lg px-2 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <Copy size={17} />
                {t("transactions.duplicate") || "Duplikat"}
              </button>
            ) : null}
            {canVoid ? (
              <button disabled={isVoid || isLinked} type="button" onClick={onVoid} className="flex flex-col items-center gap-1 rounded-lg px-2 py-3 text-xs font-bold text-kash-expense hover:bg-kash-expense/10 disabled:text-slate-600 disabled:hover:bg-transparent">
                <Trash2 size={17} />
                {t("transactions.void") || "Void"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

// Retain alias for any existing imports
export { TransactionDetailModal as TransactionDetailPanel };
