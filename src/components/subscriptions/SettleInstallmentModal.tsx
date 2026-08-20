import { CheckCircle2, History, WalletCards, X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { formatCurrency } from "../../lib/money";
import { settleRemainingInstallment, type RecurringObligationWithMeta } from "../../lib/subscriptions";
import type { PaymentMode, Wallet } from "../../types/domain";
import { Button } from "../ui/Button";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";

type SettleInstallmentModalProps = {
  obligation: RecurringObligationWithMeta;
  wallets: Wallet[];
  onClose: () => void;
  onSettled: () => void;
};

export function SettleInstallmentModal({
  obligation,
  onClose,
  onSettled,
  wallets,
}: SettleInstallmentModalProps) {
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("wallet");
  const [selectedWalletId, setSelectedWalletId] = useState<string>(
    obligation.default_wallet_id || (wallets.length > 0 ? wallets[0].id : ""),
  );
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("Early settlement for remaining balance");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remainingCount = obligation.remaining_count;
  const remainingAmount = obligation.remaining_amount;

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    if (paymentMode === "wallet" && !selectedWalletId) {
      setError("Please select a wallet for settlement.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error: settleError } = await settleRemainingInstallment({
      obligationId: obligation.id,
      paymentMode,
      walletId: paymentMode === "wallet" ? selectedWalletId : null,
      paidAt: new Date(paidAt).toISOString(),
      note: note.trim() || undefined,
    });

    if (settleError) {
      setError(settleError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onSettled();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="md"
      title="Early Settlement"
      description={`${obligation.name} (${remainingCount} installments remaining)`}
    >
      <form onSubmit={submit} className="grid w-full max-w-full min-w-0 gap-4">
        {error && (
          <div className="rounded-lg border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense shadow-sm">
            {error}
          </div>
        )}

        {/* Settlement Amount Summary */}
        <div className="rounded-xl border border-kash-emerald/20 bg-kash-selected/30 p-4 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-kash-emeraldDark">
            Total Remaining Balance to Settle
          </span>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {formatCurrency(remainingAmount)}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            Settles {remainingCount} remaining installments at once
          </p>
        </div>

        {/* Payment Mode Selector */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
            Settlement Method *
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
              Pay from Wallet
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
              Already Settled
            </button>
          </div>
        </div>

        {/* Wallet Selection (If wallet mode) */}
        {paymentMode === "wallet" && (
          <SelectField
            id="settle-wallet"
            label="Deduct Total from Wallet *"
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
          id="settle-date"
          label="Settlement Date"
          value={paidAt}
          onChange={(val) => setPaidAt(val)}
        />

        {/* Note */}
        <FormField
          id="settle-note"
          label="Note (Optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            <CheckCircle2 size={16} />
            {saving ? "Settling..." : "Complete Settlement"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
