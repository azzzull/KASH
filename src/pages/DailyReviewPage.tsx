import { BellRing, CheckCircle2, ChevronLeft, Loader2, Plus, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { TransactionModal } from "../components/transactions/TransactionModal";
import { Button } from "../components/ui/Button";
import { PageCard } from "../components/ui/PageCard";
import { PageHeader } from "../components/ui/PageHeader";
import { useActiveSpace } from "../context/ActiveSpaceContext";
import { useI18n } from "../i18n";
import { appEvents } from "../lib/appEvents";
import {
  completeDailyCheckin,
  getDailyCheckinSummary,
  getLocalDateKey,
  isValidReviewDate,
  snoozeDailyCheckin,
  type DailyCheckinSummary,
} from "../lib/dailyCheckin";
import { formatDate } from "../lib/datetime";
import { useAppEvent } from "../hooks/useAppEvent";

function isCompleted(status: DailyCheckinSummary["status"]) {
  return status === "reviewed" || status === "no_spending";
}

export function DailyReviewPage() {
  const { t, locale, formatCurrency } = useI18n();
  const { personalSpace } = useActiveSpace();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reviewDate = useMemo(() => {
    const requested = searchParams.get("date");
    const today = getLocalDateKey();
    return isValidReviewDate(requested) && requested <= today ? requested : today;
  }, [searchParams]);
  const [summary, setSummary] = useState<DailyCheckinSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"reviewed" | "no_spending" | "snooze" | null>(null);
  const [showTransactionForm, setShowTransactionForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await getDailyCheckinSummary(reviewDate));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : (t("common.error") || "Gagal memuat review harian."));
    } finally {
      setLoading(false);
    }
  }, [reviewDate, t]);

  useEffect(() => { void load(); }, [load]);
  useAppEvent(appEvents.transactionSaved, () => void load());

  const complete = async (status: "reviewed" | "no_spending") => {
    setSaving(status);
    setError(null);
    try {
      await completeDailyCheckin(reviewDate, status);
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : (t("common.error") || "Gagal menyimpan review."));
    } finally {
      setSaving(null);
    }
  };

  const snooze = async () => {
    setSaving("snooze");
    setError(null);
    try {
      await snoozeDailyCheckin(reviewDate);
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : (t("common.error") || "Gagal mengatur pengingat."));
    } finally {
      setSaving(null);
    }
  };

  const dateLabel = formatDate(`${reviewDate}T12:00:00`, locale);
  const completed = isCompleted(summary?.status ?? null);
  const isToday = reviewDate === getLocalDateKey();

  return (
    <div className="w-full min-w-0 space-y-4">
      <PageHeader
        eyebrow={t("dailyCheckin.eyebrow") || "Daily Check-in"}
        icon={BellRing}
        title={isToday ? (t("dailyCheckin.reviewToday") || "Review Hari Ini") : (t("dailyCheckin.reviewDate") || "Review Hari")}
        description={dateLabel}
        actions={<Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}><ChevronLeft size={16} />{t("common.back") || "Kembali"}</Button>}
      />

      <PageCard className="p-4 sm:p-5">
        {loading ? (
          <div className="space-y-3 animate-pulse"><div className="h-5 w-36 rounded bg-slate-100" /><div className="h-16 rounded-xl bg-slate-100" /><div className="h-10 rounded-xl bg-slate-100" /></div>
        ) : error ? (
          <div className="rounded-xl border border-kash-expense/20 bg-kash-expense/5 p-4 text-sm font-semibold text-slate-700">
            <p className="font-bold text-kash-expense">{error}</p>
            <Button className="mt-3" variant="secondary" size="sm" onClick={() => void load()}>{t("common.retry") || "Coba Lagi"}</Button>
          </div>
        ) : summary ? (
          <>
            {completed ? (
              <div className="flex items-start gap-3 rounded-xl border border-kash-emerald/20 bg-kash-selected/70 p-4 text-kash-emeraldDark">
                <CheckCircle2 className="mt-0.5 shrink-0" size={20} />
                <div><p className="text-sm font-extrabold">{t("dailyCheckin.completed") || "Hari ini sudah direview"}</p><p className="mt-1 text-xs font-semibold text-slate-600">{summary.status === "no_spending" ? (t("dailyCheckin.noSpendingConfirmed") || "Tidak ada pengeluaran yang kamu konfirmasi untuk hari ini.") : (t("dailyCheckin.completedDesc") || "Kamu tetap bisa mengubah transaksi kapan pun. KASH akan meminta review lagi jika data pengeluaran berubah.")}</p></div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("dailyCheckin.recordedExpense") || "Pengeluaran tercatat"}</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-950">{formatCurrency(summary.totalExpense, summary.currency)}</p>
                <p className="mt-1 text-xs font-semibold text-slate-600">{t("dailyCheckin.transactionCount", { count: summary.transactionCount }) || `${summary.transactionCount} transaksi`}</p>
              </div>
              <Button onClick={() => setShowTransactionForm(true)}><Plus size={17} />{t("dailyCheckin.addTransaction") || "Tambah Transaksi"}</Button>
            </div>

            {summary.transactions.length > 0 ? (
              <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
                {summary.transactions.map((transaction) => (
                  <Link key={transaction.id} to={`/transactions?date=${encodeURIComponent(reviewDate)}`} className="flex items-center justify-between gap-3 py-3 transition hover:bg-slate-50">
                    <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{transaction.title}</span><span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">{transaction.category_name || (t("categories.uncategorized") || "Tanpa kategori")}</span></span>
                    <span className="shrink-0 text-sm font-extrabold text-kash-expense">{formatCurrency(transaction.amount, summary.currency)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-slate-600"><ReceiptText className="mt-0.5 shrink-0" size={18} /><p className="text-sm font-semibold">{t("dailyCheckin.noTransactions") || "Belum ada pengeluaran yang tercatat hari ini."}</p></div>
            )}

            {!completed ? (
              <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <Button disabled={saving !== null} variant="ghost" onClick={() => void snooze()}>{saving === "snooze" ? <Loader2 className="animate-spin" size={16} /> : null}{t("dailyCheckin.remindLater") || "Ingatkan Nanti"}</Button>
                {summary.transactionCount === 0 ? <Button disabled={saving !== null} variant="secondary" onClick={() => void complete("no_spending")}>{saving === "no_spending" ? <Loader2 className="animate-spin" size={16} /> : null}{t("dailyCheckin.noSpending") || "Tidak Ada Pengeluaran Hari Ini"}</Button> : null}
                <Button disabled={saving !== null} onClick={() => void complete("reviewed")}>{saving === "reviewed" ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}{t("dailyCheckin.everythingRecorded") || "Semua Sudah Tercatat"}</Button>
              </div>
            ) : null}
          </>
        ) : null}
      </PageCard>

      {showTransactionForm && personalSpace ? (
        <TransactionModal
          mode="expense"
          initialDate={reviewDate}
          spaceId={personalSpace.id}
          onClose={() => setShowTransactionForm(false)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
