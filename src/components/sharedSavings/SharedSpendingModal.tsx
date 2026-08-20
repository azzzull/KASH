import { Receipt, Users } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { Modal } from "../ui/Modal";
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      title={
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-xs"
            style={{ backgroundColor: spaceColor }}
          >
            <Receipt size={20} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Catat Pengeluaran Bersama</h2>
            <p className="text-xs font-semibold text-slate-600">{spaceName}</p>
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
            id="spending-title"
            label="Keperluan Pengeluaran"
            required
            autoFocus
            placeholder="contoh: Beli Tiket Pesawat, Booking Hotel, dll."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <FormField
            id="spending-amount"
            label="Total Nominal Pengeluaran (Rp)"
            required
            placeholder="0"
            value={amountDigits ? formatMoneyDigits(amountDigits) : ""}
            onChange={(e) => setAmountDigits(parseMoneyInputDigits(e.target.value))}
          />

          {amountNum > 0 && (
            <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium">
                <Users size={15} className="text-slate-500" />
                Estimasi Beban ({count} Anggota):
              </span>
              <span className="font-extrabold text-slate-900">
                {formatCurrency(estimatedPerMember)} / orang
              </span>
            </div>
          )}

          <FormField
            id="spending-note"
            label="Catatan Tambahan (Opsional)"
            placeholder="Keterangan tambahan atau nomor referensi..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="rounded-xl bg-amber-50/80 border border-amber-200/80 p-3.5 text-xs text-amber-900">
            <span className="font-bold">Info:</span> Pengeluaran bersama akan memotong saldo kas pool bersama dan mengurangi porsi kepemilikan seluruh anggota secara proporsional setelah diverifikasi oleh <span className="font-bold">Approver</span>.
          </div>

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
    </Modal>
  );
}
