import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  PieChart,
  Receipt,
  RefreshCw,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  getAnalyticsSummary,
  getEmptyAnalyticsSummary,
  type AnalyticsMetricChange,
  type AnalyticsPeriodKey,
  type AnalyticsSummary,
} from "../lib/analytics";
import { getMonthlyBudgets } from "../lib/budgets";
import type { BudgetWithProgress } from "../types/domain";
import { formatCompactCurrency, formatCurrency } from "../lib/money";
import { appEvents } from "../lib/appEvents";
import { useAppEvent } from "../hooks/useAppEvent";
import { useAuth } from "../context/AuthContext";
import { DatePickerField } from "../components/ui/DatePickerField";
import { PageHeader } from "../components/ui/PageHeader";

import { useI18n, type TranslationKey } from "../i18n";

const INCOME_COLOR = "#10B981";
const EXPENSE_COLOR = "#E50914";
const NET_WORTH_COLOR = "#FBBF24";
const CHART_GRID_COLOR = "rgba(16, 185, 129, 0.16)";

function localDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function firstDayOfCurrentMonth() {
  const today = new Date();
  return localDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1));
}

function isEmptyAnalyticsPeriodError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /no rows?|0 rows?|not found|no data|empty/i.test(message);
}

function AnalyticsCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`min-w-0 max-w-full rounded-2xl border border-slate-200/60 bg-white p-5 sm:p-6 shadow-card ${className}`}>{children}</section>;
}

function EmptyPanel({ description, title, className = "" }: { className?: string; description: string; title: string }) {
  return (
    <div className={`flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center ${className}`}>
      <div>
        <p className="text-sm font-extrabold text-slate-900">{title}</p>
        <p className="mt-1 text-sm font-semibold text-slate-600">{description}</p>
      </div>
    </div>
  );
}

function buildMetricChange(current: number, previous: number): AnalyticsMetricChange {
  if (previous > 0) {
    const percent = ((current - previous) / previous) * 100;
    return {
      current,
      percent,
      previous,
      state: percent > 0 ? "increase" : percent < 0 ? "decrease" : "flat",
    };
  }

  if (current > 0) {
    return { current, percent: null, previous, state: "new" };
  }

  return { current, percent: null, previous, state: "none" };
}

const CASH_FLOW_WINDOW_SIZE = 7;

function splitCashFlowWindows(points: AnalyticsSummary["incomeExpenseTrend"]) {
  const windows: { index: number; points: AnalyticsSummary["incomeExpenseTrend"]; scale: number }[] = [];

  for (let start = 0; start < points.length; start += CASH_FLOW_WINDOW_SIZE) {
    const windowPoints = points.slice(start, start + CASH_FLOW_WINDOW_SIZE);
    const scale = Math.max(1, ...windowPoints.flatMap((point) => [Math.abs(point.income), Math.abs(point.expense)]));
    windows.push({
      index: windows.length,
      points: windowPoints,
      scale,
    });
  }

  return windows;
}

function cashFlowWindowIndexFromScroll(scrollLeft: number, clientWidth: number, windowCount: number) {
  if (windowCount <= 1 || clientWidth <= 0) return 0;
  return Math.min(windowCount - 1, Math.max(0, Math.round(scrollLeft / clientWidth)));
}

function cashFlowAxisTicks(scale: number) {
  return [scale, scale * 0.5, 0, -scale * 0.5, -scale];
}

function MiniInsightBars({ values, toneClass }: { toneClass: string; values: number[] }) {
  return (
    <div className="flex h-10 items-end gap-1 overflow-hidden">
      {values.map((value, index) => (
        <span
          key={`${index}-${value}`}
          className={`flex-1 rounded-t-sm ${toneClass}`}
          style={{
            height: `${Math.max(18, Math.min(100, value))}%`,
            opacity: 0.48 + Math.min(0.42, value / 220),
          }}
        />
      ))}
    </div>
  );
}

function ComparisonLine({
  allowWrap = false,
  change,
  className = "",
  comparisonLabel,
  currency,
  layout = "inline",
  mode = "money",
  positiveWhen = "increase",
  surface = "default",
}: {
  allowWrap?: boolean;
  change: AnalyticsMetricChange;
  className?: string;
  comparisonLabel: string;
  currency: string;
  layout?: "inline" | "stacked";
  mode?: "money" | "percentPoint";
  positiveWhen?: "decrease" | "increase";
  surface?: "default" | "hero";
}) {
  const { formatCurrency, t } = useI18n();
  const delta = change.current - change.previous;
  const increased = delta > 0;
  const decreased = delta < 0;
  const isNeutral = !increased && !decreased;
  const isPositive = positiveWhen === "decrease" ? decreased : increased;
  const Icon = isNeutral ? null : increased ? TrendingUp : TrendingDown;
  const tone =
    surface === "hero"
      ? isNeutral
        ? "text-white/65"
        : isPositive
          ? "text-emerald-100"
          : "text-red-200"
      : isNeutral
        ? "text-slate-500"
        : isPositive
          ? "text-kash-emerald"
          : "text-[#E50914]";
  const mutedTone = surface === "hero" ? "text-white/50" : "text-slate-400";
  const formattedDelta =
    mode === "percentPoint"
      ? `${delta > 0 ? "+" : delta < 0 ? "-" : ""}${Math.abs(delta).toFixed(1)}pp`
      : `${delta > 0 ? "+" : delta < 0 ? "-" : ""}${formatCurrency(Math.abs(delta), currency)}`;
  const percentText =
    mode === "money" && change.percent != null
      ? ` (${delta > 0 ? "+" : delta < 0 ? "-" : ""}${Math.abs(change.percent).toFixed(1)}%)`
      : "";
  const normalizedComparisonLabel = comparisonLabel.replace(/^vs\s+/i, "");
  const comparisonText =
    t("dashboard.vsPeriod", { period: normalizedComparisonLabel }) ||
    `vs ${normalizedComparisonLabel}`;

  if (change.state === "none") {
    if (layout === "stacked") {
      return (
        <div className={`min-w-0 max-w-full text-[10px] font-bold ${mutedTone} ${className}`}>
          <p>0</p>
          <p className="text-[9px] leading-none">{comparisonText}</p>
        </div>
      );
    }

    return (
      <p className={`text-[11px] font-bold ${mutedTone} ${className}`}>
        0 {comparisonText}
      </p>
    );
  }

  if (layout === "stacked") {
    return (
      <div className={`min-w-0 max-w-full text-[10px] font-extrabold ${tone} ${className}`}>
        <p className="inline-flex min-w-0 max-w-full items-center gap-1">
          {Icon ? <Icon aria-hidden="true" size={11} strokeWidth={2.4} /> : null}
          <span className="min-w-0 truncate">
            {formattedDelta}
            {percentText}
          </span>
        </p>
        <p className={`text-[9px] font-bold leading-none ${mutedTone}`}>{comparisonText}</p>
      </div>
    );
  }

  return (
    <p className={`inline-flex min-w-0 max-w-full items-center gap-1 text-[11px] font-extrabold ${allowWrap ? "flex-wrap" : ""} ${tone} ${className}`}>
      {Icon ? <Icon aria-hidden="true" size={12} strokeWidth={2.4} /> : null}
      <span className={allowWrap ? "min-w-0" : "min-w-0 truncate"}>
        {formattedDelta}
        {percentText}
      </span>
      <span className={`${allowWrap ? "" : "shrink-0"} font-bold ${mutedTone}`}>
        {comparisonText}
      </span>
    </p>
  );
}

function cashFlowHealth(summary: AnalyticsSummary, t: (k: TranslationKey) => string) {
  if (summary.income.amount <= 0 && summary.expense.amount <= 0) {
    return { helper: t("analytics.healthNoActivity") || "No activity yet", tone: "text-slate-700", value: t("dashboard.noData") || "No data" };
  }

  if (summary.income.amount <= 0 && summary.expense.amount > 0) {
    return { helper: t("analytics.healthExpenseWithoutIncome") || "Expense without income", tone: "text-[#E50914]", value: t("analytics.healthNeedsAttention") || "Needs attention" };
  }

  const ratio = summary.expense.amount / Math.max(summary.income.amount, 1);

  if (summary.netCashFlow.amount < 0) {
    return { helper: t("analytics.healthSpendingExceeds") || "Spending exceeds income", tone: "text-[#E50914]", value: t("analytics.healthDeficit") || "Deficit" };
  }

  if (ratio >= 0.9) {
    return { helper: t("analytics.healthSmallSurplus") || "Small surplus margin", tone: "text-kash-gold", value: t("analytics.healthTight") || "Tight" };
  }

  return { helper: t("analytics.healthIncomeCovers") || "Income covers spending", tone: "text-kash-emerald", value: t("analytics.healthHealthy") || "Healthy" };
}

function AnalyticsHeroStory({
  currency,
  periodControls,
  summary,
}: {
  currency: string;
  periodControls: ReactNode;
  summary: AnalyticsSummary;
}) {
  const { t, formatCurrency } = useI18n();
  const netCashFlow = summary.netCashFlow.amount;
  const isSurplus = netCashFlow >= 0;
  const savingsRate = summary.income.amount > 0 ? (netCashFlow / summary.income.amount) * 100 : 0;
  const topCategory = summary.categorySpending[0];

  // Signed deficit formatting fix
  const formattedNetCashFlow = netCashFlow < 0
    ? `-${formatCurrency(Math.abs(netCashFlow), currency)}`
    : formatCurrency(netCashFlow, currency);

  return (
    <section className="kash-hero-card overflow-visible p-5 sm:p-6 min-w-0 max-w-full">
      {/* Top Row: Title Left + Period Picker Right */}
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-white/70">
          {t("dashboard.netCashFlow") || "ARUS KAS BERSIH"}
        </span>
        <div className="shrink-0">{periodControls}</div>
      </div>

      {/* Main Nominal */}
      <div className="mt-3">
        <p className="break-words text-3xl font-extrabold text-white sm:text-4xl">
          {formattedNetCashFlow}
        </p>
        <ComparisonLine
          change={summary.netCashFlow.change}
          className="mt-1 text-xs"
          comparisonLabel={summary.period.comparisonLabel}
          currency={currency}
          surface="hero"
        />
      </div>

      {/* Short Contextual Explanation */}
      <p className="mt-2.5 text-xs font-medium text-white/80 leading-relaxed max-w-xl">
        {isSurplus
          ? (t("analytics.surplusStoryDesc", { rate: savingsRate.toFixed(1), category: topCategory?.name || "-" }) ||
            `Anda berhasil mempertahankan tingkat tabungan bersih sebesar ${savingsRate.toFixed(1)}%. Pengeluaran terbesar dialokasikan untuk ${topCategory?.name || "-"}.`)
          : (t("analytics.deficitStoryDesc", { category: topCategory?.name || "-" }) ||
            `Arus kas keluar periode ini lebih besar dari total pemasukan. Evaluasi pengeluaran pada ${topCategory?.name || "-"} untuk menjaga keseimbangan kas.`)}
      </p>

      {/* Bottom Inline Summary Row: Pemasukan | Pengeluaran */}
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-3 text-xs">
        <div>
          <span className="text-white/60 font-semibold">{t("common.typeIncome") || "Pemasukan"}</span>
          <p className="mt-0.5 text-sm font-extrabold text-white">
            {formatCurrency(summary.income.amount, currency)}
          </p>
          <ComparisonLine
            change={summary.income.change}
            className="mt-1"
            comparisonLabel={summary.period.comparisonLabel}
            currency={currency}
            layout="stacked"
            surface="hero"
          />
        </div>
        <div>
          <span className="text-white/60 font-semibold">{t("common.typeExpense") || "Pengeluaran"}</span>
          <p className="mt-0.5 text-sm font-extrabold text-white">
            {formatCurrency(summary.expense.amount, currency)}
          </p>
          <ComparisonLine
            change={summary.expense.change}
            className="mt-1"
            comparisonLabel={summary.period.comparisonLabel}
            currency={currency}
            layout="stacked"
            positiveWhen="decrease"
            surface="hero"
          />
        </div>
      </div>
    </section>
  );
}

function AnalyticsInsights({ currency, summary }: { currency: string; summary: AnalyticsSummary }) {
  const { t, formatCurrency } = useI18n();
  const savingsRate = summary.income.amount > 0 ? (summary.netCashFlow.amount / summary.income.amount) * 100 : null;
  const previousSavingsRate =
    summary.income.change.previous > 0 ? (summary.netCashFlow.change.previous / summary.income.change.previous) * 100 : null;
  const savingsRateChange =
    savingsRate != null && previousSavingsRate != null
      ? buildMetricChange(savingsRate, previousSavingsRate)
      : buildMetricChange(savingsRate ?? 0, 0);
  const topCategory = summary.categorySpending[0] ?? null;

  const insights = [
    {
      change: summary.expense.change,
      goodWhenDecrease: true,
      icon: TrendingDown,
      label: t("analytics.spendingChange") || "Perubahan Belanja",
      value: formatCurrency(summary.expense.amount, currency),
      helper: t("analytics.spendingChangeStory") || "Dibanding periode sebelumnya",
      tone: "text-slate-900",
      accentBg: "bg-[#E50914]/10 text-[#E50914]",
      spark: [36, 48, 56, 62, 70, 84],
      sparkTone: "bg-[#E50914]",
    },
    {
      change: savingsRateChange,
      goodWhenDecrease: false,
      icon: Sparkles,
      label: t("analytics.savingsRate") || "Rasio Tabungan Bersih",
      value: savingsRate != null ? `${savingsRate.toFixed(1)}%` : "-",
      helper: savingsRate != null && savingsRate >= 20 ? (t("analytics.healthySavingsPace") || "Di atas target ideal 20%") : (t("analytics.moderateSavingsPace") || "Alokasi tabungan perlu ditingkatkan"),
      tone: savingsRate != null && savingsRate >= 0 ? "text-kash-emeraldDark" : "text-[#E50914]",
      accentBg: savingsRate != null && savingsRate >= 0 ? "bg-kash-emerald/10 text-kash-emeraldDark" : "bg-red-500/10 text-red-700",
      spark: [28, 34, 42, 56, 68, 74],
      sparkTone: savingsRate != null && savingsRate >= 0 ? "bg-kash-emerald" : "bg-[#E50914]",
    },
    {
      change: topCategory?.change ?? buildMetricChange(0, 0),
      goodWhenDecrease: true,
      icon: PieChart,
      label: t("analytics.topCategoryImpact") || "Kontributor Belanja Terbesar",
      value: topCategory ? topCategory.name : "-",
      subvalue: topCategory ? formatCurrency(topCategory.amount, currency) : undefined,
      helper: topCategory ? `${formatCurrency(topCategory.amount, currency)} - ${Math.round(topCategory.percent)}%` : (t("analytics.noExpenseCategories") || "Belum ada kategori"),
      tone: "text-slate-900",
      accentBg: "bg-blue-500/10 text-blue-700",
      spark: [24, 32, 50, 58, 72, 88],
      sparkTone: "bg-blue-500",
    },
    {
      change: summary.transferFeesChange,
      goodWhenDecrease: true,
      icon: Receipt,
      label: t("analytics.transferFees") || "Beban Biaya Transfer",
      value: formatCurrency(summary.transferFees, currency),
      helper: summary.transferFees > 0 ? (t("analytics.transferFeesStory") || "Biaya administrasi terakumulasi") : (t("analytics.zeroTransferFees") || "Bebas biaya transfer pada periode ini"),
      tone: summary.transferFees > 0 ? "text-amber-700" : "text-slate-700",
      accentBg: "bg-slate-100 text-slate-700",
      spark: [18, 24, 30, 36, 28, 40],
      sparkTone: "bg-slate-500",
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold text-slate-900">
          {t("analytics.editorialInsights") || "Editorial Insights & Analisis Lanjutan"}
        </h3>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {insights.map((item) => (
          <article
            key={item.label}
            className="flex w-[15rem] min-w-[15rem] max-w-[15rem] flex-none snap-start flex-col justify-between rounded-2xl border border-slate-200/60 bg-white p-4 shadow-card transition hover:shadow-md"
          >
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 leading-tight">
                  {item.label}
                </span>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-extrabold text-xs ${item.accentBg}`}>
                  <item.icon size={16} />
                </span>
              </div>

              <p className={`mt-3 truncate text-xl font-extrabold ${item.tone}`}>
                {item.value}
              </p>
              {item.subvalue ? (
                <p className="mt-0.5 truncate text-sm font-bold text-slate-900">
                  {item.subvalue}
                </p>
              ) : null}
              <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                <span className="truncate">{item.helper}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                    item.change.percent != null && ((item.goodWhenDecrease && item.change.percent < 0) || (!item.goodWhenDecrease && item.change.percent > 0))
                      ? "bg-emerald-50 text-kash-emeraldDark"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {item.change.percent == null ? "-" : `${item.change.percent > 0 ? "+" : ""}${item.change.percent.toFixed(1)}%`}
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 px-2.5 py-2">
              <MiniInsightBars values={item.spark} toneClass={item.sparkTone} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function chartTickLabel(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`;
  if (value >= 1000) return `${Math.round(value / 1000).toLocaleString("id-ID")}rb`;
  return "0";
}

function currentTrendIndex(points: { key: string }[]) {
  if (points.length === 0) return 0;

  const today = new Date();
  const todayKey = localDateInputValue(today);
  const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const exactDayIndex = points.findIndex((point) => point.key === todayKey);
  if (exactDayIndex >= 0) return exactDayIndex;

  const exactMonthIndex = points.findIndex((point) => point.key === monthKey);
  if (exactMonthIndex >= 0) return exactMonthIndex;

  return 0;
}

function scrollChartToIndex(scrollElement: HTMLDivElement, itemCount: number, targetIndex: number) {
  if (itemCount <= 0) return;

  window.requestAnimationFrame(() => {
    const slotWidth = scrollElement.scrollWidth / itemCount;
    const targetCenter = (targetIndex + 0.5) * slotWidth;
    const maxScrollLeft = Math.max(0, scrollElement.scrollWidth - scrollElement.clientWidth);
    scrollElement.scrollLeft = Math.min(maxScrollLeft, Math.max(0, targetCenter - scrollElement.clientWidth / 2));
  });
}

function CashFlowOverview({ currency, summary }: { currency: string; summary: AnalyticsSummary }) {
  const { t, formatCurrency } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const points = summary.incomeExpenseTrend;
  const windows = useMemo(() => splitCashFlowWindows(points), [points]);
  const initialWindowIndex = Math.min(Math.max(0, Math.floor(currentTrendIndex(points) / CASH_FLOW_WINDOW_SIZE)), Math.max(0, windows.length - 1));
  const [activeWindowIndex, setActiveWindowIndex] = useState(initialWindowIndex);
  const [selectedPointKey, setSelectedPointKey] = useState(() => points[currentTrendIndex(points)]?.key ?? points[0]?.key ?? "");
  const hasData = points.some((point) => point.income > 0 || point.expense > 0);
  const activeWindow = windows[activeWindowIndex] ?? windows[0] ?? null;
  const selectedPoint = points.find((point) => point.key === selectedPointKey) ?? activeWindow?.points[0] ?? points[0] ?? null;

  useEffect(() => {
    const activeFirstPoint = activeWindow?.points[0];
    if (!activeFirstPoint) return;

    const selectedStillVisible = activeWindow.points.some((point) => point.key === selectedPointKey);
    if (!selectedStillVisible) {
      setSelectedPointKey(activeFirstPoint.key);
    }
  }, [activeWindow, selectedPointKey]);

  useEffect(() => {
    const fallbackIndex = Math.min(Math.max(0, Math.floor(currentTrendIndex(points) / CASH_FLOW_WINDOW_SIZE)), Math.max(0, windows.length - 1));
    setActiveWindowIndex(fallbackIndex);

    const nextSelection = points[currentTrendIndex(points)] ?? points[0];
    if (nextSelection) setSelectedPointKey(nextSelection.key);
  }, [points, windows.length]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || windows.length === 0) return;

    const maxScrollLeft = Math.max(0, scrollElement.scrollWidth - scrollElement.clientWidth);
    scrollElement.scrollLeft = Math.min(
      maxScrollLeft,
      Math.max(0, activeWindowIndex * scrollElement.clientWidth),
    );
  }, [activeWindowIndex, windows.length]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || windows.length === 0) return;

    if (scrollRafRef.current != null) {
      window.cancelAnimationFrame(scrollRafRef.current);
    }

    scrollRafRef.current = window.requestAnimationFrame(() => {
      setActiveWindowIndex((current) => {
        const next = cashFlowWindowIndexFromScroll(scrollElement.scrollLeft, scrollElement.clientWidth, windows.length);
        return next === current ? current : next;
      });
    });
  }, [windows.length]);

  if (!hasData) {
    return (
      <EmptyPanel
        title={t("analytics.noCashFlowData") || "No cash flow data"}
        description={t("analytics.noCashFlowDesc") || "Income and expense activity in this period will build the chart."}
        className="min-h-64"
      />
    );
  }

  return (
    <div className="w-full min-w-0 overflow-hidden">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-extrabold text-slate-900">{t("analytics.cashFlowOverview") || "Daily Cash Flow"}</h4>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">{activeWindow ? `${activeWindow.points[0]?.label ?? ""} - ${activeWindow.points[activeWindow.points.length - 1]?.label ?? ""}` : summary.period.label}</p>
        </div>
        <div className="text-right text-xs font-semibold text-slate-500">
          <p>{activeWindowIndex + 1}/{Math.max(1, windows.length)}</p>
          <p>{selectedPoint ? selectedPoint.label : summary.period.label}</p>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex w-full min-w-0 snap-x snap-mandatory overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {windows.map((window) => {
          const barMaxHeight = 58;
          const gridLinePositions = [0, 0.25, 0.5, 0.75, 1];
          const tickValues = cashFlowAxisTicks(window.scale);
          const selectedKeyInWindow = selectedPoint?.key;

          return (
            <section key={window.index} className="flex min-w-full flex-none snap-start gap-3">
              <div className="relative hidden w-14 shrink-0 sm:block">
                <div className="relative h-[180px]">
                  {gridLinePositions.map((position, index) => {
                    const tickValue = tickValues[index] ?? 0;
                    return (
                      <div
                        key={position}
                        className="absolute right-0 -translate-y-1/2 text-[10px] font-bold text-slate-500"
                        style={{ top: `${position * 100}%` }}
                      >
                        {formatCompactCurrency(tickValue, currency)}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="relative h-[180px] overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-50/80">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-slate-300/80" />
                  {gridLinePositions.map((position) => (
                    <div
                      key={position}
                      className="absolute inset-x-0 border-t border-dashed border-slate-200/70"
                      style={{ top: `${position * 100}%` }}
                    />
                  ))}

                  <div className="absolute inset-0 grid grid-cols-7 gap-1.5 px-2 pb-8 pt-3 sm:gap-2 sm:px-3">
                    {Array.from({ length: CASH_FLOW_WINDOW_SIZE }).map((_, slotIndex) => {
                      const point = window.points[slotIndex];
                      const isSelected = point?.key === selectedKeyInWindow;
                      const incomeHeight = point ? Math.max(2, Math.round((point.income / window.scale) * barMaxHeight)) : 0;
                      const expenseHeight = point ? Math.max(2, Math.round((point.expense / window.scale) * barMaxHeight)) : 0;
                      const hasIncome = Boolean(point && point.income > 0);
                      const hasExpense = Boolean(point && point.expense > 0);
                      const netValue = point ? point.income - point.expense : 0;

                      return (
                        <button
                          key={point?.key ?? `empty-${window.index}-${slotIndex}`}
                          type="button"
                          disabled={!point}
                          onClick={() => point && setSelectedPointKey(point.key)}
                          className={`relative flex min-w-0 flex-col items-center justify-end rounded-xl transition ${point ? "cursor-pointer" : "cursor-default"}`}
                          aria-pressed={isSelected}
                        >
                          <div className={`absolute inset-x-1 top-2 bottom-8 rounded-lg transition ${isSelected ? "bg-white/55" : "bg-transparent"}`} />
                          {point ? (
                            <>
                              <div className="absolute inset-x-0 top-1 flex flex-col items-center gap-0.5 text-[9px] font-extrabold leading-none text-kash-emerald transition duration-300 ease-out">
                                {hasIncome ? <span className="whitespace-nowrap text-kash-emerald">{formatCompactCurrency(point.income, currency)}</span> : null}
                              </div>
                              <div
                                className="absolute left-1/2 bottom-1/2 w-2.5 -translate-x-1/2 rounded-t-md bg-kash-emerald transition-all duration-300 ease-out"
                                style={{ height: `${incomeHeight}px`, opacity: hasIncome ? 0.95 : 0.16 }}
                              />
                              <div
                                className="absolute left-1/2 top-1/2 w-2.5 -translate-x-1/2 rounded-b-md bg-[#E50914] transition-all duration-300 ease-out"
                                style={{ height: `${expenseHeight}px`, opacity: hasExpense ? 0.95 : 0.16 }}
                              />
                              <div className="absolute inset-x-0 bottom-9 flex flex-col items-center gap-0.5 text-[9px] font-extrabold leading-none text-[#E50914] transition duration-300 ease-out">
                                {hasExpense ? <span className="whitespace-nowrap text-[#E50914]">{formatCompactCurrency(point.expense, currency)}</span> : null}
                              </div>
                              <div className="absolute inset-x-0 bottom-2 flex flex-col items-center gap-0.5">
                                <span className={`max-w-full truncate text-[10px] font-bold ${isSelected ? "text-slate-900" : "text-slate-600"}`}>{point.label}</span>
                                <span className={`text-[9px] font-bold ${netValue >= 0 ? "text-kash-emeraldDark" : "text-[#E50914]"}`}>
                                  {formatCompactCurrency(netValue, currency)}
                                </span>
                              </div>
                            </>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {selectedPoint ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
          <span className="font-extrabold text-slate-900">{selectedPoint.label}</span>
          <span>{t("common.typeIncome") || "Income"}: {formatCurrency(selectedPoint.income, currency)}</span>
          <span>{t("common.typeExpense") || "Expense"}: {formatCurrency(selectedPoint.expense, currency)}</span>
          <span>{t("dashboard.netCashFlow") || "Net"}: {formatCurrency(selectedPoint.income - selectedPoint.expense, currency)}</span>
        </div>
      ) : null}
    </div>
  );
}

function SpendingByCategory({ currency, summary }: { currency: string; summary: AnalyticsSummary }) {
  const { t, formatCurrency } = useI18n();
  const categories = summary.categorySpending.slice(0, 6);
  const totalExpense = categories.reduce((sum, category) => sum + category.amount, 0);

  if (categories.length === 0 || totalExpense <= 0) {
    return (
      <div className="mt-4 flex flex-col items-center justify-center gap-5 md:flex-row md:items-start">
        <div className="mx-auto flex h-55 w-55 items-center justify-center rounded-full bg-slate-100">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-600">{t("dashboard.noData") || "No data"}</div>
        </div>
        <EmptyPanel title={t("analytics.noExpenseCategories") || "No expense categories"} description={t("analytics.noExpenseCategoriesDesc") || "Completed expenses in this period will appear here."} className="flex-1" />
      </div>
    );
  }

  // Exact Dashboard SVG Donut System
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const gapDeg = 3;
  const totalGapDeg = gapDeg * categories.length;
  const availableDeg = 360 - totalGapDeg;

  let accumulatedOffset = 0;
  const segments = categories.map((category) => {
    const segDeg = (category.percent / 100) * availableDeg;
    const segLen = (segDeg / 360) * circumference;
    const gapLen = (gapDeg / 360) * circumference;
    const offset = accumulatedOffset;
    accumulatedOffset += segLen + gapLen;
    return {
      ...category,
      dasharray: `${segLen} ${circumference - segLen}`,
      dashoffset: -offset,
    };
  });

  return (
    <div className="my-auto flex flex-1 w-full flex-col items-center justify-center gap-6 py-4 md:flex-row md:items-center">
      {/* Donut - Larger ring & vertically centered on desktop */}
      <div className="relative mx-auto flex h-55 w-55 lg:h-56 lg:w-56 max-w-full shrink-0 items-center justify-center md:mx-0">
        <svg viewBox="0 0 120 120" className="kash-ring-chart h-full w-full -rotate-90">
          {segments.map((seg) => (
            <circle
              key={seg.id}
              data-segment
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="20"
              strokeLinecap="round"
              strokeDasharray={seg.dasharray}
              strokeDashoffset={seg.dashoffset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center p-2 text-center">
          <div className="min-w-0 max-w-full">
            <p className="text-[11px] font-bold text-slate-500">{t("dashboard.totalExpense") || "Total Spend"}</p>
            <p className="mt-0.5 max-w-[7rem] truncate text-xs sm:text-sm md:text-base font-extrabold leading-tight text-slate-900">
              {formatCurrency(totalExpense, currency)}
            </p>
          </div>
        </div>
      </div>

      {/* Legend - Responsive full width under donut on mobile, vertically centered on desktop */}
      <div className="w-full min-w-0 max-w-full space-y-2.5 md:flex-1">
        {categories.map((category) => (
          <div key={category.id} className="min-w-0 text-xs sm:text-sm">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                <span className="truncate font-semibold text-slate-700">{category.name}</span>
              </div>
              <div className="shrink-0 text-right">
                <span className="font-bold text-slate-900">{formatCurrency(category.amount, currency)}</span>
                <span className="ml-1.5 text-xs font-semibold text-slate-500">{Math.round(category.percent)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function linePath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function IncomeExpenseLineChart({ currency, summary }: { currency: string; summary: AnalyticsSummary }) {
  const { t, formatCurrency } = useI18n();
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const hasData = summary.incomeExpenseTrend.some((point) => point.income > 0 || point.expense > 0);
  const points = summary.incomeExpenseTrend;

  useEffect(() => {
    const scrollElement = mobileScrollRef.current;
    if (!scrollElement || points.length === 0) return;

    scrollChartToIndex(scrollElement, points.length, currentTrendIndex(points));
  }, [points]);

  if (!hasData) {
    return <EmptyPanel title={t("analytics.noTrendData") || "No trend data"} description={t("analytics.noTrendDataDesc") || "Income and expense trend will appear after activity exists."} className="mt-4 min-h-64" />;
  }

  const desktopWidth = 560;
  const mobileWidth = Math.max(560, points.length * 48);
  const height = 260;

  function renderChart({
    className,
    showYAxisLabels,
    style,
    width,
    chartPadding,
  }: {
    chartPadding: { bottom: number; left: number; right: number; top: number };
    className: string;
    showYAxisLabels: boolean;
    style?: CSSProperties;
    width: number;
  }) {
    const padding = chartPadding;
    const plotHeight = height - padding.top - padding.bottom;
    const plotWidth = width - padding.left - padding.right;
    const maxValue = Math.max(1, ...points.flatMap((point) => [point.income, point.expense]));
    const xForIndex = (index: number) => padding.left + (plotWidth / Math.max(points.length - 1, 1)) * index;
    const yForValue = (value: number) => padding.top + plotHeight - (value / maxValue) * plotHeight;
    const incomePoints = points.map((point, index) => ({ x: xForIndex(index), y: yForValue(point.income) }));
    const expensePoints = points.map((point, index) => ({ x: xForIndex(index), y: yForValue(point.expense) }));

    return (
      <svg role="img" aria-label={`Income vs expense trend for ${summary.period.label}`} viewBox={`0 0 ${width} ${height}`} className={className} style={style}>
        {[0, 0.5, 1].map((tick) => {
          const y = padding.top + plotHeight - tick * plotHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={CHART_GRID_COLOR} strokeWidth="1" />
              {showYAxisLabels ? (
                <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-slate-600 text-[10px] font-bold">
                  {chartTickLabel(maxValue * tick)}
                </text>
              ) : null}
            </g>
          );
        })}
        <path d={linePath(incomePoints)} fill="none" stroke={INCOME_COLOR} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        <path d={linePath(expensePoints)} fill="none" stroke={EXPENSE_COLOR} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        {points.map((point, index) => (
          <g key={point.key}>
            <title>{`${point.label}: Income ${formatCurrency(point.income, currency)}, Expense ${formatCurrency(point.expense, currency)}`}</title>
            <circle cx={incomePoints[index].x} cy={incomePoints[index].y} r="3.5" fill={INCOME_COLOR} />
            <circle cx={expensePoints[index].x} cy={expensePoints[index].y} r="3.5" fill={EXPENSE_COLOR} />
            <text x={incomePoints[index].x} y={height - 10} textAnchor="middle" className="fill-slate-700 text-[10px] font-bold">
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    );
  }

  const scrollChartWidth = Math.max(640, points.length * 48);

  return (
    <div className="mt-4 w-full max-w-full min-w-0 overflow-hidden">
      <div ref={mobileScrollRef} className="w-full max-w-full min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {renderChart({
          chartPadding: { bottom: 34, left: 10, right: 10, top: 18 },
          className: "block h-64 max-w-none",
          showYAxisLabels: true,
          style: { width: `${Math.max(100, (points.length / 7) * 100)}%`, minWidth: "100%" },
          width: scrollChartWidth,
        })}
      </div>
    </div>
  );
}

function NetWorthTrend({ currency, summary }: { currency: string; summary: AnalyticsSummary }) {
  const { t, formatCurrency } = useI18n();
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const hasData = summary.netWorthTrend.some((point) => point.amount !== 0);
  const pointsData = summary.netWorthTrend;

  useEffect(() => {
    const scrollElement = mobileScrollRef.current;
    if (!scrollElement || pointsData.length === 0) return;

    scrollChartToIndex(scrollElement, pointsData.length, currentTrendIndex(pointsData));
  }, [pointsData]);

  if (!hasData) {
    return <EmptyPanel title={t("analytics.noNetWorthTrend") || "No net worth trend yet"} description={t("analytics.noNetWorthTrendDesc") || "Wallet balances and ledger activity will build this trend."} className="mt-4 min-h-56" />;
  }

  const desktopWidth = 1040;
  const mobileWidth = Math.max(560, pointsData.length * 52);
  const height = 250;

  function renderChart({
    chartPadding,
    className,
    showYAxisLabels,
    style,
    width,
  }: {
    chartPadding: { bottom: number; left: number; right: number; top: number };
    className: string;
    showYAxisLabels: boolean;
    style?: CSSProperties;
    width: number;
  }) {
    const padding = chartPadding;
    const plotHeight = height - padding.top - padding.bottom;
    const plotWidth = width - padding.left - padding.right;
    const amounts = pointsData.map((point) => point.amount);
    const minAmount = Math.min(0, ...amounts);
    const maxAmount = Math.max(1, ...amounts);
    const span = Math.max(1, maxAmount - minAmount);
    const xForIndex = (index: number) => padding.left + (plotWidth / Math.max(pointsData.length - 1, 1)) * index;
    const yForValue = (value: number) => padding.top + plotHeight - ((value - minAmount) / span) * plotHeight;
    const points = pointsData.map((point, index) => ({ x: xForIndex(index), y: yForValue(point.amount) }));

    return (
      <svg role="img" aria-label={`Net worth trend for ${summary.period.label}`} viewBox={`0 0 ${width} ${height}`} className={className} style={style}>
        {[0, 0.5, 1].map((tick) => {
          const y = padding.top + plotHeight - tick * plotHeight;
          const value = minAmount + span * tick;
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={CHART_GRID_COLOR} strokeWidth="1" />
              {showYAxisLabels ? (
                <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-slate-600 text-[10px] font-bold">
                  {chartTickLabel(value)}
                </text>
              ) : null}
            </g>
          );
        })}
        <path d={linePath(points)} fill="none" stroke={NET_WORTH_COLOR} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        {pointsData.map((point, index) => (
          <g key={point.key}>
            <title>{`${point.label}: ${formatCurrency(point.amount, currency)}`}</title>
            <circle cx={points[index].x} cy={points[index].y} r="3.5" fill={NET_WORTH_COLOR} />
            <text x={points[index].x} y={height - 10} textAnchor="middle" className="fill-slate-700 text-[10px] font-bold">
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    );
  }

  const scrollChartWidth = Math.max(640, pointsData.length * 48);

  return (
    <div className="mt-4 w-full max-w-full min-w-0 overflow-hidden">
      <div ref={mobileScrollRef} className="w-full max-w-full min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {renderChart({
          chartPadding: { bottom: 34, left: 10, right: 10, top: 18 },
          className: "block h-64 max-w-none",
          showYAxisLabels: true,
          style: { width: `${Math.max(100, (pointsData.length / 7) * 100)}%`, minWidth: "100%" },
          width: scrollChartWidth,
        })}
      </div>
    </div>
  );
}

function WalletDistribution({ currency, summary }: { currency: string; summary: AnalyticsSummary }) {
  const { t, formatCurrency } = useI18n();
  const totalAssets = summary.walletDistribution.reduce((sum, item) => sum + item.amount, 0);

  if (summary.walletDistribution.length === 0 || totalAssets <= 0) {
    return <EmptyPanel title={t("analytics.noWalletDistTitle") || "No wallet distribution"} description={t("analytics.noWalletDistDesc") || "Active wallets included in net worth will appear here."} className="mt-4 min-h-40" />;
  }

  return (
    <div className="mt-4 min-w-0">
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        {summary.walletDistribution.map((item) => (
          <div
            key={item.id}
            aria-hidden="true"
            className="h-full"
            style={{ backgroundColor: item.color, width: `${Math.max(item.percent, 2)}%` }}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-3">
        {summary.walletDistribution.map((item) => (
          <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate font-bold text-slate-700">{item.label}</span>
              <span className="shrink-0 font-semibold text-slate-600">({item.percent.toFixed(1)}%)</span>
            </div>
            <p className="text-right font-extrabold text-slate-900">{formatCurrency(item.amount, currency)}</p>
          </div>
        ))}
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t border-slate-200 pt-3 text-sm">
          <p className="font-extrabold text-slate-900">{t("dashboard.netWorth") || "Net Worth"}</p>
          <div className="min-w-0 text-right">
            <p className="font-extrabold text-slate-900">{formatCurrency(summary.walletNetWorth, currency)}</p>
            <ComparisonLine
              change={summary.walletNetWorthChange}
              className="mt-0.5 justify-end"
              comparisonLabel={summary.period.comparisonLabel}
              currency={currency}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-4">
      <div className="h-16 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-28 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-28 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-28 animate-pulse rounded-lg bg-slate-200" />
      </div>
      <div className="h-80 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-80 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-80 animate-pulse rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}

function PeriodControls({
  customEndDate,
  customStartDate,
  onCustomEndDateChange,
  onCustomStartDateChange,
  onPeriodChange,
  period,
}: {
  customEndDate: string;
  customStartDate: string;
  onCustomEndDateChange: (value: string) => void;
  onCustomStartDateChange: (value: string) => void;
  onPeriodChange: (value: AnalyticsPeriodKey) => void;
  period: AnalyticsPeriodKey;
}) {
  const { t } = useI18n();
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const periodOptions: { label: string; value: AnalyticsPeriodKey }[] = useMemo(
    () => [
      { label: t("analytics.thisMonth") || "This Month", value: "this_month" },
      { label: t("analytics.lastMonth") || "Last Month", value: "last_month" },
      { label: t("analytics.3Months") || "3 Months", value: "3_months" },
      { label: t("analytics.6Months") || "6 Months", value: "6_months" },
      { label: t("analytics.thisYear") || "This Year", value: "this_year" },
      { label: t("analytics.customRange") || "Custom Range", value: "custom" },
    ],
    [t],
  );
  const selectedOption = periodOptions.find((option) => option.value === period) ?? periodOptions[0];

  useEffect(() => {
    if (!isOpen) return;

    const updatePopoverPosition = () => {
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const width = Math.min(224, window.innerWidth - 24);
      const left = Math.min(
        Math.max(12, rect.right - width),
        window.innerWidth - width - 12,
      );
      const top = Math.min(rect.bottom + 6, window.innerHeight - 292);

      setPopoverStyle({
        left,
        position: "fixed",
        top: Math.max(12, top),
        width,
        zIndex: 1200,
      });
    };

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (pickerRef.current?.contains(event.target as Node)) return;
      if (popoverRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };

    updatePopoverPosition();
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen]);

  return (
    <div className="flex flex-col items-end gap-2 min-w-0">
      <div ref={pickerRef} className="relative w-40 shrink-0">
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={isOpen}
          aria-haspopup="menu"
          aria-label={t("analytics.period") || "Period"}
          onClick={() => setIsOpen((current) => !current)}
          className="inline-flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-white/15 bg-white/15 py-0 pl-2.5 pr-2.5 text-xs font-extrabold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/30"
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <CalendarDays aria-hidden="true" className="shrink-0 text-white/85" size={13} />
            <span className="truncate">{selectedOption.label}</span>
          </span>
          <ChevronDown aria-hidden="true" className={`shrink-0 text-white/80 transition ${isOpen ? "rotate-180" : ""}`} size={13} />
        </button>

        {isOpen && popoverStyle
          ? createPortal(
              <div
                ref={popoverRef}
                style={popoverStyle}
                className="rounded-lg border border-slate-200/60 bg-white p-1.5 shadow-soft"
                role="menu"
              >
                {periodOptions.map((option) => {
                  const isSelected = option.value === period;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onPeriodChange(option.value);
                        setIsOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-extrabold transition ${
                        isSelected
                          ? "bg-kash-emerald text-white"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="truncate">{option.label}</span>
                      {isSelected ? <Check aria-hidden="true" className="shrink-0" size={14} /> : null}
                    </button>
                  );
                })}
              </div>,
              document.body,
            )
          : null}
      </div>

      {period === "custom" && (
        <div className="flex items-center gap-1.5 rounded-lg bg-white/15 p-1.5 ring-1 ring-white/15">
          <div className="w-28 sm:w-32">
            <DatePickerField
              id="analytics-start-date"
              value={customStartDate}
              onChange={(val) => onCustomStartDateChange(val)}
            />
          </div>
          <span className="text-xs font-bold text-white/50">-</span>
          <div className="w-28 sm:w-32">
            <DatePickerField
              id="analytics-end-date"
              value={customEndDate}
              onChange={(val) => onCustomEndDateChange(val)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetVsActualCard({ currency }: { currency: string }) {
  const { t, formatMonthYear, formatCurrency } = useI18n();
  const [budgets, setBudgets] = useState<BudgetWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const monthYearLabel = useMemo(() => {
    return formatMonthYear(new Date());
  }, [formatMonthYear]);

  useEffect(() => {
    getMonthlyBudgets()
      .then((data) => {
        setBudgets(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || budgets.length === 0) return null;

  return (
    <AnalyticsCard className="p-5">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Scale aria-hidden="true" className="text-kash-emerald" size={18} />
          <h2 className="text-base font-extrabold text-slate-900">{t("nav.budgets")} ({monthYearLabel})</h2>
        </div>
        <Link to="/budgets" className="text-xs font-bold text-slate-600 hover:text-kash-emerald">
          {t("common.viewAll")}
        </Link>
      </div>

      <div className="space-y-3.5">
        {budgets.slice(0, 5).map((b) => {
          const progress = Math.min(Math.max(b.usage_percentage, 0), 100);
          const isOver = b.status === "over_budget";
          const isNear = b.status === "near_limit";

          return (
            <div key={b.budget_id} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-900">{b.name}</span>
                <span className="text-slate-600">
                  <strong className={isOver ? "text-kash-expense" : "text-slate-900"}>
                    {formatCurrency(b.spent, currency)}
                  </strong>{" "}
                  / {formatCurrency(b.effective_budget, currency)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all ${
                    isOver ? "bg-kash-expense" : isNear ? "bg-amber-500" : "bg-kash-emerald"
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </AnalyticsCard>
  );
}

export function AnalyticsPage() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const currency = profile?.default_currency ?? "IDR";
  const [period, setPeriod] = useState<AnalyticsPeriodKey>("this_month");
  const [customStartDate, setCustomStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
  );
  const [customEndDate, setCustomEndDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10),
  );
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const summaryOptions = {
      customEndDate: period === "custom" ? customEndDate : undefined,
      customStartDate: period === "custom" ? customStartDate : undefined,
      period,
    };

    try {
      const data = await getAnalyticsSummary(summaryOptions);
      setSummary(data);
    } catch (loadError) {
      if (isEmptyAnalyticsPeriodError(loadError)) {
        setSummary(getEmptyAnalyticsSummary(summaryOptions));
        setError(null);
        return;
      }

      setError(
        loadError instanceof Error ? loadError.message : "Unable to load analytics summary. Please retry.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [customEndDate, customStartDate, period]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  useAppEvent(appEvents.transactionSaved, () => void loadAnalytics());

  if (isLoading && !summary) return <AnalyticsSkeleton />;

  if (error && !summary) {
    return (
      <AnalyticsCard className="p-6">
        <p className="text-sm font-bold text-kash-expense">{t("common.error")}</p>
        <p className="mt-2 text-sm font-medium text-slate-600">{error}</p>
        <button
          type="button"
          onClick={() => void loadAnalytics()}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-kash-emerald px-4 py-2 text-sm font-bold text-white transition hover:bg-kash-emeraldDark focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
        >
          <RefreshCw size={17} />
          {t("common.retry")}
        </button>
      </AnalyticsCard>
    );
  }

  if (!summary) return null;

  return (
    <div className="w-full max-w-full min-w-0 space-y-4">
      <PageHeader
        eyebrow={t("analytics.period") || "Analisis"}
        icon={BarChart3}
        title={t("nav.analytics") || "Analitik Keuangan"}
        description={t("analytics.cashFlowOverview") || "Pantau tren pemasukan, pengeluaran, arus kas, dan kesehatan keuangan."}
      />

      {/* 2. Main Emerald Financial Hero */}
      <AnalyticsHeroStory
        summary={summary}
        currency={currency}
        periodControls={
          <PeriodControls
            period={period}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onPeriodChange={setPeriod}
            onCustomStartDateChange={setCustomStartDate}
            onCustomEndDateChange={setCustomEndDate}
          />
        }
      />

      {/* 3. Main Visual Charts Grid (Donut Ring + Cash Flow Line Chart in 2 Columns) */}
      <div className="grid gap-4 lg:grid-cols-2 min-w-0 max-w-full">
        <AnalyticsCard className="p-5 flex flex-col justify-between h-full">
          <h2 className="text-base font-extrabold text-slate-900">{t("dashboard.spendingByCategory") || "Spending by Category"}</h2>
          <SpendingByCategory summary={summary} currency={currency} />
        </AnalyticsCard>

        <AnalyticsCard className="p-5 flex flex-col justify-between h-full">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">{t("analytics.cashFlowOverview") || "Cash Flow Overview"}</h2>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">{summary.period.aggregation === "daily" ? (t("analytics.dailyAggregation") || "Daily aggregation") : (t("analytics.monthlyAggregation") || "Monthly aggregation")}</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: INCOME_COLOR }} />
                {t("common.typeIncome") || t("dashboard.income") || "Income"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EXPENSE_COLOR }} />
                {t("common.typeExpense") || t("dashboard.expense") || "Expense"}
              </span>
            </div>
          </div>
          <CashFlowOverview summary={summary} currency={currency} />
        </AnalyticsCard>
      </div>

      {/* 4. Editorial Insights Section */}
      <AnalyticsInsights summary={summary} currency={currency} />

      {/* 5. Supporting Trend Charts Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AnalyticsCard className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-extrabold text-slate-900">{t("analytics.incomeVsExpense") || "Income vs Expense"}</h2>
            <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: INCOME_COLOR }} />
                {t("common.typeIncome") || t("dashboard.income") || "Income"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EXPENSE_COLOR }} />
                {t("common.typeExpense") || t("dashboard.expense") || "Expense"}
              </span>
            </div>
          </div>
          <IncomeExpenseLineChart summary={summary} currency={currency} />
        </AnalyticsCard>

        <AnalyticsCard className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">{t("analytics.netWorthTrend") || "Net Worth Trend"}</h2>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NET_WORTH_COLOR }} />
              {t("dashboard.netWorth") || "Net Worth"}
            </div>
          </div>
          <NetWorthTrend summary={summary} currency={currency} />
        </AnalyticsCard>
      </div>

      {/* 6. Budget vs Actual & Wallet Distribution (Full Width) */}
      <BudgetVsActualCard currency={currency} />

      <AnalyticsCard className="p-5 w-full min-w-0 max-w-full">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <WalletCards aria-hidden="true" className="text-slate-700" size={18} />
            <h2 className="text-base font-extrabold text-slate-900">{t("analytics.walletDistribution") || "Wallet Distribution"}</h2>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <CalendarDays aria-hidden="true" size={15} />
            {t("analytics.currentBalances") || "Current balances"}
          </div>
        </div>
        <WalletDistribution summary={summary} currency={currency} />
      </AnalyticsCard>

      <p className="text-xs font-semibold text-slate-500">
        {t("analytics.footerNote") || "Transfer fees are included in Expense. Transfer principal and balance adjustments are excluded from Income, Expense, and Cash Flow."}
      </p>
    </div>
  );
}


