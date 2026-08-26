import { Check, Plus, RotateCcw, Tag, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { quickCreateCategory, unarchiveCategory } from "../../lib/categories";
import { categoryColors, categoryIconOptions, getCategoryIcon } from "../../lib/categoryMeta";
import type { Category, CategoryType } from "../../types/domain";
import { CategoryIconPicker } from "./CategoryIconPicker";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";
import { useI18n } from "../../i18n";
import { useSpaceTerminology } from "../../hooks/useSpaceTerminology";

type QuickCreateCategoryModalProps = {
  isOpen: boolean;
  categoryType: CategoryType; // "expense" | "income"
  initialName?: string;
  onClose: () => void;
  onCreated: (category: Category) => void;
};

export function QuickCreateCategoryModal({
  isOpen,
  categoryType,
  initialName = "",
  onClose,
  onCreated,
}: QuickCreateCategoryModalProps) {
  const { t } = useI18n();
  const terms = useSpaceTerminology();
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState(() => (categoryType === "income" ? "briefcase" : "utensils"));
  const [color, setColor] = useState(() => (categoryType === "income" ? "#10B981" : "#E50914"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivedCategory, setArchivedCategory] = useState<Category | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setError(null);
      setArchivedCategory(null);
      setIcon(categoryType === "income" ? "briefcase" : "utensils");
      setColor(categoryType === "income" ? "#10B981" : "#E50914");
    }
  }, [isOpen, initialName, categoryType]);

  // Handle Escape key safely to close only this modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("categories.nameRequired") || "Nama kategori tidak boleh kosong.");
      return;
    }

    setSaving(true);
    setError(null);
    setArchivedCategory(null);

    const result = await quickCreateCategory({
      name: trimmed,
      categoryType,
      icon,
      color,
    });

    setSaving(false);

    if (result.success) {
      onCreated(result.category);
      onClose();
    } else {
      setError(result.error);
      if (result.archivedCategory) {
        setArchivedCategory(result.archivedCategory);
      }
    }
  };

  const handleRestoreArchived = async () => {
    if (!archivedCategory) return;
    setSaving(true);
    setError(null);

    const { data: restored, error: restoreErr } = await unarchiveCategory(archivedCategory.id);
    setSaving(false);

    if (restoreErr || !restored) {
      setError(restoreErr?.message || (t("categories.restoreFailed") || "Gagal memulihkan kategori."));
      return;
    }

    onCreated(restored as Category);
    onClose();
  };

  const SelectedIcon = getCategoryIcon(icon);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-xs"
            style={{ backgroundColor: color }}
          >
            <SelectedIcon size={18} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              {t("categories.addCategoryTitle", { type: categoryType === "income" ? terms.incomeLabel : terms.expenseLabel }) || `Tambah Kategori ${categoryType === "income" ? terms.incomeLabel : terms.expenseLabel}`}
            </h2>
            <p className="text-xs font-semibold text-slate-600">
              {t("categories.quickCreateDesc") || "Buat kategori baru secara cepat tanpa keluar dari form"}
            </p>
          </div>
        </div>
      }
    >
      <div>
        <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
          {error && (
            <div className="rounded-xl border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">
              <p>{error}</p>
              {archivedCategory && (
                <div className="mt-2.5 flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => void handleRestoreArchived()}
                    disabled={saving}
                    className="gap-1.5 min-h-8 px-3 py-1 text-xs"
                  >
                    <RotateCcw size={13} />
                    {t("categories.restoreAndUse") || "Pulihkan Kategori & Gunakan"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Name Field */}
          <FormField
            id="quick-category-name"
            label={t("categories.nameLabel") || "Nama Kategori"}
            required
            autoFocus
            placeholder={categoryType === "income" ? (t("categories.placeholderIncome") || "e.g. Bonus, Dividen") : (t("categories.placeholderExpense") || "e.g. Pet Care, Kopi")}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
          />

          {/* Icon Selector */}
          <CategoryIconPicker
            label={t("categories.chooseIcon") || "Ikon Kategori"}
            value={icon}
            accentColor={color}
            onChange={(selectedIcon) => setIcon(selectedIcon)}
          />

          {/* Color Palette Picker */}
          <div className="relative z-10">
            <label className="block text-sm font-bold text-slate-900 mb-2">
              {t("categories.chooseColor") || "Warna Kategori"}
            </label>
            <div className="flex flex-wrap gap-2.5">
              {categoryColors.map((c) => {
                const isSelected = color.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                      isSelected
                        ? "ring-2 ring-slate-900 ring-offset-2 scale-110"
                        : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {isSelected && <Check size={14} strokeWidth={3} className="text-white" style={{ color: "#ffffff", stroke: "#ffffff" }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("common.saving") : (t("categories.saveAndSelect") || "Simpan & Pilih")}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
