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
import { useI18n } from "../../i18n";
import { useActiveSpace } from "../../context/ActiveSpaceContext";

type CreateObligationModalProps = {
  onClose: () => void;
  onSaved: () => void;
};

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
  const { t, formatCurrency } = useI18n();
  const { activeSpaceId } = useActiveSpace();
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

  const frequencyOptions = useMemo(() => [
    { value: "monthly", label: t("subscriptions.freqMonthly") || "Bulanan" },
    { value: "yearly", label: t("subscriptions.freqYearly") || "Tahunan" },
    { value: "weekly", label: t("subscriptions.freqWeekly") || "Mingguan" },
    { value: "quarterly", label: t("subscriptions.freqQuarterly") || "Triwulan" },
  ], [t]);

  const reminderOffsetOptions = useMemo(() => [
    { value: 7, label: t("subscriptions.daysBefore", { days: 7 }) || "7 hari sebelumnya" },
    { value: 3, label: t("subscriptions.daysBefore", { days: 3 }) || "3 hari sebelumnya" },
    { value: 1, label: t("subscriptions.daysBefore", { days: 1 }) || "1 hari sebelumnya" },
    { value: 0, label: t("subscriptions.dueDay") || "Hari H" },
  ], [t]);

  useEffect(() => {
    Promise.all([getActiveCategories(activeSpaceId ?? undefined), getWallets(activeSpaceId ?? undefined)])
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
  }, [activeSpaceId]);

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
      setError(t("subscriptions.nameRequired") || "Nama tagihan wajib diisi.");
      return;
    }

    const rawAmt = parseMoneyInputDigits(amount);
    if (!rawAmt || toNumber(rawAmt) <= 0) {
      setError(t("subscriptions.amountPositive") || "Nominal harus lebih besar dari 0.");
      return;
    }

    if (isInstallmentType) {
      const count = parseInt(installmentCount, 10);
      const paid = parseInt(alreadyPaidCount, 10) || 0;
      if (!count || count <= 0) {
        setError(t("subscriptions.installmentCountMin") || "Jumlah cicilan minimal 1.");
        return;
      }
      if (paid < 0 || paid > count) {
        setError(t("subscriptions.alreadyPaidCountRange", { max: count }) || `Cicilan yang sudah dibayar harus antara 0 dan ${count}.`);
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
      spaceId: activeSpaceId ?? undefined,
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
      title={t("subscriptions.addRecurringObligation") || "Tambah Kewajiban Rutin"}
      description={t("subscriptions.addRecurringObligationDesc") || "Lacak langganan, tagihan, PayLater, atau cicilan bulanan"}
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
                {t("subscriptions.obligationType") || "Tipe Tagihan"}
              </span>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { id: "subscription", label: t("subscriptions.typeSubscription") || "Langganan" },
                  { id: "bill", label: t("subscriptions.typeBill") || "Tagihan / Utilitas" },
                  { id: "paylater", label: "PayLater" },
                  { id: "installment", label: t("subscriptions.typeInstallment") || "Cicilan" },
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
                label={t("subscriptions.obligationName") || "Nama Tagihan / Layanan"}
                required
                placeholder={type === "subscription" ? "e.g. Netflix, Spotify" : type === "bill" ? "e.g. Listrik PLN, WiFi" : "e.g. SPayLater, Tokopedia Cicilan"}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <FormField
                id="obligation-provider"
                label={t("subscriptions.providerOptional") || "Penyedia Layanan (Opsional)"}
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
                label={isInstallmentType ? (t("subscriptions.installmentAmountPerMonth") || "Nominal Cicilan / Bulan") : (t("subscriptions.billingAmount") || "Nominal Tagihan")}
                placeholder="150.000"
                value={amount}
                onChange={(e) => setAmount(formatMoneyDigits(e.target.value))}
              />

              {!isInstallmentType ? (
                <SelectField
                  id="obligation-frequency"
                  label={t("subscriptions.billingFrequency") || "Frekuensi Penagihan"}
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                >
                  {frequencyOptions.map((opt) => (
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
                  label={t("subscriptions.tenorInstallments") || "Tenor (Jumlah Bulan Cicilan)"}
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(e.target.value)}
                />
              )}
            </div>

            {/* Quick Tenor Presets for PayLater & Installments */}
            {isInstallmentType && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[11px] font-bold text-slate-500">{t("subscriptions.quickTenor") || "Pilihan Tenor:"}</span>
                {[
                  { count: "1", label: t("subscriptions.tenor1Month") || "1 Bulan (Bayar Bulan Depan)" },
                  { count: "3", label: t("subscriptions.tenor3Months") || "3 Bulan" },
                  { count: "6", label: t("subscriptions.tenor6Months") || "6 Bulan" },
                  { count: "12", label: t("subscriptions.tenor12Months") || "12 Bulan" },
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
                  <span className="font-bold text-slate-600">{t("subscriptions.calculatedTotalContract") || "Estimasi Total Nilai Kontrak:"}</span>
                  <span className="font-black text-slate-900">
                    {formatCurrency(calculatedTotalAmount, "IDR")}
                  </span>
                </div>

                <div className="mt-3 border-t border-kash-emerald/10 pt-3">
                  <span className="block text-xs font-bold text-slate-700">
                    {t("subscriptions.alreadyPaidPrior") || "Cicilan yang sudah terbayar sebelum pakai KASH:"}
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
                      {t("subscriptions.ofTenorRemaining", { total: installmentCount, remaining: Math.max(0, parseInt(installmentCount, 10) - (parseInt(alreadyPaidCount, 10) || 0)) }) || `dari ${installmentCount} bulan (${Math.max(0, parseInt(installmentCount, 10) - (parseInt(alreadyPaidCount, 10) || 0))} tersisa)`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* First Due Date & Category */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DatePickerField
                id="obligation-due-date"
                label={t("subscriptions.firstDueDate") || "Jatuh Tempo Pertama"}
                value={startDate}
                onChange={(val) => setStartDate(val)}
              />

              <SelectField
                id="obligation-category"
                label={t("subscriptions.expenseCategory") || "Kategori Pengeluaran"}
                action={
                  <button
                    type="button"
                    onClick={() => setShowQuickCategoryModal(true)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-kash-emerald transition hover:text-kash-emeraldDark focus:outline-none"
                  >
                    <Plus size={13} strokeWidth={2.5} />
                    {t("common.add") || "Tambah"}
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
                <option value="">{t("categories.noCategory") || "Tanpa Kategori"}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
                <option value="__create_new__">+ {t("categories.addNewCategory") || "Tambah Kategori Baru..."}</option>
              </SelectField>
            </div>

            {/* Default Wallet */}
            <SelectField
              id="obligation-default-wallet"
              label={t("subscriptions.defaultPaymentWalletOptional") || "Dompet Pembayaran Utama (Opsional)"}
              value={defaultWalletId}
              onChange={(e) => setDefaultWalletId(e.target.value)}
            >
              <option value="">{t("subscriptions.chooseWalletOptional") || "Pilih Dompet (Opsional)"}</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({formatCurrency(w.balance?.current_balance ?? w.initial_balance, "IDR")})
                </option>
              ))}
            </SelectField>

            {/* Reminder Settings */}
            <div>
              <span className="block text-sm font-bold text-slate-900">
                {t("subscriptions.reminderNotifications") || "Pengingat Notifikasi"}
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {reminderOffsetOptions.map((opt) => {
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
              label={t("transactions.noteOptional") || "Catatan (Opsional)"}
              placeholder={t("subscriptions.notePlaceholder") || "mis. Berlangganan bersama keluarga, autodebet"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Fixed Footer (Sticky Actions) */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/90 px-5 py-3.5 backdrop-blur-sm sm:px-6">
            <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
              {t("common.cancel") || "Batal"}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (t("common.saving") || "Menyimpan...") : (t("subscriptions.saveObligation") || "Simpan Tagihan")}
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
