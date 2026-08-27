import React, { type CSSProperties } from "react";
import { useI18n, type TranslationKey } from "../../i18n";
import { getCategoryIcon } from "../../lib/categoryMeta";
import { formatCurrency, toNumber } from "../../lib/money";
import type { TransactionType } from "../../types/domain";
import { useActiveSpace } from "../../context/ActiveSpaceContext";
import { transactionIcon, transactionTone } from "./TransactionDetailPanel";

export type TransactionRowData = {
  amount: string | number;
  category: { color?: string | null; icon?: string | null; name?: string | null } | null;
  destinationWallet?: { name?: string | null } | null;
  related_entity_type?: string | null;
  status?: "completed" | "pending" | "void";
  title?: string | null;
  transaction_date: string;
  transfer_fee?: string | number | null;
  type: TransactionType;
  wallet_id?: string | null;
  cross_space_role?: "personal_cash_out" | "managed_spending" | "managed_advance_cash_in" | null;
  wallet?: { name?: string | null } | null;
};

function iconSurfaceStyle(transaction: TransactionRowData): CSSProperties | undefined {
  if (!transaction.category?.color) return undefined;
  return { backgroundColor: `${transaction.category.color}18`, color: transaction.category.color };
}

export function TransactionRow({
  currency,
  density = "default",
  hideAmounts = false,
  isSelected = false,
  onSelect,
  onTogglePrivacy,
  transaction,
}: {
  currency: string;
  density?: "compact" | "default";
  hideAmounts?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onTogglePrivacy?: () => void;
  transaction: TransactionRowData;
}) {
  const { locale, t } = useI18n();
  const { activeSpace } = useActiveSpace();
  const isManaged = activeSpace?.space_type === "managed";
  const Icon = transaction.category?.icon ? getCategoryIcon(transaction.category.icon) : transactionIcon(transaction.type);
  const isVoid = transaction.status === "void";
  const iconClass = transaction.category?.color ? "" : transactionTone[transaction.type];
  const fee = toNumber(transaction.transfer_fee ?? 0);
  const amount = toNumber(transaction.amount);
  const timeLabel = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date(transaction.transaction_date));
  const title = transaction.title || (transaction.type === "transfer"
    ? `${t("transactions.transferTo") || "Transfer ke"} ${transaction.destinationWallet?.name ?? (t("wallets.title") || "Dompet")}`
    : transaction.type === "adjustment"
      ? adjustmentTitle(transaction.related_entity_type, t)
      : transaction.category?.name ?? (t("categories.uncategorized") || "Tanpa Kategori"));
  const categoryLabel = transaction.type === "transfer" ? (t("transactions.transfer") || "Transfer") : transaction.type === "adjustment" ? adjustmentCategory(transaction.related_entity_type, t) : transaction.category?.name ?? (t("categories.uncategorized") || "Tanpa Kategori");
  const walletLabel = transaction.type === "transfer" ? `${transaction.wallet?.name ?? (t("wallets.title") || "Dompet")} -> ${transaction.destinationWallet?.name ?? (t("wallets.title") || "Dompet")}` : transaction.wallet_id === null && transaction.cross_space_role === "managed_spending" ? (t("transactions.paidWithPersonalFunds") || "Dibayar dengan dana pribadi") : transaction.wallet?.name ?? (t("wallets.title") || "Dompet");
  const displayAmount = hideAmounts ? "••••••" : transaction.type === "transfer" ? formatCurrency(amount, currency) : transaction.type === "adjustment" ? `${amount > 0 ? "+" : ""}${formatCurrency(amount, currency)}` : formatCurrency(transaction.type === "income" ? amount : -amount, currency);
  const rowClass = `kash-activity-row block w-full text-left transition ${isSelected ? "bg-kash-selected/60" : ""} ${isVoid ? "opacity-60" : ""}`;
  const padding = density === "compact" ? "px-1 py-2" : "px-1 py-2.5";
  const amountClickProps = onTogglePrivacy
    ? {
        onClick: (e: React.MouseEvent) => { e.stopPropagation(); onTogglePrivacy(); },
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onTogglePrivacy(); } },
        role: "button" as const,
        tabIndex: 0,
        className: "shrink-0 text-right cursor-pointer select-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-kash-emerald/40 active:opacity-70 [@media(hover:hover)]:hover:opacity-75",
      }
    : { className: "shrink-0 text-right" };
  const content = <>
    <span className={`flex items-center gap-3 ${padding} ${density === "default" ? "md:hidden" : ""}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 ${iconClass}`} style={iconSurfaceStyle(transaction)}><Icon aria-hidden="true" size={16} strokeWidth={2} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900">{title}</span><span className="mt-0.5 block truncate text-xs font-medium text-slate-500">{categoryLabel} • {walletLabel}</span>{isVoid ? <span className="mt-0.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{t("transactions.voided") || "Dibatalkan"}</span> : null}</span>
      <span {...amountClickProps}><span className={`block text-sm font-extrabold ${isVoid ? "text-slate-500 line-through" : transactionTone[transaction.type]}`}>{displayAmount}</span>{!hideAmounts && transaction.type === "transfer" && fee > 0 ? <span className="block text-[10px] font-bold text-kash-expense">+ {t("transactions.fee") || "biaya"} {formatCurrency(fee, currency)}</span> : null}<span className="mt-0.5 block text-[11px] font-medium text-slate-500">{timeLabel}</span></span>
    </span>
    {density === "default" ? <span className="hidden items-center gap-4 px-2 py-2.5 text-sm md:flex"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 ${iconClass}`} style={iconSurfaceStyle(transaction)}><Icon aria-hidden="true" size={16} strokeWidth={2} /></span><span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-900">{title}</span><span className="mt-0.5 block truncate text-xs font-medium text-slate-500">{categoryLabel}</span></span><span className="min-w-0 truncate font-medium text-slate-500">{walletLabel}</span><span {...amountClickProps}><span className={`block text-right font-extrabold ${isVoid ? "text-slate-500 line-through" : transactionTone[transaction.type]}`}>{displayAmount}{!hideAmounts && transaction.type === "transfer" && fee > 0 ? <span className="block text-[10px] font-bold text-kash-expense">+ {t("transactions.fee") || "biaya"} {formatCurrency(fee, currency)}</span> : null}</span></span><span className="text-right text-xs font-medium text-slate-500">{timeLabel}</span></span> : null}
  </>;
  return onSelect ? <button type="button" onClick={onSelect} className={rowClass}>{content}</button> : <div className={rowClass}>{content}</div>;
}

function adjustmentTitle(relatedType: string | null | undefined, t: (key: TranslationKey) => string) {
  if (relatedType === "debt_payment") return t("debts.debtPayment") || "Pembayaran Utang";
  if (relatedType === "receivable_payment") return t("debts.receivableCollection") || "Pelunasan Piutang";
  if (relatedType === "shared_savings_contribution") return t("sharedSavings.contribution") || "Setoran Tabungan Bersama";
  if (relatedType === "shared_savings_withdrawal") return t("sharedSavings.withdrawal") || "Penarikan Tabungan Bersama";
  if (relatedType === "goal_contribution") return t("goals.contribution") || "Setoran Target";
  if (relatedType === "goal_refund") return t("goals.refund") || "Pengembalian Target";
  return t("wallets.balanceAdjustment") || "Penyesuaian Saldo";
}

function adjustmentCategory(relatedType: string | null | undefined, t: (key: TranslationKey) => string) {
  if (relatedType === "debt_payment" || relatedType === "debt_creation") return t("debts.debt") || "Utang";
  if (relatedType === "receivable_payment" || relatedType === "receivable_creation") return t("debts.receivable") || "Piutang";
  if (relatedType === "shared_savings_contribution" || relatedType === "shared_savings_withdrawal") return t("sharedSavings.title") || "Tabungan Bersama";
  if (relatedType === "goal_contribution" || relatedType === "goal_refund") return t("goals.title") || "Target";
  return t("wallets.adjustment") || "Penyesuaian";
}
