import { Link } from "react-router-dom";
import { Tags } from "lucide-react";
import { Modal } from "../ui/Modal";
import { useI18n } from "../../i18n";

export type SpendingSheetGroup = { id: string; name: string; amount: number; groupType: "envelope" | "category" };
export type SpendingSheetTransaction = { id: string; amount: string | number; title?: string | null; categoryName: string; envelopeName?: string | null; dateLabel?: string; walletName?: string };

export function SpendingBreakdownSheet({ group, currency, periodLabel, transactions, loading = false, onClose, transactionHref }: { group: SpendingSheetGroup | null; currency: string; periodLabel?: string; transactions: SpendingSheetTransaction[]; loading?: boolean; onClose: () => void; transactionHref: string }) {
  const { t, formatCurrency } = useI18n();
  const categoryTotals = new Map<string, { name: string; amount: number }>();
  transactions.forEach((transaction) => { const current = categoryTotals.get(transaction.categoryName) ?? { name: transaction.categoryName, amount: 0 }; current.amount += Number(transaction.amount) || 0; categoryTotals.set(transaction.categoryName, current); });
  return <Modal isOpen={Boolean(group)} onClose={onClose} maxWidth="lg" showCloseButton={false} title={group?.name ?? ""}>
    {group ? <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
      <div className="flex items-start justify-between gap-3"><div><span className="inline-flex items-center gap-1 rounded-full bg-kash-selected px-2 py-1 text-[11px] font-bold text-kash-emeraldDark"><Tags size={12} />{group.groupType === "envelope" ? (t("budgets.envelope") || "Envelope") : (t("reports.category") || "Category")}</span><p className="mt-2 text-xl font-extrabold text-slate-900">{formatCurrency(group.amount, currency)}</p>{periodLabel ? <p className="mt-1 text-xs font-semibold text-slate-500">{periodLabel}</p> : null}</div><p className="text-xs font-semibold text-slate-500">{transactions.length} {t("reports.transactions")}</p></div>
      {group.groupType === "envelope" ? <section><h3 className="text-sm font-extrabold text-slate-900">{t("reports.categoryBreakdown") || "Category Breakdown"}</h3><div className="mt-2 space-y-2">{[...categoryTotals.values()].sort((a, b) => b.amount - a.amount).map((item) => <div key={item.name} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="truncate font-semibold text-slate-700">{item.name}</span><span className="font-bold text-slate-900">{formatCurrency(item.amount, currency)}</span></div>)}</div></section> : null}
      <section><h3 className="text-sm font-extrabold text-slate-900">{t("reports.transactions")}</h3><div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">{loading ? <p className="p-4 text-sm font-semibold text-slate-500">{t("reports.loading") || "Memuat..."}</p> : transactions.map((transaction) => <div key={transaction.id} className="flex items-start justify-between gap-3 p-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{transaction.title || transaction.categoryName}</p>{transaction.dateLabel || transaction.walletName ? <p className="mt-0.5 text-xs text-slate-500">{[transaction.dateLabel, transaction.walletName].filter(Boolean).join(" · ")}</p> : null}<p className="mt-1 text-xs font-semibold text-slate-600">{transaction.categoryName}{transaction.envelopeName ? ` · ${t("budgets.envelope") || "Envelope"}: ${transaction.envelopeName}` : ""}</p></div><span className="shrink-0 text-sm font-extrabold text-slate-900">{formatCurrency(transaction.amount, currency)}</span></div>)}</div></section>
      <Link to={transactionHref} className="flex w-full items-center justify-center rounded-xl bg-kash-emerald px-4 py-2.5 text-sm font-bold text-white transition hover:bg-kash-emeraldDark">{t("common.viewTransactionDetails") || "View Detail Transaction"} →</Link>
    </div> : null}
  </Modal>;
}
