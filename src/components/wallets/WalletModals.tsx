import { Loader2 } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";
import { ToggleField } from "../ui/ToggleField";
import { useI18n } from "../../i18n";
import { emitTransactionSaved } from "../../lib/appEvents";
import {
  formatCurrency,
  formatDatabaseMoneyDigits,
  formatMoneyDigits,
  parseMoneyInputDigits,
  toNumber,
} from "../../lib/money";
import { createAdjustment } from "../../lib/transactions";
import {
  getWalletTypeOption,
  walletColors,
  walletIconOptions,
  walletTypeOptions,
} from "../../lib/walletMeta";
import { updateWallet, type WalletWithBalance } from "../../lib/wallets";
import type { WalletType } from "../../types/domain";

export type WalletEditState = {
  name: string;
  walletType: WalletType;
  institutionName: string;
  initialBalance: string;
  currency: string;
  includeInNetWorth: boolean;
  icon: string;
  color: string;
};

export function toWalletEditState(wallet: WalletWithBalance): WalletEditState {
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

export function currentLocalDateTimeValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function EditWalletModal({
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
  const [form, setForm] = useState<WalletEditState>(toWalletEditState(wallet));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedType = getWalletTypeOption(form.walletType);

  const isSpecialized =
    wallet.wallet_type === "investment" ||
    (wallet.wallet_type === "savings" && Boolean(wallet.goal_id));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    const institutionName = selectedType.needsInstitution
      ? form.institutionName.trim()
      : "";
    const initialBalance = parseMoneyInputDigits(form.initialBalance);

    if (!name) {
      setError(t("wallets.nameRequired") || "Nama dompet wajib diisi.");
      return;
    }

    if (selectedType.needsInstitution && !institutionName) {
      setError(
        t("wallets.institutionRequired") ||
          "Institusi / Bank wajib diisi untuk tipe dompet ini.",
      );
      return;
    }

    if (canEditInitialBalance && !initialBalance) {
      setError(
        t("wallets.initialBalanceRequired") ||
          "Saldo awal wajib diisi. Masukkan 0 jika kosong.",
      );
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
      setError(
        t("wallets.updateError") ||
          "Gagal memperbarui dompet. Silakan periksa data dan coba lagi.",
      );
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
      description={
        t("wallets.editDesc") ||
        "Perubahan saldo sebaiknya melalui buku besar setelah ada transaksi."
      }
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}
        <form
          className="grid w-full max-w-full min-w-0 gap-4"
          onSubmit={submit}
        >
          <SelectField
            disabled={isSpecialized || saving}
            id="edit-wallet-type"
            label={t("wallets.type") || "Tipe Dompet"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                walletType: event.target.value as WalletType,
              }))
            }
            value={form.walletType}
          >
            {walletTypeOptions
              .filter((opt) =>
                isSpecialized
                  ? opt.value === wallet.wallet_type
                  : !["investment"].includes(opt.value) &&
                    !(opt.value === "savings" && wallet.goal_id),
              )
              .map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </SelectField>
          <FormField
            id="edit-wallet-name"
            label={t("wallets.name") || "Nama Dompet"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            value={form.name}
          />
          {selectedType.needsInstitution ? (
            <FormField
              id="edit-institution-name"
              label={t("wallets.institution") || "Institusi / Bank"}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  institutionName: event.target.value,
                }))
              }
              value={form.institutionName}
            />
          ) : null}
          <FormField
            disabled={!canEditInitialBalance}
            hint={
              canEditInitialBalance
                ? t("wallets.initialBalanceEditable") ||
                  "Dapat diedit selama dompet ini belum memiliki riwayat transaksi."
                : t("wallets.initialBalanceLocked") ||
                  "Terkunci karena dompet ini sudah memiliki riwayat transaksi."
            }
            id="edit-initial-balance"
            inputMode="numeric"
            label={t("wallets.initialBalance") || "Saldo Awal"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                initialBalance: formatMoneyDigits(event.target.value),
              }))
            }
            value={form.initialBalance}
          />
          <SelectField
            disabled
            id="edit-currency"
            label={t("wallets.currency") || "Mata Uang"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                currency: event.target.value,
              }))
            }
            value={form.currency}
          >
            <option value="IDR">IDR - Indonesian Rupiah</option>
          </SelectField>
          <SelectField
            id="edit-wallet-icon"
            label={t("wallets.icon") || "Ikon"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                icon: event.target.value,
              }))
            }
            value={form.icon}
          >
            {walletIconOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <fieldset>
            <legend className="text-sm font-bold text-slate-900">
              {t("wallets.colorAccent") || "Aksen Warna"}
            </legend>
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
            description={
              t("wallets.includeInNetWorthHelp") ||
              "Dompet yang disertakan akan dihitung dalam Total Aset."
            }
            id="edit-include-net-worth"
            label={
              t("wallets.includeInNetWorth") ||
              "Sertakan dalam Kekayaan Bersih"
            }
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                includeInNetWorth: event.target.checked,
              }))
            }
          />
          <Button disabled={saving} type="submit">
            {saving ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={18} />
            ) : null}
            {saving
              ? t("common.saving") || "Menyimpan..."
              : t("common.saveChanges") || "Simpan Perubahan"}
          </Button>
        </form>
      </div>
    </Modal>
  );
}

export function AdjustmentModal({
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
  const [transactionDate, setTransactionDate] = useState(
    currentLocalDateTimeValue(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actualDigits = parseMoneyInputDigits(actualBalance);
  const currentAmount = toNumber(currentBalance);
  const actualAmount = toNumber(actualDigits);
  const adjustmentAmount = actualDigits ? actualAmount - currentAmount : 0;
  const signedAdjustment =
    adjustmentAmount < 0
      ? `-${Math.abs(adjustmentAmount)}`
      : String(adjustmentAmount);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    if (!actualDigits) {
      setError(t("wallets.actualBalanceRequired") || "Saldo riil wajib diisi.");
      return;
    }

    if (adjustmentAmount === 0) {
      setError(
        t("wallets.adjustmentNonZero") || "Nilai penyesuaian tidak boleh nol.",
      );
      return;
    }

    if (!reason.trim()) {
      setError(
        t("wallets.adjustmentReasonRequired") ||
          "Alasan penyesuaian wajib diisi.",
      );
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
        setError(
          t("wallets.saveAdjustmentError") ||
            "Gagal menyimpan penyesuaian. Silakan periksa data dan coba lagi.",
        );
        setSaving(false);
        return;
      }

      emitTransactionSaved();
      onSaved();
    } catch (adjustmentError) {
      console.error("Failed to create adjustment", adjustmentError);
      setError(
        t("wallets.saveAdjustmentErrorAuth") ||
          "Gagal menyimpan penyesuaian. Silakan coba lagi.",
      );
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="md"
      title={t("wallets.adjustBalance") || "Sesuaikan Saldo"}
      description={
        t("wallets.adjustBalanceDesc") ||
        "Sesuaikan saldo KASH dengan saldo riil pada dompet ini."
      }
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form
          className="grid w-full max-w-full min-w-0 gap-4"
          onSubmit={submit}
        >
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-600">
              {t("wallets.currentKashBalance") || "Saldo KASH Saat Ini"}
            </p>
            <p className="mt-2 text-xl font-extrabold text-slate-900">
              {formatCurrency(currentBalance, wallet.currency)}
            </p>
          </div>
          <FormField
            id="actual-balance"
            inputMode="numeric"
            label={t("wallets.actualBalance") || "Saldo Riil / Fisik"}
            onChange={(event) =>
              setActualBalance(formatMoneyDigits(event.target.value))
            }
            placeholder="600.000"
            value={actualBalance}
          />
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-600">
              {t("wallets.adjustment") || "Penyesuaian"}
            </p>
            <p
              className={`mt-2 text-xl font-extrabold ${adjustmentAmount < 0 ? "text-kash-expense" : "text-kash-income"}`}
            >
              {adjustmentAmount === 0
                ? formatCurrency(0, wallet.currency)
                : `${adjustmentAmount > 0 ? "+" : "-"}${formatCurrency(Math.abs(adjustmentAmount), wallet.currency)}`}
            </p>
          </div>
          <DatePickerField
            id="adjustment-date"
            label={t("common.date") || "Tanggal"}
            enableTime
            onChange={(val) => setTransactionDate(val)}
            value={transactionDate}
          />
          <FormField
            id="adjustment-reason"
            label={t("wallets.adjustmentReason") || "Alasan Penyesuaian"}
            onChange={(event) => setReason(event.target.value)}
            placeholder={
              t("wallets.adjustmentReasonPlaceholder") ||
              "mis. Koreksi hitung kas fisik"
            }
            value={reason}
          />
          <Button disabled={saving} type="submit">
            {saving ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={18} />
            ) : null}
            {saving
              ? t("common.saving") || "Menyimpan..."
              : t("wallets.saveAdjustment") || "Simpan Penyesuaian"}
          </Button>
        </form>
      </div>
    </Modal>
  );
}
