import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  HandCoins,
  Info,
  PiggyBank,
  Receipt,
  Scale,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import type { MoneyFlowReconciliation } from "../../lib/financialMetrics";
import { formatCurrency } from "../../lib/money";
import { useI18n } from "../../i18n";
import { formatMoneyFlowPresentation } from "../../lib/dashboardPresentation";

type SimpleMoneyFlowCardProps = {
  moneyFlow: MoneyFlowReconciliation | null;
  currency: string;
  balancesVisible: boolean;
  onToggleBalances: () => void;
  loading?: boolean;
};

export function SimpleMoneyFlowCard({
  moneyFlow,
  currency,
  balancesVisible,
  onToggleBalances,
  loading = false,
}: SimpleMoneyFlowCardProps) {
  const { t } = useI18n();
  const [showReconciliation, setShowReconciliation] = useState(false);

  if (loading) {
    return (
      <section className="min-w-0 max-w-full rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card animate-pulse md:p-6">
        <div className="h-4 w-28 rounded bg-slate-200" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="h-20 rounded-xl bg-slate-100" />
          <div className="h-20 rounded-xl bg-slate-100" />
        </div>
      </section>
    );
  }

  if (!moneyFlow) return null;

  const presentation = formatMoneyFlowPresentation(moneyFlow, t);

  const formatPrivateAmount = (amount: number) => {
    return balancesVisible ? formatCurrency(amount, currency) : "••••••";
  };

  const getItemIcon = (kind: string) => {
    switch (kind) {
      case "spending":
        return <ArrowUpRight size={14} className="text-[#E50914]" aria-hidden="true" />;
      case "savings":
        return <PiggyBank size={14} className="text-kash-emerald" aria-hidden="true" />;
      case "goal":
        return <Target size={14} className="text-indigo-600" aria-hidden="true" />;
      case "debt":
        return <Scale size={14} className="text-amber-600" aria-hidden="true" />;
      case "receivable":
        return <HandCoins size={14} className="text-teal-600" aria-hidden="true" />;
      case "investment":
        return <TrendingUp size={14} className="text-sky-600" aria-hidden="true" />;
      default:
        return <CreditCard size={14} className="text-slate-500" aria-hidden="true" />;
    }
  };

  return (
    <section className="min-w-0 max-w-full rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card transition sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">
            {t("dashboard.moneyFlowTitle")}
          </h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            {t("dashboard.moneyFlowSubtitle")}
          </p>
        </div>

        <Link
          to="/analytics"
          className="inline-flex items-center gap-1 text-xs font-bold text-kash-emeraldDark hover:text-kash-emerald transition"
        >
          <span>{t("common.details")}</span>
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>

      {/* Main Flow Grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Money In */}
        <div className="rounded-xl bg-emerald-50/60 border border-emerald-100/80 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-kash-emeraldDark">
              {t("dashboard.moneyIn")}
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-kash-emerald/15 text-kash-emeraldDark">
              <ArrowDownLeft size={13} strokeWidth={2.4} aria-hidden="true" />
            </span>
          </div>

          <div className="mt-2">
            <button
              type="button"
              onClick={onToggleBalances}
              className="select-none text-left cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-kash-emerald/40"
              aria-label={balancesVisible ? t("dashboard.hideBalances") : t("dashboard.showBalances")}
            >
              <span className="text-xl font-extrabold text-slate-900 sm:text-2xl">
                +{formatPrivateAmount(presentation.genuineIncome)}
              </span>
            </button>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {t("dashboard.moneyInDesc")}
            </p>
          </div>
        </div>

        {/* Total Allocations / Usage */}
        <div className="rounded-xl bg-slate-50/80 border border-slate-100 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
              {t("dashboard.moneyUsed")}
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200/70 text-slate-700">
              <ArrowUpRight size={13} strokeWidth={2.4} aria-hidden="true" />
            </span>
          </div>

          <div className="mt-2">
            <button
              type="button"
              onClick={onToggleBalances}
              className="select-none text-left cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-kash-emerald/40"
              aria-label={balancesVisible ? t("dashboard.hideBalances") : t("dashboard.showBalances")}
            >
              <span className="text-xl font-extrabold text-slate-900 sm:text-2xl">
                -{formatPrivateAmount(presentation.totalUsage)}
              </span>
            </button>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {presentation.usageItems.length} {t("dashboard.spendingBreakdown").toLowerCase()}
            </p>
          </div>
        </div>
      </div>

      {/* Allocation breakdown rows */}
      {presentation.usageItems.length > 0 ? (
        <div className="mt-3.5 space-y-1.5 border-t border-slate-100 pt-3">
          {presentation.usageItems.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-2 py-1 px-1 rounded-lg text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100">
                  {getItemIcon(item.kind)}
                </span>
                <span className="truncate font-semibold text-slate-700">
                  {item.label}
                </span>
              </div>
              <span className="shrink-0 font-extrabold text-slate-900">
                {formatPrivateAmount(item.amount)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Other cash movements (distinct from income/consumption) */}
      {presentation.hasOtherMovements ? (
        <div className="mt-3.5 border-t border-slate-100 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">
            {t("dashboard.otherMovements")}
          </p>
          <div className="space-y-1.5">
            {presentation.otherMovementItems.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-2 py-1 px-1 rounded-lg text-xs bg-slate-50/50"
              >
                <span className="truncate font-medium text-slate-600">
                  {item.label}
                </span>
                <span className="shrink-0 font-bold text-slate-700">
                  {item.amount > 0 ? `+${formatPrivateAmount(item.amount)}` : formatPrivateAmount(item.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Net Liquidity Change */}
      <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-600">
          {t("dashboard.netLiquidityChange")}
        </span>
        <span
          className={`font-extrabold ${
            presentation.resultingLiquidityChange >= 0
              ? "text-kash-emeraldDark"
              : "text-slate-800"
          }`}
        >
          {presentation.resultingLiquidityChange > 0 ? "+" : ""}
          {formatPrivateAmount(presentation.resultingLiquidityChange)}
        </span>
      </div>

      {/* Progressive Disclosure: Reconciliation Details */}
      <div className="mt-3 border-t border-slate-100 pt-2.5">
        <button
          type="button"
          onClick={() => setShowReconciliation((prev) => !prev)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-kash-emeraldDark transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kash-emerald/30 rounded"
        >
          <span>{t("dashboard.reconciliationDetails")}</span>
          {showReconciliation ? (
            <ChevronUp size={14} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} aria-hidden="true" />
          )}
        </button>

        {showReconciliation ? (
          <div className="mt-2.5 rounded-xl bg-slate-50/80 p-3 border border-slate-100 text-xs space-y-2 text-slate-600">
            <div>
              <p className="font-semibold text-slate-700">
                {t("dashboard.internalTransfersDesc", {
                  amount: formatPrivateAmount(presentation.internalTransfers),
                })}
              </p>
            </div>

            <div className="flex items-center gap-1.5 pt-1">
              {presentation.isFullyReconciled ? (
                <>
                  <CheckCircle2 size={14} className="text-kash-emerald shrink-0" aria-hidden="true" />
                  <span className="text-slate-700 font-medium">
                    {t("dashboard.fullyReconciled")}
                  </span>
                </>
              ) : (
                <>
                  <Info size={14} className="text-amber-600 shrink-0" aria-hidden="true" />
                  <span className="text-amber-800 font-medium">
                    {t("dashboard.unreconciledDifference", {
                      amount: formatPrivateAmount(presentation.unreconciledAmount),
                    })}
                  </span>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
