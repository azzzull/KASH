import { supabase } from "./supabase";
import type { DailyCheckin, DailyCheckinStatus, Profile } from "../types/domain";

export type DailyCheckinPreferences = Pick<
  Profile,
  "daily_checkin_enabled" | "daily_checkin_time" | "daily_checkin_timezone" | "daily_checkin_intro_seen"
>;

export type DailyCheckinTransaction = {
  id: string;
  title: string;
  amount: string | number;
  transaction_date: string;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
};

export type DailyCheckinSummary = {
  transactions: DailyCheckinTransaction[];
  transactionCount: number;
  totalExpense: string | number;
  status: DailyCheckinStatus | null;
  reviewedAt: string | null;
  snoozedUntil: string | null;
  currency: string;
};

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidReviewDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function getDailyCheckinPreferences(): Promise<DailyCheckinPreferences> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("You need to be signed in.");

  const { data, error } = await supabase
    .from("profiles")
    .select("daily_checkin_enabled, daily_checkin_time, daily_checkin_timezone, daily_checkin_intro_seen")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return data;
}

export async function updateDailyCheckinPreferences(
  changes: Partial<DailyCheckinPreferences>,
): Promise<DailyCheckinPreferences> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("You need to be signed in.");

  const { data, error } = await supabase
    .from("profiles")
    .update("daily_checkin_time" in changes ? { ...changes, daily_checkin_timezone: browserTimezone() } : changes)
    .eq("id", user.id)
    .select("daily_checkin_enabled, daily_checkin_time, daily_checkin_timezone, daily_checkin_intro_seen")
    .single();
  if (error) throw error;
  return data;
}

export async function enableDailyCheckin(reminderTime: string) {
  return updateDailyCheckinPreferences({
    daily_checkin_enabled: true,
    daily_checkin_intro_seen: true,
    daily_checkin_time: reminderTime,
    daily_checkin_timezone: browserTimezone(),
  });
}

export async function dismissDailyCheckinIntro() {
  return updateDailyCheckinPreferences({ daily_checkin_intro_seen: true });
}

type DailySummaryRow = {
  transaction_id: string | null;
  title: string | null;
  amount: string | number | null;
  transaction_date: string | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  transaction_count: number | string;
  total_expense: string | number;
  review_status: DailyCheckinStatus | null;
  reviewed_at: string | null;
  snoozed_until: string | null;
  currency: string | null;
};

export async function getDailyCheckinSummary(reviewDate: string): Promise<DailyCheckinSummary> {
  const { data, error } = await supabase.rpc("get_daily_checkin_summary", { p_review_date: reviewDate });
  if (error) throw error;

  const rows = (data ?? []) as DailySummaryRow[];
  const first = rows[0];
  return {
    transactions: rows
      .filter((row) => Boolean(row.transaction_id))
      .map(({ transaction_id, title, amount, transaction_date, category_name, category_icon, category_color }) => ({
        id: transaction_id!,
        title: title ?? "Transaction",
        amount: amount ?? 0,
        transaction_date: transaction_date ?? "",
        category_name,
        category_icon,
        category_color,
      })),
    transactionCount: Number(first?.transaction_count ?? 0),
    totalExpense: first?.total_expense ?? 0,
    status: first?.review_status ?? null,
    reviewedAt: first?.reviewed_at ?? null,
    snoozedUntil: first?.snoozed_until ?? null,
    currency: first?.currency ?? "IDR",
  };
}

export async function completeDailyCheckin(
  reviewDate: string,
  status: Extract<DailyCheckinStatus, "reviewed" | "no_spending">,
) {
  const { data, error } = await supabase.rpc("complete_daily_checkin", {
    p_review_date: reviewDate,
    p_status: status,
  });
  if (error) throw error;
  return data as DailyCheckin;
}

export async function snoozeDailyCheckin(reviewDate: string, minutes = 60) {
  const { data, error } = await supabase.rpc("snooze_daily_checkin", {
    p_review_date: reviewDate,
    p_minutes: minutes,
  });
  if (error) throw error;
  return data as DailyCheckin;
}
