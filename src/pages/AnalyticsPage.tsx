import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  RefreshCw,
  Scale,
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
  return <section className={`min-w-0 rounded-lg border border-kash-emerald/10 bg-white/95 shadow-sm ${className}`}>{children}</section>;
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
        <AnalyticsCard key={card.title} className="p-4 lg:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase text-slate-600">{card.title}</p>
              <p className="mt-3 break-words text-xl font-extrabold text-slate-900 lg:text-2xl">{formatCurrency(card.value, currency)}</p>
              <MetricComparison change={card.change} metric={card.metric} comparisonLabel={summary.period.comparisonLabel} />
            </div>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.badge}`}>
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

function AnalyticsInsights({ currency, summary }: { currency: string; summary: AnalyticsSummary }) {
  const { t, formatCurrency } = useI18n();
  const months = monthEquivalent(summary);
  const averageMonthlyExpense = summary.expense.amount / months;
  const averageMonthlyIncome = summary.income.amount / months;
  const averageMonthlyCashFlow = summary.netCashFlow.amount / months;
  const savingsRate = summary.income.amount > 0 ? (summary.netCashFlow.amount / summary.income.amount) * 100 : null;
  const expenseIncomeRatio = summary.income.amount > 0 ? (summary.expense.amount / summary.income.amount) * 100 : null;
  const topCategory = summary.categorySpending[0] ?? null;
  const highestSpendingPeriod = summary.incomeExpenseTrend.reduce(
    (highest, point) => (point.expense > highest.expense ? point : highest),
    summary.incomeExpenseTrend[0] ?? { end: "", expense: 0, income: 0, key: "", label: "-", start: "" },
  );
  const firstNetWorth = summary.netWorthTrend[0]?.amount ?? null;
  const lastNetWorth = summary.netWorthTrend[summary.netWorthTrend.length - 1]?.amount ?? null;
  const netWorthDelta = firstNetWorth != null && lastNetWorth != null ? lastNetWorth - firstNetWorth : null;
  const health = cashFlowHealth(summary, t);
  const cashFlowTone = averageMonthlyCashFlow >= 0 ? "text-kash-emerald" : "text-[#E50914]";

  const insights = [
    {
      label: t("analytics.avgMonthlyExpense") || "Avg Monthly Expense",
      value: formatCurrency(averageMonthlyExpense, currency),
      helper: t("analytics.avgMonthlyExpenseDesc") || "Monthly spending pace",
      tone: "text-[#E50914]",
    },
    {
      label: t("analytics.avgMonthlyIncome") || "Avg Monthly Income",
      value: formatCurrency(averageMonthlyIncome, currency),
      helper: t("analytics.avgMonthlyIncomeDesc") || "Monthly income pace",
      tone: "text-kash-emerald",
    },
    {
      label: t("analytics.avgMonthlyCashFlow") || "Avg Monthly Cash Flow",
      value: formatCurrency(averageMonthlyCashFlow, currency),
      helper: averageMonthlyCashFlow >= 0 ? (t("analytics.surplusPace") || "Surplus pace") : (t("analytics.deficitPace") || "Deficit pace"),
      tone: cashFlowTone,
    },
    {
      label: t("analytics.savingsRate") || "Savings Rate",
      value: formatPercent(savingsRate),
      helper: t("analytics.savingsRateDesc") || "Net cash flow / income",
      tone: savingsRate == null || savingsRate >= 0 ? "text-kash-emerald" : "text-[#E50914]",
    },
    {
      label: t("analytics.expenseIncome") || "Expense / Income",
      value: formatPercent(expenseIncomeRatio),
      helper: t("analytics.expenseIncomeDesc") || "How much income was spent",
      tone: expenseIncomeRatio == null || expenseIncomeRatio <= 80 ? "text-kash-emerald" : expenseIncomeRatio <= 100 ? "text-kash-gold" : "text-[#E50914]",
    },
    {
      label: t("analytics.cashFlowHealth") || "Cash Flow Health",
      value: health.value,
      helper: health.helper,
      tone: health.tone,
    },
    {
      label: t("analytics.transferFees") || "Transfer Fees",
      value: formatCurrency(summary.transferFees, currency),
      helper: t("analytics.transferFeesDesc") || "Fees included in expense",
      tone: summary.transferFees > 0 ? "text-[#E50914]" : "text-slate-700",
    },
    {
      label: t("analytics.highestSpending") || "Highest Spending",
      value: highestSpendingPeriod.expense > 0 ? formatCurrency(highestSpendingPeriod.expense, currency) : "-",
      helper: highestSpendingPeriod.expense > 0 ? `${summary.period.aggregation === "daily" ? (t("common.date") || "Day") : (t("dashboard.thisMonth") || "Month")} ${highestSpendingPeriod.label}` : (t("analytics.noSpendingTitle") || "No spending in period"),
      tone: highestSpendingPeriod.expense > 0 ? "text-[#E50914]" : "text-slate-700",
    },
    {
      label: t("analytics.netWorthDirection") || "Net Worth Direction",
      value: netWorthDelta == null ? "-" : formatCurrency(netWorthDelta, currency),
      helper: netWorthDelta == null ? (t("analytics.noNetWorthTrend") || "No net worth trend yet") : netWorthDelta >= 0 ? (t("analytics.increasedOverPeriod") || "Increased over period") : (t("analytics.decreasedOverPeriod") || "Decreased over period"),
      tone: netWorthDelta == null || netWorthDelta >= 0 ? "text-kash-emerald" : "text-[#E50914]",
    },
  ];

  return (
    <AnalyticsCard className="p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">{t("analytics.quickInsights") || "Quick Insights"}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">{t("analytics.quickInsightsDesc") || "Simple interpretation from the selected period."}</p>
        </div>
        {topCategory ? (
          <div className="rounded-lg bg-kash-selected px-3 py-2 text-sm font-bold text-slate-900">
            {t("analytics.topSpending") || "Top spending:"} <span className="text-kash-emeraldDark">{topCategory.name}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {insights.map((insight) => (
          <div key={insight.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-extrabold uppercase text-slate-600">{insight.label}</p>
            <p className={`mt-2 break-words text-lg font-extrabold ${insight.tone}`}>{insight.value}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{insight.helper}</p>
          </div>
        ))}
      </div>
    </AnalyticsCard>
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

function buildDonutSegments(categories: AnalyticsSummary["categorySpending"]) {
  let cursor = 0;
  return categories.map((category) => {
    const length = Math.max(category.percent, 0);
    const segment = `${category.color} ${cursor}% ${cursor + length}%`;
    cursor += length;
    return segment;
  });
}

function SpendingByCategory({ currency, summary }: { currency: string; summary: AnalyticsSummary }) {
  const { t, formatCurrency } = useI18n();
  const categories = summary.categorySpending.slice(0, 6);
  const totalExpense = categories.reduce((sum, category) => sum + category.amount, 0);

  if (categories.length === 0 || totalExpense <= 0) {
    return (
      <div className="mt-4 grid min-h-64 items-center gap-5 md:grid-cols-[160px_minmax(0,1fr)]">
        <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-slate-100">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-600">{t("dashboard.noData") || "No data"}</div>
        </div>
        <EmptyPanel title={t("analytics.noExpenseCategories") || "No expense categories"} description={t("analytics.noExpenseCategoriesDesc") || "Completed expenses in this period will appear here."} className="min-h-32" />
      </div>
    );
  }

  return (
    <div className="mt-4 grid min-h-64 min-w-0 items-center gap-5 md:grid-cols-[160px_minmax(0,1fr)]">
      <div className="relative mx-auto h-36 w-36 rounded-full" style={{ background: `conic-gradient(${buildDonutSegments(categories).join(", ")})` }}>
        <div className="absolute inset-6 flex items-center justify-center rounded-full bg-white text-center">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-600">{t("dashboard.totalExpense") || "Total Expense"}</p>
            <p className="mt-1 max-w-20 break-words text-xs font-extrabold leading-tight text-slate-900">{formatCurrency(totalExpense, currency)}</p>
          </div>
        </div>
      </div>
      <div className="min-w-0 space-y-3">
        {categories.map((category) => (
          <div key={category.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
              <span className="truncate font-bold text-slate-700">{category.name}</span>
            </div>
            <div className="text-right">
              <p className="font-extrabold leading-tight text-slate-900">{formatCurrency(category.amount, currency)}</p>
              <p className="text-xs font-semibold text-slate-600">{Math.round(category.percent)}%</p>
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
    <div className="grid gap-3 sm:grid-cols-[220px_auto_auto] sm:items-end">
      <SelectField label={t("analytics.period") || "Period"} value={period} onChange={(event) => onPeriodChange(event.target.value as AnalyticsPeriodKey)}>
        {periodOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
      {period === "custom" ? (
        <>
          <DatePickerField
            id="analytics-start-date"
            label={t("analytics.startDate") || "Start Date"}
            value={customStartDate}
            onChange={(val) => onCustomStartDateChange(val)}
          />
          <DatePickerField
            id="analytics-end-date"
            label={t("analytics.endDate") || "End Date"}
            value={customEndDate}
            onChange={(val) => onCustomEndDateChange(val)}
          />
        </>
      ) : null}
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
    <div className="w-full min-w-0 space-y-5">
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

      <SummaryCards summary={summary} currency={currency} />

      <BudgetVsActualCard currency={currency} />

      <AnalyticsInsights summary={summary} currency={currency} />

      <AnalyticsCard className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">{t("analytics.cashFlowOverview") || "Cash Flow Overview"}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">{summary.period.aggregation === "daily" ? (t("analytics.dailyAggregation") || "Daily aggregation") : (t("analytics.monthlyAggregation") || "Monthly aggregation")}</p>
          </div>
          <div className="flex items-center gap-5 text-xs font-bold text-slate-600">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: INCOME_COLOR }} />
              {t("common.typeIncome") || t("dashboard.income") || "Income"}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: EXPENSE_COLOR }} />
              {t("common.typeExpense") || t("dashboard.expense") || "Expense"}
            </span>
          </div>
        </div>
        <CashFlowOverview summary={summary} currency={currency} />
      </AnalyticsCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <AnalyticsCard className="p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-extrabold text-slate-900">{t("dashboard.spendingByCategory") || "Spending by Category"}</h2>
            <ChevronRight aria-hidden="true" className="text-slate-600" size={18} />
          </div>
          <SpendingByCategory summary={summary} currency={currency} />
        </AnalyticsCard>

        <AnalyticsCard className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-extrabold text-slate-900">{t("analytics.incomeVsExpense") || "Income vs Expense"}</h2>
            <div className="flex items-center gap-5 text-xs font-bold text-slate-600">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: INCOME_COLOR }} />
                {t("common.typeIncome") || t("dashboard.income") || "Income"}
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EXPENSE_COLOR }} />
                {t("common.typeExpense") || t("dashboard.expense") || "Expense"}
              </span>
            </div>
          </div>
          <IncomeExpenseLineChart summary={summary} currency={currency} />
        </AnalyticsCard>
      </div>

      <AnalyticsCard className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">{t("analytics.netWorthTrend") || "Net Worth Trend"}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">{t("analytics.netWorthTrendDesc") || "Reconstructed from wallet initial balances and completed ledger activity."}</p>
          </div>
          <div className="inline-flex items-center gap-2 text-xs font-bold text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NET_WORTH_COLOR }} />
            {t("dashboard.netWorth") || "Net Worth"}
          </div>
        </div>
        <NetWorthTrend summary={summary} currency={currency} />
      </AnalyticsCard>

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

      <p className="text-xs font-semibold text-slate-600">
        {t("analytics.footerNote") || "Transfer fees are included in Expense. Transfer principal and balance adjustments are excluded from Income, Expense, and Cash Flow."}
      </p>
    </div>
  );
}
