import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type DatePickerFieldProps = {
  id?: string;
  label?: string;
  value: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

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

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "Pilih Tanggal";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const monthName = MONTH_NAMES[m - 1] || "";
  return `${d} ${monthName} ${y}`;
}

function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function formatDateString(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function DatePickerField({
  className = "",
  disabled = false,
  id,
  label,
  max,
  min,
  onChange,
  placeholder = "Pilih Tanggal",
  required = false,
  value,
}: DatePickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedDate = useMemo(() => parseDate(value), [value]);

  // View state for month navigation
  const [viewYear, setViewYear] = useState(() => selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => selectedDate.getMonth());

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync view month/year when selected value changes
  useEffect(() => {
    if (value) {
      const d = parseDate(value);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (dayStr: string) => {
    onChange(dayStr);
    setIsOpen(false);
  };

  const handleToday = () => {
    const today = new Date();
    const todayStr = formatDateString(today.getFullYear(), today.getMonth(), today.getDate());
    onChange(todayStr);
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setIsOpen(false);
  };

  // Generate calendar grid cells (42 cells: 6 weeks)
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun, 1 = Mon...
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: Array<{
      dateStr: string;
      day: number;
      isCurrentMonth: boolean;
      isSelected: boolean;
      isToday: boolean;
      isDisabled: boolean;
    }> = [];

    const todayStr = formatDateString(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

    // Previous month padding
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dStr = formatDateString(prevYear, prevMonth, d);
      cells.push({
        dateStr: dStr,
        day: d,
        isCurrentMonth: false,
        isSelected: dStr === value,
        isToday: dStr === todayStr,
        isDisabled: (Boolean(min) && dStr < (min ?? "")) || (Boolean(max) && dStr > (max ?? "")),
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = formatDateString(viewYear, viewMonth, d);
      cells.push({
        dateStr: dStr,
        day: d,
        isCurrentMonth: true,
        isSelected: dStr === value,
        isToday: dStr === todayStr,
        isDisabled: (Boolean(min) && dStr < (min ?? "")) || (Boolean(max) && dStr > (max ?? "")),
      });
    }

    // Next month padding to reach 42 cells or full weeks
    const remaining = (7 - (cells.length % 7)) % 7;
    const totalNeeded = cells.length + remaining < 35 ? 35 : cells.length + remaining;
    const nextPadding = totalNeeded - cells.length;

    for (let d = 1; d <= nextPadding; d++) {
      const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dStr = formatDateString(nextYear, nextMonth, d);
      cells.push({
        dateStr: dStr,
        day: d,
        isCurrentMonth: false,
        isSelected: dStr === value,
        isToday: dStr === todayStr,
        isDisabled: (Boolean(min) && dStr < (min ?? "")) || (Boolean(max) && dStr > (max ?? "")),
      });
    }

    return cells;
  }, [viewYear, viewMonth, value, min, max]);

  return (
    <div ref={containerRef} className={`relative block w-full max-w-full min-w-0 ${className}`}>
      {label && <span className="block text-sm font-bold text-slate-900">{label}</span>}

      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`group mt-2 flex h-12 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 text-left text-base font-semibold text-slate-900 transition hover:border-kash-emerald/50 hover:bg-kash-selected/40 focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-[rgba(16,185,129,0.20)] disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-600 md:text-sm ${
          isOpen ? "border-kash-emerald ring-4 ring-[rgba(16,185,129,0.20)]" : ""
        }`}
      >
        <span className={`truncate ${value ? "text-slate-900" : "text-slate-600"}`}>
          {value ? formatDisplayDate(value) : placeholder}
        </span>
        <CalendarIcon
          size={18}
          className={`shrink-0 transition ${isOpen ? "text-kash-emerald" : "text-slate-600 group-hover:text-kash-emerald"}`}
        />
      </button>

      {/* Custom Popover Calendar */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-100 sm:w-80">
          {/* Header Month / Year Nav */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
              aria-label="Previous Month"
            >
              <ChevronLeft size={18} />
            </button>

            <span className="text-sm font-extrabold text-slate-900">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>

            <button
              type="button"
              onClick={handleNextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
              aria-label="Next Month"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Day of week headers */}
          <div className="mt-2 grid grid-cols-7 gap-1 text-center">
            {DAY_NAMES.map((name, i) => (
              <span
                key={name}
                className={`text-[11px] font-bold ${i === 0 ? "text-kash-expense" : "text-slate-600"}`}
              >
                {name}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarCells.map((cell) => {
              const isSelected = cell.isSelected;
              const isCurrent = cell.isCurrentMonth;
              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  disabled={cell.isDisabled}
                  onClick={() => handleSelectDay(cell.dateStr)}
                  className={`relative flex h-8 w-full items-center justify-center rounded-lg text-xs font-bold transition ${
                    isSelected
                      ? "bg-kash-emerald text-white shadow-sm font-black"
                      : isCurrent
                      ? "text-slate-800 hover:bg-kash-selected hover:text-kash-emeraldDark"
                      : "text-slate-600 hover:bg-slate-50"
                  } ${cell.isDisabled ? "opacity-30 cursor-not-allowed" : ""}`}
                >
                  {cell.day}
                  {cell.isToday && !isSelected && (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-kash-emerald" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Actions Footer */}
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
            <button
              type="button"
              onClick={handleToday}
              className="font-bold text-kash-emerald hover:text-kash-emeraldDark transition"
            >
              Hari Ini (Today)
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="font-bold text-slate-600 hover:text-slate-800 transition"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
