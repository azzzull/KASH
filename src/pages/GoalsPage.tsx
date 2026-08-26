import {
  BadgeDollarSign,
  CalendarDays,
  Car,
  Crosshair,
  Edit3,
  Home,
  Laptop,
  Loader2,
  PiggyBank,
  Plane,
  Plus,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { ContextualCreateAction } from "../components/ui/ContextualCreateAction";
import { DatePickerField } from "../components/ui/DatePickerField";
import { EntityMoreActionsMenu } from "../components/ui/EntityMoreActionsMenu";
import { FilterTabs } from "../components/ui/FilterTabs";
import { FormField } from "../components/ui/FormField";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { useAppEvent } from "../hooks/useAppEvent";
import { useI18n } from "../i18n";
import { appEvents, emitGoalSaved, emitTransactionSaved } from "../lib/appEvents";
import {
  archiveGoal,
  closeGoal,
  createGoal,
  deleteGoalIfEmpty,
  getArchivedGoalsCount,
  getGoals,
  updateGoal,
  type GoalWithProgress,
} from "../lib/goals";
import {
  formatCurrency,
  formatMoneyDigits,
  parseMoneyInputDigits,
  toNumber,
} from "../lib/money";
import { getWallets, type WalletWithBalance } from "../lib/wallets";

type GoalFormState = {
  name: string;
  targetAmount: string;
  deadline: string;
  icon: string;
  note: string;
  pocketInstitution: string;
};

const iconOptions = [
  { icon: BadgeDollarSign, label: "Savings", value: "badge-dollar-sign" },
  { icon: Laptop, label: "Laptop", value: "laptop" },
  { icon: Plane, label: "Travel", value: "plane" },
  { icon: Home, label: "Home", value: "home" },
  { icon: Car, label: "Vehicle", value: "car" },
  { icon: Sparkles, label: "Dream", value: "sparkles" },
];

const defaultForm: GoalFormState = {
  name: "",
  targetAmount: "",
  deadline: "",
  icon: "badge-dollar-sign",
  note: "",
  pocketInstitution: "",
};

function getGoalIcon(icon: string | null | undefined) {
  return (
    iconOptions.find((option) => option.value === icon)?.icon ??
    BadgeDollarSign
  );
}

function goalProgress(goal: GoalWithProgress) {
  return {
    current: toNumber(goal.progress?.current_amount ?? 0),
    percentage: Math.min(toNumber(goal.progress?.percentage ?? 0), 100),
    remaining: toNumber(
      goal.progress?.remaining_amount ?? goal.target_amount,
    ),
    target: toNumber(goal.target_amount),
  };
}

function GoalCard({
  goal,
  onEdit,
  onArchive,
  onClose,
  onDelete,
}: {
  goal: GoalWithProgress;
  onEdit: () => void;
  onArchive: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { t, formatDate, formatCurrency } = useI18n();
  const Icon = getGoalIcon(goal.icon);
  const progress = goalProgress(goal);
  const isCompleted =
    goal.status === "completed" || progress.percentage >= 100;
  const isCancelled = goal.status === "cancelled";

  return (
    <div className="group/card relative rounded-2xl border border-slate-200/60 bg-white p-4 shadow-card transition hover:border-kash-emerald/40 hover:shadow-md min-w-0 max-w-full">
      <div className="flex items-start justify-between gap-3">
        <Link
          to={`/goals/${goal.id}`}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-kash-emerald/10 text-kash-emerald transition group-hover/card:bg-kash-emerald/20">
            <Icon aria-hidden="true" size={21} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold text-slate-900 group-hover/card:text-kash-emerald transition">
              {goal.name}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <CalendarDays aria-hidden="true" size={13} />
              {goal.deadline
                ? formatDate(new Date(`${goal.deadline}T00:00:00`))
                : (t("goals.noDeadline") || "Tanpa tenggat")}
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-1.5 shrink-0">
          {isCompleted ? (
            <span className="shrink-0 rounded-full bg-kash-emerald/10 px-2.5 py-1 text-xs font-extrabold text-kash-emeraldDark">
              {t("goals.completed") || "Tercapai"}
            </span>
          ) : null}

          <EntityMoreActionsMenu
            triggerVariant="ghost"
            ariaLabel={`Aksi target ${goal.name}`}
            items={[
              {
                label: t("common.edit") || "Edit",
                icon: Edit3,
                hidden: isCancelled || goal.is_archived,
                onClick: onEdit,
              },
              {
                label: goal.is_archived
                  ? (t("goals.unarchiveGoal") || "Keluarkan dari Arsip")
                  : (t("goals.archiveGoal") || "Arsipkan Target"),
                icon: PiggyBank,
                hidden: isCancelled,
                onClick: onArchive,
              },
              {
                label: isCancelled
                  ? (t("goals.returnRemaining") || "Kembalikan Sisa Dana")
                  : (t("goals.cancelAndRefund") || "Batalkan & Kembalikan Dana"),
                icon: Trash2,
                isDestructive: true,
                hidden: goal.is_archived || (isCancelled && progress.current <= 0),
                onClick: onClose,
              },
              {
                label: t("goals.deletePermanent") || "Hapus Permanen",
                icon: Trash2,
                isDestructive: true,
                separatorBefore: true,
                hidden: progress.current > 0,
                onClick: onDelete,
              },
            ]}
          />
        </div>
      </div>

      <Link to={`/goals/${goal.id}`} className="mt-4 block">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold text-slate-900">
              {formatCurrency(progress.current, "IDR")}
            </p>
            <p className="text-xs font-semibold text-slate-500">
              {t("common.of") || "dari"} {formatCurrency(progress.target, "IDR")}
            </p>
          </div>
          <span className="rounded-md bg-kash-emerald/10 px-2 py-0.5 text-xs font-extrabold text-kash-emerald">
            {progress.percentage.toFixed(0)}%
          </span>
        </div>

        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-kash-emerald transition-all duration-500"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>

        <p className="mt-2 text-xs font-semibold text-slate-500">
          {t("debts.remaining") || "Sisa"} {formatCurrency(progress.remaining, "IDR")}
        </p>
      </Link>
    </div>
  );
}

function CreateGoalModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localizedIconOptions = useMemo(
    () => [
      { icon: BadgeDollarSign, label: t("goals.iconSavings") || "Tabungan", value: "badge-dollar-sign" },
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

    try {
      const { error: createError } = await createGoal({
        deadline: form.deadline || null,
        icon: form.icon,
        name,
        note: form.note.trim() || null,
        pocketInstitution: form.pocketInstitution.trim() || null,
        targetAmount,
      });

      if (createError) {
        setError(
          t("goals.createError") || "Gagal membuat target ini. Silakan periksa kembali data Anda.",
        );
        setSaving(false);
        return;
      }

      emitGoalSaved();
      onSaved();
    } catch {
      setError(
        t("goals.createError") || "Gagal membuat target ini. Silakan coba lagi.",
      );
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title={t("goals.create") || "Target Baru"}
      description={t("goals.createDescription") || "KASH akan membuat kantong tabungan khusus untuk target impian ini."}
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-xl border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <FormField
            id="goal-name"
            label={t("goals.goalName") || "Nama Target"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            placeholder={t("goals.goalNamePlaceholder") || "misal: MacBook Pro, Dana Darurat"}
            value={form.name}
            required
          />
          <FormField
            id="goal-target"
            inputMode="numeric"
            label={t("goals.targetAmount") || "Target Nominal"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                targetAmount: formatMoneyDigits(
                  event.target.value,
                ),
              }))
            }
            placeholder="15.000.000"
            value={form.targetAmount}
            required
          />
          <FormField
            id="goal-pocket-institution"
            label={t("goals.pocketInstitution") || "Bank / Institusi Kantong Tabungan (Opsional)"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                pocketInstitution: event.target.value,
              }))
            }
            placeholder={t("goals.pocketInstitutionPlaceholder") || "misal: Bank Jago, BCA, Bibit"}
            value={form.pocketInstitution}
          />
          <div>
            <DatePickerField
              id="goal-deadline"
              label={t("goals.targetDate") || "Tenggat Waktu"}
              value={form.deadline}
              placeholder={t("goals.selectDeadline") || "Pilih Tenggat Waktu"}
              onChange={(date) =>
                setForm((current) => ({
                  ...current,
                  deadline: date,
                }))
              }
            />
            <span className="mt-1.5 block text-xs font-medium text-slate-600">
              {form.deadline
                ? (t("goals.trackProgressHint") || "KASH akan memantau progres tabungan menuju tenggat waktu ini.")
                : (t("goals.deadlineOptionalHint") || "Opsional. Kosongkan jika tanpa batas waktu.")}
            </span>
          </div>
          <SelectField
            id="goal-icon"
            label={t("goals.icon") || "Ikon"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                icon: event.target.value,
              }))
            }
            value={form.icon}
          >
            {localizedIconOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <FormField
            id="goal-note"
            label={t("goals.note") || "Catatan (Opsional)"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                note: event.target.value,
              }))
            }
            placeholder={t("goals.notePlaceholder") || "Catatan tambahan..."}
            value={form.note}
          />
          <Button disabled={saving} type="submit">
            {saving ? (
              <Loader2
                aria-hidden="true"
                className="animate-spin"
                size={18}
              />
            ) : null}
            {t("goals.saveGoal") || "Simpan Target"}
          </Button>
        </form>
      </div>
    </Modal>
  );
}

function EditGoalModal({
  goal,
  onClose,
  onSaved,
}: {
  goal: GoalWithProgress;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<GoalFormState>({
    name: goal.name,
    targetAmount: formatMoneyDigits(goal.target_amount),
    deadline: goal.deadline ?? "",
    icon: goal.icon ?? "badge-dollar-sign",
    note: goal.note ?? "",
    pocketInstitution: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localizedIconOptions = useMemo(
    () => [
      { icon: BadgeDollarSign, label: t("goals.iconSavings") || "Tabungan", value: "badge-dollar-sign" },
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
          <div className="mb-4 rounded-xl border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <FormField
            id="edit-goal-name-page"
            label={t("goals.goalName") || "Nama Target"}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            value={form.name}
            required
          />
          <FormField
            id="edit-goal-target-page"
            inputMode="numeric"
            label={t("goals.targetAmount") || "Target Nominal"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                targetAmount: formatMoneyDigits(event.target.value),
              }))
            }
            value={form.targetAmount}
            required
          />
          <div className="w-full max-w-full min-w-0">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-900" htmlFor="edit-goal-deadline-page">
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
              id="edit-goal-deadline-page"
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
          <SelectField
            id="edit-goal-icon-page"
            label={t("goals.icon") || "Ikon"}
            onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))}
            value={form.icon}
          >
            {localizedIconOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <FormField
            id="edit-goal-note-page"
            label={t("goals.note") || "Catatan (Opsional)"}
            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
            value={form.note}
          />
          <Button disabled={saving} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            {t("common.saveChanges") || "Simpan Perubahan"}
          </Button>
        </form>
      </div>
    </Modal>
  );
}

function GoalsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[0, 1, 2, 3].map((item) => (
        <div
          className="h-36 animate-pulse rounded-2xl bg-slate-100 p-4"
          key={item}
        />
      ))}
    </div>
  );
}

export function GoalsPage() {
  const { t, formatCurrency } = useI18n();
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals and dialog states
  const [showCreateGoal, setShowCreateGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalWithProgress | null>(null);
  const [archivingTarget, setArchivingTarget] = useState<GoalWithProgress | null>(null);
  const [archivingLoading, setArchivingLoading] = useState(false);
  const [closingTarget, setClosingTarget] = useState<GoalWithProgress | null>(null);
  const [closingLoading, setClosingLoading] = useState(false);
  const [closeDestinationWalletId, setCloseDestinationWalletId] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [deletingTarget, setDeletingTarget] = useState<GoalWithProgress | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  const loadGoals = async () => {
    setLoading(true);
    setError(null);

    const [{ data, error: loadError }, { count: archCount }, { data: walletData }] = await Promise.all([
      getGoals(undefined, activeTab === "archived"),
      getArchivedGoalsCount(),
      getWallets(),
    ]);

    if (loadError || !data) {
      setError(t("goals.loadError") || "Gagal memuat target. Silakan coba lagi.");
      setLoading(false);
      return;
    }

    setGoals(data);
    setArchivedCount(archCount);
    if (walletData) setWallets(walletData);
    setLoading(false);
  };

  useEffect(() => {
    void loadGoals();
  }, [activeTab]);

  useAppEvent(appEvents.transactionSaved, () => void loadGoals());
  useAppEvent(appEvents.goalSaved, () => void loadGoals());
  useAppEvent(appEvents.spaceChanged, () => void loadGoals());

  const summary = useMemo(() => {
    return goals.reduce(
      (result, goal) => {
        const progress = goalProgress(goal);
        result.allocated += progress.current;
        if (goal.status === "completed" || progress.percentage >= 100)
          result.completed += 1;
        if (goal.status === "active" && progress.percentage < 100)
          result.active += 1;
        return result;
      },
      { active: 0, allocated: 0, completed: 0 },
    );
  }, [goals]);

  const createActionRef = useRef<HTMLDivElement>(null);

  const tabOptions = useMemo(
    () => [
      { value: "active" as const, label: t("goals.activeGoals") || "Target Aktif" },
      {
        value: "archived" as const,
        label: t("goals.archivedGoals") || "Target Diarsipkan",
        count: archivedCount > 0 ? archivedCount : null,
      },
    ],
    [t, archivedCount],
  );

  const handleConfirmArchive = async () => {
    if (!archivingTarget) return;
    setArchivingLoading(true);
    const { error: rpcError } = await archiveGoal(archivingTarget.id, !archivingTarget.is_archived);
    if (rpcError) {
      setError(rpcError.message || "Gagal mengarsipkan target.");
    } else {
      emitGoalSaved();
      setArchivingTarget(null);
      void loadGoals();
    }
    setArchivingLoading(false);
  };

  const handleConfirmClose = async () => {
    if (!closingTarget) return;
    const progress = goalProgress(closingTarget);

    if (progress.current > 0 && !closeDestinationWalletId) {
      setCloseError(t("goals.selectDestinationWalletError") || "Silakan pilih dompet tujuan untuk menerima sisa dana.");
      return;
    }

    setClosingLoading(true);
    setCloseError(null);

    const { error: rpcError } = await closeGoal(
      closingTarget.id,
      progress.current > 0 ? closeDestinationWalletId : null,
    );

    if (rpcError) {
      setCloseError(rpcError.message || (t("goals.closeGoalError") || "Gagal menutup target ini. Silakan coba lagi."));
      setClosingLoading(false);
      return;
    }

    emitGoalSaved();
    emitTransactionSaved();
    setClosingTarget(null);
    setCloseDestinationWalletId("");
    setClosingLoading(false);
    void loadGoals();
  };

  const handleConfirmDelete = async () => {
    if (!deletingTarget) return;
    setDeletingLoading(true);
    const { error: rpcError } = await deleteGoalIfEmpty(deletingTarget.id);
    if (rpcError) {
      setError(rpcError.message || "Gagal menghapus target permanen. Pastikan tidak ada riwayat transaksi.");
    } else {
      emitGoalSaved();
      setDeletingTarget(null);
      void loadGoals();
    }
    setDeletingLoading(false);
  };

  const availableDestinationWallets = useMemo(() => {
    if (!closingTarget) return [];
    return wallets.filter((wallet) => wallet.id !== closingTarget.wallet_id && !wallet.is_archived);
  }, [closingTarget, wallets]);

  const closingProgress = closingTarget ? goalProgress(closingTarget) : null;
  const isClosingCancelled = closingTarget?.status === "cancelled";

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-4">
      <PageHeader
        eyebrow={t("goals.title")}
        icon={Crosshair}
        title={t("goals.title")}
        description={t("goals.subtitle")}
        actions={
          <div ref={createActionRef} className="hidden sm:block">
            <Button onClick={() => setShowCreateGoal(true)}>
              <Plus aria-hidden="true" size={18} />
              {t("goals.create")}
            </Button>
          </div>
        }
      />

      {/* Hero Summary Surface */}
      <section className="kash-hero-card p-5 md:p-6 min-w-0 max-w-full">
        <p className="text-xs font-bold uppercase tracking-wide text-white/60">
          {t("wallets.allocatedToGoals") || "Total Dialokasikan ke Target"}
        </p>
        <p className="mt-2 break-words text-3xl font-extrabold text-white md:text-4xl">
          {formatCurrency(summary.allocated, "IDR")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-bold text-white/90">
            {summary.active} {t("goals.activeGoals") || "Target Aktif"}
          </span>
          {summary.completed > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-bold text-emerald-200">
              <Trophy size={13} />
              {summary.completed} {t("goals.completedGoals") || "Tercapai"}
            </span>
          ) : null}
        </div>
      </section>

      {/* Filter Tabs for Active vs Archived */}
      <div className="pt-1">
        <FilterTabs
          options={tabOptions}
          value={activeTab}
          onChange={(val) => setActiveTab(val as "active" | "archived")}
        />
      </div>

      {error ? (
        <section className="rounded-2xl border border-kash-expense/30 bg-white p-5 shadow-card">
          <h3 className="text-base font-extrabold text-slate-900">
            {t("common.error")}
          </h3>
          <p className="mt-2 text-sm font-semibold text-slate-700">
            {error}
          </p>
          <Button className="mt-4" onClick={() => void loadGoals()}>
            {t("common.retry")}
          </Button>
        </section>
      ) : null}

      {loading ? <GoalsSkeleton /> : null}

      {!loading && goals.length === 0 ? (
        activeTab === "archived" ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-card">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <PiggyBank aria-hidden="true" size={26} strokeWidth={2.4} />
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-slate-900">
              {t("goals.noArchivedGoals") || "Belum ada target yang diarsipkan"}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-slate-600">
              {t("goals.noArchivedGoalsDesc") || "Target yang diarsipkan akan tersimpan di sini dan dapat dipulihkan kapan saja."}
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-card">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-kash-emerald/10 text-kash-emerald">
              <BadgeDollarSign
                aria-hidden="true"
                size={26}
                strokeWidth={2.4}
              />
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-slate-900">
              {t("goals.emptyTitle")}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-slate-600">
              {t("goals.emptyDesc")}
            </p>
            <Button
              className="mt-5"
              onClick={() => setShowCreateGoal(true)}
            >
              <Plus aria-hidden="true" size={18} />
              {t("goals.create")}
            </Button>
          </section>
        )
      ) : null}

      {!loading && goals.length > 0 ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => (
            <GoalCard
              goal={goal}
              key={goal.id}
              onEdit={() => setEditingGoal(goal)}
              onArchive={() => setArchivingTarget(goal)}
              onClose={() => {
                setCloseError(null);
                setCloseDestinationWalletId("");
                setClosingTarget(goal);
              }}
              onDelete={() => setDeletingTarget(goal)}
            />
          ))}
        </section>
      ) : null}

      {activeTab === "active" && (
        <ContextualCreateAction
          targetRef={createActionRef}
          onClick={() => setShowCreateGoal(true)}
          label={t("goals.create")}
        />
      )}

      {showCreateGoal ? (
        <CreateGoalModal
          onClose={() => setShowCreateGoal(false)}
          onSaved={() => {
            setShowCreateGoal(false);
            void loadGoals();
          }}
        />
      ) : null}

      {editingGoal ? (
        <EditGoalModal
          goal={editingGoal}
          onClose={() => setEditingGoal(null)}
          onSaved={() => {
            setEditingGoal(null);
            void loadGoals();
          }}
        />
      ) : null}

      {archivingTarget ? (
        <ConfirmationDialog
          confirmLabel={
            archivingTarget.is_archived
              ? (t("goals.unarchiveGoal") || "Keluarkan dari Arsip")
              : (t("goals.archiveGoal") || "Arsipkan Target")
          }
          description={
            archivingTarget.is_archived
              ? (t("goals.restoreGoalConfirm") || "Apakah Anda yakin ingin mengeluarkan target ini dari arsip?")
              : (t("goals.archiveGoalConfirm") || "Apakah Anda yakin ingin mengarsipkan target ini? Riwayat alokasi dan saldo akan tetap tersimpan, tetapi target akan disembunyikan dari daftar utama.")
          }
          icon={PiggyBank}
          isLoading={archivingLoading}
          itemLabel={archivingTarget.name}
          onCancel={() => setArchivingTarget(null)}
          onConfirm={() => void handleConfirmArchive()}
          title={archivingTarget.is_archived ? "Keluarkan dari arsip?" : "Arsipkan target ini?"}
          tone="neutral"
        />
      ) : null}

      {closingTarget && closingProgress ? (
        <ConfirmationDialog
          confirmLabel={
            isClosingCancelled
              ? (t("goals.returnRemaining") || "Kembalikan Sisa Dana")
              : closingProgress.current > 0
              ? (t("goals.cancelAndRefund") || "Pindahkan & Batalkan Target")
              : (t("goals.cancelGoal") || "Batalkan Target")
          }
          description={
            closingProgress.current > 0
              ? (t("goals.transferRemainingDesc", { amount: formatCurrency(closingProgress.current, "IDR") }) || `Kantong target ini masih memiliki saldo ${formatCurrency(closingProgress.current, "IDR")}. Pilih dompet tujuan aktif untuk menerima dana ini sebelum ditutup.`)
              : (t("goals.deleteGoalDesc") || "Apakah Anda yakin ingin membatalkan target ini? Riwayat alokasi dan catatan transaksi masa lalu akan tetap tersimpan.")
          }
          disabled={closingProgress.current > 0 && !closeDestinationWalletId}
          icon={Trash2}
          isLoading={closingLoading}
          itemLabel={closingTarget.name}
          onCancel={() => {
            setClosingTarget(null);
            setCloseError(null);
          }}
          onConfirm={() => void handleConfirmClose()}
          title={isClosingCancelled ? "Kembalikan Sisa Dana" : closingProgress.current > 0 ? "Pindahkan Sisa Saldo & Batalkan" : "Batalkan target ini?"}
          tone="danger"
        >
          {closingProgress.current > 0 ? (
            <div className="mt-3 grid gap-3">
              <SelectField
                id="close-goal-destination-wallet-page"
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

      {deletingTarget ? (
        <ConfirmationDialog
          confirmLabel={t("goals.deletePermanent") || "Hapus Permanen"}
          description={t("goals.deletePermanentConfirm") || "Apakah Anda yakin ingin menghapus target ini secara permanen? Data target yang belum memiliki riwayat akan dihapus sepenuhnya dan tidak dapat dikembalikan."}
          icon={Trash2}
          isLoading={deletingLoading}
          itemLabel={deletingTarget.name}
          onCancel={() => setDeletingTarget(null)}
          onConfirm={() => void handleConfirmDelete()}
          title={t("goals.deletePermanentTitle") || "Hapus target ini permanen?"}
          tone="danger"
        />
      ) : null}
    </div>
  );
}
