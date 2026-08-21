import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { id } from "./locales/id";
import { en } from "./locales/en";
import {
  formatCurrency as baseFormatCurrency,
  formatCompactCurrency as baseFormatCompactCurrency,
  formatPercentage as baseFormatPercentage,
  formatNumber as baseFormatNumber,
  type MoneyInput,
} from "../lib/money";
import {
  formatDate as baseFormatDate,
  formatMonthYear as baseFormatMonthYear,
  formatTime as baseFormatTime,
} from "../lib/datetime";

export type Locale = "id" | "en";
export type TranslationKey = keyof typeof id;

const translations: Record<Locale, Record<string, string>> = { id, en };

const STORAGE_KEY = "kash.locale";

function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "id" || saved === "en") return saved;

    if (typeof navigator !== "undefined" && navigator.language) {
      if (navigator.language.toLowerCase().startsWith("id")) {
        return "id";
      }
    }
  } catch (err) {
    console.error("Failed to read locale from storage:", err);
  }
  return "id"; // Default to Indonesian
}

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  formatCurrency: (amount: MoneyInput, currency?: string) => string;
  formatCompactCurrency: (amount: MoneyInput, currency?: string) => string;
  formatPercentage: (value: number | string | null | undefined, decimals?: number) => string;
  formatNumber: (value: number | string | null | undefined) => string;
  formatDate: (date: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
  formatMonthYear: (date: string | Date | null | undefined) => string;
  formatTime: (date: string | Date | null | undefined) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
      document.documentElement.lang = newLocale;
    } catch (err) {
      console.error("Failed to save locale:", err);
    }
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useMemo(() => {
    return (key: TranslationKey, params?: Record<string, string | number>): string => {
      const dict = translations[locale] || translations.id;
      let text = dict[key] || translations.id[key] || key;

      if (params) {
        Object.entries(params).forEach(([paramKey, paramVal]) => {
          text = text.replace(new RegExp(`\\{+${paramKey}\\}+`, "g"), String(paramVal));
        });
      }

      // Safeguard: Strip any unpopulated placeholders (e.g. {{count}} or {var}) so raw braces never leak
      text = text.replace(/\{+[^}]+\}+/g, "").trim();

      return text;
    };
  }, [locale]);

  const formatCurrency = (amount: MoneyInput, currency = "IDR") =>
    baseFormatCurrency(amount, currency, locale);

  const formatCompactCurrency = (amount: MoneyInput, currency = "IDR") =>
    baseFormatCompactCurrency(amount, currency, locale);

  const formatPercentage = (value: number | string | null | undefined, decimals = 1) =>
    baseFormatPercentage(value, locale, decimals);

  const formatNumber = (value: number | string | null | undefined) =>
    baseFormatNumber(value, locale);

  const formatDate = (date: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions) =>
    baseFormatDate(date, locale, options);

  const formatMonthYear = (date: string | Date | null | undefined) =>
    baseFormatMonthYear(date, locale);

  const formatTime = (date: string | Date | null | undefined) =>
    baseFormatTime(date, locale);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      formatCurrency,
      formatCompactCurrency,
      formatPercentage,
      formatNumber,
      formatDate,
      formatMonthYear,
      formatTime,
    }),
    [locale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
