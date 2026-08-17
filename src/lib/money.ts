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

export function formatMoneyDigits(value: MoneyInput) {
  const digits = parseMoneyInputDigits(value);
  if (!digits) return "";
  return new Intl.NumberFormat("id-ID").format(Number(digits));
}

export function formatDatabaseMoneyDigits(value: MoneyInput) {
  const digits = normalizeDatabaseMoney(value);
  if (!digits) return "";
  return new Intl.NumberFormat("id-ID").format(Number(digits));
}

export function formatCurrency(amount: MoneyInput, currency = "IDR") {
  const numericAmount = Number(amount ?? 0);

  if (!Number.isFinite(numericAmount)) {
    return `${currency} ${amount ?? 0}`;
  }

  return new Intl.NumberFormat("id-ID", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(numericAmount);
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
