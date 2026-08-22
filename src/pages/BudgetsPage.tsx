import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  PieChart,
  Plus,
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
import { FilterTabs } from "../components/ui/FilterTabs";
import { useAppEvent } from "../hooks/useAppEvent";
import { useI18n } from "../i18n";
import { appEvents } from "../lib/appEvents";
import { getMonthlyBudgetOverview, getMonthlyBudgets } from "../lib/budgets";
import type { BudgetWithProgress, MonthlyBudgetOverview } from "../types/domain";

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
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-4 -mt-2 sm:mt-0">
      {/* 1. Compact Top Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Scale className="text-kash-emerald shrink-0" size={22} />
          <h1 className="text-lg font-black text-slate-900 truncate">{t("nav.budgets") || "Target & Budget"}</h1>
        </div>

        <div ref={createActionRef} className="hidden shrink-0 sm:block">
          <Button onClick={() => setShowCreateModal(true)} className="gap-1.5 min-h-9 px-3 py-1.5 text-xs font-extrabold">
            <Plus size={15} />
            {t("budgets.createTargetBudget") || "Buat Target Budget"}
          </Button>
        </div>
      </div>

      {/* Monthly Overview Progress Card - Unified Emerald Hero */}
      {overview && (
        <section className="kash-hero-card p-5 sm:p-6 min-w-0 max-w-full">
          {/* Top Row: Title Left + Month Picker Right */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-white/70">
              {t("budgets.unifiedFinancialPlan") || "Rencana Keuangan Terpadu"}
            </span>
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/10 p-0.5 text-white shadow-sm">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                aria-label={t("common.prevMonth") || "Bulan Sebelumnya"}
              >
                <ChevronLeft size={15} />
              </button>

              <div className="flex min-w-0 items-center gap-1.5 px-1.5 text-xs font-extrabold text-white/95">
                <Calendar size={13} className="shrink-0 text-white/85" />
                <span className="max-w-[7.5rem] truncate">{currentMonthLabel}</span>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                aria-label={t("common.nextMonth") || "Bulan Berikutnya"}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {/* Primary Metric & Health Badges */}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wide">
                {t("budgets.actualCashOutflow") || "Realisasi Kas Keluar"} / {t("budgets.totalAllocated") || "Total Dialokasikan"}
              </p>
              <p className="mt-0.5 break-words text-2xl font-extrabold text-white sm:text-3xl">
                {formatCurrency(overview.total_actual_cash_outflow)}{" "}
                <span className="text-lg font-semibold text-white/70">
                  / {formatCurrency(overview.total_allocated)}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 border border-white/15 px-2.5 py-0.5 text-xs font-extrabold text-white">
                <CheckCircle2 size={13} />
                {overview.healthy_count} {t("budgets.healthy") || "Aman"}
              </span>

              {overview.near_limit_count > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/30 border border-amber-300/30 px-2.5 py-0.5 text-xs font-extrabold text-white">
                  <AlertCircle size={13} />
                  {overview.near_limit_count} {t("budgets.nearLimit") || "Hampir Batas"}
                </span>
              )}

              {overview.over_budget_count > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/30 border border-red-300/30 px-2.5 py-0.5 text-xs font-extrabold text-white">
                  <AlertCircle size={13} />
                  {overview.over_budget_count} {t("budgets.overBudget") || "Over Budget"}
                </span>
              )}
            </div>
          </div>

          {/* Sisa Alokasi Bersih */}
          <div className="mt-3 flex items-center justify-between text-xs border-t border-white/15 pt-2.5">
            <span className="text-white/70 font-semibold">{t("budgets.netRemainingAllocation") || "Sisa Alokasi Bersih"}</span>
            <span className="text-sm sm:text-base font-extrabold text-white">{formatCurrency(overview.remaining_allocation)}</span>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/20">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  overview.over_budget_count > 0
                    ? "bg-red-400"
                    : overview.near_limit_count > 0
                    ? "bg-amber-300"
                    : "bg-white"
                }`}
                style={{ width: `${overallProgressPercent}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs font-bold text-white/80">
              <span>{t("budgets.budgetUsedPercent", { percent: overview.overall_usage_percentage.toFixed(1) }) || `${overview.overall_usage_percentage.toFixed(1)}% anggaran terpakai`}</span>
              <span>{t("budgets.activeAllocationsCount", { count: overview.total_budgets_count ?? 0 }) || `${overview.total_budgets_count ?? 0} alokasi aktif`}</span>
            </div>
          </div>
        </section>
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
