import { Check, Layers, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createEnvelope } from "../../lib/envelopes";
import type { Envelope } from "../../types/domain";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";

type QuickCreateEnvelopeModalProps = {
  isOpen: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (envelope: Envelope) => void;
};

const ENVELOPE_COLOR_OPTIONS = [
  "#4F7DF3", // Primary Envelope Blue
  "#10B981", // Emerald
  "#8B5CF6", // Purple
  "#F5B82E", // Gold/Amber
  "#EC4899", // Pink
  "#06B6D4", // Cyan
  "#F28C45", // Orange
  "#64748B", // Slate
];

export function QuickCreateEnvelopeModal({
  isOpen,
  initialName = "",
  onClose,
  onCreated,
}: QuickCreateEnvelopeModalProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState("#4F7DF3");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setColor("#4F7DF3");
      setNote("");
      setError(null);
    }
  }, [isOpen, initialName]);

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

    const { data: newEnvelope, error: createError } = await createEnvelope({
      name: trimmed,
      color,
      icon: "layers",
      note: note.trim() || null,
    });

    setSaving(false);

    if (createError || !newEnvelope) {
      setError(createError?.message || "Gagal membuat amplop baru.");
      return;
    }

    onCreated(newEnvelope);
    onClose();
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-xs"
              style={{ backgroundColor: color }}
            >
              <Layers size={16} />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Tambah Amplop Baru</h2>
              <p className="text-[11px] font-semibold text-slate-600">
                Buat amplop tujuan belanja khusus
              </p>
            </div>
          </div>
          <IconButton icon={X} label="Tutup" onClick={onClose} />
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col p-5 space-y-4">
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

          {/* Color Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">Pilih Warna Amplop</label>
            <div className="flex flex-wrap gap-2">
              {ENVELOPE_COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="flex h-7 w-7 items-center justify-center rounded-full transition hover:scale-110 focus:outline-none"
                  style={{ backgroundColor: c }}
                  aria-label={`Pilih warna ${c}`}
                >
                  {color === c && <Check size={14} className="text-white drop-shadow-xs" />}
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
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Menyimpan..." : "Simpan Amplop"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
