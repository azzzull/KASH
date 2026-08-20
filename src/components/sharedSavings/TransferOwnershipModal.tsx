import { Crown } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";
import { transferSharedSavingsOwnership } from "../../lib/sharedSavings";
import type { SharedSavingsMemberShare } from "../../types/domain";
import { useI18n } from "../../i18n";

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
  const { t } = useI18n();
  const eligibleMembers = members.filter((m) => m.member_status === "active" && m.user_id !== currentOwnerId);
  const [selectedUserId, setSelectedUserId] = useState(eligibleMembers[0]?.user_id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError(t("common.required"));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await transferSharedSavingsOwnership(spaceId, selectedUserId);
      onTransferred();
      onClose();
    } catch (err: any) {
      setError(err.message || t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
            <Crown size={20} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">{t("shared.transferOwnershipTitle")}</h2>
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

          {eligibleMembers.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
              {t("shared.noPendingInvites")}
            </div>
          ) : (
            <SelectField
              id="new-owner"
              label={t("shared.selectMember")}
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
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving || eligibleMembers.length === 0}>
              {saving ? t("shared.saving") : t("shared.transferOwnership")}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
