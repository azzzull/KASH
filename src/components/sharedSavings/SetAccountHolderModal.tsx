import { Landmark, UserCheck } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";
import { setSharedSavingsAccountHolder } from "../../lib/sharedSavings";
import type { SharedSavingsMemberShare } from "../../types/domain";
import { useI18n } from "../../i18n";

type SetAccountHolderModalProps = {
  isOpen: boolean;
  spaceId: string;
  spaceName: string;
  members: SharedSavingsMemberShare[];
  currentAccountHolderId: string;
  onClose: () => void;
  onUpdated: () => void;
};

export function SetAccountHolderModal({
  isOpen,
  spaceId,
  spaceName,
  members,
  currentAccountHolderId,
  onClose,
  onUpdated,
}: SetAccountHolderModalProps) {
  const { t } = useI18n();
  const activeMembers = members.filter((m) => m.member_status === "active");
  const [selectedUserId, setSelectedUserId] = useState(currentAccountHolderId || activeMembers[0]?.user_id || "");
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
      await setSharedSavingsAccountHolder(spaceId, selectedUserId);
      onUpdated();
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
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white shadow-xs">
            <Landmark size={20} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">{t("shared.setAccountHolderTitle")}</h2>
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

          <SelectField
            id="account-holder"
            label={t("shared.selectMember")}
            value={selectedUserId}
            onChange={(e) => {
              setSelectedUserId(e.target.value);
              if (error) setError(null);
            }}
          >
            {activeMembers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.member_name || m.member_email} ({m.member_email})
              </option>
            ))}
          </SelectField>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("shared.saving") : t("shared.saveChanges")}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
