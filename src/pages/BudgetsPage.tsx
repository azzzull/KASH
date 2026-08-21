import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  PieChart,
  Plus,
  RotateCcw,
  Scale,
  Sparkles,
  Tag,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BudgetCard } from "../components/budgets/BudgetCard";
import { CreateBudgetModal } from "../components/budgets/CreateBudgetModal";
import { Button } from "../components/ui/Button";
import { ContextualCreateAction } from "../components/ui/ContextualCreateAction";
import { DatePickerField } from "../components/ui/DatePickerField";
import { FilterTabs } from "../components/ui/FilterTabs";
import { PageHeader } from "../components/ui/PageHeader";
import { useAppEvent } from "../hooks/useAppEvent";
import { useI18n } from "../i18n";
import { appEvents } from "../lib/appEvents";
import { getMonthlyBudgetOverview, getMonthlyBudgets } from "../lib/budgets";
import { formatCurrency } from "../lib/money";
import type { BudgetWithProgress, MonthlyBudgetOverview } from "../types/domain";

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function formatMonthYearLabel(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month] = dateStr.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function BudgetsPage() {
  const { t, formatMonthYear, formatCurrency } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  const [currentMonth, setCurrentMonth] = useState(() => {
    const paramMonth = searchParams.get("month");
    if (paramMonth) return `${paramMonth.substring(0, 7)}-01`;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });

  useEffect(() => {
    const paramMonth = searchParams.get("month");
    if (paramMonth) {
      const normalized = `${paramMonth.substring(0, 7)}-01`;
      setCurrentMonth((prev) => (prev !== normalized ? normalized : prev));
    }
  }, [searchParams]);

  const [filterType, setFilterType] = useState<"all" | "category" | "envelope" | "debt" | "goal">("all");
  const [overview, setOverview] = useState<MonthlyBudgetOverview | null>(null);
  const [budgets, setBudgets] = useState<BudgetWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewData, budgetList] = await Promise.all([
        getMonthlyBudgetOverview(currentMonth),
        getMonthlyBudgets(currentMonth),
      ]);
      setOverview(overviewData);
      setBudgets(budgetList);
    } catch (err) {
      console.error("Error loading budgets:", err);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useAppEvent(appEvents.transactionSaved, () => {
    void loadData();
  });
  useAppEvent(appEvents.budgetSaved, () => {
    void loadData();
  });

  const handlePrevMonth = () => {
    const [year, month] = currentMonth.split("-").map(Number);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const newDate = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
    setCurrentMonth(newDate);
    setSearchParams({ month: newDate });
  };

  const handleNextMonth = () => {
    const [year, month] = currentMonth.split("-").map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const newDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
    setCurrentMonth(newDate);
    setSearchParams({ month: newDate });
  };

  const handleSetCurrentMonth = () => {
    const now = new Date();
    const newDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    setCurrentMonth(newDate);
    setSearchParams({ month: newDate });
  };

  const filteredBudgets = useMemo(() => {
    if (filterType === "all") return budgets;
    return budgets.filter((b) => (b.target_type ?? b.type) === filterType);
  }, [budgets, filterType]);

  const categoryBudgets = useMemo(() => budgets.filter((b) => (b.target_type ?? b.type) === "category"), [budgets]);
  const envelopeBudgets = useMemo(() => budgets.filter((b) => (b.target_type ?? b.type) === "envelope"), [budgets]);
  const debtBudgets = useMemo(() => budgets.filter((b) => (b.target_type ?? b.type) === "debt"), [budgets]);
  const goalBudgets = useMemo(() => budgets.filter((b) => (b.target_type ?? b.type) === "goal"), [budgets]);

  const overallProgressPercent = Math.min(
    Math.max(overview?.overall_usage_percentage ?? 0, 0),
    100
  );

  const filterTabOptions = useMemo(() => [
    { label: t("common.all"), value: "all", count: budgets.length },
    { label: t("budgets.categories"), value: "category", count: categoryBudgets.length },
    { label: t("budgets.envelopes"), value: "envelope", count: envelopeBudgets.length },
    { label: t("budgets.debtPayment") || "Cicil Utang", value: "debt", count: debtBudgets.length },
    { label: t("dashboard.savings") || "Tabungan", value: "goal", count: goalBudgets.length },
  ], [budgets.length, categoryBudgets.length, envelopeBudgets.length, debtBudgets.length, goalBudgets.length, t]);

  const currentMonthLabel = useMemo(() => {
    const [year, month] = currentMonth.split("-").map(Number);
    return formatMonthYear(new Date(year, month - 1, 1));
  }, [currentMonth, formatMonthYear]);

  const createActionRef = useRef<HTMLDivElement>(null);

  return (
    <div className="w-full min-w-0 space-y-5">
      {/* Page Header */}
      <PageHeader
        eyebrow={t("budgets.planning") || "Planning"}
        icon={Scale}
        title={t("nav.budgets")}
        description={t("budgets.description") || "Kendalikan rencana keuangan bulanan: belanja, amplop, cicilan utang, dan tabungan."}
        actions={
          <div ref={createActionRef}>
            <Button onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus size={16} />
              {t("budgets.createTargetBudget") || "Buat Target Budget"}
            </Button>
          </div>
        }
      />

      {/* Month Navigator Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-kash-emerald hover:bg-kash-selected/40 hover:text-kash-emeraldDark"
            aria-label={t("common.prevMonth") || "Bulan Sebelumnya"}
          >
            <ChevronLeft size={18} />
          </button>

          <div className="w-48 sm:w-56">
            <DatePickerField
              value={currentMonth}
              onChange={(val) => {
                if (val) {
                  const norm = `${val.substring(0, 7)}-01`;
                  setCurrentMonth(norm);
                  setSearchParams({ month: norm });
                }
              }}
            />
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-kash-emerald hover:bg-kash-selected/40 hover:text-kash-emeraldDark"
            aria-label={t("common.nextMonth") || "Bulan Berikutnya"}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={handleSetCurrentMonth}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-700 transition hover:border-kash-emerald hover:bg-kash-selected/40 hover:text-kash-emeraldDark"
        >
          {t("common.thisMonth") || "Bulan Ini"}
        </button>
      </div>

      {/* Monthly Overview Progress Card */}
      {overview && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-extrabold uppercase text-slate-600">
                {t("budgets.unifiedFinancialPlan") || "Unified Financial Plan"} ({currentMonthLabel})
              </span>
              <h2 className="mt-0.5 text-xl font-black text-slate-900">
                {formatCurrency(overview.total_actual_cash_outflow)}{" "}
                <span className="text-sm font-semibold text-slate-600">
                  / {formatCurrency(overview.total_allocated)}
                </span>
              </h2>
            </div>

            {/* Health Badges Counter */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="flex items-center gap-1 rounded-full bg-kash-selected px-2.5 py-1 text-kash-emeraldDark">
                <CheckCircle2 size={13} />
                {overview.healthy_count} {t("budgets.healthy") || "Aman"}
              </span>

              {overview.near_limit_count > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
                  <AlertCircle size={13} />
                  {overview.near_limit_count} {t("budgets.nearLimit") || "Hampir Batas"}
                </span>
              )}

              {overview.over_budget_count > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-kash-expense/15 px-2.5 py-1 text-kash-expense">
                  <AlertCircle size={13} />
                  {overview.over_budget_count} {t("budgets.overBudget") || "Over Budget"}
                </span>
              )}
            </div>
          </div>

          {/* Numbers Grid */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
            <div className="rounded-xl bg-slate-50 p-3">
              <span className="font-bold text-slate-600">{t("budgets.totalAllocated") || "Total Alokasi Rencana"}</span>
              <p className="mt-0.5 text-base font-black text-slate-900">
                {formatCurrency(overview.total_allocated)}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <span className="font-bold text-slate-600">{t("budgets.actualCashOutflow") || "Arus Kas Keluar Riil"}</span>
              <p className="mt-0.5 text-base font-black text-slate-900">
                {formatCurrency(overview.total_actual_cash_outflow)}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <span className="font-bold text-slate-600">{t("budgets.netRemainingAllocation") || "Sisa Alokasi Bersih"}</span>
              <p className="mt-0.5 text-base font-black text-kash-emeraldDark">
                {formatCurrency(overview.remaining_allocation)}
              </p>
            </div>
          </div>

          {/* Cashflow Breakdown Pill Chips */}
          <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-[11px] font-bold">
            <span className="text-slate-500">{t("budgets.actualCashBreakdown") || "Breakdown Kas Riil:"}</span>
            <span className="rounded-lg bg-red-50 text-red-700 px-2 py-0.5">
              {t("common.typeExpense") || "Belanja"}: {formatCurrency(overview.actual_expenses)}
            </span>
            <span className="rounded-lg bg-orange-50 text-orange-700 px-2 py-0.5">
              {t("budgets.debtPayment") || "Cicil Utang"}: {formatCurrency(overview.actual_debt_payments)}
            </span>
            <span className="rounded-lg bg-amber-50 text-amber-800 px-2 py-0.5">
              {t("budgets.savingsGoal") || "Tabungan/Goal"}: {formatCurrency(overview.actual_goal_contributions)}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  overview.over_budget_count > 0
                    ? "bg-kash-expense"
                    : overview.near_limit_count > 0
                    ? "bg-amber-500"
                    : "bg-kash-emerald"
                }`}
                style={{ width: `${overallProgressPercent}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs font-bold text-slate-600">
              <span>{t("budgets.budgetUsedPercent", { percent: overview.overall_usage_percentage.toFixed(1) }) || `${overview.overall_usage_percentage.toFixed(1)}% anggaran terpakai`}</span>
              <span>{t("budgets.activeAllocationsCount", { count: overview.total_budgets_count ?? 0 }) || `${overview.total_budgets_count ?? 0} alokasi aktif`}</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <FilterTabs
        options={filterTabOptions}
        value={filterType}
        onChange={(val) => setFilterType(val as "all" | "category" | "envelope" | "debt" | "goal")}
      />

      {/* Budgets List Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
            >
              <div className="h-6 w-32 rounded-md bg-slate-100" />
              <div className="mt-4 h-4 w-48 rounded-md bg-slate-100" />
              <div className="mt-6 h-3 w-full rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
      ) : filteredBudgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-xs">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-kash-selected text-kash-emeraldDark mb-3">
            <Scale size={28} />
          </div>
          <h3 className="text-base font-extrabold text-slate-900">{t("budgets.noBudgetsInMonth") || "Belum Ada Budget di Bulan Ini"}</h3>
          <p className="mt-1 max-w-sm text-xs font-semibold text-slate-600">
            {t("budgets.noBudgetsInMonthDesc") || "Buat batas anggaran untuk kategori favorit atau kelompokkan kategori ke dalam amplop belanja."}
          </p>
          <Button onClick={() => setShowCreateModal(true)} className="mt-4 gap-2">
            <Plus size={16} />
            {t("budgets.createBudgetNow") || "Buat Budget Sekarang"}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filteredBudgets.map((budget) => (
            <BudgetCard key={budget.budget_id} budget={budget} periodStart={currentMonth} />
          ))}
        </div>
      )}

      {/* Create Budget Modal */}
      {showCreateModal && (
        <CreateBudgetModal
          initialMonth={currentMonth}
          onClose={() => setShowCreateModal(false)}
          onSaved={() => void loadData()}
        />
      )}
      <ContextualCreateAction
        targetRef={createActionRef}
        onClick={() => setShowCreateModal(true)}
        label={t("budgets.createTargetBudget") || "Buat Target Budget"}
      />
    </div>
  );
}
