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
  X,
} from "lucide-react";
import { formatCurrency, toNumber } from "../../lib/money";
import { IconButton } from "../ui/IconButton";
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
  if (transaction.type === "adjustment") return "Balance Adjustment";
  return transaction.category?.name ?? (transaction.type === "income" ? "Income" : "Expense");
}

export function transactionCategoryLabel(transaction: TransactionWithMeta) {
  if (transaction.type === "transfer") return "Transfer";
  if (transaction.type === "adjustment") return "Adjustment";
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

export function TransactionDetailPanel({
  className = "",
  currency,
  onClose,
  onDuplicate,
  onEdit,
  onVoid,
  transaction,
}: {
  className?: string;
  currency: string;
  onClose: () => void;
  onDuplicate?: () => void;
  onEdit?: () => void;
  onVoid?: () => void;
  transaction: TransactionWithMeta;
}) {
  const Icon = transactionIcon(transaction.type);
  const dateLabel = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" }).format(new Date(transaction.transaction_date));
  const isVoid = transaction.status === "void";
  const amount = toNumber(transaction.amount);
  const fee = toNumber(transaction.transfer_fee);

  const isLinked =
    transaction.related_entity_type === "goal_contribution" ||
    transaction.related_entity_type === "goal_refund" ||
    transaction.related_entity_type === "debt_payment" ||
    transaction.related_entity_type === "receivable_payment";

  const linkedMessage =
    transaction.related_entity_type === "debt_payment" || transaction.related_entity_type === "receivable_payment"
      ? "Settlement transaction linked to Debt & Receivable. Edits and voids are managed from Debt & Receivable."
      : "Goal transfer linked to Goals. Edits and voids are managed from Goals.";

  return (
    <aside className={`overflow-y-auto border border-slate-200 bg-white p-5 shadow-soft ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <span className={`flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 ${transactionTone[transaction.type]}`}>
          <Icon aria-hidden="true" size={21} />
        </span>
        <IconButton icon={X} label="Close transaction detail" onClick={onClose} />
      </div>

      <div className="mt-6">
        <p className="text-sm font-bold text-slate-600">{transaction.type === "transfer" ? "Transfer" : transactionCategoryLabel(transaction)}</p>
        <h2 className="mt-2 text-xl font-extrabold text-slate-900">{transactionTitle(transaction)}</h2>
        <p className={`mt-4 break-words text-3xl font-extrabold ${isVoid ? "text-slate-600 line-through" : transactionTone[transaction.type]}`}>
          {displayTransactionAmount(transaction, currency)}
        </p>
        {isVoid ? <p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-600">Voided</p> : null}
      </div>

      {isLinked ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs font-semibold text-amber-900">
          {linkedMessage}
        </div>
      ) : null}

      <dl className="mt-6 divide-y divide-slate-100 border-y border-slate-100">
        <DetailLine label="Date" value={dateLabel} />
        <DetailLine label={transaction.type === "transfer" ? "From" : "Wallet"} value={transaction.wallet?.name ?? "Wallet"} />
        {transaction.type === "transfer" ? <DetailLine label="To" value={transaction.destinationWallet?.name ?? "Wallet"} /> : null}
        {transaction.type !== "transfer" && transaction.type !== "adjustment" ? <DetailLine label="Category" value={transactionCategoryLabel(transaction)} /> : null}
        {transaction.type === "transfer" ? <DetailLine label="Transfer Fee" value={fee > 0 ? formatCurrency(fee, currency) : "-"} /> : null}
        {transaction.type === "transfer" ? <DetailLine label="Total Deducted" value={formatCurrency(amount + fee, currency)} /> : null}
        {transaction.type === "transfer" ? <DetailLine label="Destination Received" value={formatCurrency(amount, currency)} /> : null}
        <DetailLine label="Notes" value={transaction.note || "-"} />
        <DetailLine label="Status" value={isVoid ? "Voided" : "Completed"} />
        <DetailLine label="Transaction ID" value={transaction.id} />
      </dl>

      {onEdit || onDuplicate || onVoid ? (
        <div className="mt-6 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 p-2">
          {onEdit ? (
            <button disabled={isVoid || isLinked} type="button" onClick={onEdit} className="flex flex-col items-center gap-1 rounded-lg px-2 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:text-slate-600">
              <Edit3 size={17} />
              Edit
            </button>
          ) : null}
          {onDuplicate ? (
            <button type="button" onClick={onDuplicate} className="flex flex-col items-center gap-1 rounded-lg px-2 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <Copy size={17} />
              Duplicate
            </button>
          ) : null}
          {onVoid ? (
            <button disabled={isVoid || isLinked} type="button" onClick={onVoid} className="flex flex-col items-center gap-1 rounded-lg px-2 py-3 text-xs font-bold text-kash-expense hover:bg-kash-expense/10 disabled:text-slate-600 disabled:hover:bg-transparent">
              <Trash2 size={17} />
              Void
            </button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
