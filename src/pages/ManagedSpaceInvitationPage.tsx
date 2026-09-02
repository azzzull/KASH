import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck, UserRound, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { getManagedRoleLabelKey } from "../components/spaces/ManagedInviteForm";
import { useActiveSpace } from "../context/ActiveSpaceContext";
import { useNotifications } from "../context/NotificationContext";
import { useI18n } from "../i18n";
import {
  getManagedSpaceInvitation,
  respondManagedSpaceInvitation,
} from "../lib/spaces";
import type {
  ManagedSpaceInvitation,
  ManagedSpaceInvitationResponse,
} from "../types/domain";

export function ManagedSpaceInvitationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { refreshSpaces } = useActiveSpace();
  const { refresh: refreshNotifications } = useNotifications();
  const [invitation, setInvitation] = useState<ManagedSpaceInvitation | null>(null);
  const [result, setResult] = useState<ManagedSpaceInvitationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInvitation = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await getManagedSpaceInvitation(id);
    setInvitation(data);
    setError(loadError ? t("spaces.invitationUnavailable") : null);
    setLoading(false);
  }, [id, t]);

  useEffect(() => {
    void loadInvitation();
  }, [loadInvitation]);

  const respond = async (action: "accept" | "decline") => {
    if (!id || responding) return;
    setResponding(action);
    setError(null);
    const { data, error: responseError } = await respondManagedSpaceInvitation(id, action);
    if (responseError || !data) {
      setError(t("spaces.invitationResponseError"));
      setResponding(null);
      return;
    }

    setResult(data);
    setInvitation((current) => current ? { ...current, status: data.status } : current);
    await refreshNotifications();
    if (action === "accept") await refreshSpaces();
    setResponding(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-[55dvh] items-center justify-center">
        <Loader2 className="animate-spin text-kash-emerald" size={28} />
      </div>
    );
  }

  if (!invitation || error && !result) {
    return (
      <div className="mx-auto w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-sm">
        <EmptyState
          action={<Button onClick={() => navigate("/dashboard")} variant="secondary">{t("spaces.backToDashboard")}</Button>}
          description={error || t("spaces.invitationUnavailable")}
          icon={XCircle}
          title={t("spaces.invitationUnavailableTitle")}
          tone="neutral"
        />
      </div>
    );
  }

  if (result) {
    const accepted = result.status === "accepted";
    return (
      <div className="mx-auto w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${accepted ? "bg-kash-emerald/10 text-kash-emeraldDark" : "bg-slate-100 text-slate-500"}`}>
          {accepted ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
        </span>
        <h1 className="mt-4 text-xl font-extrabold text-slate-900">
          {accepted
            ? t("spaces.invitationAcceptedTitle", { name: result.space_name })
            : t("spaces.invitationDeclinedTitle")}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-600">
          {accepted ? t("spaces.invitationAcceptedDesc") : t("spaces.invitationDeclinedDesc")}
        </p>
        <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <Button onClick={() => navigate("/dashboard")} variant="secondary">
            {t("spaces.later")}
          </Button>
          {accepted ? (
            <Button
              onClick={async () => {
                await refreshSpaces(result.space_id);
                navigate("/dashboard");
              }}
            >
              {t("spaces.openSpace", { name: result.space_name })}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const isPending = invitation.status === "pending";
  const inviterName = invitation.inviter_name || invitation.inviter_email;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <button className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900" onClick={() => navigate(-1)} type="button">
        <ArrowLeft size={16} />
        {t("common.back")}
      </button>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-6 sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-kash-emerald/10 text-kash-emeraldDark">
            <ShieldCheck size={24} />
          </span>
          <p className="mt-5 text-xs font-extrabold uppercase tracking-normal text-kash-emeraldDark">
            {t("spaces.managedInvitation")}
          </p>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">{invitation.space_name}</h1>
        </div>

        <div className="grid gap-5 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            {invitation.inviter_avatar_url ? (
              <img alt={inviterName} className="h-11 w-11 rounded-full border border-slate-200 object-cover" src={invitation.inviter_avatar_url} />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600"><UserRound size={20} /></span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-slate-900">{inviterName}</p>
              <p className="truncate text-xs font-medium text-slate-600">{invitation.inviter_email}</p>
            </div>
          </div>

          <p className="text-sm font-medium leading-6 text-slate-700">
            {t("spaces.invitedYouTo", { name: invitation.space_name })}
          </p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-500">{t("spaces.invitedAs")}</p>
            <p className="mt-1 text-base font-extrabold text-slate-900">{t(getManagedRoleLabelKey(invitation.role))}</p>
          </div>

          {error ? <p className="text-sm font-bold text-kash-expense">{error}</p> : null}

          {isPending ? (
            <div className="grid gap-2 border-t border-slate-100 pt-5 sm:grid-cols-2">
              <Button disabled={Boolean(responding)} onClick={() => void respond("decline")} variant="secondary">
                {responding === "decline" ? <Loader2 className="animate-spin" size={16} /> : <XCircle size={16} />}
                {t("spaces.declineInvitation")}
              </Button>
              <Button disabled={Boolean(responding)} onClick={() => void respond("accept")}>
                {responding === "accept" ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                {t("spaces.acceptInvitation")}
              </Button>
            </div>
          ) : (
            <p className="rounded-lg bg-slate-100 p-3 text-center text-sm font-bold text-slate-600">
              {t("spaces.invitationResolved")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
