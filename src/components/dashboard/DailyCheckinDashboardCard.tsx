import { Bell, BellOff, CheckCircle2, ChevronRight, Clock3, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../ui/Button";
import { PageCard } from "../ui/PageCard";
import { useI18n } from "../../i18n";
import {
  dismissDailyCheckinIntro,
  enableDailyCheckin,
  getDailyCheckinPreferences,
  getDailyCheckinSummary,
  getLocalDateKey,
  type DailyCheckinPreferences,
  type DailyCheckinSummary,
} from "../../lib/dailyCheckin";
import { getPushPermissionState, isPushSupported, subscribeCurrentDevice } from "../../lib/pushNotifications";

function previousDateKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return getLocalDateKey(date);
}

export function DailyCheckinDashboardCard() {
  const { t, formatCurrency } = useI18n();
  const [preferences, setPreferences] = useState<DailyCheckinPreferences | null>(null);
  const [today, setToday] = useState<DailyCheckinSummary | null>(null);
  const [yesterday, setYesterday] = useState<DailyCheckinSummary | null>(null);
  const [time, setTime] = useState("20:30");
  const [showSetup, setShowSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextPreferences = await getDailyCheckinPreferences();
      setPreferences(nextPreferences);
      setTime(nextPreferences.daily_checkin_time.slice(0, 5));
      if (nextPreferences.daily_checkin_enabled) {
        const [nextToday, nextYesterday] = await Promise.all([
          getDailyCheckinSummary(getLocalDateKey()),
          getDailyCheckinSummary(previousDateKey()),
        ]);
        setToday(nextToday);
        setYesterday(nextYesterday);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dismiss = async () => {
    setSaving(true);
    try { setPreferences(await dismissDailyCheckinIntro()); } finally { setSaving(false); }
  };

  const enable = async () => {
    setSaving(true);
    setPushMessage(null);
    try {
      const next = await enableDailyCheckin(time);
      setPreferences(next);
      setShowSetup(false);
      if (isPushSupported() && getPushPermissionState() === "default") {
        const result = await subscribeCurrentDevice();
        if (!result.success) setPushMessage(t("dailyCheckin.pushInactive") || "Push notification tidak aktif. Check-in tetap tersedia di KASH.");
      } else if (getPushPermissionState() === "denied") {
        setPushMessage(t("dailyCheckin.pushInactive") || "Push notification tidak aktif. Check-in tetap tersedia di KASH.");
      }
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageCard className="animate-pulse p-4"><div className="h-16 rounded-xl bg-slate-100" /></PageCard>;
  if (!preferences) return null;

  if (!preferences.daily_checkin_enabled && !preferences.daily_checkin_intro_seen) {
    return (
      <PageCard className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-kash-selected text-kash-emerald"><Bell size={19} /></span>
          <div className="min-w-0 flex-1"><h2 className="text-sm font-extrabold text-slate-900">{t("dailyCheckin.introTitle") || "Jangan lupa catat transaksi harian"}</h2><p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{t("dailyCheckin.introDesc") || "KASH bisa mengingatkan kamu untuk mengecek apakah semua transaksi hari ini sudah tercatat."}</p></div>
        </div>
        {showSetup ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs font-bold text-slate-700"><span className="mb-1.5 block">{t("dailyCheckin.reminderTime") || "Jam pengingat"}</span><input aria-label={t("dailyCheckin.reminderTime") || "Jam pengingat"} type="time" value={time} onChange={(event) => setTime(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-kash-emerald/30" /></label>
            <Button disabled={saving} onClick={() => void enable()}>{saving ? <Loader2 className="animate-spin" size={16} /> : null}{t("dailyCheckin.enable") || "Aktifkan"}</Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => setShowSetup(true)}>{t("dailyCheckin.enable") || "Aktifkan Daily Check-in"}</Button><Button disabled={saving} variant="ghost" onClick={() => void dismiss()}>{t("dailyCheckin.later") || "Nanti Saja"}</Button></div>
        )}
      </PageCard>
    );
  }

  if (!preferences.daily_checkin_enabled) return null;
  const todayComplete = today?.status === "reviewed" || today?.status === "no_spending";
  const yesterdayNeedsReview = yesterday?.status !== "reviewed" && yesterday?.status !== "no_spending";

  return (
    <PageCard className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${todayComplete ? "bg-kash-selected text-kash-emerald" : "bg-slate-100 text-slate-700"}`}>{todayComplete ? <CheckCircle2 size={19} /> : <Clock3 size={19} />}</span>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-extrabold text-slate-900">{t("dailyCheckin.title") || "Check-in Harian"}</h2><p className="mt-1 text-xs font-semibold text-slate-600">{todayComplete ? (t("dailyCheckin.completed") || "Hari ini sudah direview") : (t("dailyCheckin.todayNotReviewed") || "Hari ini belum direview")}</p></div>
        <Link to={`/daily-review?date=${getLocalDateKey()}`} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-kash-emerald hover:bg-kash-selected"><span>{t("dailyCheckin.reviewToday") || "Review Hari Ini"}</span><ChevronRight size={15} /></Link>
      </div>
      {!todayComplete && today ? <p className="mt-3 text-xs font-semibold text-slate-600">{t("dailyCheckin.summary", { count: today.transactionCount, amount: formatCurrency(today.totalExpense, today.currency) }) || `${today.transactionCount} transaksi · ${formatCurrency(today.totalExpense, today.currency)}`}</p> : null}
      {yesterdayNeedsReview && yesterday ? <Link to={`/daily-review?date=${previousDateKey()}`} className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-left transition hover:bg-kash-selected/60"><span><span className="block text-xs font-extrabold text-slate-800">{t("dailyCheckin.yesterdayNotReviewed") || "Kemarin belum direview"}</span><span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{t("dailyCheckin.summary", { count: yesterday.transactionCount, amount: formatCurrency(yesterday.totalExpense, yesterday.currency) }) || `${yesterday.transactionCount} transaksi · ${formatCurrency(yesterday.totalExpense, yesterday.currency)}`}</span></span><ChevronRight className="shrink-0 text-slate-400" size={16} /></Link> : null}
      {pushMessage ? <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><BellOff size={14} />{pushMessage}</p> : null}
    </PageCard>
  );
}
