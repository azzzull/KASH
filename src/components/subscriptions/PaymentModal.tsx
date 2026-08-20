import { CheckCircle2, History, WalletCards, X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { formatCurrency } from "../../lib/money";
import { recordRecurringPayment, type RecurringObligationWithMeta } from "../../lib/subscriptions";
import type { PaymentMode, RecurringPayment, Wallet } from "../../types/domain";
import { Button } from "../ui/Button";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";
import { useI18n } from "../../i18n";

type PaymentModalProps = {
  obligation: RecurringObligationWithMeta;
  payment: RecurringPayment;
  wallets: Wallet[];
  onClose: () => void;
  onPaid: () => void;
};

export function PaymentModal({
  obligation,
  onClose,
  onPaid,
  payment,
  wallets,
}: PaymentModalProps) {
  const { t, formatDate, formatCurrency } = useI18n();
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("wallet");
  const [selectedWalletId, setSelectedWalletId] = useState<string>(
    obligation.default_wallet_id || (wallets.length > 0 ? wallets[0].id : ""),
  );
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInstallment = obligation.type === "paylater" || obligation.type === "installment";

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    if (paymentMode === "wallet" && !selectedWalletId) {
      setError(t("debts.selectWalletError") || "Silakan pilih dompet.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error: payError } = await recordRecurringPayment({
      paymentId: payment.id,
      paymentMode,
      walletId: paymentMode === "wallet" ? selectedWalletId : null,
      paidAt: new Date(paidAt).toISOString(),
      note: note.trim() || undefined,
    });

    if (payError) {
      setError(payError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onPaid();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="md"
      title={t("subscriptions.recordPayment") || "Catat Pembayaran"}
      description={`${obligation.name} ${isInstallment && payment.installment_number ? `(${t("subscriptions.installmentNumber", { number: payment.installment_number }) || `Cicilan #${payment.installment_number}`})` : ""}`}
    >
      <form onSubmit={submit} className="grid w-full max-w-full min-w-0 gap-4">
        {error && (
          <div className="rounded-lg border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense shadow-sm">
            {error}
          </div>
        )}

        {/* Amount Display */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            {t("subscriptions.amountToPay") || "Jumlah yang Dibayar"}
          </span>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {formatCurrency(payment.amount, "IDR")}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            {t("debts.dueDate") || "Jatuh Tempo"}: {formatDate(new Date(payment.due_date))}
          </p>
        </div>

        {/* Payment Mode Selector */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
            {t("debts.settlementMethod") || "Metode Pembayaran"} *
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMode("wallet")}
              className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-extrabold transition ${
                paymentMode === "wallet"
                  ? "bg-kash-emerald text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <WalletCards size={15} />
              {t("debts.payFromWallet") || "Potong Dompet"}
            </button>

            <button
              type="button"
              onClick={() => setPaymentMode("historical")}
              className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-extrabold transition ${
                paymentMode === "historical"
                  ? "bg-kash-emerald text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <History size={15} />
              {t("debts.alreadySettled") || "Sudah Terbayar"}
            </button>
          </div>
        </div>

        {/* Wallet Selection (If wallet mode) */}
        {paymentMode === "wallet" && (
          <SelectField
            id="payment-wallet"
            label={`${t("debts.deductWallet")} *`}
            value={selectedWalletId}
            onChange={(e) => setSelectedWalletId(e.target.value)}
          >
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </SelectField>
        )}

        {/* Paid Date */}
        <DatePickerField
          id="payment-date"
          label={t("debts.paymentDate") || "Tanggal Pembayaran"}
          value={paidAt}
          onChange={(val) => setPaidAt(val)}
        />

        {/* Note */}
        <FormField
          id="payment-note"
          label={t("transactions.noteOptional") || "Catatan (Opsional)"}
          placeholder={t("subscriptions.paidViaHint") || "mis. Dibayar via BCA Virtual Account"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            {t("common.cancel") || "Batal"}
          </Button>
          <Button type="submit" disabled={saving}>
            <CheckCircle2 size={16} />
            {saving ? (t("common.saving") || "Menyimpan...") : (t("debts.confirmPayment") || "Konfirmasi Pembayaran")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
