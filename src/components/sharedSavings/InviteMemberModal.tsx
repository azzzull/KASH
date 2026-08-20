import { Mail, UserPlus } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { Modal } from "../ui/Modal";
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-kash-selected text-kash-emeraldDark shadow-xs">
            <UserPlus size={20} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Undang Anggota</h2>
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
            id="invite-email"
            type="email"
            label="Alamat Email Anggota"
            required
            autoFocus
            placeholder="contoh: teman@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            hint="Anggota yang diundang harus terdaftar di KASH dengan email ini."
          />

          <div className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-700">Peran Anggota:</p>
            <p>
              Secara default, anggota baru akan bergabung sebagai <span className="font-semibold text-slate-900">Kontributor</span> (dapat menyetor dana & melihat transparansi saldo).
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              <Mail size={15} />
              {submitting ? "Mengirim..." : "Kirim Undangan"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
