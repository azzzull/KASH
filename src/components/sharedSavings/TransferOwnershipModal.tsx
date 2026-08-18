import { Crown, UserCheck, X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { SelectField } from "../ui/SelectField";
import { transferSharedSavingsOwnership } from "../../lib/sharedSavings";
import type { SharedSavingsMemberShare } from "../../types/domain";

type TransferOwnershipModalProps = {
  isOpen: boolean;
  spaceId: string;
  spaceName: string;
  members: SharedSavingsMemberShare[];
  currentOwnerId: string;
  onClose: () => void;
  onTransferred: () => void;
};

export function TransferOwnershipModal({
  isOpen,
  spaceId,
  spaceName,
  members,
  currentOwnerId,
  onClose,
  onTransferred,
}: TransferOwnershipModalProps) {
  const eligibleMembers = members.filter((m) => m.member_status === "active" && m.user_id !== currentOwnerId);
  const [selectedUserId, setSelectedUserId] = useState(eligibleMembers[0]?.user_id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError("Pilih anggota yang akan dijadikan Owner baru.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await transferSharedSavingsOwnership(spaceId, selectedUserId);
      onTransferred();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal mengalihkan kepemilikan ruang.");
    } finally {
      setSaving(false);
    }
  };

  const memberOptions = eligibleMembers.map((m) => ({
    value: m.user_id,
    label: `${m.member_name || m.member_email} (${m.member_email})`,
  }));

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
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
              <Crown size={20} strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Alihkan Kepemilikan (Owner)</h2>
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

          {eligibleMembers.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
              Belum ada anggota lain yang bergabung di ruang ini. Undang anggota terlebih dahulu sebelum dapat mengalihkan
              kepemilikan.
            </div>
          ) : (
            <>
              <SelectField
                id="new-owner"
                label="Pilih Owner Baru"
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  if (error) setError(null);
                }}
              >
                {eligibleMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.member_name || m.member_email} ({m.member_email})
                  </option>
                ))}
              </SelectField>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
                <span className="font-extrabold text-slate-900">Penting:</span> Setelah dialihkan, Anda tetap menjadi
                anggota aktif normal dengan hak porsi tabungan yang sama. Kontrol administratif ruang akan berpindah ke
                Owner baru.
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" disabled={saving || eligibleMembers.length === 0}>
              {saving ? "Mengalihkan..." : "Alihkan Kepemilikan"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
