import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  History,
  Loader2,
  Plus,
  Receipt,
  Repeat,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PaymentModal } from "../components/subscriptions/PaymentModal";
import { SettleInstallmentModal } from "../components/subscriptions/SettleInstallmentModal";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { FinancialHeroCard } from "../components/ui/FinancialHeroCard";
import { PageHeader } from "../components/ui/PageHeader";
import { useAppEvent } from "../hooks/useAppEvent";
import { appEvents } from "../lib/appEvents";
import { formatCurrency, toNumber } from "../../src/lib/money";
import {
  cancelRecurringObligation,
  deleteRecurringObligation,
  getRecurringObligationById,
  type RecurringObligationWithMeta,
} from "../lib/subscriptions";
import { getWallets, type WalletWithBalance } from "../lib/wallets";
import type { RecurringPayment, Wallet as WalletType } from "../types/domain";
import { useI18n } from "../i18n";

export function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, formatDate, formatCurrency } = useI18n();

  const [obligation, setObligation] = useState<RecurringObligationWithMeta | null>(null);
  const [payments, setPayments] = useState<RecurringPayment[]>([]);
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [payModalPayment, setPayModalPayment] = useState<RecurringPayment | null>(null);
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const [obRes, walRes] = await Promise.all([
      getRecurringObligationById(id),
      getWallets(),
    ]);

    if (obRes.error || !obRes.data) {
      setError(obRes.error?.message || (t("subscriptions.notFound") || "Kewajiban tidak ditemukan."));
    } else {
      setObligation(obRes.data.obligation);
      setPayments(obRes.data.payments);
    }

    if (walRes.data) setWallets(walRes.data);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [id]);

  useAppEvent(appEvents.transactionSaved, () => void loadData());
  useAppEvent(appEvents.notificationsUpdated, () => void loadData());

  const handleCancel = async () => {
    if (!obligation) return;
    setActionLoading(true);
    const { error: cancelError } = await cancelRecurringObligation(obligation.id);
    setActionLoading(false);
    if (cancelError) {
      alert(cancelError.message);
      return;
    }
    setCancelModalOpen(false);
    void loadData();
  };

  const handleDelete = async () => {
    if (!obligation) return;
    setActionLoading(true);
    const { error: delError } = await deleteRecurringObligation(obligation.id);
    setActionLoading(false);
    if (delError) {
      alert(delError.message);
      return;
    }
    setDeleteModalOpen(false);
    navigate("/subscriptions", { replace: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-kash-emerald" />
      </div>
    );
  }

  if (error || !obligation) {
    return (
      <div className="mx-auto max-w-[1180px] space-y-4 py-8 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-base font-extrabold text-slate-900">{error || (t("subscriptions.notFound") || "Kewajiban tidak ditemukan.")}</p>
          <Link to="/subscriptions" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-kash-emerald hover:underline">
            <ArrowLeft size={16} /> {t("subscriptions.backToSubscriptions") || "Kembali ke Tagihan & Langganan"}
          </Link>
        </div>
      </div>
    );
  }

  const isInstallment = obligation.type === "paylater" || obligation.type === "installment";
  const openPendingPayment = payments.find((p) => p.status === "pending" || p.status === "overdue");
  const canHardDelete = payments.length === 0;

  const frequencyLabel = isInstallment
    ? (t("subscriptions.monthlyInstallment") || "Cicilan Bulanan")
    : obligation.frequency === "monthly"
      ? (t("subscriptions.freqMonthly") || "Bulanan")
      : obligation.frequency === "yearly"
        ? (t("subscriptions.freqYearly") || "Tahunan")
        : obligation.frequency === "weekly"
          ? (t("subscriptions.freqWeekly") || "Mingguan")
          : obligation.frequency === "quarterly"
            ? (t("subscriptions.freqQuarterly") || "Triwulan")
            : obligation.frequency;

  const freqSuffix = isInstallment
    ? (t("subscriptions.perMonthSuffix") || " /bln")
    : obligation.frequency === "monthly"
      ? (t("subscriptions.perMonthSuffix") || " /bln")
      : obligation.frequency === "yearly"
        ? (t("subscriptions.perYearSuffix") || " /thn")
        : ` /${obligation.frequency}`;

  // Installment progress calculations
  const tenor = obligation.installment_count || 0;
  const remainingCount = obligation.remaining_count ?? 0;
  const paidCount = Math.max(0, tenor - remainingCount);
  const paidAmount = paidCount * toNumber(obligation.amount);
  const rawPercent = tenor > 0 ? (paidCount / tenor) * 100 : (obligation.status === "completed" ? 100 : 0);
  const progressPercent = Math.min(100, Math.max(0, rawPercent));

  return (
    <div className="w-full min-w-0 space-y-4 -mt-2 sm:mt-0">
      {/* 1. Back Navigation Link */}
      <div>
        <Link
          to="/subscriptions"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 transition hover:text-kash-emeraldDark"
        >
          <ArrowLeft size={14} />
          {t("subscriptions.backToSubscriptions") || "Kembali ke Tagihan & Langganan"}
        </Link>
      </div>

      {/* 2. Canonical Emerald Hero Card */}
      <FinancialHeroCard
        icon={isInstallment ? <CreditCard size={22} /> : <Repeat size={22} />}
        eyebrow={obligation.provider || obligation.category?.name || (t("subscriptions.title") || "Tagihan & Langganan")}
        title={obligation.name}
        badge={
          <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-extrabold text-white border border-white/15 backdrop-blur-xs">
            {obligation.status === "active" ? (
              <>
                <Clock size={13} /> {t("common.active") || "Aktif"}
              </>
            ) : obligation.status === "completed" ? (
              <>
                <CheckCircle2 size={13} /> {t("goals.completed") || "Selesai"}
              </>
            ) : (
              <>
                <XCircle size={13} /> {t("debts.cancelled") || "Dibatalkan"}
              </>
            )}
          </span>
        }
        primaryMetricLabel={
          isInstallment
            ? (t("subscriptions.remainingBalance") || "Sisa Tanggungan")
            : (t("subscriptions.billingRate") || "Estimasi Tagihan")
        }
        primaryMetricValue={
          isInstallment
            ? formatCurrency(obligation.remaining_amount, "IDR")
            : `${formatCurrency(obligation.amount, "IDR")}${freqSuffix}`
        }
        supportingMetrics={
          isInstallment ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs font-semibold text-white/90">
              <div>
                <span className="text-white/60 font-semibold">{t("subscriptions.installmentRate") || "Cicilan /bln"}</span>
                <p className="mt-0.5 text-sm font-extrabold text-white">
                  {formatCurrency(obligation.amount, "IDR")}
                </p>
              </div>
              <div>
                <span className="text-white/60 font-semibold">{t("subscriptions.remainingTenor") || "Sisa Tenor"}</span>
                <p className="mt-0.5 text-sm font-extrabold text-white">
                  {remainingCount} / {tenor} {t("subscriptions.items") || "cicilan"}
                </p>
              </div>
              <div>
                <span className="text-white/60 font-semibold">{t("debts.paidAmount") || "Terbayar"}</span>
                <p className="mt-0.5 text-sm font-extrabold text-white">
                  {formatCurrency(paidAmount, "IDR")}
                </p>
              </div>
              <div>
                <span className="text-white/60 font-semibold">{t("subscriptions.nextDue") || "Jatuh Tempo"}</span>
                <p className="mt-0.5 text-sm font-extrabold text-white truncate">
                  {obligation.next_due_date ? formatDate(new Date(obligation.next_due_date)) : "-"}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs font-semibold text-white/90">
              <div>
                <span className="text-white/60 font-semibold">{t("subscriptions.frequency") || "Frekuensi"}</span>
                <p className="mt-0.5 text-sm font-extrabold text-white capitalize">
                  {frequencyLabel}
                </p>
              </div>
              <div>
                <span className="text-white/60 font-semibold">{t("subscriptions.nextDue") || "Jatuh Tempo Berikutnya"}</span>
                <p className="mt-0.5 text-sm font-extrabold text-white truncate">
                  {obligation.next_due_date ? formatDate(new Date(obligation.next_due_date)) : "-"}
                </p>
              </div>
              <div>
                <span className="text-white/60 font-semibold">{t("subscriptions.category") || "Kategori"}</span>
                <p className="mt-0.5 text-sm font-extrabold text-white truncate">
                  {obligation.category?.name || "-"}
                </p>
              </div>
              <div>
                <span className="text-white/60 font-semibold">{t("subscriptions.defaultPaymentWallet") || "Dompet Utama"}</span>
                <p className="mt-0.5 text-sm font-extrabold text-white truncate">
                  {obligation.defaultWallet?.name || "-"}
                </p>
              </div>
            </div>
          )
        }
        progress={
          isInstallment
            ? {
                percent: progressPercent,
                labelLeft: `${paidCount} / ${tenor} ${t("subscriptions.paid") || "terbayar"} (${progressPercent.toFixed(0)}%)`,
                labelRight: `${t("debts.remainingDebt") || "Sisa"}: ${formatCurrency(obligation.remaining_amount, "IDR")}`,
              }
            : undefined
        }
      />

      {/* 3. Primary Actions Row Directly Below Hero */}
      {(obligation.status === "active" && (openPendingPayment || (isInstallment && remainingCount > 0))) && (
        <div className="flex flex-nowrap items-center justify-start gap-2 overflow-x-auto max-w-full py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {openPendingPayment && (
            <Button
              type="button"
              onClick={() => setPayModalPayment(openPendingPayment)}
              className="shrink-0 whitespace-nowrap gap-1.5 min-h-9 px-4 py-1.5 text-xs font-extrabold"
            >
              <CheckCircle2 size={15} />
              {t("subscriptions.payBill") || "Bayar Tagihan"}
            </Button>
          )}

          {isInstallment && remainingCount > 0 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSettleModalOpen(true)}
              className="shrink-0 whitespace-nowrap gap-1.5 min-h-9 px-4 py-1.5 text-xs font-extrabold"
            >
              <CreditCard size={15} />
              {t("subscriptions.settleEarly") || "Lunasi Sekarang"}
            </Button>
          )}
        </div>
      )}

      {/* Payment History Section */}
      <div className="space-y-3 pt-2">
        <h3 className="text-base font-extrabold text-slate-900">{t("subscriptions.paymentOccurrencesHistory") || "Jadwal & Riwayat Pembayaran"}</h3>

        {payments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs font-semibold text-slate-600">
            {t("subscriptions.noPaymentHistoryYet") || "Belum ada riwayat pembayaran tercatat."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {payments.map((p) => {
                const isPaid = p.status === "paid";
                const isHistorical = p.payment_mode === "historical";

                return (
                  <div
                    key={p.id}
                    className="flex flex-col justify-between gap-3 p-4 transition hover:bg-slate-50/50 sm:flex-row sm:items-center"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          isPaid
                            ? "bg-kash-selected text-kash-emerald"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {isPaid ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                      </span>

                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-extrabold text-slate-900">
                            {isInstallment && p.installment_number
                              ? (t("subscriptions.installmentNumber", { number: p.installment_number }) || `Cicilan #${p.installment_number}`)
                              : `${t("subscriptions.billingCycle") || "Siklus Penagihan"} (${formatDate(new Date(p.due_date))})`}
                          </p>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${
                              isPaid
                                ? "bg-kash-selected text-kash-emeraldDark"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {p.status === "paid" ? (t("subscriptions.paid") || "Lunas") : p.status === "overdue" ? (t("subscriptions.overdue") || "Terlambat") : (t("subscriptions.pending") || "Tertunda")}
                          </span>
                        </div>

                        <p className="mt-0.5 text-xs font-semibold text-slate-600">
                          {t("debts.due") || "Tempo"}: {formatDate(new Date(p.due_date))}
                          {p.paid_at && ` • ${t("subscriptions.paidOn") || "Dibayar pada"} ${formatDate(new Date(p.paid_at))}`}
                        </p>

                        {isHistorical && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-slate-600">
                            <History size={12} /> {t("subscriptions.previousPaymentNoDeduction") || "Pembayaran Lampau (Tanpa potong dompet)"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <p className="text-sm font-black text-slate-900">
                        {formatCurrency(p.amount, "IDR")}
                      </p>

                      {!isPaid && obligation.status === "active" && (
                        <Button
                          onClick={() => setPayModalPayment(p)}
                          className="gap-1 min-h-9 px-3 py-1.5 text-xs font-extrabold"
                        >
                          <CheckCircle2 size={13} /> {t("debts.pay") || "Bayar"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Secondary Management Actions Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
          {t("subscriptions.managementActions") || "Pengaturan & Tindakan Layanan"}
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          {!isInstallment && obligation.status === "active" && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCancelModalOpen(true)}
              className="gap-1.5 min-h-9 px-3.5 py-1.5 text-xs font-extrabold border-kash-expense/30 text-kash-expense hover:bg-kash-expense/10"
            >
              <XCircle size={15} />
              {t("subscriptions.cancelPlan") || "Batalkan Layanan"}
            </Button>
          )}

          <Button
            type="button"
            variant="secondary"
            onClick={() => setDeleteModalOpen(true)}
            className="gap-1.5 min-h-9 px-3.5 py-1.5 text-xs font-extrabold border-slate-200 text-slate-600 hover:border-kash-expense/30 hover:bg-kash-expense/10 hover:text-kash-expense"
          >
            <Trash2 size={15} />
            {t("common.delete") || "Hapus"}
          </Button>
        </div>
      </div>

      {/* Payment Modal */}
      {payModalPayment && (
        <PaymentModal
          obligation={obligation}
          payment={payModalPayment}
          wallets={wallets}
          onClose={() => setPayModalPayment(null)}
          onPaid={() => {
            setPayModalPayment(null);
            void loadData();
          }}
        />
      )}

      {/* Settle Installment Modal */}
      {settleModalOpen && (
        <SettleInstallmentModal
          obligation={obligation}
          wallets={wallets}
          onClose={() => setSettleModalOpen(false)}
          onSettled={() => {
            setSettleModalOpen(false);
            void loadData();
          }}
        />
      )}

      {/* Cancel Subscription Confirmation */}
      {cancelModalOpen && (
        <ConfirmationDialog
          title={t("subscriptions.cancelSubscription") || "Batalkan Layanan"}
          description={t("subscriptions.cancelSubscriptionDesc") || "Membatalkan layanan ini akan menghentikan siklus penagihan rutin dan pengingat ke depan. Catatan pembayaran dan transaksi Pengeluaran masa lalu akan tetap tersimpan."}
          confirmLabel={actionLoading ? `${t("subscriptions.cancelling") || "Membatalkan..."}` : (t("subscriptions.cancelSubscription") || "Batalkan Layanan")}
          tone="danger"
          isLoading={actionLoading}
          onConfirm={() => void handleCancel()}
          onCancel={() => setCancelModalOpen(false)}
        />
      )}

      {/* Delete Obligation Confirmation */}
      {deleteModalOpen && (
        <ConfirmationDialog
          title={t("subscriptions.deleteObligation") || "Hapus Tagihan"}
          description={t("subscriptions.deleteObligationDesc") || "Apakah Anda yakin ingin menghapus kewajiban rutin ini? Tindakan ini tidak dapat dibatalkan."}
          confirmLabel={actionLoading ? `${t("subscriptions.deleting") || "Menghapus..."}` : (t("common.delete") || "Hapus")}
          tone="danger"
          isLoading={actionLoading}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteModalOpen(false)}
        />
      )}
    </div>
  );
}
