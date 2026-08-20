import { Lock } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../../lib/money";
import { updateBudget } from "../../lib/budgets";
import type { BudgetWithProgress } from "../../types/domain";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { Modal } from "../ui/Modal";
import { ToggleField } from "../ui/ToggleField";
import { useI18n } from "../../i18n";

type EditBudgetModalProps = {
  budget: BudgetWithProgress;
  effectivePeriod: string; // YYYY-MM-DD
  onClose: () => void;
  onSaved: () => void;
};

export function EditBudgetModal({
  budget,
  effectivePeriod,
  onClose,
  onSaved,
}: EditBudgetModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState(budget.name);
  const [amount, setAmount] = useState(formatMoneyDigits(String(budget.base_amount)));
  const [rolloverEnabled, setRolloverEnabled] = useState(budget.rollover_enabled);
  const [note, setNote] = useState(budget.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getTargetTypeLabel = (type: string, b?: BudgetWithProgress) => {
    switch (type) {
      case "envelope":
        return t("budgets.shoppingEnvelope") || "Amplop Pengeluaran";
      case "debt":
        return t("budgets.debtPaymentTarget") || "Target Cicilan Utang";
      case "goal":
        return b?.wallet_id ? (t("budgets.savingsPocket") || "Kantong Tabungan (Pocket)") : (t("budgets.savingsGoalTarget") || "Target Tabungan / Goal");
      case "category":
      default:
        return t("budgets.category") || "Kategori Pengeluaran";
    }
  };

  const getTargetDisplayName = (b: BudgetWithProgress) => {
    const type = b.target_type ?? b.type;
    switch (type) {
      case "envelope":
        return b.envelope_name ?? b.name;
      case "debt":
        if (b.counterparty_name) return `${t("debts.debtTo") || "Utang ke"} ${b.counterparty_name}`;
        return b.debt_title ?? b.name;
      case "goal":
        if (b.wallet_name) return `${t("budgets.pocket") || "Kantong"}: ${b.wallet_name}`;
        return b.goal_name ? `${t("dashboard.savings") || "Tabungan"} ${b.goal_name}` : b.name;
      case "category":
      default:
        return b.category_name ?? b.name;
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const rawAmount = parseMoneyInputDigits(amount);
    const numAmount = toNumber(rawAmount);

    if (numAmount <= 0) {
      setError(t("budgets.enterValidAmount") || "Masukkan nominal budget yang valid.");
      return;
    }

    setSaving(true);
    try {
      await updateBudget(budget.budget_id, {
        name: name.trim(),
        note: note.trim() || null,
        effectivePeriod,
        amount: rawAmount,
        rolloverEnabled,
      });

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || (t("budgets.updateBudgetFailed") || "Gagal memperbarui budget."));
    } finally {
      setSaving(false);
    }
  };

  const targetType = budget.target_type ?? budget.type;

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title={t("budgets.editBudgetTargetTitle") || "Edit Target Budget"}
      description={t("budgets.editBudgetTargetDesc") || "Perubahan berlaku mulai periode ini ke depan tanpa mengubah histori masa lampau"}
    >
      <div>
        <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
          {error && (
            <div className="rounded-lg border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">
              {error}
            </div>
          )}

          {/* Name Field */}
          <FormField
            id="edit-budget-name"
            label={`${t("budgets.targetBudgetName") || "Nama Target Budget"} *`}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/* Target Display (Read-only / Immutable) */}
          <label className="block w-full max-w-full min-w-0">
            <span className="block text-sm font-bold text-slate-900">
              {getTargetTypeLabel(targetType, budget)} {t("budgets.relatedImmutable") || "Terkait (Imutabel)"}
            </span>
            <div className="relative mt-2">
              <input
                type="text"
                disabled
                value={getTargetDisplayName(budget)}
                className="block h-12 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 pr-9 text-base font-semibold text-slate-700 cursor-not-allowed md:text-sm"
              />
              <Lock size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {t("budgets.immutableEntityNote") || "Entitas terhubung tidak dapat diubah setelah dibuat. Buat target budget baru jika ingin menargetkan entitas lain."}
            </p>
          </label>

          {/* Amount Field */}
          <FormField
            id="edit-budget-amount"
            label={`${t("budgets.monthlyTargetAmount") || "Nominal Target Bulanan"} (Rp) *`}
            required
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(formatMoneyDigits(parseMoneyInputDigits(e.target.value)))}
          />

          {/* Rollover Toggle */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <ToggleField
              id="edit-budget-rollover"
              checked={rolloverEnabled}
              onChange={(e) => setRolloverEnabled(e.target.checked)}
              label={t("budgets.enablePositiveRollover") || "Aktifkan Rollover Sisa Saldo"}
              description={t("budgets.rolloverDesc") || "Jika aktif, sisa saldo yang tidak terpakai (surplus) atau kelebihan pengeluaran (defisit) akan dialihkan ke bulan berikutnya."}
            />
          </div>

          {/* Note Field */}
          <FormField
            id="edit-budget-note"
            label={t("budgets.noteLabel") || "Catatan (Opsional)"}
            placeholder={t("budgets.notePlaceholder") || "Keterangan alokasi atau instruksi tambahan..."}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("common.saving") : t("common.saveChanges")}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
