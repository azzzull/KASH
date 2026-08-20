import {
  Archive,
  ArrowLeft,
  CalendarDays,
  Car,
  Edit3,
  Home,
  Laptop,
  Loader2,
  PiggyBank,
  Plane,
  Plus,
  Sparkles,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { DatePickerField } from "../components/ui/DatePickerField";
import { FormField } from "../components/ui/FormField";
import { IconButton } from "../components/ui/IconButton";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import {
  archiveGoal,
  closeGoal,
  createGoalContribution,
  getGoalById,
  updateGoal,
  type GoalDetail,
} from "../lib/goals";
import { useAppEvent } from "../hooks/useAppEvent";
import { appEvents, emitGoalSaved, emitTransactionSaved } from "../lib/appEvents";
import { formatCurrency, formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../lib/money";
import { getWallets, type WalletWithBalance } from "../lib/wallets";
import { useI18n } from "../i18n";

type GoalFormState = {
  name: string;
  targetAmount: string;
  deadline: string;
  icon: string;
  note: string;
};

type ContributionFormState = {
  walletId: string;
  amount: string;
  contributionDate: string;
  note: string;
};

const iconOptions = [
  { icon: PiggyBank, label: "Savings", value: "piggy-bank" },
  { icon: Laptop, label: "Laptop", value: "laptop" },
  { icon: Plane, label: "Travel", value: "plane" },
  { icon: Home, label: "Home", value: "home" },
  { icon: Car, label: "Vehicle", value: "car" },
  { icon: Sparkles, label: "Dream", value: "sparkles" },
];

function getGoalIcon(icon: string | null | undefined) {
  return iconOptions.find((option) => option.value === icon)?.icon ?? PiggyBank;
}

function progressOf(goal: GoalDetail) {
  const current = toNumber(goal.progress?.current_amount ?? 0);
  const target = toNumber(goal.target_amount);
  return {
    current,
    percentage: target > 0 ? Math.min((current / target) * 100, 100) : 0,
    remaining: Math.max(target - current, 0),
    target,
  };
}

function formatDate(value: string | null) {
  if (!value) return "No deadline";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function currentLocalDateTimeValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toEditState(goal: GoalDetail): GoalFormState {
  return {
    name: goal.name,
    targetAmount: formatMoneyDigits(goal.target_amount),
    deadline: goal.deadline ?? "",
    icon: goal.icon ?? "piggy-bank",
    note: goal.note ?? "",
  };
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-normal text-slate-600">{label}</p>
      <p className="mt-2 text-lg font-extrabold text-slate-900">{value}</p>
    </article>
  );
}

function GoalEditModal({
  goal,
  onClose,
  onSaved,
}: {
  goal: GoalDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<GoalFormState>(toEditState(goal));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localizedIconOptions = useMemo(
    () => [
      { icon: PiggyBank, label: t("goals.iconSavings") || "Tabungan", value: "piggy-bank" },
      { icon: Laptop, label: t("goals.iconLaptop") || "Gadget / Laptop", value: "laptop" },
      { icon: Plane, label: t("goals.iconTravel") || "Liburan", value: "plane" },
      { icon: Home, label: t("goals.iconHome") || "Rumah", value: "home" },
      { icon: Car, label: t("goals.iconVehicle") || "Kendaraan", value: "car" },
      { icon: Sparkles, label: t("goals.iconDream") || "Impian", value: "sparkles" },
    ],
    [t],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    const targetAmount = parseMoneyInputDigits(form.targetAmount);

    if (!name) {
      setError(t("goals.nameRequired") || "Nama target wajib diisi.");
      return;
    }

    if (!targetAmount || toNumber(targetAmount) <= 0) {
      setError(t("goals.amountGreaterThanZero") || "Target nominal harus lebih besar dari nol.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error: updateError } = await updateGoal(goal.id, {
      deadline: form.deadline || null,
      icon: form.icon,
      name,
      note: form.note.trim() || null,
      targetAmount,
    });

    if (updateError) {
      setError(t("goals.updateError") || "Gagal memperbarui target ini. Silakan periksa kembali data Anda.");
      setSaving(false);
      return;
    }

    emitGoalSaved();
    onSaved();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title={t("goals.editGoal") || "Edit Target"}
      description={t("goals.editGoalDescription") || "Hanya mengubah target nominal dan detail informasi target."}
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <FormField id="edit-goal-name" label={t("goals.goalName") || "Nama Target"} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} required />
          <FormField
            id="edit-goal-target"
            inputMode="numeric"
            label={t("goals.targetAmount") || "Target Nominal"}
            onChange={(event) => setForm((current) => ({ ...current, targetAmount: formatMoneyDigits(event.target.value) }))}
            value={form.targetAmount}
            required
          />
          <div className="w-full max-w-full min-w-0">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-900" htmlFor="edit-goal-deadline">
                {t("goals.targetDate") || "Tenggat Waktu"}
              </label>
              {form.deadline ? (
                <button
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, deadline: "" }))}
                  className="text-xs font-bold text-kash-emerald hover:text-kash-emeraldDark active:text-kash-emeraldPressed hover:underline transition"
                >
                  {t("goals.clearDeadline") || "Hapus tenggat"}
                </button>
              ) : (
                <span className="text-xs font-semibold text-slate-600">{t("goals.noDeadline") || "Tanpa tenggat"}</span>
              )}
            </div>
            <DatePickerField
              id="edit-goal-deadline"
              value={form.deadline}
              placeholder={t("goals.selectDeadline") || "Pilih Tenggat Waktu"}
              onChange={(val) => setForm((current) => ({ ...current, deadline: val }))}
            />
            <span className="mt-1.5 block text-xs font-medium text-slate-600">
              {form.deadline
                ? (t("goals.trackProgressHint") || "KASH akan memantau progres tabungan menuju tenggat waktu ini.")
                : (t("goals.deadlineOptionalHint") || "Opsional. Kosongkan jika tanpa batas waktu.")}
            </span>
          </div>
          <SelectField id="edit-goal-icon" label={t("goals.icon") || "Ikon"} onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))} value={form.icon}>
            {localizedIconOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <FormField id="edit-goal-note" label={t("goals.note") || "Catatan (Opsional)"} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} value={form.note} />
          <Button disabled={saving} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            {t("common.saveChanges") || "Simpan Perubahan"}
          </Button>
        </form>
      </div>
    </Modal>
  );
}

function ContributionModal({
  goal,
  onClose,
  onSaved,
  wallets,
}: {
  goal: GoalDetail;
  onClose: () => void;
  onSaved: () => void;
  wallets: WalletWithBalance[];
}) {
  const { t, formatCurrency } = useI18n();
  const [form, setForm] = useState<ContributionFormState>({
    amount: "",
    contributionDate: currentLocalDateTimeValue(),
    note: "",
    walletId: wallets.find((wallet) => wallet.id !== goal.wallet_id)?.id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceWallets = wallets.filter((wallet) => wallet.id !== goal.wallet_id);
  const selectedWallet = sourceWallets.find((wallet) => wallet.id === form.walletId) ?? null;
  const sourceBalance = toNumber(selectedWallet?.balance?.current_balance ?? selectedWallet?.initial_balance ?? 0);
  const amount = toNumber(parseMoneyInputDigits(form.amount));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountDigits = parseMoneyInputDigits(form.amount);

    if (!form.walletId) {
      setError(t("goals.selectWalletError") || "Pilih dompet asal terlebih dahulu.");
      return;
    }

    if (!amountDigits || toNumber(amountDigits) <= 0) {
      setError(t("goals.amountGreaterThanZero") || "Nominal harus lebih besar dari nol.");
      return;
    }

    if (toNumber(amountDigits) > sourceBalance) {
      setError(t("goals.insufficientBalance") || "Saldo dompet asal tidak mencukupi.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error: contributionError } = await createGoalContribution({
      amount: amountDigits,
      contributionDate: new Date(form.contributionDate).toISOString(),
      goalId: goal.id,
      note: form.note.trim() || null,
      walletId: form.walletId,
    });

    if (contributionError) {
      setError(contributionError.message || (t("goals.contributionError") || "Gagal menambahkan alokasi ini. Silakan coba lagi."));
      setSaving(false);
      return;
    }

    emitGoalSaved();
    emitTransactionSaved();
    onSaved();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title={t("goals.addContribution") || "Tambah Alokasi Tabungan"}
      description={t("goals.addContributionDesc") || "Ini membuat transfer internal dari dompet asal ke kantong target tabungan."}
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <SelectField id="contribution-wallet" label={t("goals.fromWallet") || "Dari Dompet"} onChange={(event) => setForm((current) => ({ ...current, walletId: event.target.value }))} value={form.walletId}>
            {sourceWallets.length === 0 ? <option value="">{t("goals.noSourceWallets") || "Tidak ada dompet asal"}</option> : null}
            {sourceWallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name} - {t("wallets.balance") || "Saldo"} {formatCurrency(wallet.balance?.current_balance ?? wallet.initial_balance, wallet.currency)}
              </option>
            ))}
          </SelectField>
          <div className="rounded-lg border border-kash-emerald/20 bg-kash-selected p-4">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-600">{t("goals.sourceWalletBalance") || "Saldo Dompet Asal"}</p>
            <p className="mt-2 text-xl font-extrabold text-slate-900">{formatCurrency(sourceBalance, selectedWallet?.currency ?? "IDR")}</p>
            {amount > 0 ? <p className="mt-1 text-xs font-bold text-slate-700">{t("goals.afterTransfer") || "Setelah transfer"}: {formatCurrency(sourceBalance - amount, selectedWallet?.currency ?? "IDR")}</p> : null}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
            <p className="font-extrabold text-slate-900">{t("goals.destination") || "Tujuan"}</p>
            <p className="mt-1">{goal.wallet?.name ?? (t("goals.goalPocket") || "Kantong Target")}</p>
          </div>
          <FormField
            id="contribution-amount"
            inputMode="numeric"
            label={t("goals.amount") || "Nominal"}
            onChange={(event) => setForm((current) => ({ ...current, amount: formatMoneyDigits(event.target.value) }))}
            placeholder="500.000"
            value={form.amount}
            required
          />
          <DatePickerField
            id="contribution-date"
            label={t("common.date") || "Tanggal"}
            enableTime
            onChange={(val) => setForm((current) => ({ ...current, contributionDate: val }))}
            value={form.contributionDate}
          />
          <FormField id="contribution-note" label={t("goals.note") || "Catatan (Opsional)"} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder={t("goals.notePlaceholder") || "Catatan tambahan..."} value={form.note} />
          <Button disabled={saving || sourceWallets.length === 0} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            {t("goals.saveContribution") || "Simpan Alokasi"}
          </Button>
        </form>
      </div>
    </Modal>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 p-4 md:p-6">
      <div className="h-8 w-32 rounded-lg bg-slate-100" />
      <div className="h-56 rounded-lg border border-slate-200 bg-white p-5">
        <div className="h-4 w-1/3 rounded-full bg-slate-100" />
        <div className="mt-8 h-8 w-2/3 rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}

export function GoalDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, formatDate: formatI18nDate, formatCurrency } = useI18n();
  const [goal, setGoal] = useState<GoalDetail | null>(null);
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [closingGoal, setClosingGoal] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closeDestinationWalletId, setCloseDestinationWalletId] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showContribution, setShowContribution] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGoal = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const [{ data: goalData, error: goalError }, { data: walletData, error: walletError }] = await Promise.all([
      getGoalById(id),
      getWallets(),
    ]);

    if (goalError || !goalData) {
      setError(t("goals.loadError") || "Gagal memuat target ini. Mungkin target tidak ada atau Anda tidak memiliki akses.");
      setLoading(false);
      return;
    }

    if (walletError || !walletData) {
      setError(t("goals.loadWalletsError") || "Gagal memuat dompet untuk alokasi.");
      setLoading(false);
      return;
    }

    setGoal(goalData);
    setWallets(walletData);
    setLoading(false);
  };

  useEffect(() => {
    void loadGoal();
  }, [id]);

  useAppEvent(appEvents.transactionSaved, () => void loadGoal());
  useAppEvent(appEvents.goalSaved, () => void loadGoal());

  const progress = useMemo(() => (goal ? progressOf(goal) : null), [goal]);

  const availableDestinationWallets = useMemo(() => {
    if (!goal) return [];
    return wallets.filter((wallet) => wallet.id !== goal.wallet_id && !wallet.is_archived);
  }, [goal, wallets]);

  const handleCloseGoal = async () => {
    if (!goal || !progress) return;

    if (progress.current > 0 && !closeDestinationWalletId) {
      setCloseError(t("goals.selectDestinationWalletError") || "Silakan pilih dompet tujuan untuk menerima sisa dana.");
      return;
    }

    setClosingGoal(true);
    setCloseError(null);

    const { error: rpcError } = await closeGoal(
      goal.id,
      progress.current > 0 ? closeDestinationWalletId : null,
    );

    if (rpcError) {
      setCloseError(rpcError.message || (t("goals.closeGoalError") || "Gagal menutup target ini. Silakan coba lagi."));
      setClosingGoal(false);
      return;
    }

    emitGoalSaved();
    emitTransactionSaved();
    navigate("/goals", { replace: true });
  };

  if (loading) return <DetailSkeleton />;

  if (error || !goal || !progress) {
    return (
      <div className="mx-auto grid w-full max-w-4xl gap-4 p-4 md:p-6">
        <Link className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-kash-emerald" to="/goals">
          <ArrowLeft aria-hidden="true" size={17} />
          {t("goals.title") || "Target"}
        </Link>
        <section className="rounded-lg border border-kash-expense/30 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold text-slate-900">{t("common.error")}</h2>
          <p className="mt-2 text-sm font-semibold text-slate-700">{error}</p>
          <Button className="mt-4" onClick={() => void loadGoal()}>
            {t("common.retry")}
          </Button>
        </section>
      </div>
    );
  }

  const Icon = getGoalIcon(goal.icon);
  const isCancelled = goal.status === "cancelled";
  const isCompleted = goal.status === "completed" || progress.percentage >= 100;

  return (
    <div className="w-full min-w-0 space-y-5">
      <Link className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-kash-emerald" to="/goals">
        <ArrowLeft aria-hidden="true" size={17} />
        {t("goals.title") || "Target"}
      </Link>

      <PageHeader
        eyebrow={isCompleted ? (t("goals.goalCompleted") || "Target Tercapai") : (t("goals.title") || "Target Impian")}
        icon={Icon}
        title={goal.name}
        description={goal.note || (t("goals.pocketWalletDesc") || "Pantau dana yang dialokasikan ke kantong tabungan ini.")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button disabled={isCancelled} onClick={() => setShowContribution(true)}>
              <Plus aria-hidden="true" size={17} />
              {t("goals.addContribution") || "Tambah Tabungan"}
            </Button>
            <Button disabled={isCancelled} onClick={() => setShowEdit(true)} variant="secondary">
              <Edit3 aria-hidden="true" size={17} />
              {t("common.edit")}
            </Button>
            <Button
              disabled={closingGoal || isCancelled}
              onClick={() => {
                setCloseError(null);
                setCloseDestinationWalletId(availableDestinationWallets[0]?.id ?? "");
                setShowCloseDialog(true);
              }}
              variant="secondary"
            >
              <Trash2 aria-hidden="true" size={17} />
              {t("goals.deleteGoal") || "Hapus Target"}
            </Button>
          </div>
        }
      />

      {isCancelled ? (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-700">
          {t("goals.closedGoalBanner") || "Target ini sudah ditutup. Riwayat alokasi dan catatan transaksi tetap tersimpan dalam riwayat Anda."}
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-kash-emerald100 text-kash-emeraldDark ring-1 ring-kash-emerald/30">
                <Icon aria-hidden="true" size={24} strokeWidth={2.4} />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-600">{t("goals.progress") || "Kemajuan"}</p>
                <p className="text-2xl font-extrabold text-slate-900">{progress.percentage.toFixed(0)}%</p>
              </div>
            </div>
          </div>
          <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-3">
            <DetailMetric label={t("goals.current") || "Terkumpul"} value={formatCurrency(progress.current, "IDR")} />
            <DetailMetric label={t("goals.target") || "Target"} value={formatCurrency(progress.target, "IDR")} />
            <DetailMetric label={t("debts.remaining") || "Sisa"} value={formatCurrency(progress.remaining, "IDR")} />
          </div>
        </div>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-kash-emerald" style={{ width: `${progress.percentage}%` }} />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <DetailMetric
          label={t("goals.targetDate") || "Tenggat Waktu"}
          value={goal.deadline ? formatI18nDate(new Date(`${goal.deadline}T00:00:00`)) : (t("goals.noDeadline") || "Tanpa tenggat")}
        />
        <DetailMetric label={t("goals.pocketWallet") || "Dompet Kantong"} value={goal.wallet?.name ?? (t("goals.goalPocket") || "Kantong Target")} />
        <DetailMetric
          label={t("common.status") || "Status"}
          value={isCancelled ? (t("goals.statusClosed") || "Ditutup") : isCompleted ? (t("goals.completed") || "Tercapai") : (t("common.active") || "Aktif")}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <WalletCards aria-hidden="true" className="text-slate-600" size={18} />
            <h3 className="text-base font-extrabold text-slate-900">{t("goals.contributionHistory") || "Riwayat Alokasi Tabungan"}</h3>
          </div>
          <span className="text-xs font-bold text-slate-600">{goal.contributions.length} {t("goals.entries") || "catatan"}</span>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          {goal.contributions.length === 0 ? (
            <div className="bg-slate-50 p-6 text-center">
              <h4 className="text-base font-extrabold text-slate-900">{t("goals.noContributionsYet") || "Belum ada alokasi dana."}</h4>
              <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-700">
                {t("goals.noContributionsDesc") || "Tambahkan alokasi saat Anda ingin memindahkan uang dari dompet ke kantong tabungan target ini."}
              </p>
            </div>
          ) : (
            goal.contributions.map((contribution) => (
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-slate-100 bg-white p-3 last:border-b-0" key={contribution.id}>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-kash-selected text-kash-emerald">
                  <WalletCards aria-hidden="true" size={18} strokeWidth={2.3} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-extrabold text-slate-900">{contribution.wallet?.name ?? (t("wallets.walletFallback") || "Dompet")}</span>
                  <span className="mt-1 block truncate text-xs font-semibold text-slate-600">
                    {formatI18nDate(new Date(contribution.contribution_date))}
                    {contribution.note ? ` - ${contribution.note}` : ""}
                  </span>
                </span>
                <span className="text-right text-sm font-extrabold text-kash-emerald">+{formatCurrency(contribution.amount, contribution.wallet?.currency ?? "IDR")}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {showEdit ? (
        <GoalEditModal
          goal={goal}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            void loadGoal();
          }}
        />
      ) : null}
      {showContribution ? (
        <ContributionModal
          goal={goal}
          onClose={() => setShowContribution(false)}
          onSaved={() => {
            setShowContribution(false);
            void loadGoal();
          }}
          wallets={wallets}
        />
      ) : null}
      {showCloseDialog ? (
        <ConfirmationDialog
          confirmLabel={progress.current > 0 ? (t("goals.transferAndClose") || "Pindahkan & Tutup Target") : (t("goals.deleteGoal") || "Hapus Target")}
          description={
            progress.current > 0
              ? (t("goals.transferRemainingDesc", { amount: formatCurrency(progress.current, "IDR") }) || `Kantong target ini masih memiliki saldo ${formatCurrency(progress.current, "IDR")}. Pilih dompet tujuan aktif untuk menerima dana ini sebelum ditutup.`)
              : (t("goals.deleteGoalDesc") || "Apakah Anda yakin ingin menghapus target ini? Riwayat alokasi dan catatan transaksi masa lalu akan tetap tersimpan.")
          }
          disabled={progress.current > 0 && !closeDestinationWalletId}
          icon={Trash2}
          isLoading={closingGoal}
          itemLabel={goal.name}
          onCancel={() => setShowCloseDialog(false)}
          onConfirm={() => void handleCloseGoal()}
          title={progress.current > 0 ? (t("goals.transferRemainingTitle") || "Pindahkan Sisa Saldo untuk Menutup Target") : (t("goals.deleteGoalTitle") || "Hapus target ini?")}
          tone="danger"
        >
          {progress.current > 0 ? (
            <div className="mt-3 grid gap-3">
              <SelectField
                id="close-goal-destination-wallet"
                label={t("goals.destinationWalletForRemaining") || "Dompet Tujuan untuk Sisa Saldo"}
                value={closeDestinationWalletId}
                onChange={(event) => setCloseDestinationWalletId(event.target.value)}
              >
                {availableDestinationWallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name} ({formatCurrency(wallet.balance?.current_balance ?? wallet.initial_balance, wallet.currency)})
                  </option>
                ))}
              </SelectField>
              {closeError ? (
                <p className="text-xs font-bold text-kash-expense">{closeError}</p>
              ) : null}
            </div>
          ) : null}
        </ConfirmationDialog>
      ) : null}
    </div>
  );
}

