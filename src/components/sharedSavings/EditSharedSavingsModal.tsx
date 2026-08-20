import { Check, Settings } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { Modal } from "../ui/Modal";
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      title={
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-xs"
            style={{ backgroundColor: color }}
          >
            <Settings size={20} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Edit Pengaturan Tabungan</h2>
            <p className="text-xs font-semibold text-slate-600">{space.name}</p>
          </div>
        </div>
      }
    >
      <div>
        <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
          {error && (
            <div className="rounded-xl border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">
              {error}
            </div>
          )}

          <FormField
            id="edit-space-name"
            label="Nama Tabungan Bersama"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <FormField
            id="edit-space-target"
            label="Target Nominal Bersama (Opsional)"
            placeholder="0"
            value={targetDigits ? formatMoneyDigits(targetDigits) : ""}
            onChange={(e) => setTargetDigits(parseMoneyInputDigits(e.target.value))}
            hint="Kosongkan jika tidak ada target nominal spesifik"
          />

          <DatePickerField
            id="edit-space-deadline"
            label="Tenggat Waktu / Target Selesai (Opsional)"
            value={deadline || ""}
            onChange={setDeadline}
          />

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">Warna Identitas Tabungan</label>
            <div className="flex flex-wrap gap-2.5">
              {spaceColors.map((c) => {
                const isSelected = color.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-9 w-9 rounded-full transition transform flex items-center justify-center ${
                      isSelected ? "ring-2 ring-offset-2 ring-slate-800 scale-110 shadow-sm" : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {isSelected && <Check size={16} strokeWidth={3} className="text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

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
    </Modal>
  );
}
