import { ArrowLeft, RotateCcw, ArrowRight, Archive, Edit3, History, LineChart, Loader2, SlidersHorizontal, Trash2, TrendingDown, TrendingUp, WalletCards, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { EntityMoreActionsMenu } from "../components/ui/EntityMoreActionsMenu";
import { DatePickerField } from "../components/ui/DatePickerField";
import { FormField } from "../components/ui/FormField";
import { IconButton } from "../components/ui/IconButton";
import { Modal } from "../components/ui/Modal";
import { SelectField } from "../components/ui/SelectField";
import { ToggleField } from "../components/ui/ToggleField";
import { useI18n } from "../i18n";
import { appEvents, emitTransactionSaved } from "../lib/appEvents";
import { useAppEvent } from "../hooks/useAppEvent";
import { formatCurrency, formatDatabaseMoneyDigits, formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../lib/money";
import { createAdjustment, getTransactions, type TransactionWithMeta } from "../lib/transactions";
import { TransactionDetailPanel, transactionIcon, transactionTitle, transactionTone } from "../components/transactions/TransactionDetailPanel";
import { getCurrentLocalDatetimeString } from "../lib/datetime";
import {
  getWalletIcon,
  getWalletTypeOption,
  walletColors,
  walletIconOptions,
  walletTypeOptions,
} from "../lib/walletMeta";
import {
  archiveWallet,
  restoreWallet,
  deleteInvestmentActivity,
  deleteWallet,
  getInvestmentActivities,
  getInvestmentValuationHistory,
  getWalletById,
  getWalletLinkedGoalCount,
  getWalletTransactionCount,
  recordInvestmentActivity,
  recordInvestmentValuation,
  updateWallet,
  type WalletWithBalance,
} from "../lib/wallets";
import type { InvestmentActivity, InvestmentActivityType, InvestmentValuation, WalletType } from "../types/domain";

import {
  AdjustmentModal,
  EditWalletModal,
} from "../components/wallets/WalletModals";

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-normal text-slate-600">{label}</p>
      <p className="mt-2 text-lg font-extrabold text-slate-900">{value}</p>
    </article>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 md:p-6">
      <div className="h-8 w-32 rounded-lg bg-slate-100" />
      <div className="h-48 rounded-lg border border-slate-200 bg-white p-5">
        <div className="h-4 w-1/3 rounded-full bg-slate-100" />
        <div className="mt-8 h-8 w-2/3 rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}

function UpdateValuationModal({
  netContributions,
  currentMarketValue,
  onClose,
  onSaved,
  wallet,
}: {
  netContributions: string | number;
  currentMarketValue: string | number;
  onClose: () => void;
  onSaved: () => void;
  wallet: WalletWithBalance;
}) {
  const { t, formatCurrency } = useI18n();
  const [marketValueInput, setMarketValueInput] = useState(formatDatabaseMoneyDigits(currentMarketValue));
  const [valuationDate, setValuationDate] = useState(getCurrentLocalDatetimeString());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const marketValueDigits = parseMoneyInputDigits(marketValueInput);
  const nextMarketValue = toNumber(marketValueDigits);
  const netContributionsAmount = toNumber(netContributions);
  const totalGain = marketValueDigits ? nextMarketValue - netContributionsAmount : 0;
  const returnPct = netContributionsAmount > 0 ? (totalGain / netContributionsAmount) * 100 : null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    if (!marketValueDigits || nextMarketValue < 0) {
      setError(t("wallets.validMarketValueRequired") || "Masukkan nilai pasar investasi yang valid (>= 0).");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: valError } = await recordInvestmentValuation({
        walletId: wallet.id,
        marketValue: nextMarketValue,
        valuationDate,
        note: note.trim() || null,
      });

      if (valError) {
        setError(t("wallets.updateValuationError") || "Gagal memperbarui nilai pasar investasi.");
        setSaving(false);
        return;
      }

      emitTransactionSaved();
      onSaved();
    } catch (err: any) {
      setError(err?.message || (t("wallets.updateValuationError") || "Gagal memperbarui nilai pasar investasi."));
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="md"
      title={t("wallets.updateInvestmentValuation") || "Update Nilai Investasi"}
      description={t("wallets.updateValuationDesc") || "Pembaruan nilai pasar tidak mengubah arus kas riil (pemasukan/pengeluaran)."}
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t("wallets.netContributions") || "Modal Bersih"}</p>
              <p className="mt-1 text-sm font-extrabold text-slate-900">{formatCurrency(netContributionsAmount, wallet.currency)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t("wallets.previousMarketValue") || "Nilai Investasi Sebelumnya"}</p>
              <p className="mt-1 text-sm font-extrabold text-slate-900">{formatCurrency(currentMarketValue, wallet.currency)}</p>
            </div>
          </div>

          <FormField
            id="investment-market-value"
            inputMode="numeric"
            label={t("wallets.currentMarketValueLabel") || "Nilai Investasi Saat Ini (Current Equity)"}
            onChange={(event) => setMarketValueInput(formatMoneyDigits(event.target.value))}
            placeholder={t("wallets.marketValuePlaceholder") || "Contoh: 10.500.000"}
            value={marketValueInput}
          />

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">{t("wallets.totalPnL") || "Total Untung / Rugi"}</span>
              <span className={`text-xs font-extrabold ${totalGain >= 0 ? "text-kash-emerald" : "text-kash-expense"}`}>
                {returnPct !== null ? `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%` : "—"}
              </span>
            </div>
            <p className={`mt-2 text-xl font-extrabold ${totalGain >= 0 ? "text-kash-emerald" : "text-kash-expense"}`}>
              {totalGain === 0 ? formatCurrency(0, wallet.currency) : `${totalGain > 0 ? "+" : "-"}${formatCurrency(Math.abs(totalGain), wallet.currency)}`}
            </p>
          </div>

          <DatePickerField
            id="valuation-date"
            label={t("wallets.valuationDate") || "Tanggal Valuasi"}
            enableTime
            onChange={(val) => setValuationDate(val)}
            value={valuationDate}
          />

          <FormField
            id="valuation-note"
            label={t("wallets.valuationNoteOptional") || "Catatan Valuasi (Opsional)"}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("wallets.valuationNotePlaceholder") || "Contoh: Update portofolio akhir bulan / dividen reinvest"}
            value={note}
          />

          <Button disabled={saving} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            {saving ? (t("common.saving") || "Menyimpan...") : (t("wallets.saveValuation") || "Simpan Nilai Valuasi")}
          </Button>
        </form>
      </div>
    </Modal>
  );
}

function RecordInvestmentActivityModal({
  onClose,
  onSaved,
  wallet,
}: {
  onClose: () => void;
  onSaved: () => void;
  wallet: WalletWithBalance;
}) {
  const { t } = useI18n();
  const [activityType, setActivityType] = useState<InvestmentActivityType>("realized_gain");
  const [amountInput, setAmountInput] = useState("");
  const [activityDate, setActivityDate] = useState(getCurrentLocalDatetimeString());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountDigits = parseMoneyInputDigits(amountInput);
  const nextAmount = toNumber(amountDigits);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    if (!amountDigits || nextAmount <= 0) {
      setError(t("wallets.validActivityAmountRequired") || "Masukkan nominal aktivitas yang valid (> 0).");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: actError } = await recordInvestmentActivity({
        walletId: wallet.id,
        activityType,
        amount: nextAmount,
        activityDate,
        note: note.trim() || null,
      });

      if (actError) {
        setError(t("wallets.recordActivityError") || "Gagal mencatat aktivitas investasi.");
        setSaving(false);
        return;
      }

      emitTransactionSaved();
      onSaved();
    } catch (err: any) {
      setError(err?.message || (t("wallets.recordActivityError") || "Gagal mencatat aktivitas investasi."));
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="md"
      title={t("wallets.recordInvestmentActivity") || "Catat Aktivitas Investasi"}
      description={t("wallets.recordActivityDesc") || "Catat hasil take profit atau cut loss. Aktivitas ini hanya membagi performa (realized vs unrealized) dan tidak mengubah saldo dompet secara ganda."}
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              {t("wallets.activityType") || "Tipe Aktivitas"}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setActivityType("realized_gain")}
                className={`flex items-center justify-center gap-2 rounded-lg p-3 text-sm font-extrabold transition border ${
                  activityType === "realized_gain"
                    ? "border-kash-emerald bg-emerald-50 text-kash-emerald"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <TrendingUp size={16} />
                {t("wallets.realizedGain") || "Untung (Gain)"}
              </button>
              <button
                type="button"
                onClick={() => setActivityType("realized_loss")}
                className={`flex items-center justify-center gap-2 rounded-lg p-3 text-sm font-extrabold transition border ${
                  activityType === "realized_loss"
                    ? "border-kash-expense bg-red-50 text-kash-expense"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <TrendingDown size={16} />
                {t("wallets.realizedLoss") || "Rugi (Loss)"}
              </button>
            </div>
          </div>

          <FormField
            id="investment-activity-amount"
            inputMode="numeric"
            label={t("common.amount") || "Nominal"}
            onChange={(event) => setAmountInput(formatMoneyDigits(event.target.value))}
            placeholder={t("wallets.marketValuePlaceholder") || "Contoh: 200.000"}
            value={amountInput}
          />

          <DatePickerField
            id="activity-date"
            label={t("wallets.activityDate") || "Tanggal Aktivitas"}
            enableTime
            onChange={(val) => setActivityDate(val)}
            value={activityDate}
          />

          <FormField
            id="activity-note"
            label={t("wallets.activityNoteOptional") || "Catatan Aktivitas (Opsional)"}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("wallets.activityNotePlaceholder") || "Contoh: Jual BREN / Take profit BBCA"}
            value={note}
          />

          <Button disabled={saving} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            {saving ? (t("common.saving") || "Menyimpan...") : (t("wallets.saveActivity") || "Simpan Aktivitas")}
          </Button>
        </form>
      </div>
    </Modal>
  );
}

export function WalletDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, formatDate, formatCurrency } = useI18n();
  const [wallet, setWallet] = useState<WalletWithBalance | null>(null);
  const [valuations, setValuations] = useState<InvestmentValuation[]>([]);
  const [activities, setActivities] = useState<InvestmentActivity[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionWithMeta[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithMeta | null>(null);
  const [linkedGoalCount, setLinkedGoalCount] = useState(0);
  const [transactionCount, setTransactionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [showValuation, setShowValuation] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<InvestmentActivity | null>(null);
  const [deletingActivity, setDeletingActivity] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWallet = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const [{ data, error: walletError }, { count, error: countError }, { count: goalCount, error: goalCountError }, txResult] = await Promise.all([
        getWalletById(id),
        getWalletTransactionCount(id),
        getWalletLinkedGoalCount(id),
        getTransactions({ walletId: id, pageSize: 10 }),
      ]);

      if (walletError || countError || goalCountError || !data) {
        setError(t("wallets.loadDetailError") || "Gagal memuat dompet ini. Dompet mungkin tidak ada atau Anda tidak memiliki akses.");
        setLoading(false);
        return;
      }

      setWallet(data);
      setTransactionCount(count);
      setLinkedGoalCount(goalCount);
      setRecentTransactions(txResult.transactions ?? []);

      if (data.wallet_type === "investment") {
        try {
          const [valHistory, actHistory] = await Promise.all([
            getInvestmentValuationHistory(id),
            getInvestmentActivities(id),
          ]);
          setValuations((valHistory.data as any) ?? []);
          setActivities(actHistory.data ?? []);
        } catch (err) {
          console.warn("Failed to load investment history", err);
        }
      }
    } catch (err: any) {
      setError(err?.message || (t("wallets.loadDetailError") || "Gagal memuat dompet ini."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWallet();
  }, [id]);

  useAppEvent(appEvents.transactionSaved, () => void loadWallet());
  useAppEvent(appEvents.goalSaved, () => void loadWallet());

  const handleRestoreWallet = async () => {
    if (!wallet) return;
    const { error: resError } = await restoreWallet(wallet.id);
    if (resError) {
      setError(resError.message || "Gagal memulihkan dompet.");
    } else {
      emitTransactionSaved();
      void loadWallet();
    }
  };

  const handleDeleteWallet = async () => {
    if (!wallet) return;

    if (linkedGoalCount > 0) {
      setError(t("wallets.linkedGoalDeletePrevented") || "Dompet ini terhubung ke target tabungan, sehingga tidak dapat dihapus langsung dari sini.");
      setShowDelete(false);
      return;
    }

    setDeleting(true);
    const result =
      transactionCount === 0
        ? await deleteWallet(wallet.id)
        : await archiveWallet(wallet.id);

    if (result.error) {
      setError(transactionCount === 0 ? (t("wallets.deleteError") || "Gagal menghapus dompet. Silakan coba lagi.") : (t("wallets.archiveError") || "Gagal mengarsipkan dompet. Silakan coba lagi."));
      setDeleting(false);
      setShowDelete(false);
      return;
    }

    emitTransactionSaved();
    navigate("/wallets", { replace: true });
  };

  const handleDeleteActivity = async () => {
    if (!activityToDelete) return;
    setDeletingActivity(true);

    try {
      const { error: delError } = await deleteInvestmentActivity(activityToDelete.id);
      if (delError) {
        setError(t("wallets.deleteActivityError") || "Gagal menghapus aktivitas investasi.");
      } else {
        emitTransactionSaved();
        setActivityToDelete(null);
        void loadWallet();
      }
    } catch (err: any) {
      setError(err?.message || (t("wallets.deleteActivityError") || "Gagal menghapus aktivitas investasi."));
    } finally {
      setDeletingActivity(false);
    }
  };

  if (loading) return <DetailSkeleton />;

  if (error || !wallet) {
    return (
      <div className="mx-auto grid w-full max-w-4xl gap-4 p-4 md:p-6">
        <Link className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-kash-emerald" to="/wallets">
          <ArrowLeft aria-hidden="true" size={17} />
          {t("wallets.title") || "Dompet"}
        </Link>
        <section className="rounded-lg border border-kash-expense/30 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold text-slate-900">{t("common.error")}</h2>
          <p className="mt-2 text-sm font-semibold text-slate-700">{error}</p>
          <Button className="mt-4" onClick={() => void loadWallet()}>
            {t("common.retry")}
          </Button>
        </section>
      </div>
    );
  }

  const isInvestment = wallet.wallet_type === "investment";
  const typeOption = getWalletTypeOption(wallet.wallet_type);
  const Icon = getWalletIcon(wallet.icon, wallet.wallet_type);

  // Investment Performance Metrics
  const currentEquity = toNumber(wallet.balance?.current_balance ?? wallet.initial_balance);
  const netContributions = toNumber(wallet.balance?.net_contributions ?? wallet.balance?.cost_basis ?? wallet.initial_balance);
  const realizedPnL = toNumber(wallet.balance?.realized_pnl ?? 0);
  const totalPnL = currentEquity - netContributions;
  const unrealizedPnL = totalPnL - realizedPnL;
  const totalReturnPct = netContributions > 0 ? (totalPnL / netContributions) * 100 : null;

  const currentBalance = currentEquity;
  const lastValuationAt = wallet.balance?.last_valuation_at;
  const canEditInitialBalance = transactionCount === 0;
  const canHardDelete = transactionCount === 0 && linkedGoalCount === 0;
  const heroMetadata = (
    <div className="mt-4 flex max-w-full flex-nowrap gap-2 overflow-x-auto border-t border-white/15 pt-3 text-xs font-semibold text-white/90 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <div className="w-[7rem] shrink-0">
        <span className="text-white/60 font-semibold">{t("wallets.type") || "Tipe Dompet"}</span>
        <p className="mt-0.5 text-sm font-extrabold text-white">{typeOption.label}</p>
      </div>
      <div className="w-[5.5rem] shrink-0">
        <span className="text-white/60 font-semibold">{t("wallets.currency") || "Mata Uang"}</span>
        <p className="mt-0.5 text-sm font-extrabold text-white">{wallet.currency}</p>
      </div>
      <div className="w-[9rem] shrink-0">
        <span className="text-white/60 font-semibold">{t("wallets.includeInNetWorth") || "Kekayaan Bersih"}</span>
        <p className="mt-0.5 text-sm font-extrabold text-white">
          {wallet.include_in_net_worth ? (t("common.yes") || "Ya") : (t("common.no") || "Tidak")}
        </p>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-4">
      <Link className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-kash-emerald" to="/wallets">
        <ArrowLeft aria-hidden="true" size={15} />
        {t("wallets.title") || "Dompet"}
      </Link>

      {/* Hero Performance/Balance Card */}
      {isInvestment ? (
        <section className="kash-hero-card p-5 md:p-6 min-w-0 max-w-full">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                <Icon aria-hidden="true" size={20} strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-white/60">
                  {wallet.goal_name ? (t("wallets.goalPocket") || "Kantong Target") : wallet.wallet_type === "savings" ? (t("wallets.savingsPocket") || "Kantong Tabungan") : typeOption.label}
                </p>
                <h1 className="truncate text-base font-extrabold text-white">{wallet.name}</h1>
              </div>
            </div>
            <EntityMoreActionsMenu
              triggerVariant="hero"
              ariaLabel={`Opsi ${wallet.name}`}
              items={[
                {
                  label: t("common.edit") || "Edit",
                  icon: Edit3,
                  onClick: () => setShowEdit(true),
                },
                {
                  label: wallet.is_archived
                    ? (t("wallets.restoreWallet") || "Pulihkan Dompet")
                    : canHardDelete
                    ? (t("common.delete") || "Hapus")
                    : (t("common.archive") || "Arsipkan"),
                  icon: wallet.is_archived ? RotateCcw : Trash2,
                  isDestructive: !wallet.is_archived,
                  separatorBefore: true,
                  onClick: () => {
                    if (wallet.is_archived) {
                      void handleRestoreWallet();
                    } else {
                      setShowDelete(true);
                    }
                  },
                },
              ]}
            />
          </div>

          <div className="mt-5 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-white/60">
              {t("wallets.currentEquity") || "Nilai Investasi Saat Ini"}
            </p>
            {totalReturnPct !== null ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-0.5 text-xs font-extrabold text-white">
                {totalReturnPct >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {totalReturnPct >= 0 ? "+" : ""}{totalReturnPct.toFixed(2)}%
              </span>
            ) : null}
          </div>

          <p className="mt-2 break-words text-3xl font-extrabold text-white md:text-4xl">
            {formatCurrency(currentEquity, wallet.currency)}
          </p>

          <div className="mt-6 flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto py-0.5 text-[10px] font-semibold text-white/90 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <span className="shrink-0 whitespace-nowrap rounded-lg bg-white/15 px-2.5 py-1">
              <span className="font-medium text-white/65">{t("wallets.netContributions") || "Modal Bersih"}: </span>
              <span className="font-extrabold text-white">{formatCurrency(netContributions, wallet.currency)}</span>
            </span>
            <span className="shrink-0 whitespace-nowrap rounded-lg bg-white/15 px-2.5 py-1">
              <span className="font-medium text-white/65">{t("wallets.totalPnL") || "Total P/L"}: </span>
              <span className="font-extrabold text-white">{totalPnL >= 0 ? "+" : ""}{formatCurrency(totalPnL, wallet.currency)}</span>
            </span>
            {realizedPnL !== 0 ? (
              <span className="shrink-0 whitespace-nowrap rounded-lg bg-white/15 px-2.5 py-1">
                <span className="font-medium text-white/65">{t("wallets.realizedPnL") || "Terealisasi"}: </span>
                <span className="font-extrabold text-white">{realizedPnL >= 0 ? "+" : ""}{formatCurrency(realizedPnL, wallet.currency)}</span>
              </span>
            ) : null}
          </div>
          {heroMetadata}
        </section>
      ) : (
        <section className="kash-hero-card p-5 md:p-6 min-w-0 max-w-full">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                <Icon aria-hidden="true" size={20} strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-white/60">
                  {wallet.goal_name ? (t("wallets.goalPocket") || "Kantong Target") : wallet.wallet_type === "savings" ? (t("wallets.savingsPocket") || "Kantong Tabungan") : typeOption.label}
                </p>
                <h1 className="truncate text-base font-extrabold text-white">{wallet.name}</h1>
              </div>
            </div>
            <EntityMoreActionsMenu
              triggerVariant="hero"
              ariaLabel={`Opsi ${wallet.name}`}
              items={[
                {
                  label: t("common.edit") || "Edit",
                  icon: Edit3,
                  onClick: () => setShowEdit(true),
                },
                {
                  label: t("wallets.adjustBalance") || "Sesuaikan Saldo",
                  icon: SlidersHorizontal,
                  hidden: isInvestment || wallet.is_archived,
                  onClick: () => setShowAdjustment(true),
                },
                {
                  label: wallet.is_archived
                    ? (t("wallets.restoreWallet") || "Pulihkan Dompet")
                    : canHardDelete
                    ? (t("common.delete") || "Hapus")
                    : (t("common.archive") || "Arsipkan"),
                  icon: wallet.is_archived ? RotateCcw : Trash2,
                  isDestructive: !wallet.is_archived,
                  separatorBefore: true,
                  onClick: () => {
                    if (wallet.is_archived) {
                      void handleRestoreWallet();
                    } else {
                      setShowDelete(true);
                    }
                  },
                },
              ]}
            />
          </div>

          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-white/60">
            {t("wallets.currentBalance") || "Saldo Saat Ini"}
          </p>
          <p className="mt-2 break-words text-3xl font-extrabold text-white md:text-4xl">
            {formatCurrency(currentBalance, wallet.currency)}
          </p>
          {heroMetadata}
        </section>
      )}

      {wallet.goal_id ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-0.5 text-xs font-semibold text-slate-500">
          <p className="min-w-0">
            <span className="font-extrabold text-slate-700">{t("wallets.pocketLinkedToGoal") || "Kantong Terhubung ke Target Tabungan (Goal)"}</span>
            <span className="text-slate-400"> · </span>
            <span className="font-bold text-slate-600">
              {wallet.goal_name} {wallet.goal_target_amount ? `(${t("goals.target") || "Target"}: ${formatCurrency(Number(wallet.goal_target_amount), wallet.currency)})` : ""}
            </span>
          </p>
          <Link to={`/goals/${wallet.goal_id}`} className="shrink-0 font-extrabold text-kash-emerald hover:text-kash-emeraldDark">
            {t("wallets.viewGoalTarget") || "Lihat Target Goal"}
          </Link>
        </div>
      ) : null}

      {/* Action Bar Directly BELOW Hero Card (Investment Wallets Only) */}
      {!wallet.is_archived && isInvestment && (
        <div className="flex flex-nowrap items-center justify-start gap-2 overflow-x-auto max-w-full py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <Button
            type="button"
            onClick={() => setShowValuation(true)}
            className="shrink-0 whitespace-nowrap gap-1.5 min-h-9 px-3.5 py-1.5 text-xs font-extrabold"
          >
            <LineChart aria-hidden="true" size={15} />
            {t("wallets.updateInvestmentValuation") || "Update Nilai"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowActivityModal(true)}
            className="shrink-0 whitespace-nowrap gap-1.5 min-h-9 px-3.5 py-1.5 text-xs font-extrabold"
          >
            <TrendingUp aria-hidden="true" size={15} />
            {t("wallets.recordActivity") || "Catat Aktivitas"}
          </Button>
        </div>
      )}

      {/* Investment Activity Ledger */}
      {isInvestment ? (
        <section className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp aria-hidden="true" className="text-slate-500" size={17} />
              <h3 className="text-sm font-extrabold text-slate-900">{t("wallets.activityHistory") || "Riwayat Aktivitas Investasi"}</h3>
            </div>
          </div>

          {activities.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200/60 text-[11px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="pb-2.5">{t("common.date") || "Tanggal"}</th>
                    <th className="pb-2.5">{t("common.type") || "Tipe"}</th>
                    <th className="pb-2.5 text-right">{t("common.amount") || "Nominal"}</th>
                    <th className="pb-2.5 pl-3">{t("common.note") || "Catatan"}</th>
                    <th className="pb-2.5 text-right">{t("common.actions") || "Aksi"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                  {activities.map((act) => {
                    const isGain = act.activity_type === "realized_gain";
                    const amountNum = toNumber(act.amount);
                    return (
                      <tr key={act.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5">
                          {formatDate(new Date(act.activity_date))}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold ${
                              isGain
                                ? "bg-emerald-50 text-kash-emerald border border-emerald-200/50"
                                : "bg-red-50 text-kash-expense border border-red-200/50"
                            }`}
                          >
                            {isGain ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {isGain ? (t("wallets.realizedGain") || "Gain") : (t("wallets.realizedLoss") || "Loss")}
                          </span>
                        </td>
                        <td className={`py-2.5 text-right font-extrabold ${isGain ? "text-kash-emerald" : "text-kash-expense"}`}>
                          {isGain ? "+" : "-"}{formatCurrency(amountNum, wallet.currency)}
                        </td>
                        <td className="py-2.5 pl-3 text-xs text-slate-500">
                          {act.note || "-"}
                        </td>
                        <td className="py-2.5 text-right">
                          <IconButton
                            icon={Trash2}
                            label={t("common.delete") || "Hapus"}
                            onClick={() => setActivityToDelete(act)}
                            className="text-slate-400 hover:text-kash-expense"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
              <p className="text-xs font-semibold text-slate-500">
                {t("wallets.noActivities") || "Belum ada aktivitas investasi yang dicatat."}
              </p>
            </div>
          )}
        </section>
      ) : null}

      {/* Valuation History */}
      {isInvestment && valuations.length > 0 ? (
        <section className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <History aria-hidden="true" className="text-slate-500" size={17} />
            <h3 className="text-sm font-extrabold text-slate-900">{t("wallets.valuationHistory") || "Riwayat Valuasi Nilai Pasar"}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200/60 text-[11px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="pb-2.5">{t("wallets.valuationDate") || "Tanggal Valuasi"}</th>
                  <th className="pb-2.5 text-right">{t("wallets.currentEquity") || "Nilai Investasi"}</th>
                  <th className="pb-2.5 text-right">{t("wallets.netContributions") || "Modal Bersih"}</th>
                  <th className="pb-2.5 text-right">{t("wallets.totalPnL") || "Total P/L"}</th>
                  <th className="pb-2.5 pl-3">{t("transactions.note") || "Catatan"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                {valuations.map((v) => {
                  const valPnL = toNumber(v.market_value) - toNumber(v.cost_basis_at_valuation);
                  return (
                    <tr key={v.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5">
                        {formatDate(new Date(v.valuation_date))}
                      </td>
                      <td className="py-2.5 text-right font-extrabold text-slate-900">
                        {formatCurrency(v.market_value, wallet.currency)}
                      </td>
                      <td className="py-2.5 text-right text-slate-500">
                        {formatCurrency(v.cost_basis_at_valuation, wallet.currency)}
                      </td>
                      <td className={`py-2.5 text-right font-extrabold ${valPnL >= 0 ? "text-kash-emerald" : "text-kash-expense"}`}>
                        {valPnL >= 0 ? "+" : ""}{formatCurrency(valPnL, wallet.currency)}
                      </td>
                      <td className="py-2.5 pl-3 text-xs text-slate-500">
                        {v.note || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Recent Transactions List */}
      <section className="rounded-2xl border border-slate-200/60 bg-white p-4 sm:p-5 shadow-card">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <WalletCards aria-hidden="true" className="text-slate-500" size={17} />
            <h3 className="text-sm font-extrabold text-slate-900">{t("dashboard.recentTransactions") || "Transaksi Terbaru"}</h3>
          </div>
          {recentTransactions.length > 0 && (
            <span className="text-xs font-bold text-slate-500">
              {recentTransactions.length} {t("nav.transactions") || "transaksi"}
            </span>
          )}
        </div>

        {recentTransactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
            <h4 className="text-sm font-extrabold text-slate-900">{t("transactions.emptyStateTitle") || "Belum ada transaksi."}</h4>
            <p className="mx-auto mt-1 max-w-sm text-xs font-semibold leading-5 text-slate-500">
              {t("wallets.transactionHistoryDesc") || "Riwayat transaksi untuk dompet ini akan muncul di sini."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
            {recentTransactions.map((tx) => {
              const IconComp = transactionIcon(tx.type);
              const title = transactionTitle(tx);
              const tone = transactionTone[tx.type];
              const formattedDate = formatDate(new Date(tx.transaction_date));
              const isSourceWallet = tx.wallet_id === wallet.id;
              const isDestinationWallet = tx.destination_wallet_id === wallet.id;

              let displayAmountPrefix = tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "";
              if (tx.type === "transfer") {
                if (isDestinationWallet && !isSourceWallet) displayAmountPrefix = "+";
                else if (isSourceWallet && !isDestinationWallet) displayAmountPrefix = "-";
              }

              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => setSelectedTransaction(tx)}
                  className="block w-full border-b border-slate-100 py-3 text-left transition last:border-b-0 hover:bg-slate-50 px-3"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-3 min-w-0">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 ${tone}`}>
                        <IconComp aria-hidden="true" size={17} strokeWidth={2.2} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-extrabold text-slate-900">{title}</span>
                        <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">
                          {formattedDate} {tx.category?.name ? `• ${tx.category.name}` : ""}
                        </span>
                      </span>
                    </span>

                    <span className="text-right shrink-0">
                      <span className={`block text-sm font-extrabold ${tone}`}>
                        {displayAmountPrefix}{formatCurrency(tx.amount, wallet.currency)}
                      </span>
                      {tx.type === "transfer" ? (
                        <span className="block text-[11px] font-bold text-slate-500">
                          {isDestinationWallet ? (t("transactions.transferIn") || "Masuk") : (t("transactions.transferOut") || "Keluar")}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {recentTransactions.length > 0 && (
          <div className="mt-3.5 text-center">
            <Link
              to={`/transactions?wallet=${wallet.id}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-2 text-xs font-extrabold text-slate-700 shadow-xs transition hover:border-kash-emerald hover:bg-kash-selected hover:text-kash-emeraldDark"
            >
              {t("wallets.viewAllTransactions") || "Lihat Semua Transaksi"}
              <ArrowRight aria-hidden="true" size={14} />
            </Link>
          </div>
        )}
      </section>

      {selectedTransaction && (
        <TransactionDetailPanel
          currency={wallet.currency}
          isOpen={Boolean(selectedTransaction)}
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
        />
      )}

      {showEdit ? (
        <EditWalletModal
          canEditInitialBalance={canEditInitialBalance}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            void loadWallet();
          }}
          wallet={wallet}
        />
      ) : null}
      {showAdjustment ? (
        <AdjustmentModal
          currentBalance={currentBalance}
          onClose={() => setShowAdjustment(false)}
          onSaved={() => {
            setShowAdjustment(false);
            void loadWallet();
          }}
          wallet={wallet}
        />
      ) : null}
      {showValuation ? (
        <UpdateValuationModal
          netContributions={netContributions}
          currentMarketValue={currentBalance}
          onClose={() => setShowValuation(false)}
          onSaved={() => {
            setShowValuation(false);
            void loadWallet();
          }}
          wallet={wallet}
        />
      ) : null}
      {showActivityModal ? (
        <RecordInvestmentActivityModal
          onClose={() => setShowActivityModal(false)}
          onSaved={() => {
            setShowActivityModal(false);
            void loadWallet();
          }}
          wallet={wallet}
        />
      ) : null}
      {showDelete ? (
        <ConfirmationDialog
          confirmLabel={canHardDelete ? (t("wallets.deleteWallet") || "Hapus Dompet") : (t("wallets.archiveWallet") || "Arsipkan Dompet")}
          description={
            linkedGoalCount > 0
              ? (t("wallets.linkedGoalDeletePrevented") || "Dompet ini terhubung ke target tabungan, sehingga tidak dapat dihapus langsung dari sini.")
              : canHardDelete
                ? (t("wallets.hardDeleteExplanation") || "Dompet ini belum memiliki riwayat transaksi, sehingga dapat dihapus secara permanen.")
                : (t("wallets.archiveExplanation") || "Dompet ini memiliki riwayat transaksi keuangan, sehingga KASH akan menyembunyikannya dari daftar aktif tanpa menghapus catatan historis.")
          }
          disabled={linkedGoalCount > 0}
          icon={canHardDelete ? Trash2 : Archive}
          isLoading={deleting}
          itemLabel={wallet.name}
          onCancel={() => setShowDelete(false)}
          onConfirm={() => void handleDeleteWallet()}
          title={canHardDelete ? (t("wallets.deleteWalletConfirm") || "Hapus dompet ini?") : (t("wallets.archiveWalletConfirm") || "Arsipkan dompet ini?")}
          tone={canHardDelete ? "danger" : "warning"}
        />
      ) : null}
      {activityToDelete ? (
        <ConfirmationDialog
          confirmLabel={t("wallets.deleteActivity") || "Hapus Aktivitas"}
          description={t("wallets.deleteActivityConfirm") || "Apakah Anda yakin ingin menghapus catatan aktivitas ini? Hal ini hanya akan mengkalkulasi ulang pembagian performa investasi."}
          icon={Trash2}
          isLoading={deletingActivity}
          itemLabel={`${activityToDelete.activity_type === "realized_gain" ? "+ " : "- "}${formatCurrency(activityToDelete.amount, wallet.currency)}${activityToDelete.note ? ` (${activityToDelete.note})` : ""}`}
          onCancel={() => setActivityToDelete(null)}
          onConfirm={() => void handleDeleteActivity()}
          title={t("wallets.deleteActivity") || "Hapus Aktivitas"}
          tone="danger"
        />
      ) : null}
    </div>
  );
}
