import { Mail, UserPlus, X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { inviteSharedSavingsMember } from "../../lib/sharedSavings";

type InviteMemberModalProps = {
  isOpen: boolean;
  spaceId: string;
  spaceName: string;
  onClose: () => void;
  onInvited: () => void;
};

export function InviteMemberModal({ isOpen, spaceId, spaceName, onClose, onInvited }: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Masukkan alamat email yang valid.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await inviteSharedSavingsMember(spaceId, cleanEmail);
      onInvited();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal mengirim undangan.");
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
        className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-kash-selected text-kash-emeraldDark shadow-xs">
              <UserPlus size={20} strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Undang Anggota</h2>
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

          <FormField
            id="member-email"
            label="Alamat Email KASH"
            type="email"
            required
            autoFocus
            placeholder="e.g. teman@gmail.com"
            hint="Masukkan alamat email akun KASH yang ingin diundang."
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
          />

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
            Undangan akan aktif selama <span className="font-bold text-slate-900">7 hari</span>. Setelah pengguna
            menerima undangan, mereka dapat mulai melihat ruang tabungan dan mengajukan setoran.
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Mengirim..." : "Kirim Undangan"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
