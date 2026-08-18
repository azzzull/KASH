import { FolderPlus, Layers, Tag, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { getActiveCategories } from "../../lib/categories";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../../lib/money";
import { createCategoryBudget, createEnvelopeBudget } from "../../lib/budgets";
import type { Category, BudgetType } from "../../types/domain";
import { Button } from "../ui/Button";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { SelectField } from "../ui/SelectField";
import { ToggleField } from "../ui/ToggleField";

type CreateBudgetModalProps = {
  initialMonth?: string; // YYYY-MM-DD
  onClose: () => void;
  onSaved: () => void;
};

export function CreateBudgetModal({ initialMonth, onClose, onSaved }: CreateBudgetModalProps) {
  const [type, setType] = useState<BudgetType>("category");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
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
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getActiveCategories().then((res) => {
      setLoadingCategories(false);
      if (res.data) {
        const expenseOnly = (res.data as Category[]).filter((c) => c.category_type === "expense");
        setCategories(expenseOnly);
        if (expenseOnly.length > 0) {
          setCategoryId(expenseOnly[0].id);
          setName(expenseOnly[0].name);
        }
      }
    });
  }, []);

  const handleCategoryChange = (newCatId: string) => {
    setCategoryId(newCatId);
    const cat = categories.find((c) => c.id === newCatId);
    if (cat && (!name || categories.some((c) => c.name === name))) {
      setName(cat.name);
    }
  };

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

    if (type === "category" && !categoryId) {
      setError("Pilih kategori pengeluaran.");
      return;
    }

    if (type === "envelope" && selectedCategoryIds.length === 0) {
      setError("Pilih minimal satu kategori pengeluaran untuk amplop.");
      return;
    }

    setSaving(true);
    try {
      if (type === "category") {
        await createCategoryBudget({
          name: name.trim() || (categories.find((c) => c.id === categoryId)?.name ?? "Budget"),
          categoryId,
          amount: rawAmount,
          startPeriod,
          repeatMonthly,
          rolloverEnabled,
          note: note.trim() || null,
        });
      } else {
        await createEnvelopeBudget({
          name: name.trim() || "Amplop Belanja",
          categoryIds: selectedCategoryIds,
          amount: rawAmount,
          startPeriod,
          repeatMonthly,
          rolloverEnabled,
          note: note.trim() || null,
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal membuat budget. Periksa kembali data Anda.");
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
            <h2 className="text-lg font-extrabold text-slate-900">Buat Budget Baru</h2>
            <p className="text-xs font-semibold text-slate-600">
              Rencanakan batas belanja bulanan berdasarkan kategori atau amplop
            </p>
          </div>
          <IconButton icon={X} label="Tutup" onClick={onClose} />
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">
              {error}
            </div>
          )}

          {/* Budget Type Tabs */}
          <div>
            <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1.5">
              Tipe Perencanaan
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setType("category");
                  if (categories.length > 0 && !name) setName(categories[0].name);
                }}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-extrabold transition ${
                  type === "category"
                    ? "bg-kash-emerald text-white shadow-sm hover:bg-kash-emeraldDark"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-kash-emeraldDark"
                }`}
              >
                <Tag size={15} />
                Budget Kategori
              </button>

              <button
                type="button"
                onClick={() => {
                  setType("envelope");
                  if (name === categories.find((c) => c.id === categoryId)?.name) {
                    setName("");
                  }
                }}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-extrabold transition ${
                  type === "envelope"
                    ? "bg-kash-emerald text-white shadow-sm hover:bg-kash-emeraldDark"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-kash-emeraldDark"
                }`}
              >
                <Layers size={15} />
                Amplop (Multi-Kategori)
              </button>
            </div>
          </div>

          {/* Name Field */}
          <FormField
            id="budget-name"
            label={type === "category" ? "Nama Budget" : "Nama Amplop"}
            required
            placeholder={type === "category" ? "e.g. Makanan & Minuman" : "e.g. Kebutuhan Hidup (Living)"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/* Category Selection based on Type */}
          {type === "category" ? (
            <SelectField
              id="budget-category"
              label="Pilih Kategori Pengeluaran"
              required
              value={categoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          ) : (
            <div>
              <label className="block text-sm font-bold text-slate-900 mb-1.5">
                Kategori Pengeluaran Tergabung ({selectedCategoryIds.length} dipilih)
              </label>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-2.5 space-y-1.5 bg-slate-50/50">
                {categories.length === 0 ? (
                  <p className="p-2 text-xs text-slate-600">Tidak ada kategori pengeluaran tersedia.</p>
                ) : (
                  categories.map((c) => {
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
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Handled by button click
                          className="h-4 w-4 rounded text-kash-emerald focus:ring-kash-emerald"
                        />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Budget Amount & Starting Month */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              id="budget-amount"
              inputMode="numeric"
              required
              label="Nominal Budget Bulanan"
              placeholder="1.500.000"
              value={amount}
              onChange={(e) => setAmount(formatMoneyDigits(e.target.value))}
            />

            <DatePickerField
              id="budget-start-period"
              label="Mulai Berlaku Bulan"
              value={startPeriod}
              onChange={(val) => setStartPeriod(val ? `${val.substring(0, 7)}-01` : val)}
            />
          </div>

          {/* Recurrence & Rollover Options */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <ToggleField
              id="budget-repeat-monthly"
              label="Ulangi Otomatis Setiap Bulan"
              description="Anggaran akan otomatis dilanjutkan ke bulan-bulan berikutnya tanpa perlu input ulang."
              checked={repeatMonthly}
              onChange={(e) => setRepeatMonthly(e.target.checked)}
            />

            <div className="border-t border-slate-200/60 pt-3">
              <ToggleField
                id="budget-rollover"
                label="Aktifkan Rollover Positif"
                description="Sisa budget yang belum terpakai di akhir bulan akan otomatis ditambahkan ke budget bulan berikutnya."
                checked={rolloverEnabled}
                onChange={(e) => setRolloverEnabled(e.target.checked)}
              />
            </div>
          </div>

          {/* Note Field */}
          <FormField
            id="budget-note"
            label="Catatan (Opsional)"
            placeholder="e.g. Termasuk anggaran makan siang kantor"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan Budget"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
