export type MoneyInput = string | number | null | undefined;

function normalizeMoneyInput(value: MoneyInput) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(Math.trunc(value)) : "";
  return value.trim();
}

export function parseMoneyInputDigits(value: MoneyInput) {
  const normalizedValue = normalizeMoneyInput(value);
  return normalizedValue.replace(/\D/g, "");
}

export function normalizeDatabaseMoney(value: MoneyInput) {
  const normalizedValue = normalizeMoneyInput(value);
  if (!normalizedValue) return "";

  const plainNumeric = normalizedValue.replace(",", ".");

  if (/^-?\d+(\.\d+)?$/.test(plainNumeric)) {
    return plainNumeric.split(".")[0].replace(/\D/g, "");
  }

  return parseMoneyInputDigits(normalizedValue);
}

export function parseMoneyDigits(value: MoneyInput) {
  return parseMoneyInputDigits(value);
}

export function formatMoneyDigits(value: MoneyInput, locale: "id" | "en" = "id") {
  const digits = parseMoneyInputDigits(value);
  if (!digits) return "";
  const intlLocale = locale === "id" ? "id-ID" : "en-US";
  return new Intl.NumberFormat(intlLocale).format(Number(digits));
}

export function formatDatabaseMoneyDigits(value: MoneyInput, locale: "id" | "en" = "id") {
  const digits = normalizeDatabaseMoney(value);
  if (!digits) return "";
  const intlLocale = locale === "id" ? "id-ID" : "en-US";
  return new Intl.NumberFormat(intlLocale).format(Number(digits));
}

export function formatCurrency(amount: MoneyInput, currency = "IDR", locale: "id" | "en" = "id") {
  const numericAmount = Number(amount ?? 0);

  if (!Number.isFinite(numericAmount)) {
    return `${currency === "IDR" ? "Rp" : currency} 0`;
  }

  if (currency === "IDR") {
    const isNegative = numericAmount < 0;
    const absVal = Math.abs(numericAmount);
    const formatted = new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
      maximumFractionDigits: 0,
    }).format(absVal);
    return isNegative ? `-Rp${formatted}` : `Rp${formatted}`;
  }

  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
    currency,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(numericAmount);
}

export function formatCompactCurrency(amount: MoneyInput, currency = "IDR", locale: "id" | "en" = "id") {
  const num = Number(amount ?? 0);
  if (!Number.isFinite(num)) return "Rp0";

  const isNegative = num < 0;
  const absNum = Math.abs(num);

  if (currency === "IDR") {
    let formatted = "";
    if (absNum >= 1_000_000_000) {
      const val = (absNum / 1_000_000_000).toFixed(1).replace(/\.0$/, "");
      const localizedVal = locale === "id" ? val.replace(".", ",") : val;
      formatted = `Rp${localizedVal} ${locale === "id" ? "miliar" : "B"}`;
    } else if (absNum >= 1_000_000) {
      const val = (absNum / 1_000_000).toFixed(1).replace(/\.0$/, "");
      const localizedVal = locale === "id" ? val.replace(".", ",") : val;
      formatted = `Rp${localizedVal} ${locale === "id" ? "jt" : "M"}`;
    } else if (absNum >= 1_000) {
      const val = (absNum / 1_000).toFixed(1).replace(/\.0$/, "");
      const localizedVal = locale === "id" ? val.replace(".", ",") : val;
      formatted = `Rp${localizedVal} ${locale === "id" ? "rb" : "K"}`;
    } else {
      formatted = `Rp${absNum}`;
    }
    return isNegative ? `-${formatted}` : formatted;
  }

  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
    currency,
    notation: "compact",
    style: "currency",
  }).format(num);
}

export function formatPercentage(value: number | string | null | undefined, locale: "id" | "en" = "id", decimals = 1) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0%";
  const formatted = num.toFixed(decimals).replace(/\.0+$/, "");
  return locale === "id" ? `${formatted.replace(".", ",")}%` : `${formatted}%`;
}

export function formatNumber(value: number | string | null | undefined, locale: "id" | "en" = "id") {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US").format(num);
}

export function toNumber(amount: MoneyInput) {
  const numericAmount = Number(amount ?? 0);
  return Number.isFinite(numericAmount) ? numericAmount : 0;
}

export function toWholeMoneyUnits(value: MoneyInput) {
  const normalizedValue = normalizeMoneyInput(value);
  if (!normalizedValue) return 0n;

  const sign = normalizedValue.startsWith("-") ? -1n : 1n;
  const unsignedValue = normalizedValue.replace(/^-/, "");
  const plainNumeric = unsignedValue.replace(",", ".");

  if (/^\d+(\.\d+)?$/.test(plainNumeric)) {
    const wholeUnits = plainNumeric.split(".")[0] || "0";
    return sign * BigInt(wholeUnits);
  }

  const digits = unsignedValue.replace(/\D/g, "");
  return sign * BigInt(digits || "0");
}

export function addMoneyValues(...values: MoneyInput[]) {
  return values.reduce((total, value) => total + toWholeMoneyUnits(value), 0n).toString();
}

export function isMoneyGreaterThan(left: MoneyInput, right: MoneyInput) {
  return toWholeMoneyUnits(left) > toWholeMoneyUnits(right);
}
