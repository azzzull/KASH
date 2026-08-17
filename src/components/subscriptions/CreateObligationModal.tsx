import { Bell, Check, Info, Plus, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { getActiveCategories } from "../../lib/categories";
import { formatCurrency, formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../../lib/money";
import { createRecurringObligation, type CreateRecurringObligationInput } from "../../lib/subscriptions";
import { getWallets, type WalletWithBalance } from "../../lib/wallets";
import type { Category, RecurringFrequency, RecurringObligationType } from "../../types/domain";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { SelectField } from "../ui/SelectField";

type CreateObligationModalProps = {
  onClose: () => void;
  onSaved: () => void;
};

const FREQUENCY_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "weekly", label: "Weekly" },
  { value: "quarterly", label: "Quarterly" },
];

const REMINDER_OFFSET_OPTIONS = [
  { value: 7, label: "7 days before" },
  { value: 3, label: "3 days before" },
  { value: 1, label: "1 day before" },
  { value: 0, label: "Due day" },
];

export function CreateObligationModal({ onClose, onSaved }: CreateObligationModalProps) {
  const [type, setType] = useState<RecurringObligationType>("subscription");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState("");
  const [defaultWalletId, setDefaultWalletId] = useState("");
  const [reminderOffsets, setReminderOffsets] = useState<number[]>([7, 3, 1, 0]);
  const [overdueReminder, setOverdueReminder] = useState(true);
  const [installmentCount, setInstallmentCount] = useState("12");
  const [alreadyPaidCount, setAlreadyPaidCount] = useState("0");
  const [note, setNote] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getActiveCategories(), getWallets()])
      .then(([catRes, walRes]) => {
        if (catRes.data) {
          const expCategories = (catRes.data as Category[]).filter((c) => c.category_type === "expense");
          setCategories(expCategories);
          if (expCategories.length > 0) setCategoryId(expCategories[0].id);
        }
        if (walRes.data) {
          setWallets(walRes.data);
        }
      })
      .catch(() => {});
  }, []);

  const isInstallmentType = type === "paylater" || type === "installment";

  const calculatedTotalAmount = useMemo(() => {
    if (!isInstallmentType) return 0;
    const rawAmt = toNumber(parseMoneyInputDigits(amount) || "0");
    const count = parseInt(installmentCount, 10) || 0;
    return rawAmt * count;
  }, [isInstallmentType, amount, installmentCount]);

  const toggleReminderOffset = (offset: number) => {
    setReminderOffsets((prev) =>
      prev.includes(offset) ? prev.filter((o) => o !== offset) : [...prev, offset].sort((a, b) => b - a),
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    const rawAmt = parseMoneyInputDigits(amount);
    if (!rawAmt || toNumber(rawAmt) <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }

    if (isInstallmentType) {
      const count = parseInt(installmentCount, 10);
      const paid = parseInt(alreadyPaidCount, 10) || 0;
      if (!count || count <= 0) {
        setError("Installment count must be at least 1.");
        return;
      }
      if (paid < 0 || paid > count) {
        setError(`Already paid installments must be between 0 and ${count}.`);
        return;
      }
    }

    setSaving(true);
    setError(null);

    const input: CreateRecurringObligationInput = {
      type,
      name: name.trim(),
      provider: provider.trim() || undefined,
      amount: rawAmt,
      startDate,
      frequency: isInstallmentType ? "monthly" : frequency,
      categoryId: categoryId || null,
      defaultWalletId: defaultWalletId || null,
      reminderOffsets,
      overdueReminderEnabled: overdueReminder,
      installmentCount: isInstallmentType ? parseInt(installmentCount, 10) : undefined,
      installmentTotalAmount: isInstallmentType ? String(calculatedTotalAmount) : undefined,
      alreadyPaidCount: isInstallmentType ? parseInt(alreadyPaidCount, 10) || 0 : 0,
      note: note.trim() || undefined,
    };

    const { error: saveError } = await createRecurringObligation(input);

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-obligation-title"
    >
      <div className="relative my-8 w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 id="create-obligation-title" className="text-xl font-black text-slate-900">
              Add Recurring Obligation
            </h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-600">
              Track subscriptions, bills, PayLater, or installments
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
          {/* Obligation Type Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Obligation Type *
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { id: "subscription", label: "Subscription" },
                { id: "bill", label: "Bill / Utility" },
                { id: "paylater", label: "PayLater" },
                { id: "installment", label: "Installment" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setType(item.id as RecurringObligationType)}
                  className={`rounded-lg py-2.5 text-center text-xs font-extrabold transition ${
                    type === item.id
                      ? "bg-kash-emerald text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name and Provider */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">Obligation Name *</span>
              <input
                type="text"
                placeholder={isInstallmentType ? "e.g. Cicilan iPhone 15" : "e.g. Netflix, Spotify"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
                required
              />
            </label>

            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">Provider / Merchant</span>
              <input
                type="text"
                placeholder="e.g. Apple, Shopee, PLN"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
              />
            </label>
          </div>

          {/* Amount and Frequency / Tenor */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                {isInstallmentType ? "Amount per Installment *" : "Amount per Cycle *"}
              </span>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-bold text-slate-600">
                  Rp
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(formatMoneyDigits(e.target.value))}
                  className="block h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-bold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
                  required
                />
              </div>
            </label>

            {!isInstallmentType ? (
              <SelectField
                id="ob-frequency"
                label="Billing Frequency *"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
              >
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </SelectField>
            ) : (
              <label className="block">
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">Total Installments (Tenor) *</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(e.target.value)}
                  className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
                  required
                />
              </label>
            )}
          </div>

          {/* Installment History & Calculation Preview */}
          {isInstallmentType && (
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">Already Paid Installments</span>
                  <input
                    type="number"
                    min={0}
                    max={parseInt(installmentCount, 10) || 12}
                    value={alreadyPaidCount}
                    onChange={(e) => setAlreadyPaidCount(e.target.value)}
                    className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
                  />
                </label>

                <div>
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">Total Contract Value</span>
                  <p className="mt-2 text-base font-black text-slate-900">
                    {formatCurrency(calculatedTotalAmount)}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-kash-emeraldDark">
                    Remaining: {Math.max(0, (parseInt(installmentCount, 10) || 0) - (parseInt(alreadyPaidCount, 10) || 0))} installments
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Start Date & Category */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">First Due Date *</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
                required
              />
            </label>

            <SelectField
              id="ob-category"
              label="Expense Category *"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </div>

          {/* Default Wallet */}
          <SelectField
            id="ob-wallet"
            label="Default Wallet (Optional)"
            value={defaultWalletId}
            onChange={(e) => setDefaultWalletId(e.target.value)}
          >
            <option value="">No default wallet</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} {w.balance ? `(${formatCurrency(w.balance.available_balance)})` : ""}
              </option>
            ))}
          </SelectField>

          {/* Reminder Settings */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Reminder Notifications
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {REMINDER_OFFSET_OPTIONS.map((opt) => {
                const active = reminderOffsets.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleReminderOffset(opt.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                      active
                        ? "bg-kash-selected text-kash-emeraldDark ring-1 ring-kash-emerald"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Bell size={13} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note */}
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">Note (Optional)</span>
            <input
              type="text"
              placeholder="e.g. Shared with family, automatic debit"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
            />
          </label>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Obligation"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
