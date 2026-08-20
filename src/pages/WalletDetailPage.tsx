import { ArrowLeft, Archive, Edit3, History, LineChart, Loader2, SlidersHorizontal, Trash2, TrendingDown, TrendingUp, WalletCards, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { DatePickerField } from "../components/ui/DatePickerField";
import { FormField } from "../components/ui/FormField";
import { IconButton } from "../components/ui/IconButton";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { ToggleField } from "../components/ui/ToggleField";
import { useI18n } from "../i18n";
import { appEvents, emitTransactionSaved } from "../lib/appEvents";
import { useAppEvent } from "../hooks/useAppEvent";
import { formatCurrency, formatDatabaseMoneyDigits, formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../lib/money";
import { createAdjustment } from "../lib/transactions";
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
  deleteWallet,
  getInvestmentValuationHistory,
  getWalletById,
  getWalletLinkedGoalCount,
  getWalletTransactionCount,
  recordInvestmentValuation,
  updateWallet,
  type WalletWithBalance,
} from "../lib/wallets";
import type { InvestmentValuation, WalletType } from "../types/domain";

type WalletEditState = {
  name: string;
  walletType: WalletType;
  institutionName: string;
  initialBalance: string;
  currency: string;
  includeInNetWorth: boolean;
  icon: string;
  color: string;
};

function toEditState(wallet: WalletWithBalance): WalletEditState {
  return {
    name: wallet.name,
    walletType: wallet.wallet_type,
    institutionName: wallet.institution_name ?? "",
    initialBalance: formatDatabaseMoneyDigits(wallet.initial_balance),
    currency: wallet.currency,
    includeInNetWorth: wallet.include_in_net_worth,
    icon: wallet.icon ?? "wallet",
    color: wallet.color ?? "#10B981",
  };
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-normal text-slate-600">{label}</p>
      <p className="mt-2 text-lg font-extrabold text-slate-900">{value}</p>
    </article>
  );
}

function EditWalletModal({
  canEditInitialBalance,
  onClose,
  onSaved,
  wallet,
}: {
  canEditInitialBalance: boolean;
  onClose: () => void;
  onSaved: () => void;
  wallet: WalletWithBalance;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<WalletEditState>(toEditState(wallet));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedType = getWalletTypeOption(form.walletType);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    const institutionName = selectedType.needsInstitution ? form.institutionName.trim() : "";
    const initialBalance = parseMoneyInputDigits(form.initialBalance);

    if (!name) {
      setError(t("wallets.nameRequired") || "Nama dompet wajib diisi.");
      return;
    }

    if (selectedType.needsInstitution && !institutionName) {
      setError(t("wallets.institutionRequired") || "Institusi / Bank wajib diisi untuk tipe dompet ini.");
      return;
    }

    if (canEditInitialBalance && !initialBalance) {
      setError(t("wallets.initialBalanceRequired") || "Saldo awal wajib diisi. Masukkan 0 jika kosong.");
      return;
    }

    setSaving(true);
    setError(null);
    const { error: updateError } = await updateWallet(wallet.id, {
      name,
      walletType: form.walletType,
      institutionName: selectedType.needsInstitution ? institutionName : null,
      initialBalance: canEditInitialBalance ? initialBalance : undefined,
      currency: form.currency,
      includeInNetWorth: form.includeInNetWorth,
      icon: form.icon,
      color: form.color,
    });

    if (updateError) {
      setError(t("wallets.updateError") || "Gagal memperbarui dompet. Silakan periksa data dan coba lagi.");
      setSaving(false);
      return;
    }

    onSaved();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title={t("wallets.edit") || "Edit Dompet"}
      description={t("wallets.editDesc") || "Perubahan saldo sebaiknya melalui buku besar setelah ada transaksi."}
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}
        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <SelectField
            disabled
            id="edit-wallet-type"
            label={t("wallets.type") || "Tipe Dompet"}
            onChange={(event) => setForm((current) => ({ ...current, walletType: event.target.value as WalletType }))}
            value={form.walletType}
          >
            {walletTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <FormField id="edit-wallet-name" label={t("wallets.name") || "Nama Dompet"} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
          {selectedType.needsInstitution ? (
            <FormField
              id="edit-institution-name"
              label={t("wallets.institution") || "Institusi / Bank"}
              onChange={(event) => setForm((current) => ({ ...current, institutionName: event.target.value }))}
              value={form.institutionName}
            />
          ) : null}
          <FormField
            disabled={!canEditInitialBalance}
            hint={
              canEditInitialBalance
                ? (t("wallets.initialBalanceEditable") || "Dapat diedit selama dompet ini belum memiliki riwayat transaksi.")
                : (t("wallets.initialBalanceLocked") || "Terkunci karena dompet ini sudah memiliki riwayat transaksi.")
            }
            id="edit-initial-balance"
            inputMode="numeric"
            label={t("wallets.initialBalance") || "Saldo Awal"}
            onChange={(event) => setForm((current) => ({ ...current, initialBalance: formatMoneyDigits(event.target.value) }))}
            value={form.initialBalance}
          />
          <SelectField disabled id="edit-currency" label={t("wallets.currency") || "Mata Uang"} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))} value={form.currency}>
            <option value="IDR">IDR - Indonesian Rupiah</option>
          </SelectField>
          <SelectField id="edit-wallet-icon" label={t("wallets.icon") || "Ikon"} onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))} value={form.icon}>
            {walletIconOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <fieldset>
            <legend className="text-sm font-bold text-slate-900">{t("wallets.colorAccent") || "Aksen Warna"}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {walletColors.map((color) => (
                <button
                  aria-label={`Use ${color}`}
                  className={`h-9 w-9 rounded-full border-2 ${form.color === color ? "border-slate-900" : "border-white"} shadow-sm ring-1 ring-slate-200`}
                  key={color}
                  onClick={() => setForm((current) => ({ ...current, color }))}
                  style={{ backgroundColor: color }}
                  type="button"
                />
              ))}
            </div>
          </fieldset>
          <ToggleField
            checked={form.includeInNetWorth}
            description={t("wallets.includeInNetWorthHelp") || "Dompet yang disertakan akan dihitung dalam Total Aset."}
            id="edit-include-net-worth"
            label={t("wallets.includeInNetWorth") || "Sertakan dalam Kekayaan Bersih"}
            onChange={(event) => setForm((current) => ({ ...current, includeInNetWorth: event.target.checked }))}
          />
          <Button disabled={saving} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            {saving ? (t("common.saving") || "Menyimpan...") : (t("common.saveChanges") || "Simpan Perubahan")}
          </Button>
        </form>
      </div>
    </Modal>
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

function currentLocalDateTimeValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function AdjustmentModal({
  currentBalance,
  onClose,
  onSaved,
  wallet,
}: {
  currentBalance: string | number;
  onClose: () => void;
  onSaved: () => void;
  wallet: WalletWithBalance;
}) {
  const { t, formatCurrency } = useI18n();
  const [actualBalance, setActualBalance] = useState("");
  const [reason, setReason] = useState("");
  const [transactionDate, setTransactionDate] = useState(currentLocalDateTimeValue());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actualDigits = parseMoneyInputDigits(actualBalance);
  const currentAmount = toNumber(currentBalance);
  const actualAmount = toNumber(actualDigits);
  const adjustmentAmount = actualDigits ? actualAmount - currentAmount : 0;
  const signedAdjustment = adjustmentAmount < 0 ? `-${Math.abs(adjustmentAmount)}` : String(adjustmentAmount);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    if (!actualDigits) {
      setError(t("wallets.actualBalanceRequired") || "Saldo riil wajib diisi.");
      return;
    }

    if (adjustmentAmount === 0) {
      setError(t("wallets.adjustmentNonZero") || "Nilai penyesuaian tidak boleh nol.");
      return;
    }

    if (!reason.trim()) {
      setError(t("wallets.adjustmentReasonRequired") || "Alasan penyesuaian wajib diisi.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: adjustmentError } = await createAdjustment({
        amount: signedAdjustment,
        reason: reason.trim(),
        transactionDate,
        walletId: wallet.id,
      });

      if (adjustmentError) {
        console.error("Failed to create adjustment", adjustmentError);
        setError(t("wallets.saveAdjustmentError") || "Gagal menyimpan penyesuaian. Silakan periksa data dan coba lagi.");
        setSaving(false);
        return;
      }

      emitTransactionSaved();
      onSaved();
    } catch (adjustmentError) {
      console.error("Failed to create adjustment", adjustmentError);
      setError(t("wallets.saveAdjustmentErrorAuth") || "Gagal menyimpan penyesuaian. Silakan coba lagi.");
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="md"
      title={t("wallets.adjustBalance") || "Sesuaikan Saldo"}
      description={t("wallets.adjustBalanceDesc") || "Sesuaikan saldo KASH dengan saldo riil pada dompet ini."}
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-600">{t("wallets.currentKashBalance") || "Saldo KASH Saat Ini"}</p>
            <p className="mt-2 text-xl font-extrabold text-slate-900">{formatCurrency(currentBalance, wallet.currency)}</p>
          </div>
          <FormField
            id="actual-balance"
            inputMode="numeric"
            label={t("wallets.actualBalance") || "Saldo Riil / Fisik"}
            onChange={(event) => setActualBalance(formatMoneyDigits(event.target.value))}
            placeholder="600.000"
            value={actualBalance}
          />
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-600">{t("wallets.adjustment") || "Penyesuaian"}</p>
            <p className={`mt-2 text-xl font-extrabold ${adjustmentAmount < 0 ? "text-kash-expense" : "text-kash-income"}`}>
              {adjustmentAmount === 0 ? formatCurrency(0, wallet.currency) : `${adjustmentAmount > 0 ? "+" : "-"}${formatCurrency(Math.abs(adjustmentAmount), wallet.currency)}`}
            </p>
          </div>
          <DatePickerField
            id="adjustment-date"
            label={t("common.date") || "Tanggal"}
            enableTime
            onChange={(val) => setTransactionDate(val)}
            value={transactionDate}
          />
          <FormField id="adjustment-reason" label={t("wallets.adjustmentReason") || "Alasan Penyesuaian"} onChange={(event) => setReason(event.target.value)} placeholder={t("wallets.adjustmentReasonPlaceholder") || "mis. Koreksi hitung kas fisik"} value={reason} />
          <Button disabled={saving} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            {saving ? (t("common.saving") || "Menyimpan...") : (t("wallets.saveAdjustment") || "Simpan Penyesuaian")}
          </Button>
        </form>
      </div>
    </Modal>
  );
}

function UpdateValuationModal({
  costBasis,
  currentMarketValue,
  onClose,
  onSaved,
  wallet,
}: {
  costBasis: string | number;
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
  const costBasisAmount = toNumber(costBasis);
  const unrealizedGain = marketValueDigits ? nextMarketValue - costBasisAmount : 0;
  const returnPct = costBasisAmount > 0 ? (unrealizedGain / costBasisAmount) * 100 : 0;

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
      title={
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-kash-emerald">
            <LineChart aria-hidden="true" size={20} />
          </span>
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">{t("wallets.updateInvestmentValuation") || "Update Nilai Investasi"}</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-600">
              {t("wallets.updateValuationDesc") || "Pembaruan nilai pasar tidak mengubah arus kas riil (pemasukan/pengeluaran)."}
            </p>
          </div>
        </div>
      }
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
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t("wallets.costBasis") || "Modal Masuk (Cost Basis)"}</p>
              <p className="mt-1 text-sm font-extrabold text-slate-900">{formatCurrency(costBasisAmount, wallet.currency)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t("wallets.previousMarketValue") || "Nilai Pasar Sebelumnya"}</p>
              <p className="mt-1 text-sm font-extrabold text-slate-900">{formatCurrency(currentMarketValue, wallet.currency)}</p>
            </div>
          </div>

          <FormField
            id="investment-market-value"
            inputMode="numeric"
            label={t("wallets.currentMarketValueLabel") || "Nilai Pasar Saat Ini (Current Market Value)"}
            onChange={(event) => setMarketValueInput(formatMoneyDigits(event.target.value))}
            placeholder={t("wallets.marketValuePlaceholder") || "Contoh: 10.500.000"}
            value={marketValueInput}
          />

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">{t("wallets.unrealizedGainLoss") || "Keuntungan / Kerugian (Unrealized)"}</span>
              <span className={`text-xs font-extrabold ${unrealizedGain >= 0 ? "text-kash-emerald" : "text-kash-expense"}`}>
                {returnPct >= 0 ? "+" : ""}{returnPct.toFixed(2)}%
              </span>
            </div>
            <p className={`mt-2 text-xl font-extrabold ${unrealizedGain >= 0 ? "text-kash-emerald" : "text-kash-expense"}`}>
              {unrealizedGain === 0 ? formatCurrency(0, wallet.currency) : `${unrealizedGain > 0 ? "+" : "-"}${formatCurrency(Math.abs(unrealizedGain), wallet.currency)}`}
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

export function WalletDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, formatDate, formatCurrency } = useI18n();
  const [wallet, setWallet] = useState<WalletWithBalance | null>(null);
  const [valuations, setValuations] = useState<InvestmentValuation[]>([]);
  const [linkedGoalCount, setLinkedGoalCount] = useState(0);
  const [transactionCount, setTransactionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [showValuation, setShowValuation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWallet = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const [{ data, error: walletError }, { count, error: countError }, { count: goalCount, error: goalCountError }] = await Promise.all([
      getWalletById(id),
      getWalletTransactionCount(id),
      getWalletLinkedGoalCount(id),
    ]);

    if (walletError || countError || goalCountError || !data) {
      setError(t("wallets.loadDetailError") || "Gagal memuat dompet ini. Dompet mungkin tidak ada atau Anda tidak memiliki akses.");
      setLoading(false);
      return;
    }

    setWallet(data);
    setTransactionCount(count);
    setLinkedGoalCount(goalCount);

    if (data.wallet_type === "investment") {
      try {
        const valHistory = await getInvestmentValuationHistory(id);
        setValuations((valHistory.data as any) ?? []);
      } catch (err) {
        console.warn("Failed to load valuation history", err);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadWallet();
  }, [id]);

  useAppEvent(appEvents.transactionSaved, () => void loadWallet());
  useAppEvent(appEvents.goalSaved, () => void loadWallet());

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
  const currentBalance = wallet.balance?.current_balance ?? wallet.initial_balance;
  const availableBalance = wallet.balance?.available_balance ?? currentBalance;
  const costBasis = wallet.balance?.cost_basis ?? wallet.initial_balance;
  const unrealizedGainLoss = toNumber(wallet.balance?.unrealized_gain_loss ?? 0);
  const returnPercentage = Number(wallet.balance?.return_percentage ?? 0);
  const lastValuationAt = wallet.balance?.last_valuation_at;
  const canEditInitialBalance = transactionCount === 0;
  const canHardDelete = transactionCount === 0 && linkedGoalCount === 0;

  return (
    <div className="w-full min-w-0 space-y-5">
      <Link className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-kash-emerald" to="/wallets">
        <ArrowLeft aria-hidden="true" size={17} />
        {t("wallets.title") || "Dompet"}
      </Link>

      <PageHeader
        eyebrow={wallet.goal_name ? (t("wallets.goalPocket") || "Kantong Target") : wallet.wallet_type === "savings" ? (t("wallets.savingsPocket") || "Kantong Tabungan") : typeOption.label}
        icon={Icon}
        title={wallet.name}
        description={wallet.institution_name ?? (t("wallets.detailSubtitle") || "Rincian dompet dan kontrol saldo.")}
        actions={
          <div className="flex flex-wrap gap-2">
            {isInvestment ? (
              <Button onClick={() => setShowValuation(true)}>
                <LineChart aria-hidden="true" size={17} />
                {t("wallets.updateInvestmentValuation") || "Update Nilai Investasi"}
              </Button>
            ) : null}
            <Button onClick={() => setShowEdit(true)} variant="secondary">
              <Edit3 aria-hidden="true" size={17} />
              {t("common.edit") || "Edit"}
            </Button>
            {!isInvestment ? (
              <Button onClick={() => setShowAdjustment(true)} variant="secondary">
                <SlidersHorizontal aria-hidden="true" size={17} />
                {t("wallets.adjustBalance") || "Sesuaikan Saldo"}
              </Button>
            ) : null}
            <Button disabled={deleting} onClick={() => setShowDelete(true)} variant="secondary">
              <Trash2 aria-hidden="true" size={17} />
              {t("common.delete") || "Hapus"}
            </Button>
          </div>
        }
      />

      {wallet.goal_id ? (
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-amber-800">
                {t("wallets.pocketLinkedToGoal") || "Kantong Terhubung ke Target Tabungan (Goal)"}
              </p>
              <p className="text-sm font-bold text-slate-900">
                {wallet.goal_name} {wallet.goal_target_amount ? `(${t("goals.target") || "Target"}: ${formatCurrency(Number(wallet.goal_target_amount), wallet.currency)})` : ""}
              </p>
            </div>
          </div>
          <Link
            to={`/goals/${wallet.goal_id}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-amber-700 self-start sm:self-center"
          >
            {t("wallets.viewGoalTarget") || "Lihat Target Goal"}
          </Link>
        </section>
      ) : null}

      {isInvestment ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <LineChart className="text-kash-emerald" size={18} />
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900">{t("wallets.investmentPerformance") || "Performa Investasi"}</h3>
            </div>
            {lastValuationAt ? (
              <span className="text-xs font-semibold text-slate-500">
                {t("wallets.lastValuation") || "Valuasi Terakhir"}: {formatDate(new Date(lastValuationAt))}
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-bold uppercase tracking-normal text-slate-600">{t("wallets.currentMarketValue") || "Nilai Pasar Saat Ini"}</p>
              <p className="mt-2 text-xl font-extrabold text-slate-900">{formatCurrency(currentBalance, wallet.currency)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-bold uppercase tracking-normal text-slate-600">{t("wallets.costBasis") || "Modal Masuk (Cost Basis)"}</p>
              <p className="mt-2 text-xl font-extrabold text-slate-900">{formatCurrency(costBasis, wallet.currency)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-bold uppercase tracking-normal text-slate-600">{t("wallets.gainLoss") || "Keuntungan / Kerugian"}</p>
              <div className="mt-2 flex items-center gap-2">
                <p className={`text-xl font-extrabold ${unrealizedGainLoss >= 0 ? "text-kash-emerald" : "text-kash-expense"}`}>
                  {unrealizedGainLoss === 0 ? formatCurrency(0, wallet.currency) : `${unrealizedGainLoss > 0 ? "+" : "-"}${formatCurrency(Math.abs(unrealizedGainLoss), wallet.currency)}`}
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-bold uppercase tracking-normal text-slate-600">{t("wallets.totalReturn") || "Total Return"}</p>
              <div className="mt-2 flex items-center gap-1.5">
                {returnPercentage >= 0 ? (
                  <TrendingUp className="text-kash-emerald" size={18} />
                ) : (
                  <TrendingDown className="text-kash-expense" size={18} />
                )}
                <p className={`text-xl font-extrabold ${returnPercentage >= 0 ? "text-kash-emerald" : "text-kash-expense"}`}>
                  {returnPercentage >= 0 ? "+" : ""}{returnPercentage.toFixed(2)}%
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 text-xs font-semibold text-emerald-950">
            {t("wallets.valuationHelpNote") || "Pembaruan valuasi pasar tercatat sebagai keuntungan/kerugian modal (unrealized gain/loss), tanpa menghasilkan transaksi pengeluaran/pemasukan palsu."}
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <DetailMetric label={t("wallets.currentBalance") || "Saldo Saat Ini"} value={formatCurrency(currentBalance, wallet.currency)} />
            <DetailMetric label={t("wallets.availableBalance") || "Saldo Tersedia"} value={formatCurrency(availableBalance, wallet.currency)} />
            <DetailMetric label={t("wallets.initialBalance") || "Saldo Awal"} value={formatCurrency(wallet.initial_balance, wallet.currency)} />
            <DetailMetric label={t("wallets.type") || "Tipe Dompet"} value={typeOption.label} />
          </div>
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2">
        <DetailMetric label={t("wallets.currency") || "Mata Uang"} value={wallet.currency} />
        <DetailMetric label={t("wallets.includeInNetWorth") || "Sertakan dalam Kekayaan Bersih"} value={wallet.include_in_net_worth ? (t("common.yes") || "Ya") : (t("common.no") || "Tidak")} />
      </section>

      {isInvestment && valuations.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <History aria-hidden="true" className="text-slate-600" size={18} />
            <h3 className="text-base font-extrabold text-slate-900">{t("wallets.valuationHistory") || "Riwayat Valuasi Nilai Pasar"}</h3>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-bold uppercase text-slate-500">
                <tr>
                  <th className="pb-3">{t("wallets.valuationDate") || "Tanggal Valuasi"}</th>
                  <th className="pb-3 text-right">{t("wallets.marketValue") || "Nilai Pasar"}</th>
                  <th className="pb-3 text-right">{t("wallets.costBasis") || "Cost Basis"}</th>
                  <th className="pb-3 text-right">Gain / Loss</th>
                  <th className="pb-3 pl-4">{t("transactions.note") || "Catatan"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                {valuations.map((v) => {
                  const gain = toNumber(v.unrealized_gain_loss ?? (toNumber(v.market_value) - toNumber(v.cost_basis_at_valuation)));
                  return (
                    <tr key={v.id} className="hover:bg-slate-50/80">
                      <td className="py-3">
                        {formatDate(new Date(v.valuation_date))}
                      </td>
                      <td className="py-3 text-right font-extrabold text-slate-900">
                        {formatCurrency(v.market_value, wallet.currency)}
                      </td>
                      <td className="py-3 text-right text-slate-600">
                        {formatCurrency(v.cost_basis_at_valuation, wallet.currency)}
                      </td>
                      <td className={`py-3 text-right font-extrabold ${gain >= 0 ? "text-kash-emerald" : "text-kash-expense"}`}>
                        {gain >= 0 ? "+" : ""}{formatCurrency(gain, wallet.currency)}
                      </td>
                      <td className="py-3 pl-4 text-xs text-slate-600">
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

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <WalletCards aria-hidden="true" className="text-slate-600" size={18} />
          <h3 className="text-base font-extrabold text-slate-900">{t("dashboard.recentTransactions") || "Transaksi Terbaru"}</h3>
        </div>
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <h4 className="text-base font-extrabold text-slate-900">{t("transactions.emptyStateTitle") || "Belum ada transaksi."}</h4>
          <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-700">
            {t("wallets.transactionHistoryDesc") || "Riwayat transaksi untuk dompet ini akan muncul di sini."}
          </p>
        </div>
      </section>

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
          costBasis={costBasis}
          currentMarketValue={currentBalance}
          onClose={() => setShowValuation(false)}
          onSaved={() => {
            setShowValuation(false);
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
    </div>
  );
}
