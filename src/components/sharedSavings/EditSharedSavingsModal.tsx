import { Check, Settings, X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { updateSharedSavingsSettings } from "../../lib/sharedSavings";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../../lib/money";
import type { SharedSavingsBalance } from "../../types/domain";

const spaceColors = [
  "#10B981", // Emerald (Brand)
  "#059669", // Emerald Dark
  "#4F7DF3", // Blue
  "#8B5CF6", // Purple
  "#F5B82E", // Gold/Amber
  "#F28C45", // Orange
  "#22B8A7", // Teal
  "#E50914", // Red
  "#475569", // Slate
];

type EditSharedSavingsModalProps = {
  isOpen: boolean;
  space: SharedSavingsBalance;
  onClose: () => void;
  onSaved: () => void;
};

export function EditSharedSavingsModal({ isOpen, space, onClose, onSaved }: EditSharedSavingsModalProps) {
  const [name, setName] = useState(space.name);
  const [targetDigits, setTargetDigits] = useState(
    space.target_amount ? String(toNumber(space.target_amount)) : ""
  );
  const [deadline, setDeadline] = useState<string | null>(space.deadline || null);
  const [color, setColor] = useState(space.color || "#10B981");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Nama tabungan bersama tidak boleh kosong.");
      return;
    }

    const targetNum = targetDigits ? Number(targetDigits) : null;
    if (targetNum !== null && (isNaN(targetNum) || targetNum <= 0)) {
      setError("Nominal target harus lebih dari 0.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateSharedSavingsSettings({
        spaceId: space.shared_savings_id,
        name: cleanName,
        targetAmount: targetNum,
        deadline: deadline || null,
        color,
      });

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal memperbarui pengaturan ruang.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-xs"
              style={{ backgroundColor: color }}
            >
              <Settings size={20} strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Edit Pengaturan Tabungan</h2>
              <p className="text-xs font-semibold text-slate-600">{space.name}</p>
            </div>
          </div>
          <IconButton icon={X} label="Tutup" onClick={onClose} />
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">
              {error}
            </div>
          )}

          {/* Name Field */}
          <FormField
            id="edit-space-name"
            label="Nama Tabungan Bersama"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
          />

          {/* Optional Target Amount */}
          <FormField
            id="edit-target-amount"
            label="Target Nominal (Opsional)"
            placeholder="0"
            hint="Kosongkan jika tabungan ini tidak memiliki target nominal tetap."
            value={formatMoneyDigits(targetDigits)}
            onChange={(e) => {
              setTargetDigits(parseMoneyInputDigits(e.target.value));
              if (error) setError(null);
            }}
          />

          {/* Optional Deadline */}
          <div>
            <DatePickerField
              id="edit-deadline"
              label="Tenggat Waktu / Deadline (Opsional)"
              value={deadline || ""}
              onChange={(val) => setDeadline(val || null)}
            />
            <p className="mt-1 text-[11px] font-semibold text-slate-500">
              Kosongkan jika tabungan berjalan tanpa batas waktu tertentu.
            </p>
          </div>

          {/* Color Palette */}
          <div>
            <label className="block text-sm font-bold text-slate-900 mb-2">Warna Identitas</label>
            <div className="flex flex-wrap gap-2.5">
              {spaceColors.map((c) => {
                const isSelected = color.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                      isSelected ? "ring-2 ring-slate-900 ring-offset-2 scale-110" : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {isSelected && <Check size={14} strokeWidth={3} className="text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
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
