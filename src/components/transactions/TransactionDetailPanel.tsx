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
import { useSpaceTerminology } from "../../hooks/useSpaceTerminology";
import type { TransactionType } from "../../types/domain";
import type { TransactionWithMeta } from "../../lib/transactions";

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
  return transaction.category?.name ?? (transaction.type === "income" ? "Income" : "Expense");
}

export function transactionCategoryLabel(transaction: TransactionWithMeta) {
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

  return transaction.wallet?.name ?? "Wallet";
}

export function signedTransactionAmount(transaction: TransactionWithMeta) {
  const amount = toNumber(transaction.amount);
  if (transaction.type === "income") return amount;
  if (transaction.type === "expense") return -amount;
  return amount;
}

export function displayTransactionAmount(transaction: TransactionWithMeta, currency = "IDR") {
  if (transaction.type === "transfer") return formatCurrency(transaction.amount, currency);
  if (transaction.type === "adjustment") {
    const amount = toNumber(transaction.amount);
    return `${amount > 0 ? "+" : ""}${formatCurrency(amount, currency)}`;
  }
  return formatCurrency(signedTransactionAmount(transaction), currency);
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-4 py-3 text-sm">
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
  const { activeSpace } = useActiveSpace();
  const isManaged = activeSpace?.space_type === "managed";

  if (!transaction) return null;

  const Icon = transactionIcon(transaction.type);
  const dateLabel = formatDate(new Date(transaction.transaction_date));
  const isVoid = transaction.status === "void";
  const amount = toNumber(transaction.amount);
  const fee = toNumber(transaction.transfer_fee);

  const getTranslatedTitle = () => {
    if (transaction.title) return transaction.title;
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
    return transaction.category?.name ?? (transaction.type === "income" ? (isManaged ? (t("transactions.funding" as any) || "Dana Masuk") : (t("transactions.income") || "Pemasukan")) : (isManaged ? (t("transactions.spending" as any) || "Pengeluaran") : (t("transactions.expense") || "Pengeluaran")));
  };

  const getTranslatedCategoryLabel = () => {
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

  const terms = useSpaceTerminology();
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 ${transactionTone[transaction.type]}`}>
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
          <p className={`break-words text-3xl font-extrabold ${isVoid ? "text-slate-600 line-through" : transactionTone[transaction.type]}`}>
            {displayTransactionAmount(transaction, currency)}
          </p>
          {isVoid ? <p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-600">{t("transactions.voided") || "Dibatalkan"}</p> : null}
        </div>

        {isLinked ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs font-semibold text-amber-900">
            {linkedMessage}
          </div>
        ) : null}

        <dl className="divide-y divide-slate-100 border-y border-slate-100">
          <DetailLine label={t("common.date") || "Tanggal"} value={dateLabel} />
          <DetailLine label={transaction.type === "transfer" ? (t("transactions.from") || "Dari") : (t("wallets.title") || "Dompet")} value={transaction.wallet?.name ?? (t("wallets.title") || "Dompet")} />
          {transaction.type === "transfer" ? <DetailLine label={t("transactions.to") || "Ke"} value={transaction.destinationWallet?.name ?? (t("wallets.title") || "Dompet")} /> : null}
          {transaction.type !== "transfer" && transaction.type !== "adjustment" ? <DetailLine label={t("categories.title") || "Kategori"} value={getTranslatedCategoryLabel()} /> : null}
          {transaction.envelope ? <DetailLine label={t("envelopes.title") || "Amplop"} value={transaction.envelope.name} /> : null}
          {transaction.type === "transfer" ? <DetailLine label={t("transactions.transferFee") || "Biaya Transfer"} value={fee > 0 ? formatCurrency(fee, currency) : "-"} /> : null}
          {transaction.type === "transfer" ? <DetailLine label={t("transactions.totalDeducted") || "Total Terpotong"} value={formatCurrency(amount + fee, currency)} /> : null}
          {transaction.type === "transfer" ? <DetailLine label={t("transactions.destinationReceived") || "Diterima Tujuan"} value={formatCurrency(amount, currency)} /> : null}
          <DetailLine label={t("transactions.note") || "Catatan"} value={transaction.note || "-"} />
          <DetailLine label={t("common.status") || "Status"} value={isVoid ? (t("transactions.voided") || "Dibatalkan") : (t("transactions.completed") || "Selesai")} />
          <DetailLine label={t("transactions.transactionId") || "ID Transaksi"} value={transaction.id} />
        </dl>

        {onEdit || onDuplicate || onVoid ? (
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 p-2">
            {onEdit ? (
              <button disabled={isVoid || isLinked} type="button" onClick={onEdit} className="flex flex-col items-center gap-1 rounded-lg px-2 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:text-slate-600">
                <Edit3 size={17} />
                {t("common.edit") || "Edit"}
              </button>
            ) : null}
            {onDuplicate ? (
              <button type="button" onClick={onDuplicate} className="flex flex-col items-center gap-1 rounded-lg px-2 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <Copy size={17} />
                {t("transactions.duplicate") || "Duplikat"}
              </button>
            ) : null}
            {onVoid ? (
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
