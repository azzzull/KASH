import { Lock, X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../../lib/money";
import { updateBudget } from "../../lib/budgets";
import type { BudgetWithProgress } from "../../types/domain";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { ToggleField } from "../ui/ToggleField";

type EditBudgetModalProps = {
  budget: BudgetWithProgress;
  effectivePeriod: string; // YYYY-MM-DD
  onClose: () => void;
  onSaved: () => void;
};

function getTargetTypeLabel(type: string) {
  switch (type) {
    case "envelope":
      return "Amplop Pengeluaran";
    case "debt":
      return "Target Cicilan Utang";
    case "goal":
      return "Target Tabungan / Goal";
    case "category":
    default:
      return "Kategori Pengeluaran";
  }
}

function getTargetDisplayName(b: BudgetWithProgress) {
  const type = b.target_type ?? b.type;
  switch (type) {
    case "envelope":
      return b.envelope_name ?? b.name;
    case "debt":
      if (b.counterparty_name) return `Utang ke ${b.counterparty_name}`;
      return b.debt_title ?? b.name;
    case "goal":
      return b.goal_name ? `Tabungan ${b.goal_name}` : b.name;
    case "category":
    default:
      return b.category_name ?? b.name;
  }
}

export function EditBudgetModal({
  budget,
  effectivePeriod,
  onClose,
  onSaved,
}: EditBudgetModalProps) {
  const [name, setName] = useState(budget.name);
  const [amount, setAmount] = useState(formatMoneyDigits(String(budget.base_amount)));
  const [rolloverEnabled, setRolloverEnabled] = useState(budget.rollover_enabled);
  const [note, setNote] = useState(budget.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const rawAmount = parseMoneyInputDigits(amount);
    const numAmount = toNumber(rawAmount);

    if (numAmount <= 0) {
      setError("Masukkan nominal budget yang valid.");
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
      setError(err.message || "Gagal memperbarui budget.");
    } finally {
      setSaving(false);
    }
  };

  const targetType = budget.target_type ?? budget.type;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Edit Target Budget</h2>
            <p className="text-xs font-semibold text-slate-600">
              Perubahan berlaku mulai periode ini ke depan tanpa mengubah histori masa lampau
            </p>
          </div>
          <IconButton icon={X} label="Tutup" onClick={onClose} />
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">
              {error}
            </div>
          )}

          {/* Name Field */}
          <FormField
            id="edit-budget-name"
            label="Nama Target Budget *"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/* Target Display (Read-only / Immutable) */}
          <label className="block w-full max-w-full min-w-0">
            <span className="block text-sm font-bold text-slate-900">
              {getTargetTypeLabel(targetType)} Terkait (Imutabel)
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
            <span className="mt-1.5 block text-xs font-medium text-slate-500">
              Sasaran target bersifat permanen. Untuk mengganti sasaran target, buat target budget baru.
            </span>
          </label>

          {/* Amount Field */}
          <FormField
            id="edit-budget-amount"
            inputMode="numeric"
            required
            label="Nominal Target Budget Bulanan *"
            placeholder="1.500.000"
            value={amount}
            onChange={(e) => setAmount(formatMoneyDigits(e.target.value))}
          />

          {/* Rollover Toggle (Only for Category and Envelope) */}
          {targetType === "category" || targetType === "envelope" ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <ToggleField
                id="edit-budget-rollover"
                label="Aktifkan Rollover Positif"
                description="Sisa budget bulan ini akan diakumulasikan menambah plafon bulan berikutnya."
                checked={rolloverEnabled}
                onChange={(e) => setRolloverEnabled(e.target.checked)}
              />
            </div>
          ) : null}

          {/* Note Field */}
          <FormField
            id="edit-budget-note"
            label="Catatan (Opsional)"
            placeholder="Keterangan alokasi atau instruksi tambahan..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
