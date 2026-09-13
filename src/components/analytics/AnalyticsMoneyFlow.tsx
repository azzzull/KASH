import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Landmark,
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

  const genuineIncome = moneyFlow.genuineIncome;
  const ordinarySpending = moneyFlow.ordinarySpending + moneyFlow.transferFees;
  const totalAllocations =
    moneyFlow.savingsAllocation +
    moneyFlow.goalContributions +
    moneyFlow.debtPrincipalPayments +
    moneyFlow.receivableOutflow +
    moneyFlow.investmentContribution;
  const netCashChange = moneyFlow.resultingLiquidityChange;
  const isFullyReconciled = Math.abs(moneyFlow.unreconciledAmount) < 1;

  // Has balance movement items
  const hasDebtOrReceivable =
    moneyFlow.debtPrincipalPayments > 0 ||
    moneyFlow.debtPrincipalInflow > 0 ||
    moneyFlow.receivableOutflow > 0 ||
    moneyFlow.receivableCollection > 0;

  const hasInvestment =
    moneyFlow.investmentContribution > 0 || moneyFlow.investmentWithdrawal > 0;

  return (
    <section
      id="money-flow"
      className="scroll-mt-6 min-w-0 max-w-full rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card sm:p-6 space-y-5"
    >
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

        {isFullyReconciled ? (
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
            {formatCurrency(genuineIncome, currency)}
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
            {formatCurrency(ordinarySpending, currency)}
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
            {formatCurrency(totalAllocations, currency)}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            {t("analytics.allocationsAndMovementsSubtitle")}
          </p>
        </div>

        {/* 4. Perubahan Kas Cair */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            {netCashChange >= 0 ? (
              <TrendingUp size={14} className="text-kash-emeraldDark" aria-hidden="true" />
            ) : (
              <TrendingDown size={14} className="text-[#E50914]" aria-hidden="true" />
            )}
            <span>{t("analytics.cashChange")}</span>
          </div>
          <p
            className={`mt-1.5 break-words text-lg font-extrabold sm:text-xl ${
              netCashChange >= 0 ? "text-kash-emeraldDark" : "text-[#E50914]"
            }`}
          >
            {netCashChange >= 0 ? "+" : ""}
            {formatCurrency(netCashChange, currency)}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            {t("analytics.cashChangeSubtitle")}
          </p>
        </div>
      </div>

      {/* Expandable Detailed Categories (7 Distinct Groups) */}
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
            {/* 1. Uang Masuk (Genuine Income Only) */}
            <div className="space-y-2">
              <p className="font-extrabold uppercase tracking-wider text-slate-400 text-[10px]">
                {t("analytics.moneyIn")}
              </p>
              <div className="flex items-center justify-between text-slate-700">
                <span className="font-semibold">{t("dashboard.moneyInDesc")}</span>
                <span className="font-extrabold text-kash-emeraldDark">
                  +{formatCurrency(moneyFlow.genuineIncome, currency)}
                </span>
              </div>
            </div>

            {/* 2. Pengeluaran (Ordinary Consumption Spending + Fees) */}
            <div className="pt-3 space-y-2">
              <p className="font-extrabold uppercase tracking-wider text-slate-400 text-[10px]">
                {t("analytics.economicActivity")}
              </p>
              <div className="flex items-center justify-between text-slate-700">
                <span className="font-semibold">{t("dashboard.consumptionSpending")}</span>
                <span className="font-extrabold text-[#E50914]">
                  -{formatCurrency(moneyFlow.ordinarySpending, currency)}
                </span>
              </div>
              {moneyFlow.transferFees > 0 ? (
                <div className="flex items-center justify-between text-slate-700">
                  <span className="font-semibold">{t("dashboard.transferFeesPaid")}</span>
                  <span className="font-extrabold text-[#E50914]">
                    -{formatCurrency(moneyFlow.transferFees, currency)}
                  </span>
                </div>
              ) : null}
            </div>

            {/* 3. Alokasi Tabungan & Target (Savings & Goals) */}
            {(moneyFlow.savingsAllocation > 0 || moneyFlow.goalContributions > 0) ? (
              <div className="pt-3 space-y-2">
                <p className="font-extrabold uppercase tracking-wider text-slate-400 text-[10px]">
                  {t("analytics.allocations")} (Tabungan & Target)
                </p>
                {moneyFlow.savingsAllocation > 0 ? (
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold">{t("dashboard.savingsAllocated")}</span>
                    <span className="font-extrabold text-sky-700">
                      -{formatCurrency(moneyFlow.savingsAllocation, currency)}
                    </span>
                  </div>
                ) : null}
                {moneyFlow.goalContributions > 0 ? (
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold">{t("dashboard.goalContributions")}</span>
                    <span className="font-extrabold text-sky-700">
                      -{formatCurrency(moneyFlow.goalContributions, currency)}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* 4. Kewajiban & Pergerakan Neraca (Debt Principal & Receivables) */}
            {hasDebtOrReceivable ? (
              <div className="pt-3 space-y-2">
                <p className="font-extrabold uppercase tracking-wider text-slate-400 text-[10px]">
                  Kewajiban & Pergerakan Neraca (Utang & Piutang)
                </p>
                {moneyFlow.debtPrincipalPayments > 0 ? (
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold">{t("dashboard.debtPayments")}</span>
                    <span className="font-extrabold text-slate-800">
                      -{formatCurrency(moneyFlow.debtPrincipalPayments, currency)}
                    </span>
                  </div>
                ) : null}
                {moneyFlow.debtPrincipalInflow > 0 ? (
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold">{t("dashboard.debtPrincipalInflow")}</span>
                    <span className="font-extrabold text-kash-emeraldDark">
                      +{formatCurrency(moneyFlow.debtPrincipalInflow, currency)}
                    </span>
                  </div>
                ) : null}
                {moneyFlow.receivableOutflow > 0 ? (
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold">{t("dashboard.receivableOutflow")}</span>
                    <span className="font-extrabold text-slate-800">
                      -{formatCurrency(moneyFlow.receivableOutflow, currency)}
                    </span>
                  </div>
                ) : null}
                {moneyFlow.receivableCollection > 0 ? (
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold">{t("dashboard.receivableCollected")}</span>
                    <span className="font-extrabold text-kash-emeraldDark">
                      +{formatCurrency(moneyFlow.receivableCollection, currency)}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* 5. Investasi (Investments) */}
            {hasInvestment ? (
              <div className="pt-3 space-y-2">
                <p className="font-extrabold uppercase tracking-wider text-slate-400 text-[10px]">
                  {t("dashboard.investments") || "Investasi"}
                </p>
                {moneyFlow.investmentContribution > 0 ? (
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold">{t("dashboard.investmentAllocated")}</span>
                    <span className="font-extrabold text-slate-800">
                      -{formatCurrency(moneyFlow.investmentContribution, currency)}
                    </span>
                  </div>
                ) : null}
                {moneyFlow.investmentWithdrawal > 0 ? (
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold">{t("dashboard.investmentWithdrawn")}</span>
                    <span className="font-extrabold text-kash-emeraldDark">
                      +{formatCurrency(moneyFlow.investmentWithdrawal, currency)}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* 6. Pergerakan Internal (Inter-Wallet Transfers & Adjustments) */}
            <div className="pt-3 space-y-2">
              <p className="font-extrabold uppercase tracking-wider text-slate-400 text-[10px]">
                {t("analytics.internalTransfers")} (Bukan Belanja)
              </p>
              <div className="flex items-center justify-between text-slate-700">
                <span className="font-medium text-slate-600">
                  {t("dashboard.internalTransfersDesc", {
                    amount: formatCurrency(moneyFlow.internalWalletMovement, currency),
                  })}
                </span>
                <span className="font-bold text-slate-700">
                  {formatCurrency(moneyFlow.internalWalletMovement, currency)}
                </span>
              </div>
              {moneyFlow.balanceAdjustments !== 0 ? (
                <div className="flex items-center justify-between text-slate-700">
                  <span className="font-semibold">{t("dashboard.balanceAdjustments")}</span>
                  <span className="font-extrabold text-slate-800">
                    {moneyFlow.balanceAdjustments >= 0 ? "+" : ""}
                    {formatCurrency(moneyFlow.balanceAdjustments, currency)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* 7. Detailed Reconciliation Accordion */}
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
                {isFullyReconciled
                  ? t("dashboard.fullyReconciled")
                  : t("dashboard.unreconciledDifference", {
                      amount: formatCurrency(moneyFlow.unreconciledAmount, currency),
                    })}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              {t("dashboard.internalTransfersDesc", {
                amount: formatCurrency(moneyFlow.internalWalletMovement, currency),
              })}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
