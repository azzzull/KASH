import { Mail, UserPlus } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { Modal } from "../ui/Modal";
import { inviteSharedSavingsMember } from "../../lib/sharedSavings";
import { useI18n } from "../../i18n";

type InviteMemberModalProps = {
  isOpen: boolean;
  spaceId: string;
  spaceName: string;
  onClose: () => void;
  onInvited: () => void;
};

export function InviteMemberModal({ isOpen, spaceId, spaceName, onClose, onInvited }: InviteMemberModalProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError(t("auth.invalidEmail"));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await inviteSharedSavingsMember(spaceId, cleanEmail);
      onInvited();
      onClose();
    } catch (err: any) {
      setError(err.message || t("common.error"));
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
            <h2 className="text-base font-extrabold text-slate-900">{t("shared.inviteTitle")}</h2>
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
            label={t("shared.invitedEmail")}
            required
            autoFocus
            placeholder={t("shared.invitedEmailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              <Mail size={15} />
              {submitting ? t("shared.saving") : t("shared.sendInvite")}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
