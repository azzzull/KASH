import type { ReportPeriod, ReportPeriodPreset } from "../types/reports";

export function localDateKey(year: number, month: number, day: number) {
  const date = new Date(year, month, day);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]); const month = Number(match[2]) - 1; const day = Number(match[3]);
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
}

export function addLocalDays(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  date.setDate(date.getDate() + days);
  return localDateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Converts a local calendar boundary to the UTC timestamp required by timestamptz queries. */
export function localCalendarStartToUtc(dateKey: string) {
  const date = parseDateKey(dateKey);
  return date ? date.toISOString() : dateKey;
}

export function reportQueryRange(period: ReportPeriod) {
  return { start: localCalendarStartToUtc(period.start), endExclusive: localCalendarStartToUtc(addLocalDays(period.end, 1)) };
}

export function createReportPeriod(args: { preset: ReportPeriodPreset; year: number; month?: number; from?: string; until?: string; label: string }): ReportPeriod {
  const { preset, year, month = 0, from, until, label } = args;
  if (preset === "custom_range") {
    const start = parseDateKey(from ?? "") ? from! : localDateKey(year, month, 1);
    const end = parseDateKey(until ?? "") ? until! : localDateKey(year, month + 1, 0);
    return { preset, start, end: end < start ? start : end, label };
  }
  if (preset === "this_year") return { preset, start: localDateKey(year, 0, 1), end: localDateKey(year, 11, 31), label, year };
  return { preset, start: localDateKey(year, month, 1), end: localDateKey(year, month + 1, 0), label, month, year };
}
