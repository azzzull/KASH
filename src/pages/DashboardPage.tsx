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
    Info,
    Minus,
    PiggyBank,
    RefreshCw,
    Scale,
    Target,
    TrendingDown,
    TrendingUp,
    WalletCards,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
    getDashboardSummary,
    type DashboardCategorySpend,
    type DashboardMetricChange,
    type DashboardSummary,
} from "../lib/dashboard";
import { getMonthlyBudgetOverview, getMonthlyBudgets } from "../lib/budgets";
import type {
    BudgetWithProgress,
    MonthlyBudgetOverview,
} from "../types/domain";
import { buildCalendarCells, localDateKey } from "../lib/calendar";
import { formatCurrency, toNumber } from "../lib/money";
import { appEvents } from "../lib/appEvents";
import { useAppEvent } from "../hooks/useAppEvent";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import type { TransactionType } from "../types/domain";

/* ─── Constants ─── */
const transactionTone: Record<TransactionType, string> = {
    adjustment: "text-slate-700",
    expense: "text-[#E50914]",
    income: "text-kash-emerald",
    transfer: "text-kash-transfer",
};

const CASHFLOW_INCOME_COLOR = "#10B981";
const CASHFLOW_EXPENSE_COLOR = "#E50914";
const CHART_GRID_COLOR = "rgba(16, 185, 129, 0.10)";
const DASHBOARD_BALANCES_VISIBLE_KEY = "kash.dashboard.balancesVisible";
const LEGACY_DASHBOARD_BALANCES_VISIBLE_KEY = "kash.dashboard.balancesVisible";
const calendarActivityOrder = [
    "income",
    "expense",
    "transfer",
    "adjustment",
] as const;
const calendarActivityDotClass = {
    adjustment: "bg-slate-600",
    expense: "bg-kash-expense",
    income: "bg-kash-emerald",
    transfer: "bg-kash-transfer",
};

/* ─── Formatters ─── */
function formatAmount(amount: number, currency: string) {
    return formatCurrency(amount, currency);
}

function formatPrivateAmount(
    amount: number,
    currency: string,
    isVisible: boolean,
) {
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

function formatPrivateCompactAmount(
    amount: number,
    currency: string,
    isVisible: boolean,
) {
    return isVisible ? formatCompactAmount(amount, currency) : "••••";
}

function chartTickLabel(value: number) {
    if (value >= 1000000)
        return `${(value / 1000000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`;
    if (value >= 1000)
        return `${Math.round(value / 1000).toLocaleString("id-ID")}rb`;
    return "0";
}

function monthKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getStoredBalancesVisibility() {
    if (typeof window === "undefined") return false;
    return (
        window.sessionStorage.getItem(DASHBOARD_BALANCES_VISIBLE_KEY) === "true"
    );
}

/* ─── Shared Sub-Components ─── */
function DashboardCard({
    children,
    className = "",
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <section
            className={`rounded-2xl border border-slate-200/60 bg-white shadow-card ${className}`}
        >
            {children}
        </section>
    );
}

function formatSignedCurrencyDelta(amount: number, currency: string) {
    const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
    return `${sign}${formatAmount(Math.abs(amount), currency)}`;
}

function formatCompactPercentageValue(value: number | null | undefined, locale: string) {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    const formatted = Math.abs(value).toFixed(1).replace(/\.0$/, "");
    return locale === "id" ? formatted.replace(".", ",") : formatted;
}

function getPreviousMonthLabel(selectedMonth: Date, locale: string) {
    return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
        month: "long",
        year: "numeric",
    }).format(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1));
}

function CompactComparisonLine({
    change,
    currency,
    metric,
    variant = "standard",
    withPreviousLabel,
}: {
    change: DashboardMetricChange;
    currency: string;
    metric: "income" | "expense" | "netCashFlow" | "netWorth";
    variant?: "hero" | "standard";
    withPreviousLabel?: string;
}) {
    const { t, locale } = useI18n();
    if (change.state === "none") return null;

    const delta = change.current - change.previous;
    const increased = delta > 0;
    const decreased = delta < 0;
    const isNeutral = !increased && !decreased;
    const isPositive =
        metric === "expense" ? decreased : increased || change.state === "new";
    const Icon = isNeutral ? Minus : increased ? TrendingUp : TrendingDown;
    const percentage = formatCompactPercentageValue(change.percent, locale);
    const tone =
        variant === "hero"
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
    const percentText = percentage ? ` (${delta > 0 ? "+" : delta < 0 ? "-" : ""}${percentage}%)` : "";

    return (
        <p className={`flex min-w-0 items-center gap-1 text-[11px] font-extrabold ${tone}`}>
            <Icon aria-hidden="true" size={13} strokeWidth={2.4} />
            <span className="truncate">
                {formatSignedCurrencyDelta(delta, currency)}
                {percentText}
                {withPreviousLabel
                    ? ` ${t("dashboard.vsPeriod", { period: withPreviousLabel }) || `vs ${withPreviousLabel}`}`
                    : ""}
            </span>
        </p>
    );
}

function EmptyPanel({
    title,
    description,
    className = "",
}: {
    title: string;
    description: string;
    className?: string;
}) {
    return (
        <div
            className={`flex items-center justify-center rounded-xl p-5 text-center ${className}`}
        >
            <div>
                <p className="text-sm font-bold text-slate-700">{title}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                    {description}
                </p>
            </div>
        </div>
    );
}

/* ─── Period Picker ─── */
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
    const { t, locale } = useI18n();
    const pickerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
    const [pickerYear, setPickerYear] = useState(selectedMonth.getFullYear());
    const monthOptions = useMemo(() => {
        return Array.from({ length: 12 }, (_, index) => {
            const date = new Date(pickerYear, index, 1);
            return {
                date,
                key: monthKey(date),
                label: new Intl.DateTimeFormat(
                    locale === "id" ? "id-ID" : "en-US",
                    { month: "short" },
                ).format(date),
            };
        });
    }, [pickerYear, locale]);
    const selectedPeriodKey = monthKey(selectedMonth);

    useEffect(() => {
        if (!isOpen) return;

        const updatePopoverPosition = () => {
            const button = buttonRef.current;
            if (!button) return;

            const rect = button.getBoundingClientRect();
            const width = Math.min(256, window.innerWidth - 24);
            const left = Math.min(
                Math.max(12, rect.right - width),
                window.innerWidth - width - 12,
            );
            const top = Math.min(rect.bottom + 6, window.innerHeight - 256);

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
        <div ref={pickerRef} className={`relative ${className}`}>
            <button
                ref={buttonRef}
                type="button"
                aria-expanded={isOpen}
                aria-haspopup="menu"
                onClick={() => setIsOpen((current) => !current)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
            >
                <CalendarDays aria-hidden="true" size={14} />
                <span>{summary.period.label}</span>
                <ChevronDown aria-hidden="true" size={12} />
            </button>

            {isOpen && popoverStyle
                ? createPortal(
                <div
                    ref={popoverRef}
                    style={popoverStyle}
                    className="rounded-xl border border-slate-200/60 bg-white p-3 shadow-soft"
                >
                    <label
                        className="block text-[11px] font-bold uppercase tracking-wide text-slate-500"
                        htmlFor="dashboard-period-year"
                    >
                        {t("dashboard.year") || "Year"}
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
                        className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
                    />

                    <div
                        className="mt-2.5 grid grid-cols-3 gap-1.5"
                        role="menu"
                    >
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
                                    className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                                        isSelected
                                            ? "bg-kash-emerald text-white"
                                            : "text-slate-700 hover:bg-slate-50"
                                    }`}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                </div>,
                document.body,
              )
                : null}
        </div>
    );
}

/* ─── Hero Card ─── */
function HeroCard({
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
    const { t, locale } = useI18n();
    const previousMonthLabel = getPreviousMonthLabel(selectedMonth, locale);
    const breakdown = summary.netWorthBreakdown;
    const assetTotal = breakdown
        ? Math.max(
              0,
              breakdown.availableCash +
                  breakdown.savings +
                  breakdown.investments +
                  breakdown.receivables,
          )
        : 0;
    const breakdownTiles = breakdown
        ? [
              {
                  key: "cash",
                  label: t("dashboard.cash") || "Cash",
                  value: breakdown.availableCash,
                  percentBase: assetTotal,
              },
              {
                  key: "savings",
                  label: t("dashboard.savings") || "Savings",
                  value: breakdown.savings,
                  percentBase: assetTotal,
              },
              {
                  key: "investments",
                  label: t("dashboard.investments") || "Investments",
                  value: breakdown.investments,
                  percentBase: assetTotal,
              },
              {
                  key: "receivables",
                  label: t("dashboard.receivables") || "Receivable",
                  value: breakdown.receivables,
                  percentBase: assetTotal,
              },
              {
                  key: "debt",
                  label: t("dashboard.debt") || "Debts",
                  value: -breakdown.debt,
                  percentBase: assetTotal,
              },
          ]
        : [];

    return (
        <div className="kash-hero-card p-4 md:p-6">
            {/* Top row: label + controls */}
            <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-white/70">
                        {t("dashboard.netWorth") || "Net Worth"}
                    </p>
                    <Info
                        aria-hidden="true"
                        className="text-white/40"
                        size={13}
                    />
                </div>
                <div className="flex items-center gap-1.5">
                    <PeriodPicker
                        summary={summary}
                        selectedMonth={selectedMonth}
                        onSelectPeriod={onSelectPeriod}
                    />
                </div>
            </div>

            {/* Net Worth amount + inline eye toggle */}
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <p className="break-words text-[2rem] font-extrabold leading-none tracking-tight text-white md:text-4xl">
                    {formatPrivateAmount(
                        summary.netWorth.amount,
                        currency,
                        balancesVisible,
                    )}
                </p>
                <button
                    type="button"
                    aria-pressed={balancesVisible}
                    aria-label={
                        balancesVisible
                            ? t("dashboard.hideBalances") ||
                              "Hide dashboard balances"
                            : t("dashboard.showBalances") ||
                              "Show dashboard balances"
                    }
                    onClick={onToggleBalances}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/12 text-white/85 transition hover:bg-white/18 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                    {balancesVisible ? (
                        <EyeOff
                            aria-hidden="true"
                            size={18}
                            strokeWidth={2.2}
                        />
                    ) : (
                        <Eye aria-hidden="true" size={18} strokeWidth={2.2} />
                    )}
                </button>
            </div>

            <div className="mt-2">
                <CompactComparisonLine
                    change={summary.netWorthComparison}
                    currency={currency}
                    metric="netWorth"
                    variant="hero"
                    withPreviousLabel={previousMonthLabel}
                />
            </div>

            {/* Available Balance inline */}
            <p className="mt-2 text-xs font-bold text-white/60">
                {t("dashboard.availableBalance") || "Available Balance"}:{" "}
                {formatPrivateAmount(
                    summary.availableBalance.amount,
                    currency,
                    balancesVisible,
                )}
            </p>

            {/* Net Worth breakdown mini tiles */}
            {breakdownTiles.length > 0 ? (
                <div className="mt-4 -mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    <div className="flex min-w-max flex-nowrap gap-2 px-1">
                        {breakdownTiles.map((item) => {
                            const percent =
                                item.percentBase > 0
                                    ? Math.round(
                                          (Math.abs(item.value) /
                                              item.percentBase) *
                                              100,
                                      )
                                    : 0;

                            return (
                                <div
                                    key={item.key}
                                    className="w-[7.7rem] shrink-0 rounded-xl border border-white/10 bg-white/10 p-3 snap-start"
                                >
                                    <p className="truncate text-[11px] font-extrabold text-white/75">
                                        {item.label}
                                    </p>
                                    <p className="mt-1 truncate text-sm font-black text-white">
                                        {formatPrivateCompactAmount(
                                            item.value,
                                            currency,
                                            balancesVisible,
                                        )}
                                    </p>
                                    <p className="mt-1 text-[11px] font-extrabold text-white/55">
                                        {percent}%
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/* ─── Quick Actions ─── */
function QuickActions() {
    const { t } = useI18n();
    const actions = [
        {
            icon: WalletCards,
            label: t("nav.wallets") || "Wallets",
            to: "/wallets",
        },
        {
            icon: Scale,
            label: t("nav.budgets") || "Budget",
            to: "/budgets",
        },
        {
            icon: Target,
            label: t("nav.goals") || "Goal",
            to: "/goals",
        },
        {
            icon: CalendarDays,
            label: t("nav.calendar") || "Calendar",
            to: "/calendar",
        },
    ];

    return (
        <div className="grid grid-cols-4 gap-2">
            {actions.map((action) => (
                <Link
                    key={action.to}
                    to={action.to}
                    className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200/60 bg-white px-2 py-2.5 text-center shadow-card transition hover:border-kash-emerald/35 hover:shadow-card-hover active:bg-kash-selected/40 md:min-h-0 md:flex-none md:flex-row md:px-5"
                >
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-kash-selected text-kash-emeraldDark ring-1 ring-kash-emerald/10">
                        <action.icon size={20} strokeWidth={2.2} />
                    </div>
                    <span className="max-w-full truncate text-[11px] font-extrabold text-slate-800">
                        {action.label}
                    </span>
                </Link>
            ))}
        </div>
    );
}

/* ─── Monthly Cash Flow Row ─── */
function CashFlowRow({
    balancesVisible,
    currency,
    summary,
}: {
    balancesVisible: boolean;
    currency: string;
    summary: DashboardSummary;
}) {
    const { t } = useI18n();
    const items = [
        {
            key: "income",
            label: t("common.typeIncome") || t("dashboard.income") || "Income",
            value: summary.monthlyIncome.amount,
            change: summary.monthComparison.income,
            metric: "income" as const,
            tone: "text-kash-emerald",
            icon: ArrowDownLeft,
        },
        {
            key: "expense",
            label:
                t("common.typeExpense") || t("dashboard.expense") || "Expense",
            value: summary.monthlyExpense.amount,
            change: summary.monthComparison.expense,
            metric: "expense" as const,
            tone: "text-[#E50914]",
            icon: ArrowUpRight,
        },
        {
            key: "cashflow",
            label: t("dashboard.netCashFlow") || "Cash Flow",
            value: summary.netCashFlow.amount,
            change: summary.monthComparison.netCashFlow,
            metric: "netCashFlow" as const,
            tone:
                summary.netCashFlow.amount >= 0
                    ? "text-kash-emerald"
                    : "text-[#E50914]",
            icon:
                summary.netCashFlow.amount >= 0 ? ArrowUpRight : ArrowDownRight,
        },
    ];

    return (
        <DashboardCard className="grid grid-cols-3 divide-x divide-slate-100 min-w-0 max-w-full overflow-hidden">
            {items.map((item) => (
                <div
                    key={item.key}
                    className="min-w-0 px-2 py-3 first:pl-3 last:pr-3 md:px-4 md:py-4 md:first:pl-5 md:last:pr-5"
                >
                    <p className="truncate text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        {item.label}
                    </p>
                    <p
                        className={`mt-1 truncate text-xs sm:text-base md:text-xl font-extrabold ${item.tone}`}
                    >
                        {formatPrivateAmount(
                            item.value,
                            currency,
                            balancesVisible,
                        )}
                    </p>
                    <div className="mt-1.5 min-w-0">
                        <CompactComparisonLine
                            change={item.change}
                            currency={currency}
                            metric={item.metric}
                        />
                    </div>
                </div>
            ))}
        </DashboardCard>
    );
}

/* ─── SVG Donut Chart ─── */
function SpendingDonut({
    balancesVisible,
    currency,
    summary,
}: {
    balancesVisible: boolean;
    currency: string;
    summary: DashboardSummary;
}) {
    const { t } = useI18n();
    const categories = summary.spendingByCategory.slice(0, 5);
    const totalExpense = categories.reduce(
        (sum, category) => sum + category.amount,
        0,
    );

    if (summary.spendingByCategory.length === 0 || totalExpense <= 0) {
        return (
            <DashboardCard className="p-5 max-w-full min-w-0 overflow-hidden">
                <h2 className="text-sm font-extrabold text-slate-900">
                    {t("dashboard.spendingByCategory") ||
                        "Spending by Category"}
                </h2>
                <div className="mt-4 flex flex-col items-center justify-center gap-4 md:flex-row md:items-start">
                    <div className="relative mx-auto flex h-32 w-32 shrink-0 items-center justify-center">
                        <svg viewBox="0 0 120 120" className="h-full w-full">
                            <circle
                                cx="60"
                                cy="60"
                                r="48"
                                fill="none"
                                stroke="#F1F5F9"
                                strokeWidth="18"
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center text-center">
                            <span className="text-xs font-bold text-slate-500">
                                {t("dashboard.noData") || "No data"}
                            </span>
                        </div>
                    </div>
                    <EmptyPanel
                        title={
                            t("dashboard.noSpendingTitle") ||
                            "No spending data yet"
                        }
                        description={
                            t("dashboard.noSpendingDesc") ||
                            "Completed expense categories will build this chart."
                        }
                        className="flex-1"
                    />
                </div>
            </DashboardCard>
        );
    }

    // Build SVG donut segments
    const radius = 48;
    const circumference = 2 * Math.PI * radius;
    const gapDeg = 3; // degrees gap between segments
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
        <DashboardCard className="p-5 max-w-full min-w-0 overflow-hidden">
            <h2 className="text-sm font-extrabold text-slate-900">
                {t("dashboard.spendingByCategory") || "Spending by Category"}
            </h2>
            <div className="mt-4 flex flex-col items-center justify-center gap-6 md:flex-row md:items-center">
                {/* Donut - Larger ring & vertically centered on desktop */}
                <div className="relative mx-auto flex h-36 w-36 sm:h-44 sm:w-44 md:h-52 md:w-52 lg:h-56 lg:w-56 max-w-full shrink-0 items-center justify-center md:mx-0">
                    <svg
                        viewBox="0 0 120 120"
                        className="kash-ring-chart h-full w-full -rotate-90"
                    >
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
                            <p className="text-[11px] font-bold text-slate-500">
                                {t("dashboard.totalExpense") || "Total Spend"}
                            </p>
                            <p className="mt-0.5 max-w-[7rem] truncate text-xs sm:text-sm md:text-base font-extrabold leading-tight text-slate-900">
                                {formatPrivateAmount(
                                    totalExpense,
                                    currency,
                                    balancesVisible,
                                )}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Legend - Responsive full width under donut on mobile, vertically centered on desktop */}
                <div className="w-full min-w-0 max-w-full space-y-2.5 md:flex-1">
                    {categories.map((category) => (
                        <div
                            key={category.id}
                            className="flex items-center justify-between gap-2.5 text-xs sm:text-sm"
                        >
                            <div className="flex min-w-0 items-center gap-2">
                                <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: category.color }}
                                />
                                <span className="truncate font-semibold text-slate-700">
                                    {category.name}
                                </span>
                            </div>
                            <div className="shrink-0 text-right">
                                <span className="font-bold text-slate-900">
                                    {formatPrivateAmount(
                                        category.amount,
                                        currency,
                                        balancesVisible,
                                    )}
                                </span>
                                <span className="ml-1.5 text-xs font-semibold text-slate-500">
                                    {Math.round(category.percent)}%
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </DashboardCard>
    );
}

/* ─── Greeting Helper ─── */
function getLocalizedGreeting(locale: string, name: string) {
    const hour = new Date().getHours();
    if (locale === "id") {
        if (hour >= 5 && hour < 12) return `Selamat pagi, ${name}`;
        if (hour >= 12 && hour < 15) return `Selamat siang, ${name}`;
        if (hour >= 15 && hour < 18) return `Selamat sore, ${name}`;
        return `Selamat malam, ${name}`;
    }
    if (hour >= 5 && hour < 12) return `Good morning, ${name}`;
    if (hour >= 12 && hour < 18) return `Good afternoon, ${name}`;
    return `Good evening, ${name}`;
}

/* ─── Cash Flow Chart ─── */
function CashFlowChart({
    balancesVisible,
    currency,
    summary,
}: {
    balancesVisible: boolean;
    currency: string;
    summary: DashboardSummary;
}) {
    const { t } = useI18n();
    const mobileScrollRef = useRef<HTMLDivElement>(null);
    const hasData = summary.cashflow.some(
        (point) => point.income > 0 || point.expense > 0,
    );
    const width = 1120;
    const height = 220;
    const padding = { bottom: 30, left: 10, right: 0, top: 10 };
    const daysInMonth = summary.period.daysInMonth || 30;
    const mobileChartWidth = daysInMonth * 44; // 44px per day slot for smooth mobile bar rendering
    const mobilePadding = { bottom: 30, left: 10, right: 10, top: 10 };
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
        const isCurrentMonth =
            today.getFullYear() === periodStart.getFullYear() &&
            today.getMonth() === periodStart.getMonth();
        const targetDay = isCurrentMonth
            ? Math.min(today.getDate(), daysInMonth)
            : 1;

        window.requestAnimationFrame(() => {
            const daySlotWidth = scrollElement.scrollWidth / daysInMonth;
            const targetCenter = (targetDay - 0.5) * daySlotWidth;
            const maxScrollLeft = Math.max(
                0,
                scrollElement.scrollWidth - scrollElement.clientWidth,
            );
            scrollElement.scrollLeft = Math.min(
                maxScrollLeft,
                Math.max(0, targetCenter - scrollElement.clientWidth / 2),
            );
        });
    }, [daysInMonth, summary.period.start]);

    if (!hasData)
        return (
            <EmptyPanel
                title={
                    t("dashboard.noCashflowData") ||
                    "No cash flow data this month"
                }
                description={
                    t("dashboard.noCashflowDesc") ||
                    "Income and expense activity will appear as a daily chart."
                }
                className="min-h-48"
            />
        );

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
        const maxValue = Math.max(
            1,
            ...points.flatMap((point) => [point.income, point.expense]),
        );
        const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
        const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
        const bandWidth = plotWidth / points.length;
        const barWidth = Math.min(
            barMaxWidth,
            Math.max(barMinWidth, bandWidth / 3.5),
        );

        return (
            <svg
                role="img"
                aria-label={`Income and expense chart for ${summary.period.label}`}
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className={barClassName}
                style={style}
            >
                {ticks.map((tick) => {
                    const y = chartPadding.top + plotHeight - tick * plotHeight;
                    const value = maxValue * tick;

                    return (
                        <g key={tick}>
                            {showGridLines || tick === 0 ? (
                                <line
                                    x1={chartPadding.left}
                                    x2={chartWidth - chartPadding.right}
                                    y1={y}
                                    y2={y}
                                    stroke={CHART_GRID_COLOR}
                                    strokeWidth="1"
                                />
                            ) : null}
                            {showYAxisLabels ? (
                                <text
                                    x={chartPadding.left + 2}
                                    y={y - 4}
                                    className="fill-slate-600 text-[10px] font-semibold"
                                >
                                    {chartTickLabel(value)}
                                </text>
                            ) : null}
                        </g>
                    );
                })}

                {points.map((point, index) => {
                    const centerX =
                        chartPadding.left + bandWidth * (index + 0.5);
                    const incomeHeight = (point.income / maxValue) * plotHeight;
                    const expenseHeight =
                        (point.expense / maxValue) * plotHeight;
                    const incomeY =
                        chartPadding.top + plotHeight - incomeHeight;
                    const expenseY =
                        chartPadding.top + plotHeight - expenseHeight;

                    return (
                        <g key={point.key}>
                            <title>
                                {`${point.title}: Income ${formatPrivateAmount(point.income, currency, balancesVisible)}, Expense ${formatPrivateAmount(point.expense, currency, balancesVisible)}`}
                            </title>
                            <rect
                                x={centerX - barWidth - 1.5}
                                y={incomeY}
                                width={barWidth}
                                height={
                                    point.income > 0
                                        ? Math.max(incomeHeight, 3)
                                        : 1.5
                                }
                                rx="4"
                                fill={CASHFLOW_INCOME_COLOR}
                                opacity={point.income > 0 ? 0.9 : 0.12}
                            />
                            <rect
                                x={centerX + 1.5}
                                y={expenseY}
                                width={barWidth}
                                height={
                                    point.expense > 0
                                        ? Math.max(expenseHeight, 3)
                                        : 1.5
                                }
                                rx="4"
                                fill={CASHFLOW_EXPENSE_COLOR}
                                opacity={point.expense > 0 ? 0.9 : 0.12}
                            />
                            <text
                                x={centerX}
                                y={chartHeight - 8}
                                textAnchor="middle"
                                className="fill-slate-600 text-[10px] font-semibold"
                            >
                                {point.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
        );
    }

    // Calculate percentage width so ~7 days fit per visible viewport
    const scrollWidthStyle = `${(daysInMonth / 7) * 100}%`;
    const chartWidth = Math.max(1120, daysInMonth * 55);

    return (
        <div className="w-full max-w-full min-w-0 overflow-hidden">
            {/* Scrollable chart area: ~7 days per viewport for bold, readable daily bars on all screen sizes */}
            <div
                ref={mobileScrollRef}
                className="w-full max-w-full min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
                {renderChart({
                    barClassName: "block h-52 max-w-none",
                    barMaxWidth: 16,
                    barMinWidth: 8,
                    chartPadding: mobilePadding,
                    chartWidth: chartWidth,
                    points: dailyPoints,
                    showGridLines: true,
                    showYAxisLabels: balancesVisible,
                    style: { width: scrollWidthStyle, minWidth: "100%" },
                })}
            </div>
        </div>
    );
}

/* ─── Recent Transactions ─── */
function transactionIcon(type: TransactionType) {
    if (type === "income") return ArrowDownLeft;
    if (type === "expense") return ArrowUpRight;
    if (type === "transfer") return ArrowRightLeft;
    return CreditCard;
}

function RecentTransactions({
    balancesVisible,
    currency,
    summary,
}: {
    balancesVisible: boolean;
    currency: string;
    summary: DashboardSummary;
}) {
    const { t, locale } = useI18n();
    if (summary.recentTransactions.length === 0)
        return (
            <EmptyPanel
                title={
                    t("dashboard.noTransactionsTitle") ||
                    "No recent transactions"
                }
                description={
                    t("dashboard.noTransactionsDesc") ||
                    "Saved ledger activity will appear here."
                }
                className="min-h-36"
            />
        );

    return (
        <div className="space-y-0.5">
            {summary.recentTransactions.slice(0, 5).map((transaction) => {
                const Icon = transactionIcon(transaction.type);
                const transactionDate = new Date(transaction.date);
                const signedAmount =
                    transaction.type === "income"
                        ? transaction.amount
                        : transaction.type === "expense"
                          ? -transaction.amount
                          : transaction.amount;

                return (
                    <div
                        key={transaction.id}
                        className="kash-activity-row flex items-center gap-3 rounded-xl px-1 py-2.5"
                    >
                        <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 ${transactionTone[transaction.type]}`}
                        >
                            <Icon
                                aria-hidden="true"
                                size={16}
                                strokeWidth={2}
                            />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-900">
                                {transaction.title}
                            </p>
                            <p className="truncate text-xs font-medium text-slate-500">
                                {transaction.categoryName} •{" "}
                                {transaction.walletName}
                            </p>
                        </div>
                        <div className="shrink-0 text-right">
                            <p
                                className={`text-sm font-extrabold ${transactionTone[transaction.type]}`}
                            >
                                {transaction.type === "transfer"
                                    ? formatPrivateAmount(
                                          transaction.amount,
                                          currency,
                                          balancesVisible,
                                      )
                                    : formatPrivateAmount(
                                          signedAmount,
                                          currency,
                                          balancesVisible,
                                      )}
                            </p>
                            <p className="text-[11px] font-medium text-slate-500">
                                {new Intl.DateTimeFormat(
                                    locale === "id" ? "id-ID" : "en-US",
                                    { hour: "2-digit", minute: "2-digit" },
                                ).format(transactionDate)}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/* ─── Calendar ─── */
function DashboardCalendar({
    month,
    onSelectDate,
    summary,
}: {
    month: Date;
    onSelectDate: (dateKey: string) => void;
    summary: DashboardSummary;
}) {
    const { locale } = useI18n();
    const todayKey = localDateKey(new Date());
    const cells = useMemo(() => buildCalendarCells(month), [month]);
    const activityByDate = useMemo(
        () =>
            new Map(
                summary.calendarActivity.map((activity) => [
                    activity.dateKey,
                    activity.types,
                ]),
            ),
        [summary.calendarActivity],
    );
    const localizedWeekdays = useMemo(() => {
        return locale === "id"
            ? ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]
            : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    }, [locale]);

    return (
        <div className="mt-3">
            <div
                className="grid gap-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500"
                style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
            >
                {localizedWeekdays.map((weekday) => (
                    <div key={weekday} className="py-1">
                        {weekday}
                    </div>
                ))}
            </div>

            <div
                className="mt-1.5 grid gap-0.5"
                style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
            >
                {cells.map((cell) => {
                    const types = activityByDate.get(cell.dateKey) ?? [];
                    const isToday = cell.dateKey === todayKey;

                    return (
                        <button
                            key={cell.dateKey}
                            type="button"
                            aria-label={`${cell.date.getDate()} ${summary.period.label}${types.length > 0 ? ", has transactions" : ""}`}
                            onClick={() => onSelectDate(cell.dateKey)}
                            className={`flex min-h-10 flex-col items-center justify-between rounded-lg p-1 text-xs transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-kash-emerald/20 ${
                                isToday
                                    ? "bg-kash-emerald/10 font-extrabold text-kash-emerald"
                                    : ""
                            } ${cell.isCurrentMonth ? "text-slate-800" : "text-slate-400"}`}
                        >
                            <span className="font-bold">
                                {cell.date.getDate()}
                            </span>
                            <span
                                className="flex min-h-1.5 items-center justify-center gap-0.5"
                                aria-hidden="true"
                            >
                                {calendarActivityOrder
                                    .filter((type) => types.includes(type))
                                    .map((type) => (
                                        <span
                                            key={type}
                                            className={`h-1 w-1 rounded-full ${calendarActivityDotClass[type]}`}
                                        />
                                    ))}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ─── Secondary Summaries ─── */
function WalletSummary({
    balancesVisible,
    currency,
    summary,
}: {
    balancesVisible: boolean;
    currency: string;
    summary: DashboardSummary;
}) {
    const { t } = useI18n();
    if (summary.wallets.length === 0)
        return (
            <EmptyPanel
                title={t("dashboard.noWalletsTitle") || "No wallets yet"}
                description={
                    t("dashboard.noWalletsDesc") ||
                    "Create your first wallet to start tracking."
                }
            />
        );

    return (
        <div className="space-y-1">
            {summary.wallets.slice(0, 4).map((wallet) => (
                <div
                    key={wallet.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-1 py-2"
                >
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                            <span
                                className="h-3.5 w-3.5 rounded-sm"
                                style={{ backgroundColor: wallet.color }}
                            />
                        </span>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">
                                {wallet.name}
                            </p>
                            <p className="text-[11px] font-medium text-slate-500">
                                {wallet.walletTypeLabel}
                            </p>
                        </div>
                    </div>
                    <span className="shrink-0 text-sm font-extrabold text-slate-900">
                        {formatPrivateAmount(
                            wallet.balance,
                            currency,
                            balancesVisible,
                        )}
                    </span>
                </div>
            ))}
        </div>
    );
}

function GoalsSummary({
    balancesVisible,
    currency,
    summary,
}: {
    balancesVisible: boolean;
    currency: string;
    summary: DashboardSummary;
}) {
    const { t } = useI18n();
    if (summary.goals.length === 0)
        return (
            <EmptyPanel
                title={t("dashboard.noGoalsTitle") || "No goals yet"}
                description={
                    t("dashboard.noGoalsDesc") ||
                    "Create a goal to add a savings pocket."
                }
            />
        );

    return (
        <div className="space-y-2.5">
            {summary.goals.slice(0, 3).map((goal) => (
                <Link
                    key={goal.id}
                    to={`/goals/${goal.id}`}
                    className="block rounded-lg px-1 py-1 transition hover:bg-slate-50"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">
                                {goal.name}
                            </p>
                            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                                {formatPrivateAmount(
                                    goal.currentAmount,
                                    currency,
                                    balancesVisible,
                                )}{" "}
                                {t("shared.ofTotal") || "of"}{" "}
                                {formatPrivateAmount(
                                    goal.targetAmount,
                                    currency,
                                    balancesVisible,
                                )}
                            </p>
                        </div>
                        <span className="shrink-0 text-xs font-extrabold text-kash-emerald">
                            {goal.percentage.toFixed(0)}%
                        </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                            className="h-full rounded-full bg-kash-emerald transition-all duration-500"
                            style={{ width: `${goal.percentage}%` }}
                        />
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
    const { t } = useI18n();
    const { totalDebt, totalReceivable, counterparties } = summary.debts;

    if (
        totalDebt === 0 &&
        totalReceivable === 0 &&
        counterparties.length === 0
    ) {
        return (
            <EmptyPanel
                title={
                    t("dashboard.noObligationsTitle") || "No obligations yet"
                }
                description={
                    t("dashboard.noObligationsDesc") ||
                    "Track money you owe or money owed to you."
                }
            />
        );
    }

    return (
        <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 p-2.5">
                    <span className="text-[11px] font-bold text-slate-500">
                        {t("dashboard.youOwe") || "You Owe"}
                    </span>
                    <p className="mt-0.5 text-sm font-extrabold text-slate-900">
                        {formatPrivateAmount(
                            totalDebt,
                            currency,
                            balancesVisible,
                        )}
                    </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-2.5">
                    <span className="text-[11px] font-bold text-slate-500">
                        {t("dashboard.owedToYou") || "Owed to You"}
                    </span>
                    <p className="mt-0.5 text-sm font-extrabold text-slate-900">
                        {formatPrivateAmount(
                            totalReceivable,
                            currency,
                            balancesVisible,
                        )}
                    </p>
                </div>
            </div>

            {counterparties.length > 0 ? (
                <div className="space-y-0.5">
                    {counterparties.slice(0, 3).map((cp) => (
                        <Link
                            key={cp.id}
                            to={`/debts/${cp.id}`}
                            className="flex items-center justify-between rounded-lg px-1 py-1.5 text-xs transition hover:bg-slate-50"
                        >
                            <div className="min-w-0">
                                <p className="truncate font-bold text-slate-900">
                                    {cp.name}
                                </p>
                                <p className="text-[11px] font-medium text-slate-500">
                                    {t("dashboard.activeItems", {
                                        count: cp.activeItemCount,
                                    })}
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                {cp.debtTotal > 0 && (
                                    <p className="font-extrabold text-kash-expense">
                                        -
                                        {formatPrivateAmount(
                                            cp.debtTotal,
                                            currency,
                                            balancesVisible,
                                        )}
                                    </p>
                                )}
                                {cp.receivableTotal > 0 && (
                                    <p className="font-extrabold text-kash-emerald">
                                        +
                                        {formatPrivateAmount(
                                            cp.receivableTotal,
                                            currency,
                                            balancesVisible,
                                        )}
                                    </p>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            ) : null}
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
    const { t } = useI18n();
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
        return <div className="h-28 animate-pulse rounded-xl bg-slate-100" />;
    }

    if (budgets.length === 0) {
        return (
            <EmptyPanel
                title={t("dashboard.noBudgetsTitle") || "Belum ada budget"}
                description={
                    t("dashboard.noBudgetsDesc") ||
                    "Atur batas belanja bulanan untuk mengendalikan pengeluaran."
                }
            />
        );
    }

    return (
        <div className="space-y-2.5">
            {budgets.slice(0, 4).map((b) => {
                const progress = Math.min(Math.max(b.usage_percentage, 0), 100);
                const isOver = b.status === "over_budget";
                const isNear = b.status === "near_limit";
                const spentNum = toNumber(b.spent);
                const effectiveNum = toNumber(b.effective_budget);

                return (
                    <div
                        key={b.budget_id}
                        className="rounded-xl bg-slate-50/70 p-2.5"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-bold text-slate-900">
                                {b.name}
                            </p>
                            <span
                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                    isOver
                                        ? "bg-kash-expense/10 text-kash-expense"
                                        : isNear
                                          ? "bg-amber-100 text-amber-700"
                                          : "bg-kash-emerald/10 text-kash-emeraldDark"
                                }`}
                            >
                                {b.usage_percentage.toFixed(0)}%
                            </span>
                        </div>

                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                    isOver
                                        ? "bg-kash-expense"
                                        : isNear
                                          ? "bg-amber-500"
                                          : "bg-kash-emerald"
                                }`}
                                style={{ width: `${progress}%` }}
                            />
                        </div>

                        <div className="mt-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
                            <span>
                                {formatPrivateAmount(
                                    spentNum,
                                    currency,
                                    balancesVisible,
                                )}
                            </span>
                            <span>
                                /{" "}
                                {formatPrivateAmount(
                                    effectiveNum,
                                    currency,
                                    balancesVisible,
                                )}
                            </span>
                        </div>
                    </div>
                );
            })}

            <div className="pt-1 text-center">
                <Link
                    to="/budgets"
                    className="inline-flex items-center gap-1 text-xs font-bold text-kash-emeraldDark hover:text-kash-emerald"
                >
                    {t("dashboard.viewAllBudgets", { count: budgets.length }) ||
                        `Lihat semua ${budgets.length} budget →`}
                </Link>
            </div>
        </div>
    );
}

/* ─── Skeleton ─── */
function DashboardSkeleton() {
    return (
        <div className="space-y-4">
            <div className="h-48 animate-pulse rounded-2xl bg-gradient-to-br from-kash-emerald/20 to-kash-heroDark/10" />
            <div className="grid grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="h-14 animate-pulse rounded-xl bg-slate-100"
                    />
                ))}
            </div>
            <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
            <div className="grid gap-4 lg:grid-cols-2">
                <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
                <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
            </div>
        </div>
    );
}

/* ─── Main Page ─── */
export function DashboardPage() {
    const { t, locale } = useI18n();
    const navigate = useNavigate();
    const { profile } = useAuth();
    const [selectedMonth, setSelectedMonth] = useState(() =>
        startOfMonth(new Date()),
    );
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [balancesVisible, setBalancesVisible] = useState(
        getStoredBalancesVisibility,
    );
    const [error, setError] = useState<string | null>(null);
    const currency = profile?.default_currency ?? "IDR";
    const firstName =
        profile?.full_name?.split(" ")[0] ??
        profile?.email.split("@")[0] ??
        "there";

    const loadDashboard = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const nextSummary = await getDashboardSummary({
                referenceDate: selectedMonth,
            });
            setSummary(nextSummary);
        } catch (caughtError) {
            setError(
                caughtError instanceof Error
                    ? caughtError.message
                    : "Unable to load dashboard data.",
            );
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
        window.sessionStorage.setItem(
            DASHBOARD_BALANCES_VISIBLE_KEY,
            String(balancesVisible),
        );
    }, [balancesVisible]);

    if (isLoading && !summary) return <DashboardSkeleton />;

    if (error && !summary) {
        return (
            <DashboardCard className="p-6">
                <p className="text-sm font-bold text-kash-expense">
                    {t("common.error")}
                </p>
                <p className="mt-2 text-sm font-medium text-slate-600">
                    {error}
                </p>
                <button
                    type="button"
                    onClick={() => void loadDashboard()}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-kash-emerald px-4 py-2 text-sm font-bold text-white transition hover:bg-kash-emeraldDark focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
                >
                    <RefreshCw size={17} />
                    {t("common.retry")}
                </button>
            </DashboardCard>
        );
    }

    if (!summary) return null;

    return (
        <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-4">
            {/* Greeting */}
            <div>
                <h1 className="text-xl font-extrabold text-slate-900 md:text-2xl">
                    {getLocalizedGreeting(locale, firstName)}
                </h1>
                <p className="mt-0.5 text-sm font-medium text-slate-500">
                    {t("dashboard.title") || "Here's your financial overview."}
                </p>
            </div>

            {/* Hero Card */}
            <HeroCard
                balancesVisible={balancesVisible}
                summary={summary}
                currency={currency}
                selectedMonth={selectedMonth}
                onSelectPeriod={(date) => setSelectedMonth(startOfMonth(date))}
                onToggleBalances={() =>
                    setBalancesVisible((current) => !current)
                }
            />

            {/* Quick Actions */}
            <QuickActions />

            {/* Monthly Cash Flow — compact row */}
            <CashFlowRow
                balancesVisible={balancesVisible}
                summary={summary}
                currency={currency}
            />

            {/* Middle: Spending Donut + Cash Flow Chart */}
            <div className="grid gap-4 lg:grid-cols-2">
                <SpendingDonut
                    balancesVisible={balancesVisible}
                    summary={summary}
                    currency={currency}
                />

                <DashboardCard className="p-5">
                    <div className="mb-3 flex items-center justify-between gap-4">
                        <h2 className="text-sm font-extrabold text-slate-900">
                            {t("dashboard.cashflow") || "Cash Flow"}{" "}
                            <span className="font-medium text-slate-500">
                                ({summary.period.label})
                            </span>
                        </h2>
                        <div className="flex items-center gap-4 text-[11px] font-bold text-slate-500">
                            <span className="inline-flex items-center gap-1.5">
                                <span
                                    className="h-2 w-2 rounded-full"
                                    style={{
                                        backgroundColor: CASHFLOW_INCOME_COLOR,
                                    }}
                                />
                                {t("common.typeIncome") || "Income"}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span
                                    className="h-2 w-2 rounded-full"
                                    style={{
                                        backgroundColor: CASHFLOW_EXPENSE_COLOR,
                                    }}
                                />
                                {t("common.typeExpense") || "Expense"}
                            </span>
                        </div>
                    </div>
                    <CashFlowChart
                        balancesVisible={balancesVisible}
                        summary={summary}
                        currency={currency}
                    />
                </DashboardCard>
            </div>

            {/* Recent Transactions */}
            <DashboardCard className="p-5">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-extrabold text-slate-900">
                        {t("dashboard.recentTransactions") ||
                            "Recent Transactions"}
                    </h2>
                    <Link
                        to="/transactions"
                        className="text-xs font-bold text-kash-emerald hover:text-kash-emeraldDark"
                    >
                        {t("common.viewAll")}
                    </Link>
                </div>
                <RecentTransactions
                    balancesVisible={balancesVisible}
                    summary={summary}
                    currency={currency}
                />
            </DashboardCard>

            {/* Secondary Summaries — 2×2 on desktop */}
            <div className="grid gap-4 sm:grid-cols-2">
                <DashboardCard className="p-5">
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Scale
                                aria-hidden="true"
                                className="text-kash-emerald"
                                size={16}
                            />
                            <h2 className="text-sm font-extrabold text-slate-900">
                                {t("nav.budgets")}
                            </h2>
                        </div>
                        <Link
                            to="/budgets"
                            className="text-xs font-bold text-slate-500 hover:text-kash-emerald"
                        >
                            {t("common.viewAll")}
                        </Link>
                    </div>
                    <BudgetDashboardSummary
                        balancesVisible={balancesVisible}
                        currency={currency}
                    />
                </DashboardCard>

                <DashboardCard className="p-5">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-extrabold text-slate-900">
                            {t("nav.wallets")}
                        </h2>
                        <Link
                            to="/wallets"
                            className="text-xs font-bold text-slate-500 hover:text-kash-emerald"
                        >
                            {t("common.viewAll")}
                        </Link>
                    </div>
                    <WalletSummary
                        balancesVisible={balancesVisible}
                        summary={summary}
                        currency={currency}
                    />
                </DashboardCard>

                <DashboardCard className="p-5">
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <PiggyBank
                                aria-hidden="true"
                                className="text-kash-emerald"
                                size={16}
                            />
                            <h2 className="text-sm font-extrabold text-slate-900">
                                {t("nav.goals")}
                            </h2>
                        </div>
                        <Link
                            to="/goals"
                            className="text-xs font-bold text-slate-500 hover:text-kash-emerald"
                        >
                            {t("common.viewAll")}
                        </Link>
                    </div>
                    <GoalsSummary
                        balancesVisible={balancesVisible}
                        summary={summary}
                        currency={currency}
                    />
                </DashboardCard>

                <DashboardCard className="p-5">
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <HandCoins
                                aria-hidden="true"
                                className="text-kash-emerald"
                                size={16}
                            />
                            <h2 className="text-sm font-extrabold text-slate-900">
                                {t("nav.debts")}
                            </h2>
                        </div>
                        <Link
                            to="/debts"
                            className="text-xs font-bold text-slate-500 hover:text-kash-emerald"
                        >
                            {t("common.viewAll")}
                        </Link>
                    </div>
                    <DebtReceivableSummary
                        balancesVisible={balancesVisible}
                        summary={summary}
                        currency={currency}
                    />
                </DashboardCard>
            </div>

            {/* Calendar — secondary area */}
            <DashboardCard className="p-5">
                <div className="flex items-center justify-between gap-4">
                    <h2 className="text-sm font-extrabold text-slate-900">
                        {t("dashboard.calendar") || "Calendar"}
                    </h2>
                    <span className="text-xs font-bold text-slate-500">
                        {summary.period.label}
                    </span>
                </div>
                <DashboardCalendar
                    month={selectedMonth}
                    summary={summary}
                    onSelectDate={(dateKey) =>
                        navigate(
                            `/calendar?date=${encodeURIComponent(dateKey)}`,
                        )
                    }
                />
            </DashboardCard>

            {error ? (
                <p className="text-sm font-medium text-kash-expense">{error}</p>
            ) : null}
        </div>
    );
}
