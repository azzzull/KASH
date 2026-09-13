import { ChevronDown, ChevronUp, Info, ShieldCheck, Wallet } from "lucide-react";
import React, { useState } from "react";
import type { SpendableCashBreakdown } from "../../lib/financialMetrics";
import { formatCurrency } from "../../lib/money";
import { useI18n } from "../../i18n";
import { getSpendableCashStatus } from "../../lib/dashboardPresentation";

type AvailableToSpendCardProps = {
  spendableCash: SpendableCashBreakdown | null;
  currency: string;
  balancesVisible: boolean;
  onToggleBalances: () => void;
  loading?: boolean;
};

export function AvailableToSpendCard({
  spendableCash,
  currency,
  balancesVisible,
  onToggleBalances,
  loading = false,
}: AvailableToSpendCardProps) {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);

  if (loading) {
    return (
      <section className="min-w-0 max-w-full rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card animate-pulse md:p-6">
        <div className="h-4 w-32 rounded bg-slate-200" />
        <div className="mt-3 h-8 w-48 rounded bg-slate-200" />
        <div className="mt-2 h-3 w-40 rounded bg-slate-100" />
      </section>
    );
  }

  if (!spendableCash) return null;

  const status = getSpendableCashStatus(spendableCash, t);
  const isDeficit = spendableCash.spendableCash < 0;

  const formatPrivateAmount = (amount: number) => {
    return balancesVisible ? formatCurrency(amount, currency) : "••••••";
  };

  return (
    <section className="min-w-0 max-w-full rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card transition sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-kash-emeraldDark">
            <Wallet size={16} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              {t("dashboard.availableToSpend")}
            </h2>
          </div>
        </div>

        {isDeficit && status.badgeLabel ? (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200/60">
            {status.badgeLabel}
          </span>
        ) : null}
      </div>

      {/* Main Metric */}
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <button
          type="button"
          onClick={onToggleBalances}
          className="select-none text-left cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-kash-emerald/40"
          aria-label={balancesVisible ? t("dashboard.hideBalances") : t("dashboard.showBalances")}
        >
          <span
            className={`break-words text-2xl font-extrabold tracking-tight md:text-3xl ${
              isDeficit ? "text-amber-900" : "text-slate-900"
            }`}
          >
            {formatPrivateAmount(spendableCash.spendableCash)}
          </span>
        </button>
      </div>

      {/* Subtitle / Context note */}
      <p className="mt-1 text-xs font-medium text-slate-500">
        {status.supportingText}
      </p>

      {/* Progressive Disclosure Toggle */}
      <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-kash-emeraldDark transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kash-emerald/30 rounded"
        >
          <span>
            {isExpanded
              ? t("dashboard.hideCalculationDetails")
              : t("dashboard.viewCalculationDetails")}
          </span>
          {isExpanded ? (
            <ChevronUp size={14} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} aria-hidden="true" />
          )}
        </button>

        {spendableCash.protectedAmounts > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
            <ShieldCheck size={13} className="text-kash-emerald" aria-hidden="true" />
            <span>
              {t("dashboard.protectedFunds")}: {formatPrivateAmount(spendableCash.protectedAmounts)}
            </span>
          </span>
        ) : null}
      </div>

      {/* Expanded Breakdown */}
      {isExpanded ? (
        <div className="mt-3 rounded-xl bg-slate-50/80 p-3.5 border border-slate-100 text-xs space-y-2.5">
          <div className="flex items-center justify-between text-slate-700">
            <span className="font-semibold">{t("dashboard.liquidCash")}</span>
            <span className="font-extrabold text-slate-900">
              +{formatPrivateAmount(spendableCash.liquidCash)}
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-700">
            <span className="font-semibold">{t("dashboard.scheduledObligations")}</span>
            <span className="font-extrabold text-[#E50914]">
              -{formatPrivateAmount(spendableCash.mandatoryObligations)}
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-700">
            <span className="font-semibold">{t("dashboard.operatingBuffer")}</span>
            <span className="font-medium text-slate-500">
              {spendableCash.operatingBuffer > 0
                ? `-${formatPrivateAmount(spendableCash.operatingBuffer)}`
                : t("dashboard.notConfigured")}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-extrabold text-slate-900">
            <span>{t("dashboard.availableToSpend")}</span>
            <span className={isDeficit ? "text-amber-800" : "text-kash-emeraldDark"}>
              ={formatPrivateAmount(spendableCash.spendableCash)}
            </span>
          </div>

          {spendableCash.protectedAmounts > 0 ? (
            <p className="text-[11px] text-slate-500 pt-1">
              • {t("dashboard.protectedFundsNote")}
            </p>
          ) : null}

          {spendableCash.limitations.length > 0 ? (
            <div className="pt-1 text-[11px] text-slate-400 space-y-1">
              {spendableCash.limitations.map((limitation, i) => (
                <p key={i}>• {limitation}</p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
