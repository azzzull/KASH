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
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { FormField } from "../components/ui/FormField";
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
  const [form, setForm] = useState<GoalFormState>(toEditState(goal));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    const targetAmount = parseMoneyInputDigits(form.targetAmount);

    if (!name) {
      setError("Goal name is required.");
      return;
    }

    if (!targetAmount || toNumber(targetAmount) <= 0) {
      setError("Target amount must be greater than zero.");
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
      setError("Couldn't update this goal. Please check the details and try again.");
      setSaving(false);
      return;
    }

    emitGoalSaved();
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/35" role="dialog" aria-modal="true">
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close edit goal" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-soft md:left-1/2 md:top-1/2 md:bottom-auto md:max-h-[86vh] md:w-full md:max-w-xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Edit Goal</h2>
            <p className="mt-1 text-sm font-semibold text-slate-700">This only edits the goal target and metadata.</p>
          </div>
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <FormField id="edit-goal-name" label="Goal Name" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
          <FormField
            id="edit-goal-target"
            inputMode="numeric"
            label="Target Amount"
            onChange={(event) => setForm((current) => ({ ...current, targetAmount: formatMoneyDigits(event.target.value) }))}
            value={form.targetAmount}
          />
          <FormField id="edit-goal-deadline" label="Deadline" onChange={(event) => setForm((current) => ({ ...current, deadline: event.target.value }))} type="date" value={form.deadline} />
          <SelectField id="edit-goal-icon" label="Icon" onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))} value={form.icon}>
            {iconOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <FormField id="edit-goal-note" label="Note" onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} value={form.note} />
          <Button disabled={saving} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            Save Changes
          </Button>
        </form>
      </section>
    </div>
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
      setError("Select a wallet first.");
      return;
    }

    if (!amountDigits || toNumber(amountDigits) <= 0) {
      setError("Contribution amount must be greater than zero.");
      return;
    }

    if (toNumber(amountDigits) > sourceBalance) {
      setError("Contribution cannot exceed this source wallet's balance.");
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
      setError(contributionError.message || "Couldn't add this contribution. Please try again.");
      setSaving(false);
      return;
    }

    emitGoalSaved();
    emitTransactionSaved();
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/35" role="dialog" aria-modal="true">
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close contribution form" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-soft md:left-1/2 md:top-1/2 md:bottom-auto md:max-h-[86vh] md:w-full md:max-w-xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Add Contribution</h2>
            <p className="mt-1 text-sm font-semibold text-slate-700">This creates an internal transfer from the source wallet to the goal pocket.</p>
          </div>
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <SelectField id="contribution-wallet" label="From Wallet" onChange={(event) => setForm((current) => ({ ...current, walletId: event.target.value }))} value={form.walletId}>
            {sourceWallets.length === 0 ? <option value="">No source wallets</option> : null}
            {sourceWallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name} - Balance {formatCurrency(wallet.balance?.current_balance ?? wallet.initial_balance, wallet.currency)}
              </option>
            ))}
          </SelectField>
          <div className="rounded-lg border border-kash-emerald/20 bg-kash-selected p-4">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-600">Source Wallet Balance</p>
            <p className="mt-2 text-xl font-extrabold text-slate-900">{formatCurrency(sourceBalance, selectedWallet?.currency ?? "IDR")}</p>
            {amount > 0 ? <p className="mt-1 text-xs font-bold text-slate-700">After transfer: {formatCurrency(sourceBalance - amount, selectedWallet?.currency ?? "IDR")}</p> : null}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
            <p className="font-extrabold text-slate-900">Destination</p>
            <p className="mt-1">{goal.wallet?.name ?? "Goal pocket"}</p>
          </div>
          <FormField
            id="contribution-amount"
            inputMode="numeric"
            label="Amount"
            onChange={(event) => setForm((current) => ({ ...current, amount: formatMoneyDigits(event.target.value) }))}
            placeholder="500.000"
            value={form.amount}
          />
          <FormField
            id="contribution-date"
            label="Date"
            onChange={(event) => setForm((current) => ({ ...current, contributionDate: event.target.value }))}
            type="datetime-local"
            value={form.contributionDate}
          />
          <FormField id="contribution-note" label="Note" onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Optional note" value={form.note} />
          <Button disabled={saving || sourceWallets.length === 0} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            Save Contribution
          </Button>
        </form>
      </section>
    </div>
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
      setError("Couldn't load this goal. It may not exist or you may not have access.");
      setLoading(false);
      return;
    }

    if (walletError || !walletData) {
      setError("Couldn't load wallets for contributions.");
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
      setCloseError("Please select a destination wallet to receive the remaining funds.");
      return;
    }

    setClosingGoal(true);
    setCloseError(null);

    const { error: rpcError } = await closeGoal(
      goal.id,
      progress.current > 0 ? closeDestinationWalletId : null,
    );

    if (rpcError) {
      setCloseError(rpcError.message || "Couldn't close this goal. Please try again.");
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
          Goals
        </Link>
        <section className="rounded-lg border border-kash-expense/30 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold text-slate-900">Something went wrong.</h2>
          <p className="mt-2 text-sm font-semibold text-slate-700">{error}</p>
          <Button className="mt-4" onClick={() => void loadGoal()}>
            Retry
          </Button>
        </section>
      </div>
    );
  }

  const Icon = getGoalIcon(goal.icon);
  const isCancelled = goal.status === "cancelled";
  const isCompleted = goal.status === "completed" || progress.percentage >= 100;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 p-4 md:p-6">
      <Link className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-kash-emerald" to="/goals">
        <ArrowLeft aria-hidden="true" size={17} />
        Goals
      </Link>

      <PageHeader
        eyebrow={isCompleted ? "Goal Completed" : "Savings Goal"}
        icon={Icon}
        title={goal.name}
        description={goal.note || "Track money moved into this dedicated goal pocket."}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button disabled={isCancelled} onClick={() => setShowContribution(true)}>
              <Plus aria-hidden="true" size={17} />
              Add Contribution
            </Button>
            <Button disabled={isCancelled} onClick={() => setShowEdit(true)} variant="secondary">
              <Edit3 aria-hidden="true" size={17} />
              Edit
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
              Delete Goal
            </Button>
          </div>
        }
      />

      {isCancelled ? (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-700">
          This goal is closed. Its historical contributions and records remain preserved in your history.
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
                <p className="text-sm font-bold text-slate-600">Progress</p>
                <p className="text-2xl font-extrabold text-slate-900">{progress.percentage.toFixed(0)}%</p>
              </div>
            </div>
          </div>
          <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-3">
            <DetailMetric label="Current" value={formatCurrency(progress.current, "IDR")} />
            <DetailMetric label="Target" value={formatCurrency(progress.target, "IDR")} />
            <DetailMetric label="Remaining" value={formatCurrency(progress.remaining, "IDR")} />
          </div>
        </div>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-kash-emerald" style={{ width: `${progress.percentage}%` }} />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <DetailMetric label="Deadline" value={formatDate(goal.deadline)} />
        <DetailMetric label="Pocket Wallet" value={goal.wallet?.name ?? "Goal pocket"} />
        <DetailMetric label="Status" value={isCancelled ? "Closed" : isCompleted ? "Completed" : "Active"} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <WalletCards aria-hidden="true" className="text-slate-600" size={18} />
            <h3 className="text-base font-extrabold text-slate-900">Contribution History</h3>
          </div>
          <span className="text-xs font-bold text-slate-600">{goal.contributions.length} entries</span>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          {goal.contributions.length === 0 ? (
            <div className="bg-slate-50 p-6 text-center">
              <h4 className="text-base font-extrabold text-slate-900">No contributions yet.</h4>
              <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-700">
                Add a contribution when you want to move money from a wallet into this goal pocket.
              </p>
            </div>
          ) : (
            goal.contributions.map((contribution) => (
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-slate-100 bg-white p-3 last:border-b-0" key={contribution.id}>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-kash-selected text-kash-emerald">
                  <WalletCards aria-hidden="true" size={18} strokeWidth={2.3} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-extrabold text-slate-900">{contribution.wallet?.name ?? "Wallet"}</span>
                  <span className="mt-1 block truncate text-xs font-semibold text-slate-600">
                    {formatDateTime(contribution.contribution_date)}
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
          confirmLabel={progress.current > 0 ? "Transfer & Close Goal" : "Delete Goal"}
          description={
            progress.current > 0
              ? `This goal pocket holds ${formatCurrency(progress.current, "IDR")}. Choose an active destination wallet to receive these funds before closing.`
              : "Are you sure you want to delete this goal? Existing contribution history and historical records will be preserved."
          }
          disabled={progress.current > 0 && !closeDestinationWalletId}
          icon={Trash2}
          isLoading={closingGoal}
          itemLabel={goal.name}
          onCancel={() => setShowCloseDialog(false)}
          onConfirm={() => void handleCloseGoal()}
          title={progress.current > 0 ? "Transfer Remaining Balance to Close Goal" : "Delete this goal?"}
          tone="danger"
        >
          {progress.current > 0 ? (
            <div className="mt-3 grid gap-3">
              <SelectField
                id="close-goal-destination-wallet"
                label="Destination Wallet for Remaining Funds"
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

