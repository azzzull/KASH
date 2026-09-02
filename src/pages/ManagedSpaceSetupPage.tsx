import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Loader2,
  MoveRight,
  Plus,
  ShieldCheck,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ManagedInviteForm } from "../components/spaces/ManagedInviteForm";
import { getManagedRoleLabelKey } from "../components/spaces/ManagedInviteForm";
import { Button } from "../components/ui/Button";
import { FormField } from "../components/ui/FormField";
import { SelectField } from "../components/ui/SelectField";
import { useAuth } from "../context/AuthContext";
import { useActiveSpace } from "../context/ActiveSpaceContext";
import { useI18n } from "../i18n";
import { emitSpaceChanged, emitTransactionSaved } from "../lib/appEvents";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../lib/money";
import { getManagedSpaceInvitations } from "../lib/spaces";
import {
  getWalletIcon,
  getWalletTypeOption,
  walletColors,
  walletIconOptions,
  walletTypeOptions,
} from "../lib/walletMeta";
import {
  analyzeWalletMoveToManaged,
  createWallet,
  getWalletTransactionCount,
  getWallets,
  moveWalletToManaged,
  type WalletWithBalance,
} from "../lib/wallets";
import type {
  ManagedSpaceInvitation,
  ManagedSpaceRole,
  WalletMoveAnalysis,
  WalletType,
} from "../types/domain";

type SetupStep =
  | "intro"
  | "method"
  | "create-wallet"
  | "wallet-picker"
  | "move-preview"
  | "invite"
  | "ready";

type WalletCandidate = WalletWithBalance & { transactionCount: number };

type WalletForm = {
  name: string;
  walletType: WalletType;
  institutionName: string;
  initialBalance: string;
  currency: string;
  icon: string;
  color: string;
};

const initialWalletForm: WalletForm = {
  name: "",
  walletType: "cash",
  institutionName: "",
  initialBalance: "0",
  currency: "IDR",
  icon: "wallet",
  color: "#10B981",
};

function SetupHeader({ current, name }: { current: number; name: string }) {
  const { t } = useI18n();
  return (
    <div className="mb-6">
      <p className="text-xs font-extrabold uppercase tracking-normal text-kash-emeraldDark">
        {t("spaces.setupProgress", { current, total: 4 })}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-kash-emerald transition-all" style={{ width: `${current * 25}%` }} />
      </div>
      <p className="mt-2 truncate text-xs font-bold text-slate-500">{name}</p>
    </div>
  );
}

export function ManagedSpaceSetupPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { t, formatCurrency } = useI18n();
  const {
    spaces,
    loading: spacesLoading,
    personalSpace,
    refreshSpaces,
    userRole,
  } = useActiveSpace();
  const startMode = searchParams.get("start");
  const startAtWallet = startMode === "wallet" || startMode === "create-wallet" || startMode === "move-wallet";
  const initialStep: SetupStep = startMode === "create-wallet"
    ? "create-wallet"
    : startMode === "move-wallet"
      ? "wallet-picker"
      : startAtWallet
        ? "method"
        : "intro";
  const [step, setStep] = useState<SetupStep>(initialStep);
  const [error, setError] = useState<string | null>(null);
  const [walletForm, setWalletForm] = useState<WalletForm>({
    ...initialWalletForm,
    currency: profile?.default_currency ?? "IDR",
  });
  const [savingWallet, setSavingWallet] = useState(false);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [personalWallets, setPersonalWallets] = useState<WalletCandidate[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<WalletCandidate | null>(null);
  const [analysis, setAnalysis] = useState<WalletMoveAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [confirmedVoidedCleanup, setConfirmedVoidedCleanup] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<ManagedSpaceInvitation[]>([]);
  const [managedWallets, setManagedWallets] = useState<WalletWithBalance[]>([]);

  const space = useMemo(
    () => spaces.find((candidate) => candidate.id === spaceId && candidate.space_type === "managed"),
    [spaces, spaceId],
  );
  const callerRole: ManagedSpaceRole = space?.owner_user_id === user?.id
    ? "owner"
    : (userRole ?? "viewer");
  const canManage = callerRole === "owner" || callerRole === "admin";
  const isCreatorFlow = !startAtWallet;

  useEffect(() => {
    if (spacesLoading || !spaceId) return;
    if (!space || !canManage || isCreatorFlow && space.owner_user_id !== user?.id) {
      navigate("/dashboard", { replace: true });
    }
  }, [canManage, isCreatorFlow, navigate, space, spaceId, spacesLoading, user?.id]);

  const loadManagedSummary = useCallback(async () => {
    if (!spaceId || !canManage) return;
    const [walletResult, invitationResult] = await Promise.all([
      getWallets(spaceId),
      getManagedSpaceInvitations(spaceId),
    ]);
    setManagedWallets(walletResult.data ?? []);
    setPendingInvitations((invitationResult.data ?? []).filter((item) => item.status === "pending"));
  }, [canManage, spaceId]);

  useEffect(() => {
    if (step === "invite" || step === "ready") void loadManagedSummary();
  }, [loadManagedSummary, step]);

  const loadPersonalWallets = useCallback(async () => {
    if (!personalSpace) return;
    setWalletsLoading(true);
    setError(null);
    const { data, error: walletsError } = await getWallets(personalSpace.id);
    if (walletsError || !data) {
      setError(t("spaces.walletPickerError"));
      setWalletsLoading(false);
      return;
    }

    const eligible = data.filter((wallet) =>
      !wallet.is_archived && wallet.wallet_type !== "investment" && !wallet.goal_id,
    );
    const counts = await Promise.all(
      eligible.map(async (wallet) => ({
        wallet,
        result: await getWalletTransactionCount(wallet.id),
      })),
    );
    setPersonalWallets(counts.map(({ wallet, result }) => ({ ...wallet, transactionCount: result.count })));
    setWalletsLoading(false);
  }, [personalSpace, t]);

  useEffect(() => {
    if (step === "wallet-picker") void loadPersonalWallets();
  }, [loadPersonalWallets, step]);

  const createManagedWallet = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!spaceId) return;
    const typeOption = getWalletTypeOption(walletForm.walletType);
    const name = walletForm.name.trim();
    const institution = walletForm.institutionName.trim();
    const initialBalance = parseMoneyInputDigits(walletForm.initialBalance);
    if (!name || !initialBalance || typeOption.needsInstitution && !institution) {
      setError(t("spaces.walletFormIncomplete"));
      return;
    }

    setSavingWallet(true);
    setError(null);
    const { error: createError } = await createWallet({
      name,
      walletType: walletForm.walletType,
      institutionName: typeOption.needsInstitution ? institution : null,
      initialBalance,
      currency: walletForm.currency,
      includeInNetWorth: true,
      icon: walletForm.icon,
      color: walletForm.color,
    }, spaceId);

    if (createError) {
      setError(t("wallets.createError"));
      setSavingWallet(false);
      return;
    }

    emitSpaceChanged();
    setSavingWallet(false);
    setStep("invite");
  };

  const selectWallet = async (wallet: WalletCandidate) => {
    if (!spaceId) return;
    setSelectedWallet(wallet);
    setStep("move-preview");
    setAnalysis(null);
    setError(null);
    setAnalyzing(true);
    setConfirmedVoidedCleanup(false);
    const { data, error: analysisError } = await analyzeWalletMoveToManaged(wallet.id, spaceId);
    setAnalysis(data);
    setError(analysisError ? t("wallets.moveAnalyzeError") : null);
    setAnalyzing(false);
  };

  const moveWallet = async () => {
    if (!spaceId || !selectedWallet || !analysis?.can_move) return;
    if ((analysis.safe_voided_transfer_cleanups ?? 0) > 0 && !confirmedVoidedCleanup) {
      setError(t("wallets.moveVoidedCleanupConfirmRequired"));
      return;
    }

    setMoving(true);
    setError(null);
    const { error: moveError } = await moveWalletToManaged(selectedWallet.id, spaceId);
    if (moveError) {
      setError(moveError.message);
      setMoving(false);
      return;
    }

    await refreshSpaces(spaceId);
    emitTransactionSaved();
    emitSpaceChanged();
    setMoving(false);
    setStep("invite");
  };

  const finish = async () => {
    if (!spaceId) return;
    await refreshSpaces(spaceId);
    navigate("/dashboard");
  };

  if (spacesLoading || !space) {
    return <div className="flex min-h-[55dvh] items-center justify-center"><Loader2 className="animate-spin text-kash-emerald" size={28} /></div>;
  }

  const stepNumber = step === "intro" ? 1 : step === "method" || step === "create-wallet" || step === "wallet-picker" || step === "move-preview" ? 2 : step === "invite" ? 3 : 4;
  const managedBalance = managedWallets.reduce(
    (sum, wallet) => sum + toNumber(wallet.balance?.current_balance ?? wallet.initial_balance),
    0,
  );

  return (
    <div className="mx-auto w-full max-w-4xl pb-24 sm:pb-8">
      <SetupHeader current={stepNumber} name={space.name} />

      {error ? (
        <div className="mb-4 rounded-lg border border-kash-expense/20 bg-kash-expense/10 p-3 text-sm font-bold text-kash-expense">{error}</div>
      ) : null}

      {step === "intro" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-kash-emerald/10 text-kash-emeraldDark"><ShieldCheck size={24} /></span>
          <h1 className="mt-5 text-2xl font-extrabold text-slate-900">{t("spaces.setupTitle", { name: space.name })}</h1>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-600">{t("spaces.setupIntro")}</p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-extrabold text-slate-900">{t("spaces.personalMoney")}</p>
              <p className="mt-2 text-xs font-medium leading-5 text-slate-600">{t("spaces.personalMoneyDesc")}</p>
            </div>
            <div className="rounded-lg border border-kash-emerald/30 bg-kash-emerald/5 p-4">
              <p className="text-xs font-extrabold text-kash-emeraldDark">Managed Space</p>
              <p className="mt-2 text-xs font-medium leading-5 text-slate-600">{t("spaces.managedMoneyDesc")}</p>
            </div>
          </div>
          <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setStep("invite")} variant="ghost">{t("spaces.skipForNow")}</Button>
            <Button onClick={() => setStep("method")}>{t("spaces.startSetup")}<ArrowRight size={16} /></Button>
          </div>
        </section>
      ) : null}

      {step === "method" ? (
        <section>
          <h1 className="text-2xl font-extrabold text-slate-900">{t("spaces.setupMethodTitle")}</h1>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <button className="group min-h-44 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-kash-emerald/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20" onClick={() => setStep("create-wallet")} type="button">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-kash-emerald/10 text-kash-emeraldDark"><Plus size={22} /></span>
              <h2 className="mt-4 text-base font-extrabold text-slate-900">{t("spaces.createNewWallet")}</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{t("spaces.createNewWalletDesc")}</p>
            </button>
            <button className="group min-h-44 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-kash-emerald/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20" onClick={() => setStep("wallet-picker")} type="button">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><MoveRight size={22} /></span>
              <h2 className="mt-4 text-base font-extrabold text-slate-900">{t("spaces.movePersonalWallet")}</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{t("spaces.movePersonalWalletDesc")}</p>
            </button>
          </div>
          <div className="mt-5 flex justify-between gap-2">
            {isCreatorFlow ? <Button onClick={() => setStep("intro")} variant="ghost"><ArrowLeft size={16} />{t("common.back")}</Button> : <span />}
            <Button onClick={() => setStep("invite")} variant="ghost">{t("spaces.skipWalletSetup")}</Button>
          </div>
        </section>
      ) : null}

      {step === "create-wallet" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <button className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600" onClick={() => setStep("method")} type="button"><ArrowLeft size={16} />{t("common.back")}</button>
          <h1 className="text-xl font-extrabold text-slate-900">{t("spaces.createNewWallet")}</h1>
          <p className="mt-2 text-sm font-medium text-slate-600">{t("spaces.walletCreatedDirectly", { name: space.name })}</p>
          <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={createManagedWallet}>
            <SelectField id="setup-wallet-type" label={t("wallets.type")} onChange={(event) => setWalletForm((current) => ({ ...current, walletType: event.target.value as WalletType }))} value={walletForm.walletType}>
              {walletTypeOptions.filter((item) => item.value !== "investment" && item.value !== "savings").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </SelectField>
            <FormField id="setup-wallet-name" label={t("wallets.name")} onChange={(event) => setWalletForm((current) => ({ ...current, name: event.target.value }))} required value={walletForm.name} />
            {getWalletTypeOption(walletForm.walletType).needsInstitution ? <FormField id="setup-wallet-institution" label={t("wallets.institution")} onChange={(event) => setWalletForm((current) => ({ ...current, institutionName: event.target.value }))} required value={walletForm.institutionName} /> : null}
            <FormField id="setup-wallet-balance" inputMode="numeric" label={t("wallets.initialBalance")} onChange={(event) => setWalletForm((current) => ({ ...current, initialBalance: formatMoneyDigits(event.target.value) }))} required value={walletForm.initialBalance} />
            <SelectField id="setup-wallet-icon" label={t("wallets.icon")} onChange={(event) => setWalletForm((current) => ({ ...current, icon: event.target.value }))} value={walletForm.icon}>
              {walletIconOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </SelectField>
            <fieldset>
              <legend className="text-sm font-bold text-slate-900">{t("wallets.colorAccent")}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {walletColors.map((color) => <button aria-label={color} className={`h-9 w-9 rounded-full border-2 ${walletForm.color === color ? "border-slate-900" : "border-white"} shadow-sm ring-1 ring-slate-200`} key={color} onClick={() => setWalletForm((current) => ({ ...current, color }))} style={{ backgroundColor: color }} type="button" />)}
              </div>
            </fieldset>
            <div className="md:col-span-2 md:justify-self-end"><Button disabled={savingWallet} type="submit">{savingWallet ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}{t("spaces.createNewWallet")}</Button></div>
          </form>
        </section>
      ) : null}

      {step === "wallet-picker" ? (
        <section>
          <button className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600" onClick={() => setStep("method")} type="button"><ArrowLeft size={16} />{t("common.back")}</button>
          <h1 className="text-2xl font-extrabold text-slate-900">{t("spaces.choosePersonalWallet")}</h1>
          <p className="mt-2 text-sm font-medium text-slate-600">{t("spaces.choosePersonalWalletDesc")}</p>
          {walletsLoading ? <div className="mt-8 flex justify-center"><Loader2 className="animate-spin text-kash-emerald" /></div> : null}
          {!walletsLoading && personalWallets.length === 0 ? <div className="mt-5 rounded-xl border border-slate-200 bg-white p-7 text-center text-sm font-medium text-slate-600">{t("spaces.noEligiblePersonalWallets")}</div> : null}
          <div className="mt-5 grid gap-3">
            {personalWallets.map((wallet) => {
              const Icon = getWalletIcon(wallet.icon, wallet.wallet_type);
              return <button className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-kash-emerald/50" key={wallet.id} onClick={() => void selectWallet(wallet)} type="button">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${wallet.color ?? "#10B981"}15`, color: wallet.color ?? "#10B981" }}><Icon size={21} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold text-slate-900">{wallet.name}</p><p className="truncate text-xs font-medium text-slate-500">{getWalletTypeOption(wallet.wallet_type).label} · {t("spaces.transactionCount", { count: wallet.transactionCount })}</p>{!wallet.include_in_net_worth ? <span className="mt-1 inline-block text-[11px] font-bold text-amber-700">{t("spaces.excludedFromNetWorth")}</span> : null}</div>
                <p className="shrink-0 text-sm font-extrabold text-slate-900">{formatCurrency(wallet.balance?.current_balance ?? wallet.initial_balance, wallet.currency)}</p>
              </button>;
            })}
          </div>
          <div className="mt-5 flex justify-end"><Button onClick={() => setStep("invite")} variant="ghost">{t("spaces.skipWalletSetup")}</Button></div>
        </section>
      ) : null}

      {step === "move-preview" ? (
        <section>
          <button className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600" onClick={() => { setStep("wallet-picker"); setAnalysis(null); }} type="button"><ArrowLeft size={16} />{t("common.back")}</button>
          {analyzing || !analysis ? <div className="flex min-h-60 items-center justify-center"><Loader2 className="animate-spin text-kash-emerald" size={28} /></div> : <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h1 className="text-xl font-extrabold text-slate-900">{analysis.wallet.name}</h1>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                [t("spaces.balance"), formatCurrency(analysis.wallet.current_balance, analysis.wallet.currency)],
                [t("wallets.moveTransactionsToMove"), analysis.transactions_to_move],
                [t("wallets.moveCustomCategories"), analysis.custom_categories_to_reuse_or_copy],
                [t("wallets.moveSafeDependencies"), analysis.safe_dependencies],
                [t("wallets.moveRequiresReview"), analysis.requires_review],
                [t("wallets.moveBlockingIssues"), analysis.blocking_issues.length],
              ].map(([label, value]) => <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" key={String(label)}><p className="text-[11px] font-bold text-slate-500">{label}</p><p className="mt-1 text-base font-extrabold text-slate-900">{value}</p></div>)}
            </div>

            {(analysis.safe_voided_transfer_cleanups ?? 0) > 0 ? <label className="mt-5 flex cursor-pointer gap-3 rounded-lg border border-kash-emerald/30 bg-kash-emerald/5 p-4"><input checked={confirmedVoidedCleanup} className="mt-1 h-4 w-4 accent-kash-emerald" onChange={(event) => setConfirmedVoidedCleanup(event.target.checked)} type="checkbox" /><span><strong className="block text-sm text-slate-900">{t("wallets.moveVoidedCleanupTitle", { count: analysis.safe_voided_transfer_cleanups ?? 0 })}</strong><span className="mt-1 block text-xs font-medium leading-5 text-slate-600">{t("wallets.moveVoidedCleanupDescription")}</span></span></label> : null}

            {analysis.blocking_issues.length > 0 ? <div className="mt-5 rounded-lg border border-kash-expense/20 bg-kash-expense/10 p-4"><h2 className="text-sm font-extrabold text-slate-900">{t("spaces.walletCannotMove")}</h2>{analysis.blocking_issues.map((issue) => <div className="mt-3" key={issue.code}><p className="text-xs font-bold text-kash-expense">{issue.title}</p>{issue.items.slice(0, 5).map((item) => <p className="mt-1 text-xs font-medium text-slate-600" key={item.id}>{item.date ? new Date(item.date).toLocaleDateString() : ""} {item.title || item.note || item.type} {item.other_wallet_name ? `· ${item.other_wallet_name}` : ""}</p>)}</div>)}</div> : null}

            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs font-medium leading-5 text-amber-900"><p>{t("wallets.moveWarning")}</p><p className="mt-1 font-bold">{t("spaces.walletBalanceUnchanged")}</p></div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <div className="flex gap-2"><Button onClick={() => setStep("wallet-picker")} variant="secondary">{t("spaces.chooseAnotherWallet")}</Button>{!analysis.can_move && selectedWallet ? <Button onClick={() => navigate(`/wallets/${selectedWallet.id}`)} variant="ghost">{t("spaces.reviewTransactions")}</Button> : null}</div>
              <Button disabled={!analysis.can_move || moving || (analysis.safe_voided_transfer_cleanups ?? 0) > 0 && !confirmedVoidedCleanup} onClick={() => void moveWallet()}>{moving ? <Loader2 className="animate-spin" size={16} /> : <MoveRight size={16} />}{t("spaces.moveToSpace", { name: space.name })}</Button>
            </div>
          </div>}
        </section>
      ) : null}

      {step === "invite" ? (
        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-kash-emerald/10 text-kash-emeraldDark"><UserPlus size={21} /></span>
            <h1 className="mt-4 text-xl font-extrabold text-slate-900">{t("spaces.invitePeople")}</h1>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{t("spaces.invitePeopleDesc")}</p>
            <div className="mt-5"><ManagedInviteForm callerRole={callerRole} idPrefix="setup-invite" onInvited={async () => { await loadManagedSummary(); }} spaceId={space.id} /></div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-center justify-between"><h2 className="text-sm font-extrabold text-slate-900">{t("spaces.pendingInvitations")}</h2><span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-800">{pendingInvitations.length}</span></div>
            {pendingInvitations.length === 0 ? <p className="mt-5 text-sm font-medium text-slate-500">{t("spaces.inviteOptional")}</p> : <div className="mt-4 divide-y divide-slate-100">{pendingInvitations.map((invitation) => <div className="py-3" key={invitation.id}><p className="text-sm font-extrabold text-slate-900">{invitation.invited_name || invitation.invited_email}</p><p className="text-xs font-medium text-slate-600">{invitation.invited_email}</p><p className="mt-1 text-[11px] font-bold text-amber-700">{t(getManagedRoleLabelKey(invitation.role))} · {t("spaces.awaitingResponse")}</p></div>)}</div>}
            <div className="mt-6 border-t border-slate-100 pt-5"><Button className="w-full" onClick={() => setStep("ready")}>{pendingInvitations.length > 0 ? t("common.continue") : t("spaces.skipInvite")}<ArrowRight size={16} /></Button></div>
          </div>
        </section>
      ) : null}

      {step === "ready" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-9">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-kash-emerald/10 text-kash-emeraldDark"><CheckCircle2 size={28} /></span>
          <h1 className="mt-5 text-2xl font-extrabold text-slate-900">{t("spaces.setupReady", { name: space.name })}</h1>
          <div className="mx-auto mt-6 grid max-w-xl gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-4"><CircleDollarSign className="mx-auto text-kash-emerald" size={20} /><p className="mt-2 text-xs font-bold text-slate-500">{t("spaces.managedBalance")}</p><p className="mt-1 text-base font-extrabold text-slate-900">{formatCurrency(managedBalance, profile?.default_currency ?? "IDR")}</p></div>
            <div className="rounded-lg border border-slate-200 p-4"><WalletCards className="mx-auto text-blue-600" size={20} /><p className="mt-2 text-xs font-bold text-slate-500">{t("spaces.walletsCount")}</p><p className="mt-1 text-base font-extrabold text-slate-900">{managedWallets.length}</p></div>
            <div className="rounded-lg border border-slate-200 p-4"><Users className="mx-auto text-amber-600" size={20} /><p className="mt-2 text-xs font-bold text-slate-500">{t("spaces.pendingInvitations")}</p><p className="mt-1 text-base font-extrabold text-slate-900">{pendingInvitations.length}</p></div>
          </div>
          <Button className="mt-7" onClick={() => void finish()}><Landmark size={17} />{t("spaces.enterDashboard")}</Button>
        </section>
      ) : null}
    </div>
  );
}
