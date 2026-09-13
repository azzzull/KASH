import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  PiggyBank,
  Receipt,
  Scale,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import React, { useState } from "react";
import type { MoneyFlowReconciliation } from "../../lib/financialMetrics";
import { formatCurrency } from "../../lib/money";
import { useI18n } from "../../i18n";
import { formatMoneyFlowPresentation } from "../../lib/dashboardPresentation";

type AnalyticsMoneyFlowProps = {
  moneyFlow: MoneyFlowReconciliation | null;
  currency: string;
};

export function AnalyticsMoneyFlow({
  moneyFlow,
  currency,
}: AnalyticsMoneyFlowProps) {
  const { t } = useI18n();
  const [showCategories, setShowCategories] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState(false);

  if (!moneyFlow) return null;

  const presentation = formatMoneyFlowPresentation(moneyFlow, t);

  return (
    <section className="min-w-0 max-w-full rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-kash-emeraldDark">
              <Scale size={17} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <h2 className="text-base font-extrabold text-slate-900">
              {t("analytics.moneyFlowTitle")}
            </h2>
          </div>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {t("analytics.moneyFlowDesc")}
          </p>
        </div>

        {presentation.isFullyReconciled ? (
          <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-kash-emeraldDark border border-emerald-200/60">
            <CheckCircle2 size={13} aria-hidden="true" />
            <span>{t("dashboard.fullyReconciled")}</span>
          </span>
        ) : null}
      </div>

      {/* 4-way Top-Level Overview Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* 1. Uang Masuk */}
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-kash-emeraldDark">
            <ArrowDownLeft size={14} aria-hidden="true" />
            <span>{t("analytics.moneyIn")}</span>
          </div>
          <p className="mt-1.5 break-words text-lg font-extrabold text-slate-900 sm:text-xl">
            {formatCurrency(presentation.genuineIncome, currency)}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            {t("analytics.moneyInSubtitle")}
          </p>
        </div>

        {/* 2. Pengeluaran (Konsumsi & Biaya) */}
        <div className="rounded-xl border border-red-100 bg-red-50/30 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#E50914]">
            <ArrowUpRight size={14} aria-hidden="true" />
            <span>{t("analytics.ordinaryExpense")}</span>
          </div>
          <p className="mt-1.5 break-words text-lg font-extrabold text-slate-900 sm:text-xl">
            {formatCurrency(presentation.ordinarySpending, currency)}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            {t("analytics.ordinaryExpenseSubtitle")}
          </p>
        </div>

        {/* 3. Alokasi & Perpindahan (Bukan Konsumsi) */}
        <div className="rounded-xl border border-sky-100 bg-sky-50/30 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-sky-700">
            <ArrowRightLeft size={14} aria-hidden="true" />
            <span>{t("analytics.allocationsAndMovements")}</span>
          </div>
          <p className="mt-1.5 break-words text-lg font-extrabold text-slate-900 sm:text-xl">
            {formatCurrency(presentation.totalAllocations, currency)}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            {t("analytics.allocationsAndMovementsSubtitle")}
          </p>
        </div>

        {/* 4. Perubahan Kas Cair */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            {presentation.resultingLiquidityChange >= 0 ? (
              <TrendingUp size={14} className="text-kash-emeraldDark" aria-hidden="true" />
            ) : (
              <TrendingDown size={14} className="text-[#E50914]" aria-hidden="true" />
            )}
            <span>{t("analytics.cashChange")}</span>
          </div>
          <p
            className={`mt-1.5 break-words text-lg font-extrabold sm:text-xl ${
              presentation.resultingLiquidityChange >= 0
                ? "text-kash-emeraldDark"
                : "text-[#E50914]"
            }`}
          >
            {presentation.resultingLiquidityChange >= 0 ? "+" : ""}
            {formatCurrency(presentation.resultingLiquidityChange, currency)}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            {t("analytics.cashChangeSubtitle")}
          </p>
        </div>
      </div>

      {/* Expandable Movement Categories */}
      <div className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-3.5">
        <button
          type="button"
          onClick={() => setShowCategories((prev) => !prev)}
          className="flex w-full items-center justify-between text-left text-xs font-bold text-slate-700 hover:text-kash-emeraldDark transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kash-emerald/30 rounded"
        >
          <span className="flex items-center gap-2">
            <Receipt size={15} className="text-slate-500" aria-hidden="true" />
            <span>{t("analytics.movementCategories")}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-slate-500">
            {showCategories ? (
              <ChevronUp size={15} aria-hidden="true" />
            ) : (
              <ChevronDown size={15} aria-hidden="true" />
            )}
          </span>
        </button>

        {showCategories ? (
          <div className="mt-4 grid gap-4 divide-y divide-slate-200/60 pt-1 text-xs">
            {/* Spending Items */}
            {presentation.spendingItems.length > 0 ? (
              <div className="space-y-2">
                <p className="font-extrabold uppercase tracking-wider text-slate-400 text-[10px]">
                  {t("analytics.economicActivity")}
                </p>
                {presentation.spendingItems.map((item) => (
                  <div key={item.key} className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold">{item.label}</span>
                    <span className="font-extrabold text-[#E50914]">
                      -{formatCurrency(item.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Allocation Items */}
            {presentation.allocationItems.length > 0 ? (
              <div className="pt-3 space-y-2">
                <p className="font-extrabold uppercase tracking-wider text-slate-400 text-[10px]">
                  {t("analytics.allocations")}
                </p>
                {presentation.allocationItems.map((item) => (
                  <div key={item.key} className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold">{item.label}</span>
                    <span className="font-extrabold text-sky-700">
                      -{formatCurrency(item.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Other Movements */}
            {presentation.hasOtherMovements ? (
              <div className="pt-3 space-y-2">
                <p className="font-extrabold uppercase tracking-wider text-slate-400 text-[10px]">
                  {t("analytics.otherMovements")}
                </p>
                {presentation.otherMovementItems.map((item) => (
                  <div key={item.key} className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold">{item.label}</span>
                    <span className="font-extrabold text-slate-800">
                      {item.amount >= 0 ? "+" : ""}
                      {formatCurrency(item.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Internal Transfers Note */}
            <div className="pt-3 flex items-center justify-between text-slate-500 font-medium">
              <span>{t("analytics.internalTransfers")}</span>
              <span className="font-bold text-slate-700">
                {formatCurrency(presentation.internalTransfers, currency)}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Detailed Reconciliation Accordion */}
      <div className="rounded-xl border border-slate-100 bg-white p-3.5">
        <button
          type="button"
          onClick={() => setShowReconciliation((prev) => !prev)}
          className="flex w-full items-center justify-between text-left text-xs font-bold text-slate-600 hover:text-kash-emeraldDark transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kash-emerald/30 rounded"
        >
          <span className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-slate-500" aria-hidden="true" />
            <span>{t("analytics.reconciliationTitle")}</span>
          </span>
          <span className="text-slate-500">
            {showReconciliation ? (
              <ChevronUp size={15} aria-hidden="true" />
            ) : (
              <ChevronDown size={15} aria-hidden="true" />
            )}
          </span>
        </button>

        {showReconciliation ? (
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <span>{t("dashboard.reconciliationStatus")}</span>
              <span className="font-bold text-slate-900">
                {presentation.isFullyReconciled
                  ? t("dashboard.fullyReconciled")
                  : t("dashboard.unreconciledDifference", {
                      amount: formatCurrency(presentation.unreconciledAmount, currency),
                    })}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              {t("dashboard.internalTransfersDesc", {
                amount: formatCurrency(presentation.internalTransfers, currency),
              })}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
