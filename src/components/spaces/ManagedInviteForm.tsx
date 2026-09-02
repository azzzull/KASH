import { Loader2, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useI18n } from "../../i18n";
import type { TranslationKey } from "../../i18n";
import { inviteManagedSpaceMember } from "../../lib/spaces";
import type { ManagedSpaceRole } from "../../types/domain";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { SelectField } from "../ui/SelectField";

type InvitableRole = Exclude<ManagedSpaceRole, "owner">;

const roleLabelKeys: Record<InvitableRole, TranslationKey> = {
  admin: "spaces.roleAdmin",
  member: "spaces.roleMember",
  viewer: "spaces.roleViewer",
};

const roleDescriptionKeys: Record<InvitableRole, TranslationKey> = {
  admin: "spaces.roleAdminDesc",
  member: "spaces.roleMemberDesc",
  viewer: "spaces.roleViewerDesc",
};

export function getManagedRoleLabelKey(role: InvitableRole): TranslationKey {
  return roleLabelKeys[role];
}

export function ManagedInviteForm({
  callerRole,
  idPrefix = "managed-invite",
  onInvited,
  spaceId,
}: {
  callerRole: ManagedSpaceRole;
  idPrefix?: string;
  onInvited: (duplicate: boolean) => void | Promise<void>;
  spaceId: string;
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roles: InvitableRole[] = callerRole === "owner"
    ? ["admin", "member", "viewer"]
    : ["member", "viewer"];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError(t("spaces.inviteEmailRequired"));
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: inviteError } = await inviteManagedSpaceMember(
      spaceId,
      cleanEmail,
      role,
    );

    if (inviteError || !data) {
      setError(
        inviteError?.message.includes("selected role") || inviteError?.message.includes("Unauthorized")
          ? t("spaces.unauthorizedRole")
          : t("spaces.inviteUnavailable"),
      );
      setLoading(false);
      return;
    }

    setEmail("");
    setRole("member");
    await onInvited(data.duplicate);
    setLoading(false);
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      {error ? (
        <div className="rounded-lg border border-kash-expense/20 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">
          {error}
        </div>
      ) : null}

      <FormField
        autoComplete="email"
        disabled={loading}
        id={`${idPrefix}-email`}
        label={t("spaces.memberEmail")}
        onChange={(event) => {
          setEmail(event.target.value);
          setError(null);
        }}
        placeholder={t("spaces.memberEmailPlaceholder")}
        required
        type="email"
        value={email}
      />

      <SelectField
        disabled={loading}
        id={`${idPrefix}-role`}
        label={t("spaces.memberRole")}
        onChange={(event) => setRole(event.target.value as InvitableRole)}
        value={role}
      >
        {roles.map((option) => (
          <option key={option} value={option}>
            {t(roleLabelKeys[option])}
          </option>
        ))}
      </SelectField>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-extrabold text-slate-900">
          {t(roleLabelKeys[role])}
        </p>
        <p className="mt-1 text-xs font-medium leading-5 text-slate-600">
          {t(roleDescriptionKeys[role])}
        </p>
      </div>

      <Button disabled={loading || !email.trim()} type="submit">
        {loading ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={16} />}
        {loading ? t("common.saving") : t("spaces.sendInvitation")}
      </Button>
    </form>
  );
}
