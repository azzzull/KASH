import { Check, CreditCard, FolderPlus, HandCoins, Layers, PiggyBank, Plus, Tag, Target, UserCheck, WalletCards, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { getActiveCategories } from "../../lib/categories";
import { getEnvelopes } from "../../lib/envelopes";
import { getActiveDebts, getCounterparties, type CounterpartyWithSummary } from "../../lib/debts";
import { getGoals, type GoalWithProgress } from "../../lib/goals";
import { getWallets, type WalletWithBalance } from "../../lib/wallets";
import { formatCurrency, formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../../lib/money";
import { createBudgetTarget } from "../../lib/budgets";
import type { BudgetTargetType, Category, DebtProgress, Envelope } from "../../types/domain";
import { QuickCreateCategoryModal } from "../categories/QuickCreateCategoryModal";
import { QuickCreateEnvelopeModal } from "../envelopes/QuickCreateEnvelopeModal";
import { Button } from "../ui/Button";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";
import { ToggleField } from "../ui/ToggleField";
import { useI18n } from "../../i18n";

type CreateBudgetModalProps = {
  initialMonth?: string; // YYYY-MM-DD
  onClose: () => void;
  onSaved: () => void;
};

export function CreateBudgetModal({ initialMonth, onClose, onSaved }: CreateBudgetModalProps) {
  const { t } = useI18n();
  const [targetType, setTargetType] = useState<BudgetTargetType>("category");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [envelopeId, setEnvelopeId] = useState("");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [isSpecificItemTarget, setIsSpecificItemTarget] = useState(false);
  const [debtId, setDebtId] = useState("");
  const [savingsMode, setSavingsMode] = useState<"pocket" | "goal">("pocket");
  const [goalId, setGoalId] = useState("");
  const [walletId, setWalletId] = useState("");
  const [showQuickCategoryModal, setShowQuickCategoryModal] = useState(false);
  const [showQuickEnvelopeModal, setShowQuickEnvelopeModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [startPeriod, setStartPeriod] = useState(() => {
    if (initialMonth) return `${initialMonth.substring(0, 7)}-01`;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [repeatMonthly, setRepeatMonthly] = useState(true);
  const [rolloverEnabled, setRolloverEnabled] = useState(false);
  const [note, setNote] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [counterparties, setCounterparties] = useState<CounterpartyWithSummary[]>([]);
  const [debts, setDebts] = useState<DebtProgress[]>([]);
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [savingsWallets, setSavingsWallets] = useState<WalletWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getActiveCategories(),
      getEnvelopes(),
      getCounterparties({ type: "debt", status: "active" }).catch(() => ({ counterparties: [] })),
      getActiveDebts().catch(() => []),
      getGoals().catch(() => ({ data: [] })),
      getWallets().catch(() => ({ data: [] })),
    ]).then(([catRes, envRes, cpRes, debtRes, goalRes, walletRes]) => {
      setLoading(false);
      if (catRes.data) {
        const expenseOnly = (catRes.data as Category[]).filter((c) => c.category_type === "expense");
        setCategories(expenseOnly);
      }
      if (envRes.data) {
        setEnvelopes(envRes.data);
      }
      if (cpRes && (cpRes as any).counterparties) {
        setCounterparties((cpRes as any).counterparties);
      }
      if (debtRes) {
        setDebts(debtRes);
      }
      if (goalRes.data) {
        setGoals(goalRes.data);
      }
      if (walletRes.data) {
        const pureSavingsOnly = (walletRes.data as WalletWithBalance[]).filter(
          (w) => w.wallet_type === "savings" && !w.goal_id
        );
        setSavingsWallets(pureSavingsOnly);
      }
    });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const rawAmount = parseMoneyInputDigits(amount);
    const numAmount = toNumber(rawAmount);

    if (numAmount <= 0) {
      setError(t("budgets.enterValidAmount") || "Masukkan nominal budget yang valid (lebih dari 0).");
      return;
    }

    if (targetType === "category" && !categoryId) {
      setError(t("budgets.chooseExpenseCategory") || "Pilih kategori pengeluaran.");
      return;
    }

    if (targetType === "envelope" && !envelopeId) {
      setError(t("budgets.chooseExpenseEnvelope") || "Pilih amplop pengeluaran.");
      return;
    }

    if (targetType === "debt") {
      if (isSpecificItemTarget && !debtId) {
        setError(t("budgets.chooseSpecificDebtItem") || "Pilih item utang spesifik yang ingin ditargetkan.");
        return;
      }
      if (!isSpecificItemTarget && !counterpartyId) {
        setError(t("budgets.chooseDebtContact") || "Pilih orang / kontak yang ingin dicicil utangnya.");
        return;
      }
    }

    if (targetType === "goal") {
      if (savingsMode === "pocket" && !walletId) {
        setError(t("budgets.chooseSavingsPocket") || "Pilih kantong tabungan (savings pocket) yang ingin ditargetkan.");
        return;
      }
      if (savingsMode === "goal" && !goalId) {
        setError(t("budgets.chooseSavingsGoal") || "Pilih target tabungan (goal) yang ingin ditargetkan.");
        return;
      }
    }

    let defaultName = "Budget";
    if (targetType === "category") {
      defaultName = categories.find((c) => c.id === categoryId)?.name ? `Budget ${categories.find((c) => c.id === categoryId)?.name}` : (t("budgets.categoryBudget") || "Budget Kategori");
    } else if (targetType === "envelope") {
      defaultName = envelopes.find((env) => env.id === envelopeId)?.name ? `Amplop ${envelopes.find((env) => env.id === envelopeId)?.name}` : (t("budgets.envelopeBudget") || "Budget Amplop");
    } else if (targetType === "debt") {
      if (isSpecificItemTarget && debtId) {
        const debtItem = debts.find((d) => d.debt_id === debtId);
        defaultName = debtItem?.title ? `${t("budgets.debtSettlement") || "Pelunasan"}: ${debtItem.title}` : (t("budgets.debtSettlement") || "Pelunasan Utang");
      } else {
        const cpItem = counterparties.find((c) => c.id === counterpartyId);
        defaultName = cpItem?.name ? `${t("budgets.debtPayment") || "Cicil Utang"}: ${cpItem.name}` : (t("budgets.debtPayment") || "Cicilan Utang");
      }
    } else if (targetType === "goal") {
      if (savingsMode === "pocket") {
        const wItem = savingsWallets.find((w) => w.id === walletId);
        defaultName = wItem?.name ? `${t("dashboard.savings") || "Nabung"}: ${wItem.name}` : (t("budgets.savingsPocket") || "Kantong Tabungan");
      } else {
        const gItem = goals.find((g) => g.id === goalId);
        defaultName = gItem?.name ? `${t("dashboard.savings") || "Tabungan"}: ${gItem.name}` : (t("budgets.monthlySavings") || "Tabungan Bulanan");
      }
    }

    setSaving(true);
    try {
      await createBudgetTarget({
        name: name.trim() || defaultName,
        targetType,
        amount: rawAmount,
        startPeriod,
        repeatMonthly,
        rolloverEnabled,
        categoryId: targetType === "category" ? categoryId : null,
        envelopeId: targetType === "envelope" ? envelopeId : null,
        counterpartyId: targetType === "debt" ? counterpartyId || null : null,
        debtId: targetType === "debt" && isSpecificItemTarget ? debtId || null : null,
        goalId: targetType === "goal" && savingsMode === "goal" ? goalId || null : null,
        walletId: targetType === "goal" && savingsMode === "pocket" ? walletId || null : null,
        note: note.trim() || null,
      });

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || (t("budgets.createBudgetFailed") || "Gagal membuat budget. Periksa kembali data Anda."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title={t("budgets.createTargetBudget") || "Buat Target Budget Baru"}
      description={t("budgets.planMonthlyAllocation") || "Rencanakan alokasi keuangan bulanan Anda secara terarah"}
    >
      <div>
        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
          {error && (
            <div className="rounded-lg border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">
              {error}
            </div>
          )}

          {/* Budget Target Type Selector Tabs */}
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-2">
              {t("budgets.planningTargetType") || "Jenis Target Perencanaan"}
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => setTargetType("category")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl p-2.5 text-center transition ${
                  targetType === "category"
                    ? "bg-kash-emerald text-white shadow-sm font-extrabold"
                    : "border border-slate-200 bg-white text-slate-600 font-bold hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-kash-emeraldDark"
                }`}
              >
                <Tag size={18} />
                <span className="text-xs">{t("budgets.category") || "Kategori"}</span>
              </button>

              <button
                type="button"
                onClick={() => setTargetType("envelope")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl p-2.5 text-center transition ${
                  targetType === "envelope"
                    ? "bg-kash-emerald text-white shadow-sm font-extrabold"
                    : "border border-slate-200 bg-white text-slate-600 font-bold hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-kash-emeraldDark"
                }`}
              >
                <Layers size={18} />
                <span className="text-xs">{t("budgets.envelope") || "Amplop"}</span>
              </button>

              <button
                type="button"
                onClick={() => setTargetType("debt")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl p-2.5 text-center transition ${
                  targetType === "debt"
                    ? "bg-kash-emerald text-white shadow-sm font-extrabold"
                    : "border border-slate-200 bg-white text-slate-600 font-bold hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-kash-emeraldDark"
                }`}
              >
                <HandCoins size={18} />
                <span className="text-xs">{t("budgets.debtPayment") || "Cicil Utang"}</span>
              </button>

              <button
                type="button"
                onClick={() => setTargetType("goal")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl p-2.5 text-center transition ${
                  targetType === "goal"
                    ? "bg-kash-emerald text-white shadow-sm font-extrabold"
                    : "border border-slate-200 bg-white text-slate-600 font-bold hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-kash-emeraldDark"
                }`}
              >
                <PiggyBank size={18} />
                <span className="text-xs">{t("dashboard.savings") || "Tabungan"}</span>
              </button>
            </div>
          </div>

          {/* Context Info Banner */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs font-semibold text-slate-700">
            {targetType === "category" && (t("budgets.categoryTargetContext") || "Target belanja pada kategori pengeluaran tertentu.")}
            {targetType === "envelope" && (t("budgets.envelopeTargetContext") || "Target belanja pada amplop tujuan spesifik.")}
            {targetType === "debt" && (t("budgets.debtTargetContext") || "Target pembayaran cicilan utang bulanan. Mengurangi kewajiban utang, bukan pengeluaran konsumtif.")}
            {targetType === "goal" && (t("budgets.goalTargetContext") || "Target menabung bulanan. Mengakumulasi aset masa depan, bukan pengeluaran konsumtif.")}
          </div>

          {/* Target Specific Selectors */}
          {targetType === "category" && (
            <SelectField
              id="budget-category"
              label={`${t("budgets.chooseExpenseCategory") || "Pilih Kategori Pengeluaran"} *`}
              action={
                <button
                  type="button"
                  onClick={() => setShowQuickCategoryModal(true)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-kash-emerald transition hover:text-kash-emeraldDark focus:outline-none"
                >
                  <Plus size={13} strokeWidth={2.5} />
                  {t("categories.addCategory") || "Tambah Kategori"}
                </button>
              }
              required
              value={categoryId}
              onChange={(e) => {
                if (e.target.value === "__create_new__") {
                  setShowQuickCategoryModal(true);
                } else {
                  setCategoryId(e.target.value);
                }
              }}
            >
              <option value="">-- {t("budgets.selectCategoryOption") || "Pilih Kategori"} --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__create_new__">+ {t("categories.addNewCategoryOption") || "Tambah Kategori Baru..."}</option>
            </SelectField>
          )}

          {targetType === "envelope" && (
            <SelectField
              id="budget-envelope"
              label={`${t("budgets.chooseExpenseEnvelope") || "Pilih Amplop Pengeluaran"} *`}
              action={
                <button
                  type="button"
                  onClick={() => setShowQuickEnvelopeModal(true)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-kash-emerald transition hover:text-kash-emeraldDark focus:outline-none"
                >
                  <Plus size={13} strokeWidth={2.5} />
                  {t("categories.addEnvelope") || "Tambah Amplop"}
                </button>
              }
              required
              value={envelopeId}
              onChange={(e) => {
                if (e.target.value === "__create_new__") {
                  setShowQuickEnvelopeModal(true);
                } else {
                  setEnvelopeId(e.target.value);
                }
              }}
            >
              <option value="">-- {t("budgets.selectEnvelopeOption") || "Pilih Amplop"} --</option>
              {envelopes.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
              <option value="__create_new__">+ {t("categories.addNewEnvelopeOption") || "Buat Amplop Baru..."}</option>
            </SelectField>
          )}

          {targetType === "debt" && (
            <div className="space-y-3">
              <SelectField
                id="budget-debt-counterparty"
                label={`${t("budgets.chooseDebtContact") || "Pilih Orang / Kontak yang Diutangi"} *`}
                required={!isSpecificItemTarget}
                value={counterpartyId}
                onChange={(e) => {
                  setCounterpartyId(e.target.value);
                  if (debtId) {
                    const match = debts.find((d) => d.debt_id === debtId);
                    if (match && match.counterparty_id !== e.target.value) {
                      setDebtId("");
                    }
                  }
                }}
              >
                <option value="">-- {t("budgets.selectContactOption") || "Pilih Kontak / Orang"} --</option>
                {counterparties.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {t("debts.totalDebt") || "Total Utang"}: {formatCurrency(c.debtTotal, "IDR")}{c.activeDebtCount > 1 ? ` (${c.activeDebtCount} item)` : ""}
                  </option>
                ))}
              </SelectField>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <ToggleField
                  label={t("budgets.targetSpecificDebtItem") || "Target item utang tertentu (Opsional)"}
                  description={t("budgets.targetSpecificDebtItemDesc") || "Aktifkan jika budget ini khusus untuk melunasi 1 item utang spesifik"}
                  checked={isSpecificItemTarget}
                  onChange={(e) => setIsSpecificItemTarget(e.target.checked)}
                />

                {isSpecificItemTarget && (
                  <div className="mt-3 pt-3 border-t border-slate-200/60">
                    <SelectField
                      id="budget-specific-debt"
                      label={`${t("budgets.chooseSpecificDebtItem") || "Pilih Item Utang Spesifik"} *`}
                      required
                      value={debtId}
                      onChange={(e) => {
                        setDebtId(e.target.value);
                        const selectedDebt = debts.find((d) => d.debt_id === e.target.value);
                        if (selectedDebt && selectedDebt.counterparty_id && !counterpartyId) {
                          setCounterpartyId(selectedDebt.counterparty_id);
                        }
                      }}
                    >
                      <option value="">-- {t("budgets.selectDebtItemOption") || "Pilih Item Utang"} --</option>
                      {debts
                        .filter((d) => !counterpartyId || d.counterparty_id === counterpartyId)
                        .map((d) => (
                          <option key={d.debt_id} value={d.debt_id}>
                            {d.title} ({t("debts.remaining") || "Sisa"}: {formatCurrency(d.remaining_amount, "IDR")})
                          </option>
                        ))}
                    </SelectField>
                  </div>
                )}
              </div>
            </div>
          )}

          {targetType === "goal" && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-1.5">
                  {t("budgets.savingsType") || "Tipe Simpanan Tabungan"}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSavingsMode("pocket");
                      setGoalId("");
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl p-2.5 text-xs transition ${
                      savingsMode === "pocket"
                        ? "bg-kash-emerald text-white shadow-xs font-extrabold"
                        : "border border-slate-200 bg-white text-slate-700 font-bold hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-kash-emeraldDark"
                    }`}
                  >
                    <WalletCards size={16} />
                    <span>{t("budgets.savingsPocket") || "Kantong Tabungan"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSavingsMode("goal");
                      setWalletId("");
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl p-2.5 text-xs transition ${
                      savingsMode === "goal"
                        ? "bg-kash-emerald text-white shadow-xs font-extrabold"
                        : "border border-slate-200 bg-white text-slate-700 font-bold hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-kash-emeraldDark"
                    }`}
                  >
                    <Target size={16} />
                    <span>{t("budgets.savingsGoal") || "Target Tabungan (Goal)"}</span>
                  </button>
                </div>
              </div>

              {savingsMode === "pocket" && (
                <SelectField
                  id="budget-savings-pocket"
                  label={`${t("budgets.chooseSavingsPocket") || "Pilih Kantong Tabungan (Savings Pocket)"} *`}
                  required
                  value={walletId}
                  onChange={(e) => setWalletId(e.target.value)}
                >
                  <option value="">-- {t("budgets.selectSavingsPocketOption") || "Pilih Kantong Tabungan"} --</option>
                  {savingsWallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.institution_name ? `(${w.institution_name})` : ""} — {t("wallets.balance") || "Saldo"}: {formatCurrency(w.balance?.current_balance ?? w.initial_balance, w.currency)}
                    </option>
                  ))}
                </SelectField>
              )}

              {savingsMode === "goal" && (
                <SelectField
                  id="budget-goal"
                  label={`${t("budgets.chooseSavingsGoal") || "Pilih Target Tabungan (Goal)"} *`}
                  required
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                >
                  <option value="">-- {t("budgets.selectSavingsGoalOption") || "Pilih Target Tabungan (Goal)"} --</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} — {t("goals.target") || "Target"}: {formatCurrency(g.target_amount, "IDR")}
                    </option>
                  ))}
                </SelectField>
              )}
            </div>
          )}

          {/* Budget Name */}
          <FormField
            id="budget-name"
            label={t("budgets.targetBudgetName") || "Nama Target Budget (Opsional)"}
            placeholder={t("budgets.targetBudgetNamePlaceholder") || "Biarkan kosong untuk menggunakan nama otomatis"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/* Amount & Month */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              id="budget-amount"
              inputMode="numeric"
              required
              label={t("budgets.monthlyTargetAmount") || "Nominal Target Bulanan"}
              placeholder="1.500.000"
              value={amount}
              onChange={(e) => setAmount(formatMoneyDigits(e.target.value))}
            />

            <DatePickerField
              id="budget-start-period"
              label={t("budgets.effectiveStartMonth") || "Mulai Berlaku Bulan"}
              value={startPeriod}
              onChange={(val) => setStartPeriod(val ? `${val.substring(0, 7)}-01` : val)}
            />
          </div>

          {/* Recurrence Options */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <ToggleField
              id="budget-repeat-monthly"
              label={t("budgets.repeatMonthly") || "Ulangi Otomatis Setiap Bulan"}
              description={t("budgets.repeatMonthlyDesc") || "Target anggaran akan otomatis dilanjutkan ke bulan-bulan berikutnya."}
              checked={repeatMonthly}
              onChange={(e) => setRepeatMonthly(e.target.checked)}
            />

            {targetType === "category" || targetType === "envelope" ? (
              <div className="border-t border-slate-200/60 pt-3">
                <ToggleField
                  id="budget-rollover"
                  label={t("budgets.enablePositiveRollover") || "Aktifkan Rollover Positif"}
                  description={t("budgets.rolloverDesc") || "Sisa budget yang tidak terpakai di akhir bulan akan ditambahkan ke bulan berikutnya."}
                  checked={rolloverEnabled}
                  onChange={(e) => setRolloverEnabled(e.target.checked)}
                />
              </div>
            ) : null}
          </div>

          {/* Note Field */}
          <FormField
            id="budget-note"
            label={t("budgets.noteLabel") || "Catatan (Opsional)"}
            placeholder={t("budgets.notePlaceholder") || "e.g. Alokasi wajib awal bulan setelah gajian"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("common.saving") : (t("budgets.saveTargetBudget") || "Simpan Target Budget")}
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

        <QuickCreateEnvelopeModal
          isOpen={showQuickEnvelopeModal}
          onClose={() => setShowQuickEnvelopeModal(false)}
          onCreated={(newEnv) => {
            setEnvelopes((prev) => {
              const exists = prev.some((e) => e.id === newEnv.id);
              return exists ? prev.map((e) => (e.id === newEnv.id ? newEnv : e)) : [newEnv, ...prev];
            });
            setEnvelopeId(newEnv.id);
            setShowQuickEnvelopeModal(false);
          }}
        />
      </div>
    </Modal>
  );
}
