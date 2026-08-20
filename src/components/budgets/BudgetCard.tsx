import { AlertCircle, CheckCircle2, ChevronRight, HandCoins, Layers, PiggyBank, Tag } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency } from "../../lib/money";
import type { BudgetWithProgress } from "../../types/domain";

type BudgetCardProps = {
  budget: BudgetWithProgress;
  periodStart: string; // YYYY-MM-DD
};

export function BudgetCard({ budget, periodStart }: BudgetCardProps) {
  const targetType = budget.target_type ?? (budget.type === "envelope" ? "envelope" : "category");
  const isOverBudget = budget.status === "over_budget";
  const isNearLimit = budget.status === "near_limit";

  const progressPercent = Math.min(Math.max(budget.usage_percentage, 0), 100);

  const progressBarColor = isOverBudget
    ? "bg-kash-expense"
    : isNearLimit
    ? "bg-amber-500"
    : "bg-kash-emerald";

  const statusBadge = isOverBudget ? (
    <span className="flex items-center gap-1 rounded-full bg-kash-expense/15 px-2 py-0.5 text-[11px] font-extrabold text-kash-expense">
      <AlertCircle size={12} />
      Over Budget
    </span>
  ) : isNearLimit ? (
    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800">
      <AlertCircle size={12} />
      Hampir Habis
    </span>
  ) : (
    <span className="flex items-center gap-1 rounded-full bg-kash-selected px-2 py-0.5 text-[11px] font-extrabold text-kash-emeraldDark">
      <CheckCircle2 size={12} />
      Aman
    </span>
  );

  const targetIcon =
    targetType === "envelope" ? (
      <Layers size={18} />
    ) : targetType === "debt" ? (
      <HandCoins size={18} />
    ) : targetType === "goal" ? (
      <PiggyBank size={18} />
    ) : (
      <Tag size={18} />
    );

  const targetColor =
    targetType === "envelope"
      ? "#4F7DF3"
      : targetType === "debt"
      ? "#F28C45"
      : targetType === "goal"
      ? "#F5B82E"
      : budget.category_color || "#10B981";

  const targetLabel =
    targetType === "envelope"
      ? "Amplop"
      : targetType === "debt"
      ? "Cicil Utang"
      : targetType === "goal"
      ? "Tabungan"
      : "Kategori";

  const subtitle =
    targetType === "envelope"
      ? budget.envelope_name || "Amplop Pengeluaran"
      : targetType === "debt"
      ? budget.debt_title || "Target Pelunasan Utang"
      : targetType === "goal"
      ? budget.goal_name || "Target Alokasi Tabungan"
      : budget.category_name || "Kategori Pengeluaran";

  return (
    <Link
      to={`/budgets/${budget.budget_id}?month=${periodStart}`}
      className="group block rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm transition hover:border-kash-emerald hover:shadow-md"
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-xs font-black text-sm"
            style={{ backgroundColor: targetColor }}
          >
            {targetIcon}
          </span>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-kash-emeraldDark transition">
                {budget.name}
              </h3>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                {targetLabel}
              </span>
            </div>

            <p className="mt-0.5 text-xs font-semibold text-slate-600">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {statusBadge}
          <ChevronRight size={18} className="text-slate-600 group-hover:text-kash-emerald transition" />
        </div>
      </div>

      {/* Financial Numbers Grid */}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
        <div>
          <span className="text-slate-600 font-semibold">Terpakai:</span>
          <p className="font-extrabold text-slate-900">
            {formatCurrency(budget.spent)}
          </p>
        </div>

        <div className="text-right">
          <span className="text-slate-600 font-semibold">
            {Number(budget.remaining) < 0 ? "Kelebihan:" : "Sisa Budget:"}
          </span>
          <p
            className={`font-black ${
              Number(budget.remaining) < 0 ? "text-kash-expense" : "text-kash-emeraldDark"
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

        <div className="mt-1.5 flex items-center justify-between text-[11px] font-bold text-slate-600">
          <span>{budget.usage_percentage.toFixed(1)}% terpakai</span>
          <div className="flex items-center gap-1.5">
            <span>Budget: {formatCurrency(budget.effective_budget)}</span>
            {Number(budget.rollover_amount) > 0 && (
              <span className="rounded bg-amber-100 px-1 text-[10px] font-extrabold text-amber-800">
                +{formatCurrency(budget.rollover_amount)} Rollover
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
