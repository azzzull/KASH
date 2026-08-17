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
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-obligation-title"
    >
      {/* Backdrop click dismiss */}
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default"
        aria-label="Close modal backdrop"
        onClick={onClose}
      />

      <div className="relative flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-2xl border border-slate-200 bg-white shadow-2xl transition-all sm:max-h-[88dvh] sm:rounded-2xl">
        {/* Header (Fixed) */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h3 id="create-obligation-title" className="text-lg font-black text-slate-900 sm:text-xl">
              Add Recurring Obligation
            </h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-600">
              Track subscriptions, bills, PayLater, or installments
            </p>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 sm:px-6">
            {error && (
              <div className="rounded-lg border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense shadow-sm">
                {error}
              </div>
            )}

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
                  required
                  placeholder={type === "subscription" ? "e.g. Netflix, Spotify" : type === "bill" ? "e.g. Electricity, WiFi" : "e.g. iPhone 15, Laptop"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">Provider (Optional)</span>
                <input
                  type="text"
                  placeholder="e.g. Telkomsel, PLN, Kredivo"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
                />
              </label>
            </div>

            {/* Amount & Frequency */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  {isInstallmentType ? "Installment Amount / Month *" : "Billing Amount *"}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="150.000"
                  value={amount}
                  onChange={(e) => setAmount(formatMoneyDigits(e.target.value))}
                  className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
                />
              </label>

              {!isInstallmentType ? (
                <SelectField
                  id="obligation-frequency"
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
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Tenor (Installments) *
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    required
                    value={installmentCount}
                    onChange={(e) => setInstallmentCount(e.target.value)}
                    className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
                  />
                </label>
              )}
            </div>

            {/* Installment specific summary & already paid */}
            {isInstallmentType && (
              <div className="rounded-xl border border-kash-emerald/20 bg-kash-selected/30 p-3.5 sm:p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-600">Calculated Total Contract Value:</span>
                  <span className="font-black text-slate-900">
                    {formatCurrency(calculatedTotalAmount)}
                  </span>
                </div>

                <div className="mt-3 border-t border-kash-emerald/10 pt-3">
                  <label className="block">
                    <span className="block text-xs font-bold text-slate-700">
                      Already paid installments prior to KASH:
                    </span>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max={installmentCount}
                        value={alreadyPaidCount}
                        onChange={(e) => setAlreadyPaidCount(e.target.value)}
                        className="block h-10 w-24 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
                      />
                      <span className="text-xs font-semibold text-slate-600">
                        of {installmentCount} months ({parseInt(installmentCount, 10) - (parseInt(alreadyPaidCount, 10) || 0)} remaining)
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Start Date & Category */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  First Due / Start Date *
                </span>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
                />
              </label>

              <SelectField
                id="obligation-category"
                label="Expense Category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">No Category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </SelectField>
            </div>

            {/* Default Wallet */}
            <SelectField
              id="obligation-default-wallet"
              label="Default Payment Wallet (Optional)"
              value={defaultWalletId}
              onChange={(e) => setDefaultWalletId(e.target.value)}
            >
              <option value="">Choose Wallet (Optional)</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({formatCurrency(w.balance?.current_balance ?? w.initial_balance)})
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
          </div>

          {/* Fixed Footer (Sticky Actions) */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/90 px-5 py-3.5 backdrop-blur-sm sm:px-6">
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
