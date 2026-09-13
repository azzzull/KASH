import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Receipt,
  Scale,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import React from "react";
import type { SpendableCashBreakdown } from "../../lib/financialMetrics";
import { formatCurrency } from "../../lib/money";
import { useI18n } from "../../i18n";
import { Modal } from "../ui/Modal";

type AvailableToSpendDetailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  spendableCash: SpendableCashBreakdown | null;
  currency: string;
  balancesVisible: boolean;
};

export function AvailableToSpendDetailModal({
  isOpen,
  onClose,
  spendableCash,
  currency,
  balancesVisible,
}: AvailableToSpendDetailModalProps) {
  const { t, formatDate } = useI18n();

  if (!spendableCash) return null;

  const formatAmount = (amount: number) => {
    return balancesVisible ? formatCurrency(amount, currency) : "••••••";
  };

  const isDeficit = spendableCash.spendableCash < 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-kash-emeraldDark">
            <Scale size={18} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <span className="text-base font-extrabold text-slate-900">
            {t("dashboard.spendableCalculation")}
          </span>
        </div>
      }
      description={t("dashboard.spendableCalculationDesc")}
      maxWidth="lg"
    >
      <div className="space-y-4 pt-1">
        {/* Header Metric Card */}
        <div
          className={`rounded-2xl p-4 sm:p-5 border transition ${
            isDeficit
              ? "bg-amber-50/70 border-amber-200/80 text-amber-900"
              : "bg-emerald-50/60 border-emerald-200/80 text-emerald-950"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-extrabold uppercase tracking-wide opacity-75">
              {t("dashboard.availableToSpend")}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                isDeficit
                  ? "bg-amber-100 text-amber-800 border-amber-300/80"
                  : "bg-emerald-100 text-kash-emeraldDark border-emerald-300/80"
              }`}
            >
              {isDeficit ? (
                <>
                  <AlertTriangle size={12} aria-hidden="true" />
                  {t("dashboard.deficit")}
                </>
              ) : (
                <>
                  <CheckCircle2 size={12} aria-hidden="true" />
                  {t("status.active") || "Aman"}
                </>
              )}
            </span>
          </div>

          <p className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
            {formatAmount(spendableCash.spendableCash)}
          </p>

          <p className="mt-1 text-xs font-medium opacity-80 leading-relaxed">
            {isDeficit
              ? t("dashboard.temporaryDeficitDesc")
              : t("dashboard.availableToSpendDesc") ||
                "Dana cair yang aman dibelanjakan setelah mencadangkan semua kewajiban bulan ini."}
          </p>
        </div>

        {/* 1. Uang Likuid */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <WalletCards size={15} strokeWidth={2} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  {t("dashboard.liquidWalletsTitle")}
                </h3>
                <p className="text-[11px] font-medium text-slate-500">
                  {t("dashboard.liquidWalletsDesc")}
                </p>
              </div>
            </div>
          </div>

          {/* List of Contributing Liquid Wallets */}
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50">
            {spendableCash.liquidSources.length > 0 ? (
              spendableCash.liquidSources.map((wallet) => (
                <div
                  key={wallet.walletId}
                  className="flex items-center justify-between p-3 text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <p className="truncate font-bold text-slate-900">
                      {wallet.walletName}
                    </p>
                    <p className="text-[10px] font-semibold text-slate-500 capitalize">
                      {wallet.walletType.replace("_", " ")}
                    </p>
                  </div>
                  <span className="shrink-0 font-extrabold text-slate-900">
                    +{formatAmount(wallet.amount)}
                  </span>
                </div>
              ))
            ) : (
              <p className="p-3 text-xs font-medium text-slate-500 text-center">
                {t("dashboard.noLiquidWallets")}
              </p>
            )}
          </div>

          {/* Subtotal Liquid Cash */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
            <span className="font-extrabold text-slate-700">
              {t("dashboard.totalLiquidCash")}
            </span>
            <span className="font-black text-kash-emeraldDark text-sm">
              +{formatAmount(spendableCash.liquidCash)}
            </span>
          </div>
        </section>

        {/* 2. Kewajiban Bulan Ini */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-[#E50914]">
                <CalendarDays size={15} strokeWidth={2} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  {t("dashboard.scheduledObligations")}
                </h3>
                <p className="text-[11px] font-medium text-slate-500">
                  {t("dashboard.scheduledObligationsDesc") ||
                    "Tagihan rutin dan target cicilan utang yang jatuh tempo bulan ini."}
                </p>
              </div>
            </div>
          </div>

          {/* 2A. Scheduled Bills */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-extrabold text-slate-600">
              <span>{t("dashboard.scheduledBillsTitle")}</span>
              <span className="text-[#E50914] font-bold">
                -{formatAmount(spendableCash.unpaidScheduledBills)}
              </span>
            </div>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50">
              {spendableCash.scheduledObligations.length > 0 ? (
                spendableCash.scheduledObligations.map((bill) => (
                  <div
                    key={bill.id}
                    className="flex items-center justify-between p-3 text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="truncate font-bold text-slate-900">
                        {bill.name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                        {bill.dueDate ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock size={11} />
                            {formatDate(bill.dueDate)}
                          </span>
                        ) : null}
                        {bill.status === "overdue" ? (
                          <span className="rounded-sm bg-red-100 px-1.5 py-0.5 font-bold text-[#E50914]">
                            {t("status.overdue") || "Lewat Jatuh Tempo"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className="shrink-0 font-extrabold text-[#E50914]">
                      -{formatAmount(bill.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="p-3 text-xs font-medium text-slate-500 text-center">
                  {t("dashboard.noScheduledBills")}
                </p>
              )}
            </div>
          </div>

          {/* 2B. Current-Period Debt Obligations */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs font-extrabold text-slate-600">
              <span>{t("dashboard.debtObligationsTitle")}</span>
              <span className="text-[#E50914] font-bold">
                -{formatAmount(spendableCash.remainingDebtAllocation)}
              </span>
            </div>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50">
              {spendableCash.debtObligations.length > 0 ? (
                spendableCash.debtObligations.map((debt) => (
                  <div
                    key={debt.id}
                    className="flex flex-col gap-1.5 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-slate-900">
                        {debt.counterpartyName || t("nav.debts") || "Utang"}
                      </p>
                      <span className="font-extrabold text-[#E50914]">
                        -{formatAmount(debt.remainingThisPeriod)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span>
                        {t("dashboard.targetThisPeriod")}:{" "}
                        <strong className="text-slate-700">
                          {formatAmount(debt.targetThisPeriod)}
                        </strong>
                      </span>
                      <span>
                        {t("dashboard.paidThisPeriod")}:{" "}
                        <strong className="text-kash-emeraldDark">
                          {formatAmount(debt.paidThisPeriod)}
                        </strong>
                      </span>
                      <span>
                        {t("dashboard.remainingReserved")}:{" "}
                        <strong className="text-[#E50914]">
                          {formatAmount(debt.remainingThisPeriod)}
                        </strong>
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="p-3 text-xs font-medium text-slate-500 text-center">
                  {t("dashboard.noDebtObligations")}
                </p>
              )}
            </div>
          </div>

          {/* 2C. Other Mandatory Obligations (if any) */}
          {spendableCash.otherMandatoryObligationItems.length > 0 ? (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs font-extrabold text-slate-600">
                <span>{t("dashboard.otherMovements") || "Kewajiban Lainnya"}</span>
                <span className="text-[#E50914] font-bold">
                  -{formatAmount(spendableCash.otherMandatoryObligations)}
                </span>
              </div>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50">
                {spendableCash.otherMandatoryObligationItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="truncate font-bold text-slate-900">
                        {item.name}
                      </p>
                      {item.dueDate ? (
                        <p className="text-[10px] text-slate-500">
                          {formatDate(item.dueDate)}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 font-extrabold text-[#E50914]">
                      -{formatAmount(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Subtotal Monthly Obligations */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
            <span className="font-extrabold text-slate-700">
              {t("dashboard.totalMonthlyObligations")}
            </span>
            <span className="font-black text-[#E50914] text-sm">
              -{formatAmount(spendableCash.totalRemainingObligations)}
            </span>
          </div>
        </section>

        {/* 3. Plain Visual Reconciliation Summary */}
        <section className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5 space-y-2.5">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-slate-600" aria-hidden="true" />
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">
              {t("dashboard.reconciliationFormulaTitle")}
            </h3>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-700">
              <span>{t("dashboard.totalLiquidCash")}</span>
              <span className="font-bold text-slate-900">
                +{formatAmount(spendableCash.liquidCash)}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-700">
              <span>− {t("dashboard.totalMonthlyObligations")}</span>
              <span className="font-bold text-[#E50914]">
                -{formatAmount(spendableCash.totalRemainingObligations)}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-700">
              <span>− {t("dashboard.operatingBuffer")}</span>
              <span className="font-bold text-slate-700">
                {spendableCash.operatingBuffer > 0
                  ? `-${formatAmount(spendableCash.operatingBuffer)}`
                  : "Rp0"}
              </span>
            </div>

            <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-sm font-black">
              <span className="text-slate-900">
                = {t("dashboard.availableToSpend")}
              </span>
              <span
                className={
                  isDeficit ? "text-amber-800" : "text-kash-emeraldDark"
                }
              >
                {formatAmount(spendableCash.spendableCash)}
              </span>
            </div>
          </div>
        </section>

        {/* 4. Informational Protected Funds Notice (No double-counting) */}
        {spendableCash.protectedAmounts > 0 ? (
          <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3.5 flex items-start gap-2.5 text-xs text-sky-900">
            <ShieldCheck size={16} className="shrink-0 text-sky-600 mt-0.5" aria-hidden="true" />
            <p className="leading-relaxed">
              {t("dashboard.protectedInfoNotice", {
                amount: formatAmount(spendableCash.protectedAmounts),
              })}
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
