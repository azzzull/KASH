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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
    >
      <div className="relative my-8 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 id="payment-modal-title" className="text-xl font-black text-slate-900">
              Record Payment
            </h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-600">
              {obligation.name} {isInstallment && payment.installment_number ? `(Installment #${payment.installment_number})` : ""}
            </p>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-kash-expense/30 bg-white p-3 text-xs font-bold text-kash-expense shadow-sm">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-5 space-y-4">
          {/* Amount Display */}
          <div className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm">
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
                Previous Payment
              </button>
            </div>
          </div>

          {/* Wallet Selector (if wallet mode) */}
          {paymentMode === "wallet" && (
            <SelectField
              id="payment-wallet"
              label="Select Wallet *"
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

          {/* Payment Date */}
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">Payment Date *</span>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
              required
            />
          </label>

          {/* Note */}
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">Note (Optional)</span>
            <input
              type="text"
              placeholder="e.g. Paid via mobile banking"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
            />
          </label>

          {/* Explanatory banner */}
          <div className="rounded-lg bg-slate-50 p-3 text-xs font-semibold text-slate-600">
            {paymentMode === "wallet"
              ? "Will create an Expense transaction and decrease your wallet balance."
              : "Will record this payment as completed historically without creating any Expense transaction."}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Processing..." : "Confirm Payment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
