import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { setSharedSavingsApprover } from "../../lib/sharedSavings";
import type { SharedSavingsMemberShare } from "../../types/domain";
import { useI18n } from "../../i18n";

type ManageApproversModalProps = {
  isOpen: boolean;
  spaceId: string;
  spaceName: string;
  members: SharedSavingsMemberShare[];
  approvers: string[];
  onClose: () => void;
  onUpdated: () => void;
};

export function ManageApproversModal({
  isOpen,
  spaceId,
  spaceName,
  members,
  approvers,
  onClose,
  onUpdated,
}: ManageApproversModalProps) {
  const { t } = useI18n();
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeMembers = members.filter((m) => m.member_status === "active");

  const handleToggle = async (userId: string, currentIsApprover: boolean) => {
    setLoadingUserId(userId);
    setError(null);

    try {
      await setSharedSavingsApprover(spaceId, userId, !currentIsApprover);
      onUpdated();
    } catch (err: any) {
      setError(err.message || t("common.error"));
    } finally {
      setLoadingUserId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      title={
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
            <ShieldCheck size={20} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">{t("shared.manageApproversTitle")}</h2>
            <p className="text-xs font-semibold text-slate-600">{spaceName}</p>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">
            {error}
          </div>
        )}

        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
          {activeMembers.map((m) => {
            const isApprover = approvers.includes(m.user_id);
            const isLoading = loadingUserId === m.user_id;

            return (
              <div key={m.user_id} className="flex items-center justify-between p-3.5 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-extrabold text-slate-900 truncate">
                      {m.member_name || m.member_email}
                    </p>
                    {m.is_owner && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                        {t("shared.owner")}
                      </span>
                    )}
                    {m.is_account_holder && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-800">
                        {t("shared.accountHolder")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{m.member_email}</p>
                </div>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => void handleToggle(m.user_id, isApprover)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold transition shadow-xs ${
                    isApprover
                      ? "bg-kash-selected text-kash-emeraldDark border border-kash-emerald/30 hover:bg-red-50 hover:text-kash-expense hover:border-kash-expense/30"
                      : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-kash-selected hover:text-kash-emeraldDark"
                  }`}
                >
                  {isApprover ? (
                    <>
                      <CheckCircle2 size={14} className="text-kash-emerald" />
                      {t("shared.approver")}
                    </>
                  ) : (
                    `+ ${t("shared.approver")}`
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
