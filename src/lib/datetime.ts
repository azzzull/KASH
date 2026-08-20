/**
 * Centralized Date & Timezone Utilities for KASH
 * 
 * Ensures consistent serialization between local browser time and UTC timestamptz in Supabase.
 * Eliminates double-offset addition/subtraction and off-by-one date shifts on edit.
 */

function padZero(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Converts any ISO timestamp string or Date object into a local "YYYY-MM-DDTHH:mm"
 * string suitable for HTML datetime-local inputs and KASH DatePickerField.
 */
export function toLocalDatetimeInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = padZero(date.getMonth() + 1);
  const day = padZero(date.getDate());
  const hours = padZero(date.getHours());
  const minutes = padZero(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Converts any ISO timestamp string or Date object into a local "YYYY-MM-DD"
 * string suitable for date inputs.
 */
export function toLocalDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = padZero(date.getMonth() + 1);
  const day = padZero(date.getDate());

  return `${year}-${month}-${day}`;
}

/**
 * Converts a local datetime-local string ("YYYY-MM-DDTHH:mm" or "YYYY-MM-DD")
 * into a canonical UTC ISO string ("2026-08-20T07:30:00.000Z") for safe database storage.
 */
export function toUtcIsoString(localDatetimeStr: string | null | undefined): string {
  if (!localDatetimeStr || !localDatetimeStr.trim()) {
    return new Date().toISOString();
  }

  const str = localDatetimeStr.trim();

  // If already an ISO string with timezone indicator (Z or +07:00), parse directly
  if (str.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  // If format is "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split("-").map(Number);
    const date = new Date(y, m - 1, d, 12, 0, 0, 0); // midday local
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  // If format is "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss"
  const [datePart, timePart] = str.split("T");
  if (datePart && timePart) {
    const [y, m, d] = datePart.split("-").map(Number);
    const [hh, mm, ss] = timePart.split(":").map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0, 0);
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/**
 * Returns current local datetime in "YYYY-MM-DDTHH:mm" format.
 */
export function getCurrentLocalDatetimeString(): string {
  return toLocalDatetimeInputValue(new Date());
}

/**
 * Returns current local date in "YYYY-MM-DD" format.
 */
export function getCurrentLocalDateString(): string {
  return toLocalDateInputValue(new Date());
}
