import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";

const INCOME_COLOR = "#10B981";
const EXPENSE_COLOR = "#E50914";
const DAY_COLUMN_WIDTH = 40;

export type CashFlowPoint = {
  expense: number;
  income: number;
  key: string;
  label: string;
};

function todayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function axisTicks(scale: number) {
  return [scale, scale * 0.5, 0, -scale * 0.5, -scale];
}

export function CashFlowChart({
  currency,
  focusKey,
  points,
  variant,
}: {
  currency: string;
  focusKey?: string;
  points: CashFlowPoint[];
  variant: "compact" | "detailed";
}) {
  const { formatCompactCurrency, formatCurrency, t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const focusIndex = Math.max(0, points.findIndex((point) => point.key === (focusKey ?? todayKey())));
  const [visibleRange, setVisibleRange] = useState({ end: Math.min(points.length, 7), start: 0 });
  const [selectedKey, setSelectedKey] = useState(() => points[focusIndex]?.key ?? points[0]?.key ?? "");
  const compactStart = Math.min(Math.max(0, focusIndex - 3), Math.max(0, points.length - 7));
  const compactPoints = points.slice(compactStart, compactStart + 7);
  const visiblePoints = variant === "compact" ? compactPoints : points.slice(visibleRange.start, visibleRange.end);
  const scale = Math.max(1, ...visiblePoints.flatMap((point) => [point.income, point.expense]));
  const selectedPoint = points.find((point) => point.key === selectedKey) ?? points[0] ?? null;

  useEffect(() => {
    setSelectedKey(points[focusIndex]?.key ?? points[0]?.key ?? "");
    setVisibleRange({ end: Math.min(points.length, 7), start: 0 });
  }, [focusIndex, points]);

  useEffect(() => {
    if (variant !== "detailed") return;
    const scrollElement = scrollRef.current;
    if (!scrollElement || points.length === 0) return;

    window.requestAnimationFrame(() => {
      const visibleCount = Math.max(1, Math.ceil(scrollElement.clientWidth / DAY_COLUMN_WIDTH));
      const targetStart = Math.min(Math.max(0, focusIndex - Math.floor(visibleCount / 2)), Math.max(0, points.length - visibleCount));
      scrollElement.scrollLeft = targetStart * DAY_COLUMN_WIDTH;
      setVisibleRange({ start: targetStart, end: Math.min(points.length, targetStart + visibleCount) });
    });
  }, [focusIndex, points, variant]);

  useEffect(() => () => {
    if (scrollRafRef.current != null) window.cancelAnimationFrame(scrollRafRef.current);
  }, []);

  const handleScroll = useCallback(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    if (scrollRafRef.current != null) window.cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = window.requestAnimationFrame(() => {
      const start = Math.max(0, Math.floor(scrollElement.scrollLeft / DAY_COLUMN_WIDTH));
      const end = Math.min(points.length, start + Math.max(1, Math.ceil(scrollElement.clientWidth / DAY_COLUMN_WIDTH)));
      setVisibleRange((current) => current.start === start && current.end === end ? current : { start, end });
    });
  }, [points.length]);

  if (variant === "compact") {
    return (
      <div className="relative h-[116px] overflow-hidden">
        <div className="absolute inset-x-0 top-[42px] border-t border-slate-300" />
        <div className="grid h-full grid-cols-7 gap-1">
          {compactPoints.map((point) => {
            const incomeHeight = point.income > 0 ? Math.max(2, Math.round((point.income / scale) * 36)) : 0;
            const expenseHeight = point.expense > 0 ? Math.max(2, Math.round((point.expense / scale) * 36)) : 0;
            const isFocus = point.key === points[focusIndex]?.key;
            return (
              <div key={point.key} className="relative h-full text-center">
                <span className={`absolute inset-x-0 top-1 h-[82px] rounded-lg ${isFocus ? "bg-kash-emerald/10" : ""}`} />
                {point.income > 0 ? <span className="absolute bottom-[74px] left-1/2 w-2.5 -translate-x-1/2 rounded-t-sm bg-kash-emerald transition-[height] duration-300 ease-out" style={{ height: `${incomeHeight}px` }} /> : null}
                {point.expense > 0 ? <span className="absolute left-1/2 top-[42px] w-2.5 -translate-x-1/2 rounded-b-sm bg-[#E50914] transition-[height] duration-300 ease-out" style={{ height: `${expenseHeight}px` }} /> : null}
                <span className={`absolute inset-x-0 top-[94px] text-[10px] font-bold ${isFocus ? "text-slate-900" : "text-slate-500"}`}>{point.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 overflow-hidden">
      <div className="flex h-[214px] min-w-0 gap-2 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-2">
        <div className="relative h-[160px] w-12 shrink-0 text-right">
          {axisTicks(scale).map((tick, index) => <span key={index} className="absolute right-0 -translate-y-1/2 text-[9px] font-bold text-slate-500 sm:text-[10px]" style={{ top: `${index * 25}%` }}>{formatCompactCurrency(tick, currency)}</span>)}
        </div>
        <div ref={scrollRef} onScroll={handleScroll} className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="relative h-[198px]" style={{ width: `${Math.max(1, points.length) * DAY_COLUMN_WIDTH}px` }}>
            <div className="absolute inset-x-0 top-0 h-[160px]">
              {[0, 25, 50, 75, 100].map((position) => <div key={position} className={`absolute inset-x-0 border-t ${position === 50 ? "border-slate-300" : "border-dashed border-slate-200/70"}`} style={{ top: `${position}%` }} />)}
              {points.map((point, index) => {
                const isSelected = point.key === selectedPoint?.key;
                const isToday = point.key === todayKey();
                const incomeHeight = point.income > 0 ? Math.max(2, Math.round((point.income / scale) * 70)) : 0;
                const expenseHeight = point.expense > 0 ? Math.max(2, Math.round((point.expense / scale) * 70)) : 0;
                return <button key={point.key} type="button" onClick={() => setSelectedKey(point.key)} aria-pressed={isSelected} aria-label={`${point.label}: ${t("common.typeIncome") || "Income"} ${formatCurrency(point.income, currency)}, ${t("common.typeExpense") || "Expense"} ${formatCurrency(point.expense, currency)}`} className="absolute top-0 h-[198px] cursor-pointer" style={{ left: `${index * DAY_COLUMN_WIDTH}px`, width: `${DAY_COLUMN_WIDTH}px` }}>
                  <span className={`absolute inset-x-1 top-1 h-[158px] rounded-lg ${isSelected ? "bg-white/80" : isToday ? "bg-kash-emerald/10" : ""}`} />
                  {point.income > 0 ? <span className="absolute bottom-[118px] left-1/2 z-10 w-3 -translate-x-1/2 rounded-t-md bg-kash-emerald transition-[height] duration-300 ease-out" style={{ height: `${incomeHeight}px` }} /> : null}
                  {point.expense > 0 ? <span className="absolute left-1/2 top-[80px] z-10 w-3 -translate-x-1/2 rounded-b-md bg-[#E50914] transition-[height] duration-300 ease-out" style={{ height: `${expenseHeight}px` }} /> : null}
                  <span className={`absolute inset-x-0 top-[171px] truncate text-center text-[10px] font-bold ${isSelected || isToday ? "text-slate-900" : "text-slate-600"}`}>{point.label}</span>
                </button>;
              })}
            </div>
          </div>
        </div>
      </div>
      {selectedPoint ? <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-xs font-semibold text-slate-600"><span className="font-extrabold text-slate-900">{selectedPoint.label}</span><span>{t("common.typeIncome") || "Income"}: {formatCurrency(selectedPoint.income, currency)}</span><span>{t("common.typeExpense") || "Expense"}: {formatCurrency(selectedPoint.expense, currency)}</span><span>{t("dashboard.netCashFlow") || "Net"}: {formatCurrency(selectedPoint.income - selectedPoint.expense, currency)}</span></div> : null}
    </div>
  );
}
