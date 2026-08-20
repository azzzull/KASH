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

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-xs"
              style={{ backgroundColor: color }}
            >
              <IconComp size={20} />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                {isEditing ? "Edit Amplop Pengeluaran" : "Tambah Amplop Baru"}
              </h2>
              <p className="text-[11px] font-semibold text-slate-600">
                {isEditing ? "Ubah nama, ikon, atau warna amplop" : "Buat amplop tujuan belanja khusus"}
              </p>
            </div>
          </div>
          <IconButton icon={X} label="Tutup" onClick={onClose} />
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-kash-expense/30 bg-kash-expense/10 p-2.5 text-xs font-bold text-kash-expense">
              {error}
            </div>
          )}

          <FormField
            id="envelope-name"
            label="Nama Amplop *"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Dana Liburan, Belanja Mingguan..."
          />

          {/* Icon Picker Component */}
          <CategoryIconPicker
            value={icon}
            onChange={setIcon}
            accentColor={color}
            label="Pilih Ikon Amplop"
          />

          {/* Color Palette Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">Pilih Warna Amplop</label>
            <div className="flex flex-wrap gap-2.5">
              {categoryColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="flex h-8 w-8 items-center justify-center rounded-full transition hover:scale-110 focus:outline-none ring-offset-2 focus:ring-2 focus:ring-kash-emerald"
                  style={{ backgroundColor: c }}
                  aria-label={`Pilih warna ${c}`}
                >
                  {color === c && <Check size={16} className="text-white drop-shadow-xs" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          <FormField
            id="envelope-note"
            label="Catatan (Opsional)"
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
    </div>
  );

  return createPortal(modalContent, document.body);
}
