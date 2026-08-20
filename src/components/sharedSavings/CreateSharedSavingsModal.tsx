import { Check, Plus, Users, X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { Modal } from "../ui/Modal";
import { createSharedSavingsSpace } from "../../lib/sharedSavings";
import { formatMoneyDigits, parseMoneyInputDigits } from "../../lib/money";
import { useI18n } from "../../i18n";

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

type CreateSharedSavingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (spaceId: string) => void;
};

export function CreateSharedSavingsModal({ isOpen, onClose, onCreated }: CreateSharedSavingsModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [targetDigits, setTargetDigits] = useState("");
  const [deadline, setDeadline] = useState<string | null>(null);
  const [color, setColor] = useState("#10B981");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError(t("common.required"));
      return;
    }

    const targetNum = targetDigits ? Number(targetDigits) : null;
    if (targetNum !== null && (isNaN(targetNum) || targetNum <= 0)) {
      setError(t("common.invalidAmount"));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const spaceId = await createSharedSavingsSpace({
        name: cleanName,
        targetAmount: targetNum,
        deadline: deadline || null,
        icon: "users",
        color,
      });

      onCreated(spaceId);
      onClose();
    } catch (err: any) {
      setError(err.message || t("common.error"));
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
            <Users size={20} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">{t("shared.createTitle")}</h2>
            <p className="text-xs font-semibold text-slate-600">
              {t("shared.createDesc")}
            </p>
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

          {/* Name Field */}
          <FormField
            id="shared-space-name"
            label={t("shared.spaceName")}
            required
            autoFocus
            placeholder={t("shared.spaceNamePlaceholder")}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
          />

          {/* Optional Target Amount */}
          <FormField
            id="shared-target-amount"
            label={t("shared.targetAmountOptional")}
            placeholder="0"
            value={formatMoneyDigits(targetDigits)}
            onChange={(e) => {
              setTargetDigits(parseMoneyInputDigits(e.target.value));
              if (error) setError(null);
            }}
          />

          {/* Optional Deadline */}
          <div>
            <DatePickerField
              id="shared-deadline"
              label={t("shared.deadlineOptional")}
              value={deadline || ""}
              onChange={(val) => setDeadline(val || null)}
            />
          </div>

          {/* Color Palette */}
          <div>
            <label className="block text-sm font-bold text-slate-900 mb-2">{t("shared.spaceColor")}</label>
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
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("shared.creating") : t("shared.createSpace")}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
