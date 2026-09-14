import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  HandCoins,
  Info,
  PiggyBank,
  Scale,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";
import React, { useState } from "react";
import { formatMoneyFlowPresentation } from "../../lib/dashboardPresentation";
import type { MoneyFlowReconciliation } from "../../lib/financialMetrics";
import { formatCurrency } from "../../lib/money";
import { useI18n } from "../../i18n";

type AnalyticsMoneyFlowProps = {
  moneyFlow: MoneyFlowReconciliation | null;
  currency: string;
  receivableOutstanding: number;
};

function MovementIcon({ kind }: { kind: string }) {
  const className = "h-4 w-4";
  switch (kind) {
    case "spending": case "fee": return <ArrowUpRight className={`${className} text-[#E50914]`} aria-hidden="true" />;
    case "savings": return <PiggyBank className={`${className} text-kash-emeraldDark`} aria-hidden="true" />;
    case "goal": return <Target className={`${className} text-indigo-600`} aria-hidden="true" />;
    case "debt": return <Scale className={`${className} text-amber-700`} aria-hidden="true" />;
    case "receivable": return <HandCoins className={`${className} text-teal-700`} aria-hidden="true" />;
    case "investment": return <TrendingUp className={`${className} text-sky-700`} aria-hidden="true" />;
    default: return <CreditCard className={`${className} text-slate-500`} aria-hidden="true" />;
  }
}

export function AnalyticsMoneyFlow({ moneyFlow, currency, receivableOutstanding }: AnalyticsMoneyFlowProps) {
  const { t } = useI18n();
  const [showReconciliation, setShowReconciliation] = useState(false);
  if (!moneyFlow) return null;

  const presentation = formatMoneyFlowPresentation(moneyFlow, t);
  const isFullyReconciled = Math.abs(moneyFlow.unreconciledAmount) < 1;

  return (
    <section id="money-flow" className="scroll-mt-6 min-w-0 max-w-full rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-kash-emeraldDark"><Scale size={17} strokeWidth={2.2} aria-hidden="true" /></span><h2 className="text-base font-extrabold text-slate-900">{t("analytics.moneyFlowTitle")}</h2></div>
          <p className="mt-1 text-xs font-medium text-slate-500">{t("analytics.moneyFlowDesc")}</p>
        </div>
        {isFullyReconciled ? <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-emerald-200/60 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-kash-emeraldDark"><CheckCircle2 size={13} aria-hidden="true" />{t("dashboard.fullyReconciled")}</span> : null}
      </div>

      <div className="divide-y divide-slate-100">
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-kash-emeraldDark"><ArrowDownLeft size={16} aria-hidden="true" /></span><div><p className="text-sm font-extrabold text-slate-900">{t("analytics.moneyIn")}</p><p className="text-xs font-medium text-slate-500">{t("analytics.moneyInSubtitle")}</p></div></div>
          <span className="shrink-0 text-base font-extrabold text-kash-emeraldDark">+{formatCurrency(presentation.genuineIncome, currency)}</span>
        </div>

        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="text-sm font-extrabold text-slate-900">{t("analytics.outstandingAdvanceTitle")}</p>
            <p className="text-xs font-medium text-slate-500">{t("analytics.outstandingAdvanceDesc")}</p>
          </div>
          <span className="shrink-0 text-base font-extrabold text-teal-700">{formatCurrency(receivableOutstanding, currency)}</span>
        </div>

        <div className="py-4">
          <div className="mb-2 flex items-center justify-between gap-4"><div><p className="text-sm font-extrabold text-slate-900">{t("analytics.moneyOutAndAllocation")}</p><p className="text-xs font-medium text-slate-500">{t("analytics.moneyOutAndAllocationDesc")}</p></div><span className="shrink-0 text-sm font-extrabold text-slate-900">-{formatCurrency(presentation.totalUsage, currency)}</span></div>
          {presentation.usageItems.length > 0 ? <div className="space-y-1">{presentation.usageItems.map((item) => {
            const isSavingsAdvance = item.key === "receivable_outflow_non_liquid";
            return <React.Fragment key={item.key}>
              <div className="flex items-center justify-between gap-3 rounded-lg px-1 py-2 text-sm"><div className="flex min-w-0 items-center gap-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-50"><MovementIcon kind={item.kind} /></span><div className="min-w-0"><span className="block truncate font-semibold text-slate-700">{item.label}</span>{isSavingsAdvance ? <span className="block text-xs font-medium text-slate-500">{t("analytics.advanceFromSavingsDesc")}</span> : null}</div></div><span className="shrink-0 font-extrabold text-slate-900">-{formatCurrency(item.amount, currency)}</span></div>
            </React.Fragment>;
          })}</div> : <p className="py-1 text-sm font-medium text-slate-500">{t("analytics.noMoneyOutAndAllocation")}</p>}
        </div>

        {presentation.hasOtherMovements ? <div className="py-4"><p className="mb-2 text-sm font-extrabold text-slate-900">{t("analytics.otherMovements")}</p><div className="space-y-1">{presentation.otherMovementItems.map((item) => <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg px-1 py-2 text-sm"><div className="flex min-w-0 items-center gap-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-50"><MovementIcon kind={item.kind} /></span><span className="truncate font-semibold text-slate-700">{item.label}</span></div><span className={`shrink-0 font-extrabold ${item.amount >= 0 ? "text-kash-emeraldDark" : "text-slate-900"}`}>{item.amount >= 0 ? "+" : ""}{formatCurrency(item.amount, currency)}</span></div>)}</div></div> : null}

        <div className="flex items-center justify-between gap-4 py-4"><div><p className="text-sm font-extrabold text-slate-900">{t("analytics.internalTransfers")}</p><p className="text-xs font-medium text-slate-500">{t("analytics.internalTransfersSubtitle")}</p></div><span className="shrink-0 text-sm font-extrabold text-slate-700">{formatCurrency(presentation.internalTransfers, currency)}</span></div>
        <div className="flex items-center justify-between gap-4 pt-4"><div><p className="text-sm font-extrabold text-slate-900">{t("analytics.cashChange")}</p><p className="text-xs font-medium text-slate-500">{t("analytics.cashChangeSubtitle")}</p></div><span className={`shrink-0 text-base font-extrabold ${presentation.resultingLiquidityChange >= 0 ? "text-kash-emeraldDark" : "text-[#E50914]"}`}>{presentation.resultingLiquidityChange >= 0 ? "+" : ""}{formatCurrency(presentation.resultingLiquidityChange, currency)}</span></div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <button type="button" onClick={() => setShowReconciliation((previous) => !previous)} className="inline-flex items-center gap-1.5 rounded text-xs font-bold text-slate-500 transition hover:text-kash-emeraldDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kash-emerald/30"><ShieldCheck size={15} aria-hidden="true" />{t("analytics.reconciliationTitle")}{showReconciliation ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}</button>
        {showReconciliation ? <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><div className="flex items-center gap-1.5">{isFullyReconciled ? <CheckCircle2 size={14} className="shrink-0 text-kash-emerald" aria-hidden="true" /> : <Info size={14} className="shrink-0 text-amber-600" aria-hidden="true" />}<span className="font-semibold">{isFullyReconciled ? t("dashboard.fullyReconciled") : t("dashboard.unreconciledDifference", { amount: formatCurrency(moneyFlow.unreconciledAmount, currency) })}</span></div><p>{t("dashboard.internalTransfersDesc", { amount: formatCurrency(presentation.internalTransfers, currency) })}</p></div> : null}
      </div>
    </section>
  );
}
