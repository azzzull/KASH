import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
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
import { Link } from "react-router-dom";
import { getAnalyticsSummary, type AnalyticsMetricChange, type AnalyticsPeriodKey, type AnalyticsSummary } from "../lib/analytics";
import { getMonthlyBudgets } from "../lib/budgets";
import type { BudgetWithProgress } from "../types/domain";
import { formatCurrency } from "../lib/money";
import { appEvents } from "../lib/appEvents";
import { useAppEvent } from "../hooks/useAppEvent";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { DatePickerField } from "../components/ui/DatePickerField";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";

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

function MetricComparison({
  change,
  comparisonLabel,
  metric,
}: {
  change: AnalyticsMetricChange;
  comparisonLabel: string;
  metric: "income" | "expense" | "netCashFlow";
}) {
  const { t } = useI18n();
  if (change.state === "none") return null;

  if (change.state === "flat") {
    return (
      <p className="mt-2 text-xs font-bold">
        <span className="text-slate-700">0.0%</span>
        <span className="ml-1 font-semibold text-slate-600">{comparisonLabel}</span>
      </p>
    );
  }

  if (change.state === "new") {
    const tone = metric === "expense" ? "text-[#E50914]" : "text-kash-emerald";
    return <p className={`mt-2 text-xs font-bold ${tone}`}>{t("analytics.newInPeriod") || "New in this period"}</p>;
  }

  const increased = change.state === "increase";
  const positive = metric === "expense" ? !increased : increased;
  const Icon = increased ? TrendingUp : TrendingDown;

  return (
    <p className="mt-2 flex items-center gap-1 text-xs font-bold">
      <span className={`inline-flex items-center gap-1 ${positive ? "text-kash-emerald" : "text-[#E50914]"}`}>
        <Icon aria-hidden="true" size={13} strokeWidth={2.4} />
        {Math.abs(change.percent ?? 0).toFixed(1)}%
      </span>
      <span className="font-semibold text-slate-600">{comparisonLabel}</span>
    </p>
  );
}

function SummaryCards({ currency, summary }: { currency: string; summary: AnalyticsSummary }) {
  const { t, formatCurrency } = useI18n();
  const cards = [
    {
      accent: "text-kash-emerald",
      badge: "bg-kash-emerald/10 text-kash-emerald",
      change: summary.income.change,
      icon: ArrowUpRight,
      metric: "income" as const,
      title: t("common.typeIncome") || t("dashboard.income") || "Income",
      value: summary.income.amount,
    },
    {
      accent: "text-[#E50914]",
      badge: "bg-kash-expense/10 text-[#E50914]",
      change: summary.expense.change,
      icon: ArrowDownRight,
      metric: "expense" as const,
      title: t("common.typeExpense") || t("dashboard.expense") || "Expense",
      value: summary.expense.amount,
    },
    {
      accent: summary.netCashFlow.amount >= 0 ? "text-kash-emerald" : "text-[#E50914]",
      badge: summary.netCashFlow.amount >= 0 ? "bg-kash-emerald/10 text-kash-emerald" : "bg-kash-expense/10 text-[#E50914]",
      change: summary.netCashFlow.change,
      icon: summary.netCashFlow.amount >= 0 ? ArrowUpRight : ArrowDownRight,
      metric: "netCashFlow" as const,
      title: t("dashboard.netCashFlow") || "Cash Flow",
      value: summary.netCashFlow.amount,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:gap-4">
      {cards.map((card) => (
        <AnalyticsCard key={card.title} className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{card.title}</p>
              <p className="mt-1.5 break-words text-2xl font-extrabold text-slate-900">{formatCurrency(card.value, currency)}</p>
              <MetricComparison change={card.change} metric={card.metric} comparisonLabel={summary.period.comparisonLabel} />
            </div>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.badge}`}>
              <card.icon aria-hidden="true" size={20} strokeWidth={2.4} />
            </span>
          </div>
        </AnalyticsCard>
      ))}
    </div>
  );
}

function monthEquivalent(summary: AnalyticsSummary) {
  const start = new Date(summary.period.start);
  const end = new Date(summary.period.end);
  const days = Math.max(1, (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, days / 30.4375);
}

function formatPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
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

function AnalyticsHeroStory({ currency, summary }: { currency: string; summary: AnalyticsSummary }) {
  const { t, formatCurrency } = useI18n();
  const netCashFlow = summary.netCashFlow.amount;
  const isSurplus = netCashFlow >= 0;
  const savingsRate = summary.income.amount > 0 ? (netCashFlow / summary.income.amount) * 100 : 0;
  const topCategory = summary.categorySpending[0];

  return (
    <section className="kash-hero-card p-5 sm:p-6 min-w-0 max-w-full">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-extrabold text-white">
          {isSurplus ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {isSurplus ? (t("analytics.surplusState") || "Cash Flow Surplus") : (t("analytics.deficitState") || "Cash Flow Deficit")}
        </span>
        <span className="text-xs font-bold text-white/70">
          {summary.period.label}
        </span>
      </div>

      <div className="mt-4">
        <h2 className="text-xl font-black text-white sm:text-2xl">
          {isSurplus
            ? `${t("analytics.surplusHeadline") || "Kondisi Keuangan Sehat & Surplus"}`
            : `${t("analytics.deficitHeadline") || "Pengeluaran Melebihi Pemasukan"}`}
        </h2>
        <p className="mt-1 break-words text-3xl font-extrabold text-white sm:text-4xl">
          {formatCurrency(Math.abs(netCashFlow), currency)}{" "}
          <span className="text-xs font-semibold text-white/70">
            {isSurplus ? (t("analytics.netSurplus") || "net surplus kas") : (t("analytics.netDeficit") || "net defisit kas")}
          </span>
        </p>
      </div>

      <p className="mt-3 text-xs font-medium text-white/80 max-w-xl">
        {isSurplus
          ? (t("analytics.surplusStoryDesc", { rate: savingsRate.toFixed(1), category: topCategory?.name || "-" }) ||
            `Anda berhasil mempertahankan tingkat tabungan bersih sebesar ${savingsRate.toFixed(1)}%. Pengeluaran terbesar bulan ini dialokasikan untuk ${topCategory?.name || "-"}.`)
          : (t("analytics.deficitStoryDesc", { category: topCategory?.name || "-" }) ||
            `Arus kas keluar periode ini lebih besar dari total pemasukan. Evaluasi pengeluaran pada ${topCategory?.name || "-"} untuk menjaga keseimbangan kas.`)}
      </p>
    </section>
  );
}

function AnalyticsInsights({ currency, summary }: { currency: string; summary: AnalyticsSummary }) {
  const { t, formatCurrency } = useI18n();
  const months = monthEquivalent(summary);
  const averageMonthlyExpense = summary.expense.amount / months;
  const averageMonthlyIncome = summary.income.amount / months;
  const averageMonthlyCashFlow = summary.netCashFlow.amount / months;
  const savingsRate = summary.income.amount > 0 ? (summary.netCashFlow.amount / summary.income.amount) * 100 : null;
  const topCategory = summary.categorySpending[0] ?? null;

  const insights = [
    {
      icon: TrendingDown,
      label: t("analytics.avgMonthlyExpense") || "Rata-rata Belanja Bulanan",
      value: formatCurrency(averageMonthlyExpense, currency),
      helper: t("analytics.avgMonthlyExpenseStory") || "Laju pengeluaran rutin per bulan",
      tone: "text-slate-900",
      accentBg: "bg-[#E50914]/10 text-[#E50914]",
    },
    {
      icon: TrendingUp,
      label: t("analytics.avgMonthlyIncome") || "Rata-rata Pemasukan Bulanan",
      value: formatCurrency(averageMonthlyIncome, currency),
      helper: t("analytics.avgMonthlyIncomeStory") || "Kecepatan arus masuk dana",
      tone: "text-slate-900",
      accentBg: "bg-kash-emerald/10 text-kash-emeraldDark",
    },
    {
      icon: Sparkles,
      label: t("analytics.savingsRate") || "Rasio Tabungan Bersih",
      value: savingsRate != null ? `${savingsRate.toFixed(1)}%` : "-",
      helper: savingsRate != null && savingsRate >= 20 ? (t("analytics.healthySavingsPace") || "Diatas target ideal 20%") : (t("analytics.moderateSavingsPace") || "Alokasi tabungan perlu ditingkatkan"),
      tone: savingsRate != null && savingsRate >= 0 ? "text-kash-emeraldDark" : "text-[#E50914]",
      accentBg: "bg-amber-500/10 text-amber-800",
    },
    {
      icon: PieChart,
      label: t("analytics.topCategoryImpact") || "Kontributor Belanja Terbesar",
      value: topCategory ? topCategory.name : "-",
      helper: topCategory ? `${formatCurrency(topCategory.amount, currency)} (${topCategory.percent.toFixed(0)}% dari total)` : (t("analytics.noData") || "Belum ada transaksi"),
      tone: "text-slate-900",
      accentBg: "bg-blue-500/10 text-blue-700",
    },
    {
      icon: Receipt,
      label: t("analytics.transferFees") || "Beban Biaya Transfer",
      value: formatCurrency(summary.transferFees, currency),
      helper: summary.transferFees > 0 ? (t("analytics.transferFeesStory") || "Biaya administrasi terakumulasi") : (t("analytics.zeroTransferFees") || "Bebas biaya transfer pada periode ini"),
      tone: summary.transferFees > 0 ? "text-amber-700" : "text-slate-700",
      accentBg: "bg-slate-100 text-slate-700",
    },
    {
      icon: WalletCards,
      label: t("analytics.netCashFlow") || "Net Surplus/Defisit Kas",
      value: formatCurrency(averageMonthlyCashFlow, currency),
      helper: averageMonthlyCashFlow >= 0 ? (t("analytics.surplusPaceStory") || "Pengakumulasian kas positif") : (t("analytics.deficitPaceStory") || "Defisit kas terakumulasi"),
      tone: averageMonthlyCashFlow >= 0 ? "text-kash-emeraldDark" : "text-[#E50914]",
      accentBg: averageMonthlyCashFlow >= 0 ? "bg-kash-emerald/10 text-kash-emeraldDark" : "bg-red-500/10 text-red-700",
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold text-slate-900">
          {t("analytics.editorialInsights") || "Editorial Insights & Analisis Lanjutan"}
        </h3>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {insights.map((item) => (
          <div
            key={item.label}
            className="flex flex-col justify-between rounded-2xl border border-slate-200/60 bg-white p-4.5 sm:p-5 shadow-card hover:shadow-md transition"
          >
            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {item.label}
                </span>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-extrabold text-xs ${item.accentBg}`}>
                  <item.icon size={18} />
                </span>
              </div>

              <p className={`mt-3 text-2xl font-extrabold ${item.tone}`}>
                {item.value}
              </p>
            </div>

            <p className="mt-4 border-t border-slate-100/80 pt-3 text-xs font-semibold text-slate-500 leading-relaxed">
              {item.helper}
            </p>
          </div>
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
  const { t, formatCurrency, formatCompactCurrency } = useI18n();
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const hasData = summary.incomeExpenseTrend.some((point) => point.income > 0 || point.expense > 0);
  const points = summary.incomeExpenseTrend;
  const mobileWidth = Math.max(360, points.length * 40);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  useEffect(() => {
    const scrollElement = mobileScrollRef.current;
    if (!scrollElement || points.length === 0) return;

    scrollChartToIndex(scrollElement, points.length, currentTrendIndex(points));
  }, [points]);

  if (!hasData) {
    return <EmptyPanel title={t("analytics.noCashFlowData") || "No cash flow data"} description={t("analytics.noCashFlowDesc") || "Income and expense activity in this period will build the chart."} className="min-h-64" />;
  }

  function renderChart({
    className,
    showYAxisLabels = true,
    style,
    width,
    chartPadding = { bottom: 34, left: 38, right: 10, top: 16 },
  }: {
    chartPadding?: { bottom: number; left: number; right: number; top: number };
    className: string;
    showYAxisLabels?: boolean;
    style?: CSSProperties;
    width: number;
  }) {
    const height = 260;
    const padding = chartPadding;
    const maxValue = Math.max(1, ...points.flatMap((point) => [point.income, point.expense]));
    const plotHeight = height - padding.top - padding.bottom;
    const plotWidth = width - padding.left - padding.right;
    const bandWidth = plotWidth / points.length;
    const barWidth = Math.min(18, Math.max(7, bandWidth / 3.4));

    return (
      <svg role="img" aria-label={`Cash flow overview for ${summary.period.label}`} viewBox={`0 0 ${width} ${height}`} className={className} style={style}>
        {ticks.map((tick) => {
          const y = padding.top + plotHeight - tick * plotHeight;
          const value = maxValue * tick;

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

        {points.map((point, index) => {
          const centerX = padding.left + bandWidth * (index + 0.5);
          const incomeHeight = (point.income / maxValue) * plotHeight;
          const expenseHeight = (point.expense / maxValue) * plotHeight;
          const incomeY = padding.top + plotHeight - incomeHeight;
          const expenseY = padding.top + plotHeight - expenseHeight;

          return (
            <g key={point.key}>
              <title>{`${point.label}: Income ${formatCurrency(point.income, currency)}, Expense ${formatCurrency(point.expense, currency)}`}</title>
              {point.income > 0 ? (
                <text
                  x={centerX - barWidth / 2 - 2}
                  y={Math.max(10, incomeY - 5)}
                  textAnchor="middle"
                  className="fill-kash-emerald text-[9px] font-extrabold"
                >
                  {formatCompactCurrency(point.income)}
                </text>
              ) : null}
              {point.expense > 0 ? (
                <text
                  x={centerX + barWidth / 2 + 2}
                  y={Math.max(10, expenseY - 5)}
                  textAnchor="middle"
                  className="fill-[#E50914] text-[9px] font-extrabold"
                >
                  {formatCompactCurrency(point.expense)}
                </text>
              ) : null}
              <rect
                x={centerX - barWidth - 2}
                y={incomeY}
                width={barWidth}
                height={point.income > 0 ? Math.max(incomeHeight, 3) : 2}
                rx="3"
                fill={INCOME_COLOR}
                opacity={point.income > 0 ? 0.95 : 0.16}
              />
              <rect
                x={centerX + 2}
                y={expenseY}
                width={barWidth}
                height={point.expense > 0 ? Math.max(expenseHeight, 3) : 2}
                rx="3"
                fill={EXPENSE_COLOR}
                opacity={point.expense > 0 ? 1 : 0.16}
              />
              <text x={centerX} y={height - 10} textAnchor="middle" className="fill-slate-700 text-[10px] font-bold">
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden">
      <div ref={mobileScrollRef} className="-mx-5 w-[calc(100%+2.5rem)] overflow-x-auto sm:hidden">
        {renderChart({
          className: "block h-64 max-w-none",
          chartPadding: { bottom: 34, left: 0, right: 0, top: 16 },
          showYAxisLabels: false,
          style: { width: `${mobileWidth}px` },
          width: mobileWidth,
        })}
      </div>
      <div className="hidden min-w-0 sm:block">
        {renderChart({ className: "block h-72 w-full max-w-full", width: 1040 })}
      </div>
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
        <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full bg-slate-100">
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
    <div className="mt-4 flex flex-col items-center justify-center gap-5 md:flex-row md:items-start">
      {/* Donut - Centered horizontally on mobile */}
      <div className="relative mx-auto flex h-36 w-36 sm:h-40 sm:w-40 max-w-full shrink-0 items-center justify-center md:mx-0">
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
            <p className="mt-0.5 max-w-[5.5rem] truncate text-xs sm:text-sm font-extrabold leading-tight text-slate-900">
              {formatCurrency(totalExpense, currency)}
            </p>
          </div>
        </div>
      </div>

      {/* Legend - Responsive full width under donut on mobile */}
      <div className="w-full min-w-0 max-w-full space-y-2.5 md:flex-1">
        {categories.map((category) => (
          <div key={category.id} className="flex items-center justify-between gap-2.5 text-xs sm:text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
              <span className="truncate font-semibold text-slate-700">{category.name}</span>
            </div>
            <div className="shrink-0 text-right">
              <span className="font-bold text-slate-900">{formatCurrency(category.amount, currency)}</span>
              <span className="ml-1.5 text-xs font-semibold text-slate-500">{Math.round(category.percent)}%</span>
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

  if (!hasData) {
    return <EmptyPanel title={t("analytics.noTrendData") || "No trend data"} description={t("analytics.noTrendDataDesc") || "Income and expense trend will appear after activity exists."} className="mt-4 min-h-64" />;
  }

  const desktopWidth = 560;
  const mobileWidth = Math.max(560, points.length * 48);
  const height = 260;

  useEffect(() => {
    const scrollElement = mobileScrollRef.current;
    if (!scrollElement || points.length === 0) return;

    scrollChartToIndex(scrollElement, points.length, currentTrendIndex(points));
  }, [points]);

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

  return (
    <div className="mt-4 min-w-0 overflow-hidden">
      <div ref={mobileScrollRef} className="-mx-5 w-[calc(100%+2.5rem)] overflow-x-auto sm:hidden">
        {renderChart({
          chartPadding: { bottom: 34, left: 0, right: 0, top: 18 },
          className: "block h-64 max-w-none",
          showYAxisLabels: false,
          style: { width: `${mobileWidth}px` },
          width: mobileWidth,
        })}
      </div>
      <div className="hidden min-w-0 sm:block">
        {renderChart({
          chartPadding: { bottom: 34, left: 40, right: 14, top: 18 },
          className: "block h-64 w-full",
          showYAxisLabels: true,
          width: desktopWidth,
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

  if (!hasData) {
    return <EmptyPanel title={t("analytics.noNetWorthTrend") || "No net worth trend yet"} description={t("analytics.noNetWorthTrendDesc") || "Wallet balances and ledger activity will build this trend."} className="mt-4 min-h-56" />;
  }

  const desktopWidth = 1040;
  const mobileWidth = Math.max(560, pointsData.length * 52);
  const height = 250;

  useEffect(() => {
    const scrollElement = mobileScrollRef.current;
    if (!scrollElement || pointsData.length === 0) return;

    scrollChartToIndex(scrollElement, pointsData.length, currentTrendIndex(pointsData));
  }, [pointsData]);

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

  return (
    <div className="mt-4 min-w-0 overflow-hidden">
      <div ref={mobileScrollRef} className="-mx-5 w-[calc(100%+2.5rem)] overflow-x-auto sm:hidden">
        {renderChart({
          chartPadding: { bottom: 34, left: 0, right: 0, top: 18 },
          className: "block h-64 max-w-none",
          showYAxisLabels: false,
          style: { width: `${mobileWidth}px` },
          width: mobileWidth,
        })}
      </div>
      <div className="hidden min-w-0 sm:block">
        {renderChart({
          chartPadding: { bottom: 34, left: 56, right: 16, top: 18 },
          className: "block h-64 w-full",
          showYAxisLabels: true,
          width: desktopWidth,
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
          <p className="text-right font-extrabold text-slate-900">{formatCurrency(summary.walletNetWorth, currency)}</p>
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/60 bg-white p-3 shadow-card">
      <div className="flex items-center gap-2">
        <CalendarDays size={16} className="text-kash-emerald" />
        <span className="text-xs font-extrabold text-slate-700">{t("analytics.period") || "Periode"}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40 sm:w-48">
          <SelectField
            value={period}
            onChange={(event) => onPeriodChange(event.target.value as AnalyticsPeriodKey)}
          >
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </div>
        {period === "custom" && (
          <div className="flex items-center gap-2">
            <div className="w-32 sm:w-36">
              <DatePickerField
                id="analytics-start-date"
                value={customStartDate}
                onChange={(val) => onCustomStartDateChange(val)}
              />
            </div>
            <span className="text-xs font-bold text-slate-400">-</span>
            <div className="w-32 sm:w-36">
              <DatePickerField
                id="analytics-end-date"
                value={customEndDate}
                onChange={(val) => onCustomEndDateChange(val)}
              />
            </div>
          </div>
        )}
      </div>
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
    try {
      const data = await getAnalyticsSummary({
        customEndDate: period === "custom" ? customEndDate : undefined,
        customStartDate: period === "custom" ? customStartDate : undefined,
        period,
      });
      setSummary(data);
    } catch (loadError) {
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
    <div className="w-full max-w-full min-w-0 space-y-5">
      <PageHeader
        eyebrow={t("nav.analytics")}
        icon={BarChart3}
        title={t("nav.analytics")}
        description={t("analytics.description") || "Comprehensive insights across cash flow, spending distribution, and net worth."}
      />

      <PeriodControls
        period={period}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        onPeriodChange={setPeriod}
        onCustomStartDateChange={setCustomStartDate}
        onCustomEndDateChange={setCustomEndDate}
      />

      {/* Analytics Key Story Hero */}
      <AnalyticsHeroStory summary={summary} currency={currency} />

      {/* Primary KPI Metric Strip */}
      <SummaryCards summary={summary} currency={currency} />

      {/* Modern Editorial Insight Cards */}
      <AnalyticsInsights summary={summary} currency={currency} />

      {/* Main Visual Charts Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AnalyticsCard className="p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-extrabold text-slate-900">{t("dashboard.spendingByCategory") || "Spending by Category"}</h2>
            <ChevronRight aria-hidden="true" className="text-slate-400" size={18} />
          </div>
          <SpendingByCategory summary={summary} currency={currency} />
        </AnalyticsCard>

        <AnalyticsCard className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-extrabold text-slate-900">{t("analytics.cashFlowOverview") || "Cash Flow Overview"}</h2>
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

      {/* Supporting Trend Charts Grid */}
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

      {/* Budget vs Actual & Wallet Distribution */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BudgetVsActualCard currency={currency} />

        <AnalyticsCard className="p-5">
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
      </div>

      <p className="text-xs font-semibold text-slate-600">
        {t("analytics.footerNote") || "Transfer fees are included in Expense. Transfer principal and balance adjustments are excluded from Income, Expense, and Cash Flow."}
      </p>
    </div>
  );
}
