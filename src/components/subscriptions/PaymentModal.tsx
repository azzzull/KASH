import { CheckCircle2, History, WalletCards, X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { formatCurrency } from "../../lib/money";
import { recordRecurringPayment, type RecurringObligationWithMeta } from "../../lib/subscriptions";
import type { PaymentMode, RecurringPayment, Wallet } from "../../types/domain";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { SelectField } from "../ui/SelectField";

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
      setError("Please select a wallet.");
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default"
        aria-label="Close modal backdrop"
        onClick={onClose}
      />

      <div className="relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl border border-slate-200 bg-white shadow-2xl transition-all sm:max-h-[88dvh] sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h3 id="payment-modal-title" className="text-lg font-black text-slate-900 sm:text-xl">
              Record Payment
            </h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-600">
              {obligation.name} {isInstallment && payment.installment_number ? `(Installment #${payment.installment_number})` : ""}
            </p>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 sm:px-6">
            {error && (
              <div className="rounded-lg border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense shadow-sm">
                {error}
              </div>
            )}

            {/* Amount Display */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Amount to Pay
              </span>
              <p className="mt-1 text-2xl font-black text-slate-900">
                {formatCurrency(payment.amount)}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                Due Date: {new Date(payment.due_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>

            {/* Payment Mode Selector */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                Payment Method *
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
                  Already Paid
                </button>
              </div>
            </div>

            {/* Wallet Selection (If wallet mode) */}
            {paymentMode === "wallet" && (
              <SelectField
                id="payment-wallet"
                label="Deduct from Wallet *"
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
            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">Payment Date *</span>
              <input
                type="date"
                required
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
              />
            </label>

            {/* Note */}
            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">Note (Optional)</span>
              <input
                type="text"
                placeholder="e.g. Paid via BCA Virtual Account"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
              />
            </label>
          </div>

          {/* Fixed Footer */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/90 px-5 py-3.5 backdrop-blur-sm sm:px-6">
            <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              <CheckCircle2 size={16} />
              {saving ? "Recording..." : "Confirm Payment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
