import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";
import { Button } from "../ui/Button";
import { updateManagedSpaceMemberRole } from "../../lib/spaces";
import { emitMembershipChanged, emitSpaceChanged } from "../../lib/appEvents";
import { useI18n } from "../../i18n";
import type { ManagedSpaceMemberItem, ManagedSpaceRole } from "../../types/domain";

type EditMemberRoleModalProps = {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  member: ManagedSpaceMemberItem;
  callerRole: ManagedSpaceRole;
  onRoleUpdated: () => void;
};

export function EditMemberRoleModal({
  isOpen,
  onClose,
  spaceId,
  member,
  callerRole,
  onRoleUpdated,
}: EditMemberRoleModalProps) {
  const { t } = useI18n();
  const [role, setRole] = useState<ManagedSpaceRole>(member.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = callerRole === "owner";

  const handleRoleChange = (e: { target: { value: string } }) => {
    setRole(e.target.value as ManagedSpaceRole);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (role === member.role) {
      onClose();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: rpcError } = await updateManagedSpaceMemberRole(
        spaceId,
        member.user_id,
        role
      );
      if (rpcError) {
        const msg = rpcError.message || "";
        if (msg.includes("Cannot modify owner") || msg.includes("Cannot assign owner")) {
          setError(t("spaces.unauthorizedRole") || "Peran pemilik tidak dapat diubah.");
        } else if (msg.includes("Admin cannot modify another admin") || msg.includes("Admin cannot promote to admin") || msg.includes("Unauthorized")) {
          setError(t("spaces.unauthorizedRole") || "Anda tidak memiliki izin untuk mengubah ke peran ini.");
        } else {
          setError(rpcError.message || t("common.error"));
        }
        setLoading(false);
        return;
      }

      emitMembershipChanged();
      emitSpaceChanged();
      onRoleUpdated();
      onClose();
    } catch (err: any) {
      setError(err?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const displayName = member.full_name || "Pengguna KASH";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("spaces.changeRole") || "Ubah Peran"}
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-1 pb-1">
        <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {t("spaces.members") || "Anggota"}
          </p>
          <p className="text-sm font-extrabold text-slate-900 mt-0.5">
            {displayName}
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-kash-expense/20 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">
            {error}
          </div>
        ) : null}

        <SelectField
          id="edit-member-role-select"
          label={t("spaces.memberRole") || "Peran Anggota"}
          value={role}
          onChange={handleRoleChange}
          disabled={loading}
        >
          {isOwner ? (
            <option value="admin">
              {t("spaces.roleAdmin") || "Admin"} — {t("spaces.roleAdminDesc") || "Kelola transaksi & anggota"}
            </option>
          ) : null}
          <option value="member">
            {t("spaces.roleMember") || "Member"} — {t("spaces.roleMemberDesc") || "Catat transaksi & lihat data"}
          </option>
          <option value="viewer">
            {t("spaces.roleViewer") || "Viewer"} — {t("spaces.roleViewerDesc") || "Lihat data saja (read-only)"}
          </option>
        </SelectField>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={loading || role === member.role}
          >
            <ShieldCheck size={16} />
            {loading ? (t("common.saving") || "Menyimpan...") : (t("common.save") || "Simpan Peran")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
