import { Receipt, Users, X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { submitSharedSpendingRequest } from "../../lib/sharedSavings";
import { formatCurrency, formatMoneyDigits, parseMoneyInputDigits } from "../../lib/money";

type SharedSpendingModalProps = {
  isOpen: boolean;
  spaceId: string;
  spaceName: string;
  activeMembersCount: number;
  spaceColor?: string;
  onClose: () => void;
  onSubmitted: () => void;
};

export function SharedSpendingModal({
  isOpen,
  spaceId,
  spaceName,
  activeMembersCount,
  spaceColor = "#10B981",
  onClose,
  onSubmitted,
}: SharedSpendingModalProps) {
  const [title, setTitle] = useState("");
  const [amountDigits, setAmountDigits] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const amountNum = Number(amountDigits) || 0;
  const count = Math.max(1, activeMembersCount);
  const estimatedPerMember = Math.floor(amountNum / count);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Judul pengeluaran bersama wajib diisi.");
      return;
    }

    if (!amountDigits || amountNum <= 0) {
      setError("Nominal pengeluaran bersama harus lebih dari 0.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await submitSharedSpendingRequest({
        spaceId,
        title: cleanTitle,
        amount: amountNum,
        note: note.trim() || undefined,
      });

      onSubmitted();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal mengajukan pengeluaran bersama.");
    } finally {
      setSubmitting(false);
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
              style={{ backgroundColor: spaceColor }}
            >
              <Receipt size={20} strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Catat Pengeluaran Bersama</h2>
              <p className="text-xs font-semibold text-slate-600">{spaceName}</p>
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

          {/* Title Field */}
          <FormField
            id="spending-title"
            label="Tujuan / Keperluan Pengeluaran"
            required
            autoFocus
            placeholder="e.g. DP Hotel Tokyo, Tiket Masuk Universal Studios, Makan Malam"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
          />

          {/* Amount Field */}
          <FormField
            id="spending-amount"
            label="Total Nominal Pengeluaran (Rp)"
            required
            placeholder="0"
            value={formatMoneyDigits(amountDigits)}
            onChange={(e) => {
              setAmountDigits(parseMoneyInputDigits(e.target.value));
              if (error) setError(null);
            }}
          />

          {/* Equal Split Preview Card */}
          {amountNum > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600 flex items-center gap-1.5">
                  <Users size={14} className="text-slate-500" />
                  Jumlah Anggota Aktif Saat Ini
                </span>
                <span className="font-extrabold text-slate-900">{count} orang</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200/80 pt-2">
                <span className="text-xs font-extrabold text-slate-900">Estimasi Beban / Anggota</span>
                <span className="text-sm font-black text-kash-emeraldDark">
                  ± {formatCurrency(estimatedPerMember, "IDR")}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Porsi masing-masing anggota aktif akan dipotong secara sama rata setelah pengeluaran ini diverifikasi &
                disetujui oleh Approver.
              </p>
            </div>
          )}

          {/* Optional Note */}
          <FormField
            id="spending-note"
            label="Catatan Tambahan (Opsional)"
            placeholder="e.g. Bukti bayar dipegang Budi, nomor referensi booking #12345"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting || amountNum <= 0}>
              {submitting ? "Mengajukan..." : "Ajukan Pengeluaran"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
