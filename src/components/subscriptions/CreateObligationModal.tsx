import { Bell, Plus, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { getActiveCategories } from "../../lib/categories";
import { formatCurrency, formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../../lib/money";
import { createRecurringObligation, type CreateRecurringObligationInput } from "../../lib/subscriptions";
import { getWallets, type WalletWithBalance } from "../../lib/wallets";
import type { Category, RecurringFrequency, RecurringObligationType } from "../../types/domain";
import { QuickCreateCategoryModal } from "../categories/QuickCreateCategoryModal";
import { Button } from "../ui/Button";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { Modal } from "../ui/Modal";
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

function findSmartCategory(targetType: RecurringObligationType, catList: Category[]): string {
  const norm = (str: string) => str.toLowerCase().trim();

  if (targetType === "subscription") {
    const found = catList.find((c) => {
      const n = norm(c.name);
      return n.includes("langganan") || n.includes("subscription") || n.includes("hiburan") || n.includes("entertainment") || n.includes("digital");
    });
    if (found) return found.id;
  } else if (targetType === "bill") {
    const found = catList.find((c) => {
      const n = norm(c.name);
      return n.includes("tagihan") || n.includes("bill") || n.includes("utilitas") || n.includes("utility") || n.includes("listrik") || n.includes("air") || n.includes("internet") || n.includes("pulsa");
    });
    if (found) return found.id;
  } else if (targetType === "paylater" || targetType === "installment") {
    const found = catList.find((c) => {
      const n = norm(c.name);
      return n.includes("cicilan") || n.includes("installment") || n.includes("paylater") || n.includes("belanja") || n.includes("shopping");
    });
    if (found) return found.id;
  }

  return "";
}

export function CreateObligationModal({ onClose, onSaved }: CreateObligationModalProps) {
  const [type, setType] = useState<RecurringObligationType>("subscription");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState("");
  const [showQuickCategoryModal, setShowQuickCategoryModal] = useState(false);
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
          const smartCat = findSmartCategory(type, expCategories);
          if (smartCat) setCategoryId(smartCat);
        }
        if (walRes.data) {
          setWallets(walRes.data);
        }
      })
      .catch(() => {});
  }, []);

  const isInstallmentType = type === "paylater" || type === "installment";

  const handleTypeChange = (newType: RecurringObligationType) => {
    setType(newType);
    if (newType === "paylater") {
      setInstallmentCount("1");
    } else if (newType === "installment" && (installmentCount === "1" || !installmentCount)) {
      setInstallmentCount("12");
    }

    // Smart category adjustment if not manually customized
    const smartCat = findSmartCategory(newType, categories);
    if (smartCat) {
      setCategoryId(smartCat);
    }
  };

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
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title="Add Recurring Obligation"
      description="Track subscriptions, bills, PayLater, or installments"
    >
      <div>
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
              <span className="block text-sm font-bold text-slate-900">
                Obligation Type
              </span>
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
                    onClick={() => handleTypeChange(item.id as RecurringObligationType)}
                    className={`rounded-lg py-2.5 text-center text-xs font-extrabold transition ${
                      type === item.id
                        ? "bg-kash-emerald text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-700 hover:border-kash-emerald/40 hover:bg-slate-50"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Name and Provider */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                id="obligation-name"
                label="Obligation Name"
                required
                placeholder={type === "subscription" ? "e.g. Netflix, Spotify" : type === "bill" ? "e.g. Electricity, WiFi" : "e.g. SPayLater, Shopee Checkout"}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <FormField
                id="obligation-provider"
                label="Provider (Optional)"
                placeholder="e.g. Shopee, Gojek, Telkomsel, PLN"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
            </div>

            {/* Amount & Frequency / Tenor */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                id="obligation-amount"
                inputMode="numeric"
                required
                label={isInstallmentType ? "Installment Amount / Month" : "Billing Amount"}
                placeholder="150.000"
                value={amount}
                onChange={(e) => setAmount(formatMoneyDigits(e.target.value))}
              />

              {!isInstallmentType ? (
                <SelectField
                  id="obligation-frequency"
                  label="Billing Frequency"
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
                <FormField
                  id="obligation-tenor"
                  type="number"
                  min="1"
                  max="120"
                  required
                  label="Tenor (Installments / Months)"
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(e.target.value)}
                />
              )}
            </div>

            {/* Quick Tenor Presets for PayLater & Installments */}
            {isInstallmentType && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[11px] font-bold text-slate-500">Quick Tenor:</span>
                {[
                  { count: "1", label: "1 Bulan (Bayar Bulan Depan)" },
                  { count: "3", label: "3 Bulan" },
                  { count: "6", label: "6 Bulan" },
                  { count: "12", label: "12 Bulan" },
                ].map((preset) => (
                  <button
                    key={preset.count}
                    type="button"
                    onClick={() => setInstallmentCount(preset.count)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${
                      installmentCount === preset.count
                        ? "bg-kash-emerald text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-kash-emeraldDark"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}

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
                      of {installmentCount} months ({Math.max(0, parseInt(installmentCount, 10) - (parseInt(alreadyPaidCount, 10) || 0))} remaining)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* First Due Date & Category */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DatePickerField
                id="obligation-due-date"
                label="First Due Date"
                value={startDate}
                onChange={(val) => setStartDate(val)}
              />

              <SelectField
                id="obligation-category"
                label="Expense Category"
                action={
                  <button
                    type="button"
                    onClick={() => setShowQuickCategoryModal(true)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-kash-emerald transition hover:text-kash-emeraldDark focus:outline-none"
                  >
                    <Plus size={13} strokeWidth={2.5} />
                    Tambah
                  </button>
                }
                value={categoryId}
                onChange={(e) => {
                  if (e.target.value === "__create_new__") {
                    setShowQuickCategoryModal(true);
                  } else {
                    setCategoryId(e.target.value);
                  }
                }}
              >
                <option value="">No Category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
                <option value="__create_new__">+ Tambah Kategori Baru...</option>
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
              <span className="block text-sm font-bold text-slate-900">
                Reminder Notifications
              </span>
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
            <FormField
              id="obligation-note"
              label="Note (Optional)"
              placeholder="e.g. Shared with family, automatic debit"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
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

        <QuickCreateCategoryModal
          isOpen={showQuickCategoryModal}
          categoryType="expense"
          onClose={() => setShowQuickCategoryModal(false)}
          onCreated={(newCat) => {
            setCategories((prev) => {
              const exists = prev.some((c) => c.id === newCat.id);
              return exists ? prev.map((c) => (c.id === newCat.id ? newCat : c)) : [...prev, newCat];
            });
            setCategoryId(newCat.id);
            setShowQuickCategoryModal(false);
          }}
        />
      </div>
    </Modal>
  );
}
