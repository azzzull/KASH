import { AlertCircle, CheckCircle2, ChevronRight, HandCoins } from "lucide-react";
import { Link } from "react-router-dom";
import { getCategoryIcon } from "../../lib/categoryMeta";
import type { BudgetWithProgress } from "../../types/domain";
import { useI18n } from "../../i18n";

type BudgetCardProps = {
  budget: BudgetWithProgress;
  periodStart: string; // YYYY-MM-DD
};

export function BudgetCard({ budget, periodStart }: BudgetCardProps) {
  const { t, formatCurrency } = useI18n();
  const targetType = budget.target_type ?? (budget.type === "envelope" ? "envelope" : "category");
  const isContributionTarget = targetType === "goal" || targetType === "debt";
  const hasReachedTarget = isContributionTarget && budget.usage_percentage >= 100;
  const isApproachingTarget = isContributionTarget && budget.usage_percentage >= 80;
  const isOverBudget = !isContributionTarget && budget.status === "over_budget";
  const isNearLimit = !isContributionTarget && budget.status === "near_limit";
  const isAboveTarget = isContributionTarget && Number(budget.remaining) < 0;

  const progressPercent = Math.min(Math.max(budget.usage_percentage, 0), 100);

  const progressBarColor = isOverBudget
    ? "bg-kash-expense"
    : isNearLimit
    ? "bg-amber-500"
    : "bg-kash-emerald";

  const statusBadge = hasReachedTarget ? (
    <span className="flex items-center gap-1 rounded-full bg-kash-selected px-2 py-0.5 text-[11px] font-extrabold text-kash-emeraldDark">
      <CheckCircle2 size={12} />
      {t("budgets.targetReached") || "Target tercapai"}
    </span>
  ) : isApproachingTarget ? (
    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800">
      <AlertCircle size={12} />
      {t("budgets.approachingTarget") || "Mendekati target"}
    </span>
  ) : isOverBudget ? (
    <span className="flex items-center gap-1 rounded-full bg-kash-expense/15 px-2 py-0.5 text-[11px] font-extrabold text-kash-expense">
      <AlertCircle size={12} />
      {t("budgets.overBudget") || "Over Budget"}
    </span>
  ) : isNearLimit ? (
    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800">
      <AlertCircle size={12} />
      {t("budgets.nearLimit") || "Hampir Habis"}
    </span>
  ) : (
    <span className="flex items-center gap-1 rounded-full bg-kash-selected px-2 py-0.5 text-[11px] font-extrabold text-kash-emeraldDark">
      <CheckCircle2 size={12} />
      {t("budgets.healthy") || "Aman"}
    </span>
  );

  const IconComp =
    targetType === "envelope"
      ? getCategoryIcon(budget.envelope_icon || "layers")
      : targetType === "debt"
      ? HandCoins
      : targetType === "goal"
      ? getCategoryIcon(budget.wallet_icon || budget.goal_icon || "piggy-bank")
      : getCategoryIcon(budget.category_icon || "tag");

  const targetColor =
    targetType === "envelope"
      ? budget.envelope_color || "#4F7DF3"
      : targetType === "debt"
      ? "#F28C45"
      : targetType === "goal"
      ? budget.wallet_color || "#F5B82E"
      : budget.category_color || "#10B981";

  const targetLabel =
    targetType === "envelope"
      ? (t("budgets.envelope") || "Amplop")
      : targetType === "debt"
      ? (t("budgets.debtPayment") || "Cicil Utang")
      : targetType === "goal"
      ? budget.wallet_id ? (t("budgets.pocket") || "Kantong") : (t("dashboard.savings") || "Tabungan")
      : (t("budgets.category") || "Kategori");

  const subtitle =
    targetType === "envelope"
      ? budget.envelope_name || (t("nav.envelopes") || "Amplop Pengeluaran")
      : targetType === "debt"
      ? budget.counterparty_name
        ? `${t("debts.debtTo") || "Utang ke"} ${budget.counterparty_name}${budget.debt_title ? ` (${budget.debt_title})` : ""}`
        : budget.debt_title || (t("budgets.debtSettlementTarget") || "Target Pelunasan Utang")
      : targetType === "goal"
      ? budget.wallet_name ? `${t("budgets.savingsPocket") || "Kantong Tabungan"}: ${budget.wallet_name}` : budget.goal_name || (t("budgets.savingsGoalTarget") || "Target Alokasi Tabungan")
      : budget.category_name || (t("common.typeExpense") || "Kategori Pengeluaran");

  return (
    <Link
      to={`/budgets/${budget.budget_id}?month=${periodStart}`}
      className="group block min-w-0 max-w-full rounded-2xl border border-slate-200/60 bg-white p-4 sm:p-5 shadow-card transition hover:border-kash-emerald/50 hover:shadow-md"
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-extrabold text-sm shadow-xs"
            style={{ backgroundColor: `${targetColor}18`, color: targetColor }}
          >
            <IconComp size={20} />
          </span>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-extrabold text-slate-900 group-hover:text-kash-emeraldDark transition">
                {budget.name}
              </h3>
              <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                {targetLabel}
              </span>
            </div>

            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {statusBadge}
          <ChevronRight size={17} className="text-slate-400 group-hover:text-kash-emerald transition" />
        </div>
      </div>

      {/* Spent vs Target Financial Numbers */}
      <div className="mt-4 flex items-baseline justify-between gap-2 border-t border-slate-100/80 pt-3 text-xs">
        <div className="min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t("budgets.used") || "Terpakai"}</span>
          <p className="mt-0.5 text-base font-extrabold text-slate-900">
            {formatCurrency(budget.spent)}{" "}
            <span className="text-xs font-semibold text-slate-500">
              / {formatCurrency(budget.effective_budget)}
            </span>
          </p>
        </div>

        <div className="text-right shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {isAboveTarget
              ? t("budgets.aboveTarget") || "Melebihi target"
              : Number(budget.remaining) < 0
              ? t("budgets.overspentLabel") || "Kelebihan"
              : t("budgets.remainingBudgetLabel") || "Sisa Budget"}
          </span>
          <p
            className={`mt-0.5 text-xs font-extrabold ${
              Number(budget.remaining) < 0 && !isContributionTarget ? "text-kash-expense" : "text-kash-emerald"
            }`}
          >
            {formatCurrency(Math.abs(Number(budget.remaining)))}
          </p>
        </div>
      </div>

      {/* Progress Bar & Percentage */}
      <div className="mt-3">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-300 ${progressBarColor}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[11px] font-extrabold text-slate-500">
          <span>
            {isContributionTarget
              ? t("budgets.monthlyTargetProgress", { percent: budget.usage_percentage.toFixed(1) }) || `${budget.usage_percentage.toFixed(1)}% target bulanan`
              : t("budgets.budgetUsedPercent", { percent: budget.usage_percentage.toFixed(1) }) || `${budget.usage_percentage.toFixed(1)}% terpakai`}
          </span>
          {Number(budget.rollover_amount) > 0 ? (
            <span className="rounded-md bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800">
              +{formatCurrency(budget.rollover_amount)} Rollover
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
