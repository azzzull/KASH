import { Modal } from "../ui/Modal";
import { useI18n } from "../../i18n";
import type { ManagedSpaceRole } from "../../types/domain";
import { ManagedInviteForm } from "./ManagedInviteForm";

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
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("spaces.inviteMember")}
      maxWidth="sm"
    >
      <div className="grid gap-4 pt-1">
        <p className="text-xs font-semibold leading-5 text-slate-600">
          {t("spaces.inviteMemberDesc")}
        </p>
        <ManagedInviteForm
          callerRole={callerRole}
          onInvited={async () => {
            await onMemberAdded();
            onClose();
          }}
          spaceId={spaceId}
        />
      </div>
    </Modal>
  );
}
