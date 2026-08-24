import { CalendarClock, ReceiptText } from "lucide-react";
import React, { useMemo } from "react";
import { useI18n } from "../../i18n";
import { toNumber } from "../../lib/money";
import type { RecurringObligationWithMeta } from "../../lib/subscriptions";

function dueDateFor(item: RecurringObligationWithMeta) {
  return item.currentPayment?.due_date ?? item.next_due_date;
}

export function UpcomingTimeline({
  balancesVisible = true,
  currency,
  emptyClassName = "min-h-28",
  items,
  onTogglePrivacy,
  selectedDateKey,
}: {
  balancesVisible?: boolean;
  currency: string;
  emptyClassName?: string;
  items: RecurringObligationWithMeta[];
  onTogglePrivacy?: () => void;
  selectedDateKey?: string;
}) {
  const { formatCurrency, formatDate, t } = useI18n();
  const upcoming = useMemo(() => items
    .filter((item) => item.status === "active" && dueDateFor(item))
    .filter((item) => !selectedDateKey || dueDateFor(item)?.slice(0, 10) === selectedDateKey)
    .sort((a, b) => String(dueDateFor(a)).localeCompare(String(dueDateFor(b))))
    .slice(0, 4), [items, selectedDateKey]);

  if (upcoming.length === 0) {
    return <div className={`flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 text-center ${emptyClassName}`}><div><CalendarClock className="mx-auto text-slate-400" size={22} /><p className="mt-2 text-xs font-bold text-slate-600">{t("subscriptions.noUpcomingDueDate") || "No upcoming billing date scheduled"}</p></div></div>;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const amountClickProps = onTogglePrivacy
    ? {
        onClick: (e: React.MouseEvent) => { e.stopPropagation(); onTogglePrivacy(); },
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onTogglePrivacy(); } },
        role: "button" as const,
        tabIndex: 0,
        className: "shrink-0 text-right cursor-pointer select-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-kash-emerald/40 active:opacity-70 [@media(hover:hover)]:hover:opacity-75",
      }
    : { className: "shrink-0 text-right" };

  return <div className="divide-y divide-slate-100">
    {upcoming.map((item) => {
      const rawDate = dueDateFor(item)!;
      const dueDate = new Date(rawDate);
      dueDate.setHours(0, 0, 0, 0);
      const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
      const dueLabel = diffDays === 0 ? (t("subscriptions.dueToday") || "Due today") : diffDays > 0 ? (t("subscriptions.dueIn", { days: diffDays }) || `Due in ${diffDays} days`) : (t("subscriptions.overdue") || "Overdue");
      const amount = toNumber(item.currentPayment?.amount ?? item.amount);
      const displayAmount = balancesVisible ? formatCurrency(amount, currency) : "••••••";
      return <div key={item.id} className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 py-3">
        <div className="text-center"><p className="text-lg font-extrabold leading-none text-slate-900">{dueDate.getDate()}</p><p className="mt-1 text-[10px] font-bold uppercase text-slate-500">{formatDate(dueDate, { month: "short" })}</p></div>
        <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{item.name}</p><p className="mt-0.5 truncate text-xs font-medium text-slate-500">{item.type === "installment" || item.type === "paylater" ? (t("subs.installment") || "Installment") : (t("subs.title") || "Bill")} · {dueLabel}</p></div>
        <div {...amountClickProps}><p className="text-sm font-extrabold text-[#E50914]">{displayAmount}</p><ReceiptText aria-hidden="true" className="ml-auto mt-1 text-slate-400" size={13} /></div>
      </div>;
    })}
  </div>;
}
