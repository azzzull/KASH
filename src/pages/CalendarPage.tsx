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
import { appEvents } from "../lib/appEvents";
import { useAppEvent } from "../hooks/useAppEvent";
import { useI18n } from "../i18n";
import type { TransactionWithMeta } from "../lib/transactions";
import { TransactionDetailPanel } from "../components/transactions/TransactionDetailPanel";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { UpcomingTimeline } from "../components/financial/UpcomingTimeline";
import { getRecurringObligations, type RecurringObligationWithMeta } from "../lib/subscriptions";
import { TransactionRow } from "../components/transactions/TransactionRow";

const activityOrder = ["income", "expense", "transfer", "adjustment"] as const;
const activityDotClass = {
  adjustment: "bg-slate-600",
  expense: "bg-[#E50914]",
  income: "bg-kash-emerald",
  transfer: "bg-kash-transfer",
};

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
  obligations,
  onSelectDate,
  selectedDateKey,
  todayKey,
}: {
  activeMonth: Date;
  monthData: CalendarMonthData;
  obligations: RecurringObligationWithMeta[];
  onSelectDate: (dateKey: string) => void;
  selectedDateKey: string;
  todayKey: string;
}) {
  const { locale, formatDate, t } = useI18n();
  const calendarCells = useMemo(() => buildCalendarCells(activeMonth), [activeMonth]);
  const obligationDates = useMemo(() => new Set(obligations.filter((item) => item.status === "active").map((item) => (item.currentPayment?.due_date ?? item.next_due_date)?.slice(0, 10)).filter((dateKey): dateKey is string => Boolean(dateKey))), [obligations]);
  const weekdays = useMemo(() => {
    return locale === "id" ? ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  }, [locale]);

  return (
    <>
      <div
        className="mt-4 grid gap-0.5 text-center text-[10px] font-extrabold uppercase text-slate-600 md:gap-1"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {weekdays.map((weekday) => (
          <div key={weekday} className="py-0.5">
            {weekday}
          </div>
        ))}
      </div>

      <div
        className="mt-1 grid gap-0.5 md:gap-1"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {calendarCells.map((cell) => {
          const dayData = monthData.days.get(cell.dateKey);
          const isSelected = selectedDateKey === cell.dateKey;
          const isToday = todayKey === cell.dateKey;
          const dayNumber = cell.date.getDate();
          const hasObligation = obligationDates.has(cell.dateKey);
          const selectedDateLabel = formatDate(parseLocalDateKey(cell.dateKey));

          return (
            <button
              key={cell.dateKey}
              type="button"
              aria-label={`${selectedDateLabel}${dayData ? `, ${dayData.summary.transactionCount} transactions` : ""}`}
              aria-pressed={isSelected}
              onClick={() => onSelectDate(cell.dateKey)}
              className={`flex min-h-[52px] flex-col items-center justify-start gap-1 rounded-lg border border-transparent bg-white p-1 text-sm transition focus:outline-none focus:ring-2 focus:ring-kash-emerald/20 md:min-h-[58px] md:p-1.5 ${isSelected ? "bg-kash-selected/45" : "hover:bg-slate-50"} ${cell.isCurrentMonth ? "" : "text-slate-400"}`}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-full font-extrabold transition ${isSelected ? "bg-kash-emerald text-white shadow-sm" : isToday ? "text-kash-emerald ring-1 ring-kash-emerald/60 ring-offset-1" : cell.isCurrentMonth ? "text-slate-800" : "text-slate-400"}`}>
                {dayNumber}
              </span>
              <span className="flex min-h-1.5 items-center gap-1" aria-hidden="true">
                {dayData?.summary.income ? <span className="h-1.5 w-1.5 rounded-full bg-kash-emerald" /> : null}
                {dayData?.summary.expense ? <span className="h-1.5 w-1.5 rounded-full bg-[#E50914]" /> : null}
                {hasObligation ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-center gap-4 text-[10px] font-bold text-slate-500">
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-kash-emerald" />{t("transactions.income") || "Income"}</span>
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#E50914]" />{t("transactions.expense") || "Expense"}</span>
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{t("subscriptions.tabDueSoon") || "Due"}</span>
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
  upcomingObligations,
}: {
  currency: string;
  isLoading: boolean;
  onSelectTransaction: (transaction: TransactionWithMeta) => void;
  selectedDateKey: string;
  selectedSummary: ReturnType<typeof calculateDaySummary>;
  selectedTransactions: TransactionWithMeta[];
  upcomingObligations: RecurringObligationWithMeta[];
}) {
  const { t, formatDate, formatCurrency } = useI18n();
  const formattedDate = formatDate(parseLocalDateKey(selectedDateKey));

  return (
    <section className="mt-5 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-extrabold text-slate-900">{formattedDate}</h2>
          {isLoading ? <Loader2 aria-hidden="true" className="animate-spin text-slate-400" size={15} /> : null}
        </div>
        <span className={`shrink-0 text-xs font-extrabold ${selectedSummary.net >= 0 ? "text-kash-emeraldDark" : "text-kash-expense"}`}>
          {selectedSummary.transactionCount > 0 ? `${selectedSummary.net >= 0 ? "+" : ""}${formatCurrency(selectedSummary.net, currency)}` : (t("dashboard.noData") || "No activity")}
        </span>
      </div>
      {selectedSummary.transactionCount > 0 ? <p className="mt-1 text-xs font-semibold text-slate-500">{selectedSummary.transactionCount} {t("nav.transactions") || "transactions"}</p> : null}

      <div className="mt-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">{t("nav.transactions") || "Transaksi Hari Ini"}</h3>

        {selectedTransactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
            <ReceiptText className="mx-auto text-slate-400" size={24} />
            <p className="mt-2 text-xs font-extrabold text-slate-700">{t("calendar.noTransactions") || "Tidak ada transaksi pada tanggal ini."}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{t("dashboard.noTransactionsDesc") || "Tanggal yang memiliki aktivitas transaksi ditandai pada kalender."}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 px-1">
            {selectedTransactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                currency={currency}
                transaction={transaction}
                density="compact"
                onSelect={() => onSelectTransaction(transaction)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">{t("subscriptions.tabDueSoon") || "Upcoming"}</h3>
        <UpcomingTimeline currency={currency} emptyClassName="min-h-20" items={upcomingObligations} selectedDateKey={selectedDateKey} />
      </div>
    </section>
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
  const [upcomingObligations, setUpcomingObligations] = useState<RecurringObligationWithMeta[]>([]);
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

  useEffect(() => {
    let isMounted = true;
    void getRecurringObligations().then(({ data }) => {
      if (isMounted) setUpcomingObligations(data);
    });
    return () => { isMounted = false; };
  }, []);

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
    <div className="relative w-full min-w-0 space-y-4">
      <PageHeader
        eyebrow={t("nav.calendar") || "Kalender"}
        icon={CalendarDays}
        title={t("nav.calendar") || "Kalender Keuangan"}
        description={t("calendar.subtitle") || "Lihat aktivitas dan jadwal transaksi dalam tampilan bulanan."}
      />

      {isLoading && !monthData ? (
        <div className="mt-4">
          <CalendarSkeleton />
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-kash-expense/30 bg-white p-5 text-sm shadow-xs">
          <p className="font-extrabold text-slate-900">{t("common.error")}</p>
          <p className="mt-1 font-semibold text-slate-600">{error}</p>
          <Button className="mt-4" variant="secondary" onClick={() => void loadMonth()}>
            {isLoading ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
            {t("common.retry")}
          </Button>
        </div>
      ) : null}

      {!error && monthData ? (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => goToMonth(addMonths(activeMonth, -1))}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-kash-selected hover:text-kash-emerald focus:outline-none focus:ring-4 focus:ring-kash-emerald/20 shrink-0"
            >
              <ChevronLeft aria-hidden="true" size={18} />
            </button>
            <h2 className="min-w-32 text-center text-base font-extrabold text-slate-900">{formatMonthYear(activeMonth)}</h2>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => goToMonth(addMonths(activeMonth, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-kash-selected hover:text-kash-emerald focus:outline-none focus:ring-4 focus:ring-kash-emerald/20 shrink-0"
            >
              <ChevronRight aria-hidden="true" size={18} />
            </button>
            <button type="button" onClick={() => goToMonth(today)} className="ml-1 shrink-0 px-1 text-xs font-extrabold text-kash-emerald transition hover:text-kash-emeraldDark focus:outline-none focus:ring-2 focus:ring-kash-emerald/20">
              {t("common.today") || "Today"}
            </button>
          </div>

          <CalendarGrid
            activeMonth={activeMonth}
            monthData={monthData}
            obligations={upcomingObligations}
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
            upcomingObligations={upcomingObligations}
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
