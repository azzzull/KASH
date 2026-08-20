import { CalendarDays, ChevronLeft, ChevronRight, Loader2, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addMonths,
  buildCalendarCells,
  calculateDaySummary,
  getCalendarMonthTransactions,
  localDateKey,
  parseLocalDateKey,
  startOfLocalMonth,
  type CalendarMonthData,
} from "../lib/calendar";
import { formatCurrency, toNumber } from "../lib/money";
import { appEvents } from "../lib/appEvents";
import { useAppEvent } from "../hooks/useAppEvent";
import { useI18n } from "../i18n";
import type { TransactionWithMeta } from "../lib/transactions";
import {
  displayTransactionAmount,
  transactionCategoryLabel,
  transactionIcon,
  transactionTitle,
  transactionTone,
  transactionWalletLabel,
  TransactionDetailPanel,
} from "../components/transactions/TransactionDetailPanel";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";

const activityOrder = ["income", "expense", "transfer", "adjustment"] as const;
const activityDotClass = {
  adjustment: "bg-slate-600",
  expense: "bg-[#E50914]",
  income: "bg-kash-emerald",
  transfer: "bg-kash-transfer",
};

function formatSignedCurrency(amount: number, currency = "IDR", formatCurrencyFn?: (amount: number, currency?: string) => string) {
  if (amount === 0) return formatCurrencyFn ? formatCurrencyFn(0, currency) : formatCurrency(0, currency);
  const formatted = formatCurrencyFn ? formatCurrencyFn(amount, currency) : formatCurrency(amount, currency);
  return `${amount > 0 ? "+" : ""}${formatted}`;
}

function CalendarSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="h-8 w-48 animate-pulse rounded-full bg-slate-200" />
      <div className="mt-6 grid gap-2" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {Array.from({ length: 42 }, (_, index) => (
          <div key={index} className="aspect-square animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
      <div className="mt-6 border-t border-slate-100 pt-5">
        <div className="h-6 w-40 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
        </div>
        <div className="mt-6 space-y-3">
          <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

function CalendarGrid({
  activeMonth,
  monthData,
  onSelectDate,
  selectedDateKey,
  todayKey,
}: {
  activeMonth: Date;
  monthData: CalendarMonthData;
  onSelectDate: (dateKey: string) => void;
  selectedDateKey: string;
  todayKey: string;
}) {
  const { locale, formatDate, formatCompactCurrency } = useI18n();
  const calendarCells = useMemo(() => buildCalendarCells(activeMonth), [activeMonth]);
  const weekdays = useMemo(() => {
    return locale === "id" ? ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  }, [locale]);

  return (
    <>
      <div
        className="mt-6 grid gap-1 text-center text-[11px] font-extrabold uppercase text-slate-600 md:gap-2"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {weekdays.map((weekday) => (
          <div key={weekday} className="py-1">
            {weekday}
          </div>
        ))}
      </div>

      <div
        className="mt-2 grid gap-1 md:gap-2"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {calendarCells.map((cell) => {
          const dayData = monthData.days.get(cell.dateKey);
          const isSelected = selectedDateKey === cell.dateKey;
          const isToday = todayKey === cell.dateKey;
          const dayNumber = cell.date.getDate();
          const selectedDateLabel = formatDate(parseLocalDateKey(cell.dateKey));

          return (
            <button
              key={cell.dateKey}
              type="button"
              aria-label={`${selectedDateLabel}${dayData ? `, ${dayData.summary.transactionCount} transactions` : ""}`}
              aria-pressed={isSelected}
              onClick={() => onSelectDate(cell.dateKey)}
              className={`flex min-h-[58px] flex-col items-center justify-between rounded-lg border p-1.5 text-sm transition focus:outline-none focus:ring-4 focus:ring-kash-emerald/20 md:min-h-[76px] md:p-2 ${
                isSelected
                  ? "border-kash-emerald bg-kash-selected text-kash-emerald"
                  : isToday
                    ? "border-kash-emerald/60 bg-white text-slate-900"
                    : "border-transparent bg-white text-slate-900 hover:bg-slate-50"
              } ${cell.isCurrentMonth ? "" : "text-slate-400"}`}
            >
              <span className={`font-extrabold ${cell.isCurrentMonth ? "" : "text-slate-400"}`}>{dayNumber}</span>
              {dayData && dayData.summary.transactionCount > 0 ? (
                <div className="flex w-full flex-col items-center gap-0.5 px-0.5 text-[9px] md:text-[10px] font-black leading-tight overflow-hidden">
                  {dayData.summary.income > 0 && (
                    <span className="truncate text-kash-emerald">
                      +{formatCompactCurrency(dayData.summary.income)}
                    </span>
                  )}
                  {dayData.summary.expense > 0 && (
                    <span className="truncate text-kash-expense">
                      -{formatCompactCurrency(dayData.summary.expense)}
                    </span>
                  )}
                </div>
              ) : (
                <span className="flex min-h-3" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function SelectedDatePanel({
  currency,
  isLoading,
  onSelectTransaction,
  selectedDateKey,
  selectedSummary,
  selectedTransactions,
}: {
  currency: string;
  isLoading: boolean;
  onSelectTransaction: (transaction: TransactionWithMeta) => void;
  selectedDateKey: string;
  selectedSummary: ReturnType<typeof calculateDaySummary>;
  selectedTransactions: TransactionWithMeta[];
}) {
  const { t, formatDate, formatCurrency } = useI18n();
  const formattedDate = formatDate(parseLocalDateKey(selectedDateKey));

  return (
    <section className="mt-6 border-t border-slate-100 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase text-slate-600">{t("calendar.transactionsOnDate") || "Selected Date"}</p>
          <h2 className="mt-1 text-lg font-extrabold text-slate-900">{formattedDate}</h2>
        </div>
        {isLoading ? <Loader2 aria-hidden="true" className="mt-1 animate-spin text-slate-600" size={18} /> : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <SummaryCard label={t("common.typeIncome") || t("dashboard.income") || "Income"} tone="text-kash-emerald" value={formatCurrency(selectedSummary.income, currency)} />
        <SummaryCard label={t("common.typeExpense") || t("dashboard.expense") || "Expense"} tone="text-[#E50914]" value={formatCurrency(selectedSummary.expense, currency)} />
        <SummaryCard
          label={t("calendar.netSummary") || "Net"}
          tone={selectedSummary.net >= 0 ? "text-kash-emerald" : "text-[#E50914]"}
          value={formatSignedCurrency(selectedSummary.net, currency, formatCurrency)}
        />
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-extrabold text-slate-900">{t("nav.transactions")}</h3>

        {selectedTransactions.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
            <ReceiptText className="mx-auto text-slate-600" size={28} />
            <p className="mt-3 text-sm font-extrabold text-slate-900">{t("calendar.noTransactions") || "No transactions on this day."}</p>
            <p className="mt-1 text-sm font-semibold text-slate-600">{t("dashboard.noTransactionsDesc") || "Dates with activity are marked in the calendar."}</p>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {selectedTransactions.map((transaction) => (
              <DayTransactionRow
                key={transaction.id}
                currency={currency}
                transaction={transaction}
                onSelect={() => onSelectTransaction(transaction)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SummaryCard({ label, tone, value }: { label: string; tone: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-bold text-slate-600">{label}</p>
      <p className={`mt-2 break-words text-sm font-extrabold md:text-base ${tone}`}>{value}</p>
    </div>
  );
}

function DayTransactionRow({
  currency,
  onSelect,
  transaction,
}: {
  currency: string;
  onSelect: () => void;
  transaction: TransactionWithMeta;
}) {
  const { t, formatCurrency, formatTime } = useI18n();
  const Icon = transactionIcon(transaction.type);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="block w-full border-b border-slate-100 py-3 text-left transition last:border-b-0 hover:bg-slate-50 md:px-2"
    >
      <span className="grid grid-cols-[auto_1fr_auto] items-center gap-3 md:hidden">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 ${transactionTone[transaction.type]}`}>
          <Icon aria-hidden="true" size={17} strokeWidth={2.2} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-extrabold text-slate-900">{transactionTitle(transaction)}</span>
          <span className="mt-1 block truncate text-xs font-semibold text-slate-600">
            {transactionCategoryLabel(transaction)} / {transactionWalletLabel(transaction)}
          </span>
        </span>
        <span className="text-right">
          <span className={`block text-sm font-extrabold ${transactionTone[transaction.type]}`}>{displayTransactionAmount(transaction, currency)}</span>
          {transaction.type === "transfer" && toNumber(transaction.transfer_fee) > 0 ? (
            <span className="block text-[11px] font-bold text-kash-expense">
              + {t("dashboard.fee") || "biaya"} {formatCurrency(transaction.transfer_fee, currency)}
            </span>
          ) : null}
          <span className="mt-1 block text-xs font-bold text-slate-600">{formatTime(transaction.transaction_date)}</span>
        </span>
      </span>

      <span
        className="hidden items-center gap-4 text-sm md:grid"
        style={{ gridTemplateColumns: "64px minmax(0, 1.1fr) minmax(110px, 0.9fr) minmax(120px, 1fr) 130px" }}
      >
        <span className="font-semibold text-slate-600">{formatTime(transaction.transaction_date)}</span>
        <span className="min-w-0">
          <span className="block truncate font-bold text-slate-900">{transactionTitle(transaction)}</span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-slate-600">{transaction.type === "transfer" ? (t("tx.transfer") || "Transfer") : transaction.note}</span>
        </span>
        <span className="truncate font-semibold text-slate-600">{transactionCategoryLabel(transaction)}</span>
        <span className="truncate font-semibold text-slate-600">{transactionWalletLabel(transaction)}</span>
        <span className={`text-right font-extrabold ${transactionTone[transaction.type]}`}>
          <span>{displayTransactionAmount(transaction, currency)}</span>
          {transaction.type === "transfer" && toNumber(transaction.transfer_fee) > 0 ? (
            <span className="block text-[11px] font-bold text-kash-expense">
              + {t("dashboard.fee") || "biaya"} {formatCurrency(transaction.transfer_fee, currency)}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

export function CalendarPage() {
  const { t, formatMonthYear } = useI18n();
  const [searchParams] = useSearchParams();
  const today = useMemo(() => new Date(), []);
  const todayKey = localDateKey(today);
  const initialDateKey = searchParams.get("date") ?? todayKey;
  const [activeMonth, setActiveMonth] = useState(() => startOfLocalMonth(parseLocalDateKey(initialDateKey)));
  const [selectedDateKey, setSelectedDateKey] = useState(initialDateKey);
  const [monthData, setMonthData] = useState<CalendarMonthData | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currency = "IDR";

  const selectedTransactions = monthData?.days.get(selectedDateKey)?.transactions ?? [];
  const selectedSummary = calculateDaySummary(selectedTransactions);

  const loadMonth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getCalendarMonthTransactions(activeMonth);
      setMonthData(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Couldn't load calendar transactions.");
    } finally {
      setIsLoading(false);
    }
  }, [activeMonth]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  useAppEvent(appEvents.transactionSaved, () => void loadMonth());

  useEffect(() => {
    const dateKey = searchParams.get("date");
    if (!dateKey) return;

    setSelectedDateKey(dateKey);
    setActiveMonth(startOfLocalMonth(parseLocalDateKey(dateKey)));
    setSelectedTransaction(null);
  }, [searchParams]);

  const goToMonth = (nextMonth: Date) => {
    const normalizedMonth = startOfLocalMonth(nextMonth);
    setActiveMonth(normalizedMonth);
    setSelectedTransaction(null);

    const monthStartKey = localDateKey(normalizedMonth);
    const isCurrentMonth = normalizedMonth.getFullYear() === today.getFullYear() && normalizedMonth.getMonth() === today.getMonth();
    setSelectedDateKey(isCurrentMonth ? todayKey : monthStartKey);
  };

  return (
    <div className="relative w-full min-w-0 space-y-5">
      <PageHeader
        eyebrow={t("nav.calendar")}
        icon={CalendarDays}
        title={t("nav.calendar")}
        description={t("calendar.subtitle") || "Review financial activity by date."}
        actions={
          <Button variant="secondary" onClick={() => goToMonth(today)}>
            <CalendarDays aria-hidden="true" size={17} />
            {t("common.today")}
          </Button>
        }
      />

      {isLoading && !monthData ? (
        <div className="mt-5">
          <CalendarSkeleton />
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-lg border border-kash-expense/30 bg-white p-4 text-sm shadow-sm">
          <p className="font-extrabold text-slate-900">{t("common.error")}</p>
          <p className="mt-1 font-semibold text-slate-600">{error}</p>
          <Button className="mt-4" variant="secondary" onClick={() => void loadMonth()}>
            {isLoading ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
            {t("common.retry")}
          </Button>
        </div>
      ) : null}

      {!error && monthData ? (
        <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => goToMonth(addMonths(activeMonth, -1))}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-kash-selected hover:text-kash-emerald focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
            >
              <ChevronLeft aria-hidden="true" size={18} />
            </button>
            <h2 className="min-w-44 text-center text-base font-extrabold text-slate-900">{formatMonthYear(activeMonth)}</h2>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => goToMonth(addMonths(activeMonth, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-kash-selected hover:text-kash-emerald focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
            >
              <ChevronRight aria-hidden="true" size={18} />
            </button>
          </div>

          <CalendarGrid
            activeMonth={activeMonth}
            monthData={monthData}
            selectedDateKey={selectedDateKey}
            todayKey={todayKey}
            onSelectDate={(dateKey) => {
              setSelectedDateKey(dateKey);
              setSelectedTransaction(null);
            }}
          />

          <SelectedDatePanel
            currency={currency}
            isLoading={isLoading}
            selectedDateKey={selectedDateKey}
            selectedSummary={selectedSummary}
            selectedTransactions={selectedTransactions}
            onSelectTransaction={setSelectedTransaction}
          />
        </section>
      ) : null}

      <TransactionDetailPanel
        currency={currency}
        isOpen={Boolean(selectedTransaction)}
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />
    </div>
  );
}
