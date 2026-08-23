import type { ReactNode } from "react";
import { useI18n } from "../../i18n";
import { formatCurrency } from "../../lib/money";
import { transactionIcon, transactionTone } from "./TransactionDetailPanel";
import type { TransactionType } from "../../types/domain";

export function TransactionPreviewRow({
  amount,
  categoryLabel,
  currency,
  dateLabel,
  fee = 0,
  hideAmounts = false,
  icon,
  onClick,
  title,
  type,
  walletLabel,
}: {
  amount: number;
  categoryLabel: string;
  currency: string;
  dateLabel: string;
  fee?: number;
  hideAmounts?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
  title: string;
  type: TransactionType;
  walletLabel: string;
}) {
  const { t } = useI18n();
  const Icon = transactionIcon(type);
  const signedAmount = type === "income" ? amount : type === "expense" ? -amount : amount;
  const displayAmount = hideAmounts ? "••••••" : type === "adjustment" ? `${amount > 0 ? "+" : ""}${formatCurrency(amount, currency)}` : formatCurrency(signedAmount, currency);
  const content = <>
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 ${transactionTone[type]}`}>{icon ?? <Icon aria-hidden="true" size={16} strokeWidth={2} />}</span>
    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900">{title}</span><span className="mt-0.5 block truncate text-xs font-medium text-slate-500">{categoryLabel} · {walletLabel}</span></span>
    <span className="shrink-0 text-right"><span className={`block text-sm font-extrabold ${transactionTone[type]}`}>{displayAmount}</span>{!hideAmounts && type === "transfer" && fee > 0 ? <span className="block text-[10px] font-bold text-kash-expense">+ {t("transactions.fee") || "biaya"} {formatCurrency(fee, currency)}</span> : null}<span className="mt-0.5 block text-[11px] font-medium text-slate-500">{dateLabel}</span></span>
  </>;

  const className = "kash-activity-row flex w-full items-center gap-3 px-1 py-2.5 text-left transition hover:bg-slate-50";
  return onClick ? <button type="button" onClick={onClick} className={className}>{content}</button> : <div className={className}>{content}</div>;
}
