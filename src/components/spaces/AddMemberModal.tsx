import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { Modal } from "../ui/Modal";
import { FormField } from "../ui/FormField";
import { SelectField } from "../ui/SelectField";
import { Button } from "../ui/Button";
import { addManagedSpaceMember } from "../../lib/spaces";
import { useI18n } from "../../i18n";
import type { ManagedSpaceRole } from "../../types/domain";

type AddMemberModalProps = {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  callerRole: ManagedSpaceRole;
  onMemberAdded: () => void;
};

export function AddMemberModal({
  isOpen,
  onClose,
  spaceId,
  callerRole,
  onMemberAdded,
}: AddMemberModalProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ManagedSpaceRole>("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Owner can add admin, member, viewer
  // Admin can only add member, viewer
  const isOwner = callerRole === "owner";

  const handleRoleChange = (e: { target: { value: string } }) => {
    setRole(e.target.value as ManagedSpaceRole);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError(t("spaces.memberEmail") + " " + t("common.required").toLowerCase());
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: rpcError } = await addManagedSpaceMember(spaceId, cleanEmail, role);
      if (rpcError) {
        const msg = rpcError.message || "";
        if (msg.includes("User not found")) {
          setError(t("spaces.userNotFound") || "Pengguna dengan email ini tidak ditemukan di KASH.");
        } else if (msg.includes("Cannot add yourself")) {
          setError(t("spaces.cannotAddSelf") || "Anda tidak dapat menambahkan diri sendiri.");
        } else if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("already")) {
          setError(t("spaces.alreadyMember") || "Pengguna ini sudah menjadi anggota di space ini.");
        } else if (msg.includes("Admin cannot create an admin") || msg.includes("Cannot add an owner") || msg.includes("Unauthorized")) {
          setError(t("spaces.unauthorizedRole") || "Anda tidak memiliki izin untuk menetapkan peran ini.");
        } else {
          setError(rpcError.message || t("common.error"));
        }
        setLoading(false);
        return;
      }

      setEmail("");
      setRole("member");
      onMemberAdded();
      onClose();
    } catch (err: any) {
      setError(err?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("spaces.addMember") || "Tambah Anggota"}
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-1 pb-1">
        <p className="text-xs font-semibold text-slate-500">
          {t("spaces.addMemberDesc") || "Masukkan alamat email akun KASH yang ingin ditambahkan."}
        </p>

        {error ? (
          <div className="rounded-xl border border-kash-expense/20 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">
            {error}
          </div>
        ) : null}

        <FormField
          id="member-email-input"
          label={t("spaces.memberEmail") || "Email Pengguna"}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("spaces.memberEmailPlaceholder") || "mis. rekan@email.com"}
          disabled={loading}
          autoFocus
          required
          hasError={Boolean(error)}
        />

        <SelectField
          id="member-role-select"
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
            disabled={loading || !email.trim()}
          >
            <UserPlus size={16} />
            {loading ? (t("common.saving") || "Menyimpan...") : (t("spaces.addMember") || "Tambah Anggota")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
