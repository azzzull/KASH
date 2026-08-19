import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Eye,
  EyeOff,
  HandCoins,
  Home,
  Info,
  PiggyBank,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDashboardSummary, type DashboardCategorySpend, type DashboardMetricChange, type DashboardSummary } from "../lib/dashboard";
import { getMonthlyBudgetOverview, getMonthlyBudgets } from "../lib/budgets";
import type { BudgetWithProgress, MonthlyBudgetOverview } from "../types/domain";
import { buildCalendarCells, localDateKey } from "../lib/calendar";
import { formatCurrency, toNumber } from "../lib/money";
import { appEvents } from "../lib/appEvents";
import { useAppEvent } from "../hooks/useAppEvent";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/ui/PageHeader";
import type { TransactionType } from "../types/domain";

const transactionTone: Record<TransactionType, string> = {
  adjustment: "text-slate-700",
  expense: "text-[#E50914]",
  income: "text-kash-emerald",
  transfer: "text-kash-transfer",
};

const CASHFLOW_INCOME_COLOR = "#10B981";
const CASHFLOW_EXPENSE_COLOR = "#E50914";
const CHART_GRID_COLOR = "rgba(16, 185, 129, 0.16)";
const DASHBOARD_BALANCES_VISIBLE_KEY = "kash.dashboard.balancesVisible";
const LEGACY_DASHBOARD_BALANCES_VISIBLE_KEY = "kash.dashboard.balancesVisible";
const calendarWeekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const calendarActivityOrder = ["income", "expense", "transfer", "adjustment"] as const;
const calendarActivityDotClass = {
  adjustment: "bg-slate-600",
  expense: "bg-kash-expense",
  income: "bg-kash-emerald",
  transfer: "bg-kash-transfer",
};

function formatAmount(amount: number, currency: string) {
  return formatCurrency(amount, currency);
}

function formatPrivateAmount(amount: number, currency: string, isVisible: boolean) {
  return isVisible ? formatAmount(amount, currency) : "••••••";
}

function formatCompactAmount(amount: number, currency: string) {
  const absoluteAmount = Math.abs(amount);
  const prefix = currency === "IDR" ? "Rp" : currency;

  if (absoluteAmount >= 1000000) {
    return `${prefix}${(amount / 1000000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  }

  if (absoluteAmount >= 1000) {
    return `${prefix}${Math.round(amount / 1000).toLocaleString("id-ID")} rb`;
  }

  return `${prefix}${amount.toLocaleString("id-ID")}`;
}

function formatPrivateCompactAmount(amount: number, currency: string, isVisible: boolean) {
  return isVisible ? formatCompactAmount(amount, currency) : "••••";
}

function chartTickLabel(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`;
  if (value >= 1000) return `${Math.round(value / 1000).toLocaleString("id-ID")}rb`;
  return "0";
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildMonthOptions(year: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(year, index, 1);
    return {
      date,
      key: monthKey(date),
      label: new Intl.DateTimeFormat("id-ID", { month: "short" }).format(date),
    };
  });
}

function getStoredBalancesVisibility() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(DASHBOARD_BALANCES_VISIBLE_KEY) === "true";
}

function DashboardCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-lg border border-kash-emerald/10 bg-white/95 shadow-sm ${className}`}>{children}</section>;
}

function MetricComparisonLine({ change, metric }: { change: DashboardMetricChange; metric: "income" | "expense" | "netCashFlow" }) {
  if (change.state === "none") return null;

  const increased = change.state === "increase";
  const decreased = change.state === "decrease";
  const isPositive =
    metric === "expense"
      ? decreased
      : increased || change.state === "new";
  const tone = isPositive ? "text-kash-emerald" : "text-[#E50914]";

  if (change.state === "new") {
    return <p className={`mt-2 text-xs font-bold ${tone}`}>New this month</p>;
  }

  if (change.state === "flat") {
    return (
      <p className="mt-2 text-xs font-bold">
        <span className="text-slate-700">0.0%</span>
        <span className="ml-1 font-semibold text-slate-600">vs last month</span>
      </p>
    );
  }

  const Icon = increased ? TrendingUp : TrendingDown;
  const percentage = Math.abs(change.percent ?? 0).toFixed(1);

  return (
    <p className="mt-2 flex items-center gap-1 text-xs font-bold">
      <span className={`inline-flex items-center gap-1 ${tone}`}>
        <Icon aria-hidden="true" size={13} strokeWidth={2.4} />
        {percentage}%
      </span>
      <span className="font-semibold text-slate-600">vs last month</span>
    </p>
  );
}

function EmptyPanel({ title, description, className = "" }: { title: string; description: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center ${className}`}>
      <div>
        <p className="text-sm font-bold text-slate-700">{title}</p>
        <p className="mt-1 text-sm font-medium text-slate-600">{description}</p>
      </div>
    </div>
  );
}

function PeriodPicker({
  onSelectPeriod,
  selectedMonth,
  summary,
  className = "",
}: {
  onSelectPeriod: (date: Date) => void;
  selectedMonth: Date;
  summary: DashboardSummary;
  className?: string;
}) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(selectedMonth.getFullYear());
  const monthOptions = useMemo(() => buildMonthOptions(pickerYear), [pickerYear]);
  const selectedPeriodKey = monthKey(selectedMonth);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (pickerRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [isOpen]);

  return (
    <div ref={pickerRef} className={`relative w-full min-w-0 ${className}`}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-lg text-left focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
      >
        <div className="flex min-w-0 items-center gap-3">
          <CalendarDays aria-hidden="true" className="shrink-0 text-slate-700" size={18} />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">This Month</p>
            <p className="mt-1 truncate text-xs font-semibold text-slate-600">{summary.period.label}</p>
          </div>
        </div>
        <ChevronDown aria-hidden="true" className="shrink-0 text-slate-600" size={18} />
      </button>

      {isOpen ? (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-30 rounded-lg border border-slate-200 bg-white p-3 shadow-lg sm:left-auto sm:right-0 sm:w-72">
          <label className="block text-xs font-bold uppercase tracking-normal text-slate-600" htmlFor="dashboard-period-year">
            Year
          </label>
          <input
            id="dashboard-period-year"
            type="number"
            min="1970"
            max={new Date().getFullYear()}
            value={pickerYear}
            onChange={(event) => {
              const year = Number(event.target.value);
              if (Number.isFinite(year)) setPickerYear(year);
            }}
            className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
          />

          <div className="mt-3 grid grid-cols-3 gap-2" role="menu">
            {monthOptions.map((option) => {
              const isSelected = option.key === selectedPeriodKey;

              return (
                <button
                  key={option.key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelectPeriod(option.date);
                    setIsOpen(false);
                  }}
                  className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                    isSelected ? "bg-kash-selected text-kash-emerald" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TopFinancialOverview({
  balancesVisible,
  currency,
  onToggleBalances,
  onSelectPeriod,
  selectedMonth,
  summary,
}: {
  balancesVisible: boolean;
  currency: string;
  onToggleBalances: () => void;
  onSelectPeriod: (date: Date) => void;
  selectedMonth: Date;
  summary: DashboardSummary;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <DashboardCard className="p-5 lg:col-span-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-900">Net Worth</p>
            <Info aria-hidden="true" className="text-slate-600" size={15} />
          </div>
          <button
            type="button"
            aria-pressed={balancesVisible}
            aria-label={balancesVisible ? "Hide dashboard balances" : "Show dashboard balances"}
            onClick={onToggleBalances}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-kash-emerald hover:bg-kash-selected hover:text-kash-emerald focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
          >
            {balancesVisible ? <EyeOff aria-hidden="true" size={18} strokeWidth={2.3} /> : <Eye aria-hidden="true" size={18} strokeWidth={2.3} />}
          </button>
        </div>
        <p className="mt-4 break-words text-2xl font-extrabold text-slate-900 md:text-3xl">{formatPrivateAmount(summary.netWorth.amount, currency, balancesVisible)}</p>
      </DashboardCard>

      <DashboardCard className="p-5 lg:col-span-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">Available Balance</p>
            <p className="mt-4 break-words text-xl font-extrabold text-slate-900">{formatPrivateAmount(summary.availableBalance.amount, currency, balancesVisible)}</p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-700">
            <Wallet aria-hidden="true" size={20} />
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="flex min-h-28 items-center p-5 lg:col-span-3">
        <PeriodPicker summary={summary} selectedMonth={selectedMonth} onSelectPeriod={onSelectPeriod} />
      </DashboardCard>
    </div>
  );
}

function MonthlySummary({ balancesVisible, currency, summary }: { balancesVisible: boolean; currency: string; summary: DashboardSummary }) {
  const cards = [
    {
      title: "Income",
      value: summary.monthlyIncome.amount,
      change: summary.monthComparison.income,
      metric: "income" as const,
      icon: ArrowUpRight,
      badge: "bg-kash-emerald/10 text-kash-emerald",
      tone: "text-kash-emerald",
    },
    {
      title: "Expense",
      value: summary.monthlyExpense.amount,
      change: summary.monthComparison.expense,
      metric: "expense" as const,
      icon: ArrowDownRight,
      badge: "bg-kash-expense/10 text-[#E50914]",
      tone: "text-[#E50914]",
    },
    {
      title: "Cash Flow",
      value: summary.netCashFlow.amount,
      change: summary.monthComparison.netCashFlow,
      metric: "netCashFlow" as const,
      icon: summary.netCashFlow.amount >= 0 ? ArrowUpRight : ArrowDownRight,
      badge: summary.netCashFlow.amount >= 0 ? "bg-kash-emerald/10 text-kash-emerald" : "bg-kash-expense/10 text-[#E50914]",
      tone: summary.netCashFlow.amount >= 0 ? "text-kash-emerald" : "text-[#E50914]",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <DashboardCard key={card.title} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">{card.title}</p>
              <p className="mt-4 break-words text-xl font-extrabold text-slate-900">{formatPrivateAmount(card.value, currency, balancesVisible)}</p>
              <MetricComparisonLine change={card.change} metric={card.metric} />
            </div>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.badge}`}>
              <card.icon aria-hidden="true" size={20} strokeWidth={2.2} />
            </div>
          </div>
        </DashboardCard>
      ))}
    </div>
  );
}

function CashFlowChart({ balancesVisible, currency, summary }: { balancesVisible: boolean; currency: string; summary: DashboardSummary }) {
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const hasData = summary.cashflow.some((point) => point.income > 0 || point.expense > 0);
  const width = 1120;
  const height = 250;
  const padding = { bottom: 34, left: 10, right: 0, top: 14 };
  const mobileWidth = Math.max(360, summary.period.daysInMonth * 40);
  const mobilePadding = { bottom: 34, left: 0, right: 0, top: 14 };
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const dailyPoints = summary.cashflow.map((point) => ({
    key: String(point.day),
    label: String(point.day),
    title: `${point.day} ${summary.period.label}`,
    income: point.income,
    expense: point.expense,
  }));

  useEffect(() => {
    const scrollElement = mobileScrollRef.current;
    if (!scrollElement) return;

    const today = new Date();
    const periodStart = new Date(summary.period.start);
    const isCurrentMonth = today.getFullYear() === periodStart.getFullYear() && today.getMonth() === periodStart.getMonth();
    const targetDay = isCurrentMonth ? Math.min(today.getDate(), summary.period.daysInMonth) : 1;

    window.requestAnimationFrame(() => {
      const daySlotWidth = scrollElement.scrollWidth / summary.period.daysInMonth;
      const targetCenter = (targetDay - 0.5) * daySlotWidth;
      const maxScrollLeft = Math.max(0, scrollElement.scrollWidth - scrollElement.clientWidth);
      scrollElement.scrollLeft = Math.min(maxScrollLeft, Math.max(0, targetCenter - scrollElement.clientWidth / 2));
    });
  }, [summary.period.daysInMonth, summary.period.start]);

  if (!hasData) return <EmptyPanel title="No cash flow data this month" description="Income and expense activity will appear as a daily chart." className="min-h-64" />;

  function renderChart({
    barClassName,
    barMaxWidth,
    barMinWidth,
    chartHeight = height,
    chartPadding = padding,
    chartWidth = width,
    points,
    showGridLines = true,
    showYAxisLabels,
    style,
  }: {
    barClassName: string;
    barMaxWidth: number;
    barMinWidth: number;
    chartHeight?: number;
    chartPadding?: typeof padding;
    chartWidth?: number;
    points: typeof dailyPoints;
    showGridLines?: boolean;
    showYAxisLabels: boolean;
    style?: CSSProperties;
  }) {
    const maxValue = Math.max(1, ...points.flatMap((point) => [point.income, point.expense]));
    const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
    const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
    const bandWidth = plotWidth / points.length;
    const barWidth = Math.min(barMaxWidth, Math.max(barMinWidth, bandWidth / 3.1));

    return (
      <svg role="img" aria-label={`Income and expense chart for ${summary.period.label}`} viewBox={`0 0 ${chartWidth} ${chartHeight}`} className={barClassName} style={style}>
        {ticks.map((tick) => {
          const y = chartPadding.top + plotHeight - tick * plotHeight;
          const value = maxValue * tick;

          return (
            <g key={tick}>
              {showGridLines || tick === 0 ? <line x1={chartPadding.left} x2={chartWidth - chartPadding.right} y1={y} y2={y} stroke={CHART_GRID_COLOR} strokeWidth="1" /> : null}
              {showYAxisLabels ? (
                <text x={chartPadding.left + 2} y={y - 4} className="fill-slate-600 text-[10px] font-semibold">
                  {chartTickLabel(value)}
                </text>
              ) : null}
            </g>
          );
        })}

        {points.map((point, index) => {
          const centerX = chartPadding.left + bandWidth * (index + 0.5);
          const incomeHeight = (point.income / maxValue) * plotHeight;
          const expenseHeight = (point.expense / maxValue) * plotHeight;
          const incomeY = chartPadding.top + plotHeight - incomeHeight;
          const expenseY = chartPadding.top + plotHeight - expenseHeight;

          return (
            <g key={point.key}>
              <title>
                {`${point.title}: Income ${formatPrivateAmount(point.income, currency, balancesVisible)}, Expense ${formatPrivateAmount(point.expense, currency, balancesVisible)}`}
              </title>
              {point.income > 0 ? (
                <text
                  x={centerX - barWidth / 2 - 2}
                  y={Math.max(10, incomeY - 5)}
                  textAnchor="middle"
                  className="fill-kash-emerald text-[9px] font-extrabold"
                >
                  {formatPrivateCompactAmount(point.income, currency, balancesVisible)}
                </text>
              ) : null}
              {point.expense > 0 ? (
                <text
                  x={centerX + barWidth / 2 + 2}
                  y={Math.max(10, expenseY - 5)}
                  textAnchor="middle"
                  className="fill-[#E50914] text-[9px] font-extrabold"
                >
                  {formatPrivateCompactAmount(point.expense, currency, balancesVisible)}
                </text>
              ) : null}
              <rect
                x={centerX - barWidth - 2}
                y={incomeY}
                width={barWidth}
                height={point.income > 0 ? Math.max(incomeHeight, 4) : 2}
                rx="3"
                fill={CASHFLOW_INCOME_COLOR}
                opacity={point.income > 0 ? 0.95 : 0.18}
              />
              <rect
                x={centerX + 2}
                y={expenseY}
                width={barWidth}
                height={point.expense > 0 ? Math.max(expenseHeight, 4) : 2}
                rx="3"
                fill={CASHFLOW_EXPENSE_COLOR}
                opacity={point.expense > 0 ? 1 : 0.16}
              />
              <text x={centerX} y={chartHeight - 10} textAnchor="middle" className="fill-slate-700 text-[11px] font-bold">
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
      <div ref={mobileScrollRef} className="-mx-5 w-[calc(100%+2.5rem)] min-w-0 overflow-x-auto sm:hidden">
        {renderChart({
          barClassName: "block h-56 max-w-none",
          barMaxWidth: 13,
          barMinWidth: 9,
          chartPadding: mobilePadding,
          chartWidth: mobileWidth,
          points: dailyPoints,
          showGridLines: false,
          showYAxisLabels: false,
          style: { width: `${mobileWidth}px` },
        })}
      </div>
      <div className="hidden w-full min-w-0 sm:block">
        {renderChart({
          barClassName: "block h-64 w-full max-w-full",
          barMaxWidth: 22,
          barMinWidth: 10,
          points: dailyPoints,
          showYAxisLabels: balancesVisible,
        })}
      </div>
    </div>
  );
}

function buildDonutSegments(categories: DashboardCategorySpend[]) {
  let cursor = 0;
  return categories.map((category) => {
    const length = Math.max(category.percent, 0);
    const segment = `${category.color} ${cursor}% ${cursor + length}%`;
    cursor += length;
    return segment;
  });
}

function SpendingByCategory({ balancesVisible, currency, summary }: { balancesVisible: boolean; currency: string; summary: DashboardSummary }) {
  const categories = summary.spendingByCategory.slice(0, 5);
  const totalExpense = categories.reduce((sum, category) => sum + category.amount, 0);

  if (summary.spendingByCategory.length === 0 || totalExpense <= 0) {
    return (
      <div className="mt-4 grid min-h-64 min-w-0 items-center gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
        <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-slate-100 sm:h-36 sm:w-36">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-center text-xs font-bold text-slate-600">No data</div>
        </div>
        <EmptyPanel title="No spending data yet" description="Completed expense categories will build this chart." className="min-h-36" />
      </div>
    );
  }

  const donutBackground = `conic-gradient(${buildDonutSegments(categories).join(", ")})`;

  return (
    <div className="mt-4 grid min-h-64 min-w-0 items-center gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
      <div className="relative mx-auto h-36 w-36 rounded-full sm:h-40 sm:w-40" style={{ background: donutBackground }}>
        <div className="absolute inset-6 flex items-center justify-center rounded-full bg-white text-center">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-600">Total Expense</p>
            <p className="mt-1 max-w-20 break-words text-xs font-extrabold leading-tight text-slate-900">{formatPrivateAmount(totalExpense, currency, balancesVisible)}</p>
          </div>
        </div>
      </div>
      <div className="min-w-0 space-y-3">
        {categories.map((category) => (
          <div key={category.id} className="grid min-w-0 grid-cols-1 items-start gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
              <span className="truncate font-bold text-slate-700">{category.name}</span>
            </div>
            <div className="min-w-0 pl-4 text-left sm:pl-0 sm:text-right">
              <p className="break-words font-bold leading-tight text-slate-900">{formatPrivateAmount(category.amount, currency, balancesVisible)}</p>
              <p className="text-xs font-semibold text-slate-600">{Math.round(category.percent)}%</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardCalendar({ month, onSelectDate, summary }: { month: Date; onSelectDate: (dateKey: string) => void; summary: DashboardSummary }) {
  const todayKey = localDateKey(new Date());
  const cells = useMemo(() => buildCalendarCells(month), [month]);
  const activityByDate = useMemo(() => new Map(summary.calendarActivity.map((activity) => [activity.dateKey, activity.types])), [summary.calendarActivity]);

  return (
    <div className="mt-4">
      <div
        className="grid gap-1 text-center text-[11px] font-extrabold uppercase text-slate-600"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {calendarWeekdays.map((weekday) => (
          <div key={weekday} className="py-1">
            {weekday}
          </div>
        ))}
      </div>

      <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {cells.map((cell) => {
          const types = activityByDate.get(cell.dateKey) ?? [];
          const isToday = cell.dateKey === todayKey;

          return (
            <button
              key={cell.dateKey}
              type="button"
              aria-label={`${cell.date.getDate()} ${summary.period.label}${types.length > 0 ? ", has transactions" : ""}`}
              onClick={() => onSelectDate(cell.dateKey)}
              className={`flex min-h-11 flex-col items-center justify-between rounded-lg border p-1 text-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-kash-emerald/20 ${
                isToday ? "border-kash-emerald/60 text-kash-emerald" : "border-transparent"
              } ${cell.isCurrentMonth ? "text-slate-900" : "text-slate-400"}`}
            >
              <span className="font-extrabold">{cell.date.getDate()}</span>
              <span className="flex min-h-2 items-center justify-center gap-0.5" aria-hidden="true">
                {calendarActivityOrder
                  .filter((type) => types.includes(type))
                  .map((type) => <span key={type} className={`h-1.5 w-1.5 rounded-full ${calendarActivityDotClass[type]}`} />)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WalletSummary({ balancesVisible, currency, summary }: { balancesVisible: boolean; currency: string; summary: DashboardSummary }) {
  if (summary.wallets.length === 0) return <EmptyPanel title="No wallets yet" description="Create your first wallet to start tracking your net worth." className="min-h-44" />;

  return (
    <div className="divide-y divide-slate-100">
      {summary.wallets.slice(0, 4).map((wallet) => (
        <div key={wallet.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
              <span className="h-4 w-4 rounded-sm" style={{ backgroundColor: wallet.color }} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{wallet.name}</p>
              <p className="text-xs font-semibold text-slate-600">{wallet.walletTypeLabel}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-extrabold text-slate-900">{formatPrivateAmount(wallet.balance, currency, balancesVisible)}</span>
            <ArrowRight aria-hidden="true" className="text-slate-600" size={16} />
          </div>
        </div>
      ))}
    </div>
  );
}

function GoalsSummary({ balancesVisible, currency, summary }: { balancesVisible: boolean; currency: string; summary: DashboardSummary }) {
  if (summary.goals.length === 0) return <EmptyPanel title="No goals yet" description="Create a goal to add a dedicated savings pocket." className="min-h-44" />;

  return (
    <div className="divide-y divide-slate-100">
      {summary.goals.slice(0, 3).map((goal) => (
        <Link key={goal.id} to={`/goals/${goal.id}`} className="block py-3 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{goal.name}</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                {formatPrivateAmount(goal.currentAmount, currency, balancesVisible)} of {formatPrivateAmount(goal.targetAmount, currency, balancesVisible)}
              </p>
            </div>
            <span className="shrink-0 text-sm font-extrabold text-kash-emerald">{goal.percentage.toFixed(0)}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-kash-emerald" style={{ width: `${goal.percentage}%` }} />
          </div>
        </Link>
      ))}
    </div>
  );
}

function DebtReceivableSummary({
  balancesVisible,
  currency,
  summary,
}: {
  balancesVisible: boolean;
  currency: string;
  summary: DashboardSummary;
}) {
  const { totalDebt, totalReceivable, counterparties } = summary.debts;

  if (totalDebt === 0 && totalReceivable === 0 && counterparties.length === 0) {
    return (
      <EmptyPanel
        title="No obligations yet"
        description="Track money you owe or money owed to you."
        className="min-h-44"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-50 p-2.5">
          <span className="text-[11px] font-bold text-slate-600">You Owe</span>
          <p className="mt-1 text-sm font-black text-slate-900">
            {formatPrivateAmount(totalDebt, currency, balancesVisible)}
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5">
          <span className="text-[11px] font-bold text-slate-600">Owed to You</span>
          <p className="mt-1 text-sm font-black text-slate-900">
            {formatPrivateAmount(totalReceivable, currency, balancesVisible)}
          </p>
        </div>
      </div>

      <div className="divide-y divide-slate-100 border-t border-slate-100 pt-1">
        {counterparties.slice(0, 3).map((cp) => (
          <Link
            key={cp.id}
            to={`/debts/${cp.id}`}
            className="flex items-center justify-between py-2 text-xs transition hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="truncate font-bold text-slate-900">{cp.name}</p>
              <p className="text-[11px] font-semibold text-slate-600">
                {cp.activeItemCount} active item{cp.activeItemCount !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="text-right">
              {cp.debtTotal > 0 && (
                <p className="font-extrabold text-kash-expense">
                  -{formatPrivateAmount(cp.debtTotal, currency, balancesVisible)}
                </p>
              )}
              {cp.receivableTotal > 0 && (
                <p className="font-extrabold text-kash-emerald">
                  +{formatPrivateAmount(cp.receivableTotal, currency, balancesVisible)}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function BudgetDashboardSummary({
  balancesVisible,
  currency,
}: {
  balancesVisible: boolean;
  currency: string;
}) {
  const [budgets, setBudgets] = useState<BudgetWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBudgets = useCallback(async () => {
    try {
      const data = await getMonthlyBudgets();
      setBudgets(data);
    } catch {
      // safe fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBudgets();
  }, [loadBudgets]);

  useAppEvent(appEvents.transactionSaved, () => void loadBudgets());
  useAppEvent(appEvents.budgetSaved, () => void loadBudgets());

  if (loading) {
    return <div className="h-36 animate-pulse rounded-lg bg-slate-100" />;
  }

  if (budgets.length === 0) {
    return (
      <EmptyPanel
        title="Belum ada budget"
        description="Atur batas belanja bulanan untuk mengendalikan pengeluaran."
        className="min-h-36"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {budgets.slice(0, 4).map((b) => {
          const progress = Math.min(Math.max(b.usage_percentage, 0), 100);
          const isOver = b.status === "over_budget";
          const isNear = b.status === "near_limit";
          const spentNum = toNumber(b.spent);
          const effectiveNum = toNumber(b.effective_budget);

          return (
            <div key={b.budget_id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-black text-slate-900">{b.name}</p>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                    isOver
                      ? "bg-kash-expense/15 text-kash-expense"
                      : isNear
                      ? "bg-amber-100 text-amber-800"
                      : "bg-kash-selected text-kash-emeraldDark"
                  }`}
                >
                  {b.usage_percentage.toFixed(0)}%
                </span>
              </div>

              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isOver ? "bg-kash-expense" : isNear ? "bg-amber-500" : "bg-kash-emerald"
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="mt-1 flex items-center justify-between text-[11px] font-bold text-slate-600">
                <span>{formatPrivateAmount(spentNum, currency, balancesVisible)}</span>
                <span>/ {formatPrivateAmount(effectiveNum, currency, balancesVisible)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-1 text-center border-t border-slate-100">
        <Link
          to="/budgets"
          className="inline-flex items-center gap-1 text-xs font-extrabold text-kash-emeraldDark hover:text-kash-emerald hover:underline"
        >
          Lihat semua {budgets.length} budget &rarr;
        </Link>
      </div>
    </div>
  );
}

function transactionIcon(type: TransactionType) {
  if (type === "income") return ArrowDownLeft;
  if (type === "expense") return ArrowUpRight;
  if (type === "transfer") return ArrowRightLeft;
  return CreditCard;
}

function RecentTransactions({ balancesVisible, currency, summary }: { balancesVisible: boolean; currency: string; summary: DashboardSummary }) {
  if (summary.recentTransactions.length === 0) return <EmptyPanel title="No recent transactions" description="Saved Alpha ledger activity will appear here." className="min-h-48" />;

  return (
    <div className="divide-y divide-slate-100 overflow-hidden">
      {summary.recentTransactions.slice(0, 5).map((transaction) => {
        const Icon = transactionIcon(transaction.type);
        const transactionDate = new Date(transaction.date);
        const signedAmount =
          transaction.type === "income"
            ? transaction.amount
            : transaction.type === "expense"
              ? -transaction.amount
              : transaction.type === "adjustment"
                ? transaction.amount
                : transaction.amount;

        return (
          <div key={transaction.id} className="py-3 first:pt-0 last:pb-0">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 md:hidden">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white ${transactionTone[transaction.type]}`}>
                <Icon aria-hidden="true" size={17} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{transaction.title}</p>
                <p className="truncate text-xs font-semibold text-slate-600">{transaction.subtitle}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-extrabold ${transactionTone[transaction.type]}`}>
                  {transaction.type === "transfer" ? formatPrivateAmount(transaction.amount, currency, balancesVisible) : formatPrivateAmount(signedAmount, currency, balancesVisible)}
                </p>
                {transaction.transferFee > 0 ? <p className="text-xs font-semibold text-slate-600">Fee {formatPrivateAmount(transaction.transferFee, currency, balancesVisible)}</p> : null}
              </div>
            </div>

            <div className="hidden grid-cols-[96px_1.2fr_1fr_1fr_120px_64px_20px] items-center gap-4 text-sm md:grid">
              <p className="font-semibold text-slate-600">
                {new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(transactionDate)}
              </p>
              <p className="truncate font-bold text-slate-900">{transaction.title}</p>
              <p className="truncate font-semibold text-slate-600">{transaction.categoryName}</p>
              <p className="truncate font-semibold text-slate-600">{transaction.walletName}</p>
              <p className={`text-right font-extrabold ${transactionTone[transaction.type]}`}>
                {transaction.type === "transfer" ? formatPrivateAmount(transaction.amount, currency, balancesVisible) : formatPrivateAmount(signedAmount, currency, balancesVisible)}
              </p>
              <p className="text-right font-semibold text-slate-600">
                {new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(transactionDate)}
              </p>
              <ArrowRight aria-hidden="true" className="justify-self-end text-slate-600" size={16} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="h-32 animate-pulse rounded-lg bg-slate-200 lg:col-span-6" />
        <div className="h-32 animate-pulse rounded-lg bg-slate-200 lg:col-span-3" />
        <div className="h-32 animate-pulse rounded-lg bg-slate-200 lg:col-span-3" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-28 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-28 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-28 animate-pulse rounded-lg bg-slate-200" />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="h-80 animate-pulse rounded-lg bg-slate-200 lg:col-span-7" />
        <div className="h-80 animate-pulse rounded-lg bg-slate-200 lg:col-span-5" />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()));
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [balancesVisible, setBalancesVisible] = useState(getStoredBalancesVisibility);
  const [error, setError] = useState<string | null>(null);
  const currency = profile?.default_currency ?? "IDR";
  const firstName = profile?.full_name?.split(" ")[0] ?? profile?.email.split("@")[0] ?? "there";

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextSummary = await getDashboardSummary({ referenceDate: selectedMonth });
      setSummary(nextSummary);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useAppEvent(appEvents.transactionSaved, () => void loadDashboard());
  useAppEvent(appEvents.goalSaved, () => void loadDashboard());
  useAppEvent(appEvents.debtSaved, () => void loadDashboard());

  useEffect(() => {
    window.localStorage.removeItem(LEGACY_DASHBOARD_BALANCES_VISIBLE_KEY);
    window.sessionStorage.setItem(DASHBOARD_BALANCES_VISIBLE_KEY, String(balancesVisible));
  }, [balancesVisible]);

  if (isLoading && !summary) return <DashboardSkeleton />;

  if (error && !summary) {
    return (
      <DashboardCard className="p-6">
        <p className="text-sm font-bold text-kash-expense">Dashboard could not load</p>
        <p className="mt-2 text-sm font-medium text-slate-600">{error}</p>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-kash-emerald px-4 py-2 text-sm font-bold text-white transition hover:bg-kash-emeraldDark focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
        >
          <RefreshCw size={17} />
          Retry
        </button>
      </DashboardCard>
    );
  }

  if (!summary) return null;

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-4">
      <PageHeader
        eyebrow="Dashboard"
        icon={Home}
        title="Dashboard"
        description={`Hi, ${firstName}. Here is your current financial picture.`}
      />

      <TopFinancialOverview
        balancesVisible={balancesVisible}
        summary={summary}
        currency={currency}
        selectedMonth={selectedMonth}
        onSelectPeriod={(date) => setSelectedMonth(startOfMonth(date))}
        onToggleBalances={() => setBalancesVisible((current) => !current)}
      />
      <MonthlySummary balancesVisible={balancesVisible} summary={summary} currency={currency} />

      <DashboardCard className="p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-base font-extrabold text-slate-900">
            Cash Flow <span className="font-semibold text-slate-600">({summary.period.label})</span>
          </h2>
          <div className="hidden items-center gap-5 text-xs font-bold text-slate-600 sm:flex">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: CASHFLOW_INCOME_COLOR }} />
              Income
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: CASHFLOW_EXPENSE_COLOR }} />
              Expense
            </span>
          </div>
        </div>
        <CashFlowChart balancesVisible={balancesVisible} summary={summary} currency={currency} />
      </DashboardCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardCard className="p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-base font-extrabold text-slate-900">Spending by Category</h2>
          </div>
          <SpendingByCategory balancesVisible={balancesVisible} summary={summary} currency={currency} />
        </DashboardCard>

        <DashboardCard className="p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-extrabold text-slate-900">Calendar</h2>
            <span className="text-xs font-bold text-slate-600">{summary.period.label}</span>
          </div>
          <DashboardCalendar
            month={selectedMonth}
            summary={summary}
            onSelectDate={(dateKey) => navigate(`/calendar?date=${encodeURIComponent(dateKey)}`)}
          />
        </DashboardCard>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale aria-hidden="true" className="text-kash-emerald" size={18} />
              <h2 className="text-base font-extrabold text-slate-900">Budget</h2>
            </div>
            <Link to="/budgets" className="text-xs font-bold text-slate-600 hover:text-kash-emerald">
              View All
            </Link>
          </div>
          <BudgetDashboardSummary balancesVisible={balancesVisible} currency={currency} />
        </DashboardCard>

        <DashboardCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900">Wallets</h2>
            <Link to="/wallets" className="text-xs font-bold text-slate-600 hover:text-kash-emerald">
              View All
            </Link>
          </div>
          <WalletSummary balancesVisible={balancesVisible} summary={summary} currency={currency} />
        </DashboardCard>

        <DashboardCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PiggyBank aria-hidden="true" className="text-kash-emerald" size={18} />
              <h2 className="text-base font-extrabold text-slate-900">Goals</h2>
            </div>
            <Link to="/goals" className="text-xs font-bold text-slate-600 hover:text-kash-emerald">
              View All
            </Link>
          </div>
          <GoalsSummary balancesVisible={balancesVisible} summary={summary} currency={currency} />
        </DashboardCard>

        <DashboardCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HandCoins aria-hidden="true" className="text-kash-emerald" size={18} />
              <h2 className="text-base font-extrabold text-slate-900">Debt & Receivable</h2>
            </div>
            <Link to="/debts" className="text-xs font-bold text-slate-600 hover:text-kash-emerald">
              View All
            </Link>
          </div>
          <DebtReceivableSummary balancesVisible={balancesVisible} summary={summary} currency={currency} />
        </DashboardCard>
      </div>

      <DashboardCard className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900">Recent Transactions</h2>
          <Link to="/transactions" className="text-xs font-bold text-slate-600 hover:text-kash-emerald">
            View All
          </Link>
        </div>
        <RecentTransactions balancesVisible={balancesVisible} summary={summary} currency={currency} />
      </DashboardCard>

      {error ? <p className="text-sm font-semibold text-kash-expense">{error}</p> : null}
    </div>
  );
}
