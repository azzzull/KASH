import { Check, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createEnvelope, updateEnvelope } from "../../lib/envelopes";
import { categoryColors, getCategoryIcon } from "../../lib/categoryMeta";
import type { Envelope } from "../../types/domain";
import { CategoryIconPicker } from "../categories/CategoryIconPicker";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { Modal } from "../ui/Modal";

type QuickCreateEnvelopeModalProps = {
  isOpen: boolean;
  envelopeToEdit?: Envelope | null;
  initialName?: string;
  onClose: () => void;
  onCreated: (envelope: Envelope) => void;
};

export function QuickCreateEnvelopeModal({
  isOpen,
  envelopeToEdit,
  initialName = "",
  onClose,
  onCreated,
}: QuickCreateEnvelopeModalProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("layers");
  const [color, setColor] = useState<string>("#4F7DF3");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(envelopeToEdit);

  useEffect(() => {
    if (isOpen) {
      if (envelopeToEdit) {
        setName(envelopeToEdit.name);
        setIcon(envelopeToEdit.icon || "layers");
        setColor(envelopeToEdit.color || "#4F7DF3");
        setNote(envelopeToEdit.note || "");
      } else {
        setName(initialName);
        setIcon("layers");
        setColor("#4F7DF3");
        setNote("");
      }
      setError(null);
    }
  }, [isOpen, envelopeToEdit, initialName]);

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
      setError("Nama amplop tidak boleh kosong.");
      return;
    }

    setSaving(true);
    setError(null);

    let resultEnvelope: Envelope | null = null;
    let err: Error | null = null;

    if (isEditing && envelopeToEdit) {
      const res = await updateEnvelope(envelopeToEdit.id, {
        name: trimmed,
        color,
        icon,
        note: note.trim() || null,
      });
      resultEnvelope = res.data;
      err = res.error;
    } else {
      const res = await createEnvelope({
        name: trimmed,
        color,
        icon,
        note: note.trim() || null,
      });
      resultEnvelope = res.data;
      err = res.error;
    }

    setSaving(false);

    if (err || !resultEnvelope) {
      setError(err?.message || `Gagal ${isEditing ? "memperbarui" : "membuat"} amplop.`);
      return;
    }

    onCreated(resultEnvelope);
    onClose();
  };

  const IconComp = getCategoryIcon(icon);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-xs"
            style={{ backgroundColor: color }}
          >
            <IconComp size={20} />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              {isEditing ? "Edit Amplop Pengeluaran" : "Tambah Amplop Baru"}
            </h2>
            <p className="text-xs font-semibold text-slate-600">
              {isEditing ? "Ubah nama, ikon, atau warna amplop" : "Buat amplop tujuan belanja khusus"}
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
            </div>
          )}

          {/* Name */}
          <FormField
            id="envelope-name"
            label="Nama Amplop"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Belanja Bulanan, Liburan, Kencan"
          />

          {/* Icon Picker */}
          <CategoryIconPicker value={icon} onChange={setIcon} accentColor={color} label="Pilih Ikon Amplop" />

          {/* Color Picker */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
              Warna Amplop
            </label>
            <div className="flex flex-wrap gap-2.5">
              {categoryColors.map((c) => {
                const isSelected = color.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full transition transform flex items-center justify-center ${
                      isSelected ? "ring-2 ring-offset-2 ring-slate-800 scale-110 shadow-sm" : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {isSelected && <Check size={14} strokeWidth={3} className="text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note / Description */}
          <FormField
            id="envelope-note"
            label="Keterangan / Catatan (Opsional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Tujuan amplop atau keterangan tambahan..."
          />

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Menyimpan..." : isEditing ? "Simpan Perubahan" : "Simpan Amplop"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
