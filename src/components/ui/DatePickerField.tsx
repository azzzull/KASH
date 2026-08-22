import React, { useEffect, useMemo, useRef, useState } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Calendar as CalendarIcon, Check, ChevronDown, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useI18n } from "../../i18n";
import { autoScrollFieldIntoContainer } from "./SelectField";

type DatePickerFieldProps = {
  id?: string;
  label?: string;
  value: string; // "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"
  onChange: (value: string) => void;
  enableTime?: boolean;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => padZero(i));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => padZero(i));

function padZero(n: number): string {
  return String(n).padStart(2, "0");
}

function parseDateTime(dateStr: string) {
  if (!dateStr) {
    const now = new Date();
    return {
      dateStr: `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`,
      hours: padZero(now.getHours()),
      minutes: padZero(now.getMinutes()),
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
    };
  }

  // If dateStr contains timezone info (Z or +/- offset), convert to local Date first
  if (dateStr.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return {
        dateStr: `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`,
        hours: padZero(d.getHours()),
        minutes: padZero(d.getMinutes()),
        year: d.getFullYear(),
        month: d.getMonth(),
        day: d.getDate(),
      };
    }
  }

  const [datePart, timePart] = dateStr.split("T");
  const [y, m, d] = (datePart || "").split("-").map(Number);
  const [hh, mm] = (timePart || "").split(":").map(Number);

  const now = new Date();
  const year = isNaN(y) ? now.getFullYear() : y;
  const month = isNaN(m) ? now.getMonth() : m - 1;
  const day = isNaN(d) ? now.getDate() : d;
  const hours = isNaN(hh) ? padZero(now.getHours()) : padZero(hh);
  const minutes = isNaN(mm) ? padZero(now.getMinutes()) : padZero(mm);

  return {
    dateStr: `${year}-${padZero(month + 1)}-${padZero(day)}`,
    hours,
    minutes,
    year,
    month,
    day,
  };
}

function formatDisplayString(valueStr: string, enableTime: boolean, locale: "id" | "en" = "id"): string {
  if (!valueStr) return enableTime ? (locale === "id" ? "Pilih Tanggal & Jam" : "Select Date & Time") : (locale === "id" ? "Pilih Tanggal" : "Select Date");
  const parsed = parseDateTime(valueStr);
  const monthNames = locale === "id" ? MONTH_NAMES_ID : MONTH_NAMES_EN;
  const monthName = monthNames[parsed.month] || "";
  const dateFormatted = locale === "id"
    ? `${parsed.day} ${monthName} ${parsed.year}`
    : `${monthName} ${parsed.day}, ${parsed.year}`;
  if (!enableTime) return dateFormatted;
  return `${dateFormatted}, ${parsed.hours}:${parsed.minutes}`;
}

function TimeDropdown({
  ariaLabel,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  onChange: (val: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <Listbox value={value} onChange={onChange}>
      <div className="relative">
        <ListboxButton
          aria-label={ariaLabel}
          className="group flex h-8 items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-900 transition hover:border-kash-emerald/50 hover:bg-kash-selected/40 focus:border-kash-emerald focus:outline-none focus:ring-2 focus:ring-[rgba(16,185,129,0.20)]"
        >
          <span>{value}</span>
          <ChevronDown size={13} className="text-slate-600 transition group-data-[open]:rotate-180" />
        </ListboxButton>

        <ListboxOptions className="absolute z-60 bottom-full mb-1.5 max-h-48 w-18 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-soft focus:outline-none">
          {options.map((opt) => (
            <ListboxOption
              key={opt}
              value={opt}
              className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold text-slate-700 transition data-[active]:bg-kash-selected data-[active]:text-kash-emerald data-[selected]:font-black data-[selected]:text-kash-emeraldDark"
            >
              <span>{opt}</span>
              <Check className="hidden group-data-[selected]:block text-kash-emerald" size={12} />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}

export function DatePickerField({
  className = "",
  disabled = false,
  enableTime = false,
  id,
  label,
  max,
  min,
  onChange,
  placeholder,
  required = false,
  value,
}: DatePickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const parsedValue = useMemo(() => parseDateTime(value), [value]);

  // Calendar navigation month/year
  const [viewYear, setViewYear] = useState(() => parsedValue.year);
  const [viewMonth, setViewMonth] = useState(() => parsedValue.month);

  // Time state
  const [selectedHours, setSelectedHours] = useState(() => parsedValue.hours);
  const [selectedMinutes, setSelectedMinutes] = useState(() => parsedValue.minutes);

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sync internal state when external value changes
  useEffect(() => {
    if (value) {
      const p = parseDateTime(value);
      setViewYear(p.year);
      setViewMonth(p.month);
      setSelectedHours(p.hours);
      setSelectedMinutes(p.minutes);
    }
  }, [value]);

  // Auto-scroll into view when opened
  useEffect(() => {
    if (isOpen && containerRef.current) {
      autoScrollFieldIntoContainer(containerRef.current);
    }
  }, [isOpen]);

  // Click outside to close
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

  const handleSelectDay = (dayDateStr: string) => {
    if (enableTime) {
      const nextVal = `${dayDateStr}T${selectedHours}:${selectedMinutes}`;
      onChange(nextVal);
    } else {
      onChange(dayDateStr);
      setIsOpen(false);
    }
  };

  const handleHourChange = (newHours: string) => {
    setSelectedHours(newHours);
    const currentDatePart = parsedValue.dateStr;
    onChange(`${currentDatePart}T${newHours}:${selectedMinutes}`);
  };

  const handleMinuteChange = (newMinutes: string) => {
    setSelectedMinutes(newMinutes);
    const currentDatePart = parsedValue.dateStr;
    onChange(`${currentDatePart}T${selectedHours}:${newMinutes}`);
  };

  const handleSetNow = () => {
    const now = new Date();
    const dStr = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`;
    const hStr = padZero(now.getHours());
    const mStr = padZero(now.getMinutes());
    setSelectedHours(hStr);
    setSelectedMinutes(mStr);
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());

    if (enableTime) {
      onChange(`${dStr}T${hStr}:${mStr}`);
    } else {
      onChange(dStr);
    }
    setIsOpen(false);
  };

  // Generate 42 calendar grid cells (6 weeks)
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

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`;
    const currentDatePart = parsedValue.dateStr;

    // Previous month trailing days
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dStr = `${prevYear}-${padZero(prevMonth + 1)}-${padZero(d)}`;
      cells.push({
        dateStr: dStr,
        day: d,
        isCurrentMonth: false,
        isSelected: dStr === currentDatePart && Boolean(value),
        isToday: dStr === todayStr,
        isDisabled: (Boolean(min) && dStr < (min ?? "")) || (Boolean(max) && dStr > (max ?? "")),
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${viewYear}-${padZero(viewMonth + 1)}-${padZero(d)}`;
      cells.push({
        dateStr: dStr,
        day: d,
        isCurrentMonth: true,
        isSelected: dStr === currentDatePart && Boolean(value),
        isToday: dStr === todayStr,
        isDisabled: (Boolean(min) && dStr < (min ?? "")) || (Boolean(max) && dStr > (max ?? "")),
      });
    }

    // Next month padding to reach full rows
    const remaining = (7 - (cells.length % 7)) % 7;
    const totalNeeded = cells.length + remaining < 35 ? 35 : cells.length + remaining;
    const nextPadding = totalNeeded - cells.length;

    for (let d = 1; d <= nextPadding; d++) {
      const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dStr = `${nextYear}-${padZero(nextMonth + 1)}-${padZero(d)}`;
      cells.push({
        dateStr: dStr,
        day: d,
        isCurrentMonth: false,
        isSelected: dStr === currentDatePart && Boolean(value),
        isToday: dStr === todayStr,
        isDisabled: (Boolean(min) && dStr < (min ?? "")) || (Boolean(max) && dStr > (max ?? "")),
      });
    }

    return cells;
  }, [viewYear, viewMonth, parsedValue.dateStr, value, min, max]);

  let locale: "id" | "en" = "id";
  try {
    const i18n = useI18n();
    locale = i18n.locale;
  } catch {}

  const monthNames = locale === "id" ? MONTH_NAMES_ID : MONTH_NAMES_EN;
  const dayNames = locale === "id" ? DAY_NAMES_ID : DAY_NAMES_EN;
  const defaultPlaceholder = enableTime ? (locale === "id" ? "Pilih Tanggal & Jam" : "Select Date & Time") : (locale === "id" ? "Pilih Tanggal" : "Select Date");

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
          {value ? formatDisplayString(value, enableTime, locale) : (placeholder || defaultPlaceholder)}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 text-slate-600 group-hover:text-kash-emerald">
          {enableTime && <Clock size={16} className={isOpen ? "text-kash-emerald" : ""} />}
          <CalendarIcon size={18} className={isOpen ? "text-kash-emerald" : ""} />
        </div>
      </button>

      {/* Popover Calendar Container */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-100 sm:w-80"
        >
          {/* Month/Year Navigation Header */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
              aria-label="Previous Month"
            >
              <ChevronLeft size={18} />
            </button>

            <span className="text-sm font-extrabold text-slate-900">
              {monthNames[viewMonth]} {viewYear}
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

          {/* Day of Week Headers */}
          <div className="mt-2 grid grid-cols-7 gap-1 text-center">
            {dayNames.map((name, i) => (
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

          {/* Standardized Custom Time Picker Section (Jam & Menit) */}
          {enableTime && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Clock size={14} className="text-kash-emerald" />
                  {locale === "id" ? "Waktu:" : "Time:"}
                </span>

                <div className="flex items-center gap-1.5">
                  {/* Hours Dropdown */}
                  <TimeDropdown
                    ariaLabel={locale === "id" ? "Pilih Jam" : "Select Hour"}
                    value={selectedHours}
                    options={HOUR_OPTIONS}
                    onChange={handleHourChange}
                  />

                  <span className="text-xs font-black text-slate-700">:</span>

                  {/* Minutes Dropdown */}
                  <TimeDropdown
                    ariaLabel={locale === "id" ? "Pilih Menit" : "Select Minute"}
                    value={selectedMinutes}
                    options={MINUTE_OPTIONS}
                    onChange={handleMinuteChange}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions Footer */}
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
            <button
              type="button"
              onClick={handleSetNow}
              className="font-bold text-kash-emerald hover:text-kash-emeraldDark transition"
            >
              {enableTime ? (locale === "id" ? "Sekarang" : "Now") : (locale === "id" ? "Hari Ini" : "Today")}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-1 rounded-md bg-kash-emerald px-2.5 py-1 font-bold text-white shadow-sm hover:bg-kash-emeraldDark transition"
            >
              <Check size={13} />
              {locale === "id" ? "Selesai" : "Done"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
