import { Check, Lock, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { getActiveCategories } from "../../lib/categories";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../../lib/money";
import { updateBudget } from "../../lib/budgets";
import type { BudgetWithProgress, Category } from "../../types/domain";
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
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    budget.included_category_ids ?? []
  );

  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (budget.type === "envelope") {
      getActiveCategories().then((res) => {
        if (res.data) {
          const expenseOnly = (res.data as Category[]).filter((c) => c.category_type === "expense");
          setCategories(expenseOnly);
        }
      });
    }
  }, [budget.type]);

  const handleToggleEnvelopeCategory = (catId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const rawAmount = parseMoneyInputDigits(amount);
    const numAmount = toNumber(rawAmount);

    if (numAmount <= 0) {
      setError("Masukkan nominal budget yang valid.");
      return;
    }

    if (budget.type === "envelope" && selectedCategoryIds.length === 0) {
      setError("Amplop harus memiliki minimal 1 kategori pengeluaran.");
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
        categoryIds: budget.type === "envelope" ? selectedCategoryIds : undefined,
      });

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal memperbarui budget.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Edit Budget</h2>
            <p className="text-xs font-semibold text-slate-600">
              Perubahan berlaku mulai periode ini ke depan tanpa mengubah masa lampau
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
            label="Nama Budget"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/* Category Display (Immutable for Category Budget, Editable for Envelope) */}
          {budget.type === "category" ? (
            <label className="block w-full max-w-full min-w-0">
              <span className="block text-sm font-bold text-slate-900">Kategori Terkait (Imutabel)</span>
              <div className="relative mt-2">
                <input
                  type="text"
                  disabled
                  value={budget.category_name ?? "Kategori"}
                  className="block h-12 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 pr-9 text-base font-semibold text-slate-600 cursor-not-allowed md:text-sm"
                />
                <Lock size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-600" />
              </div>
            </label>
          ) : (
            <div>
              <label className="block text-sm font-bold text-slate-900 mb-1.5">
                Kategori Pengeluaran Amplop ({selectedCategoryIds.length} dipilih)
              </label>
              <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-1.5 bg-slate-50/50">
                {categories.map((c) => {
                  const isChecked = selectedCategoryIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleToggleEnvelopeCategory(c.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-bold transition ${
                        isChecked
                          ? "border border-kash-emerald/40 bg-kash-selected text-kash-emeraldDark"
                          : "border border-transparent bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: c.color || "#10B981" }}
                        />
                        {c.name}
                      </span>
                      <div
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                          isChecked
                            ? "border-kash-emerald bg-kash-emerald"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {isChecked && (
                          <Check
                            size={11}
                            strokeWidth={3.5}
                            className="text-white"
                            style={{ color: "#ffffff", stroke: "#ffffff" }}
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Amount Field */}
          <FormField
            id="edit-budget-amount"
            inputMode="numeric"
            required
            label="Nominal Budget Bulanan"
            placeholder="1.500.000"
            value={amount}
            onChange={(e) => setAmount(formatMoneyDigits(e.target.value))}
          />

          {/* Rollover Toggle */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <ToggleField
              id="edit-budget-rollover"
              label="Aktifkan Rollover Positif"
              description="Sisa budget bulan ini akan diakumulasikan ke bulan berikutnya."
              checked={rolloverEnabled}
              onChange={(e) => setRolloverEnabled(e.target.checked)}
            />
          </div>

          {/* Note Field */}
          <FormField
            id="edit-budget-note"
            label="Catatan (Opsional)"
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
