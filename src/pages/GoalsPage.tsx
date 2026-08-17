import {
    CalendarDays,
    Car,
    Crosshair,
    Home,
    Laptop,
    Loader2,
    BadgeDollarSign,
    Plane,
    Plus,
    Sparkles,
    Trophy,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { FormField } from "../components/ui/FormField";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { useAppEvent } from "../hooks/useAppEvent";
import { appEvents, emitGoalSaved } from "../lib/appEvents";
import { createGoal, getGoals, type GoalWithProgress } from "../lib/goals";
import {
    formatCurrency,
    formatMoneyDigits,
    parseMoneyInputDigits,
    toNumber,
} from "../lib/money";

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

function formatDate(value: string | null) {
    if (!value) return "No deadline";
    return new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
}

function GoalCard({ goal }: { goal: GoalWithProgress }) {
    const Icon = getGoalIcon(goal.icon);
    const progress = goalProgress(goal);
    const isCompleted =
        goal.status === "completed" || progress.percentage >= 100;

    return (
        <Link
            className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-kash-emerald hover:bg-kash-selected/40"
            to={`/goals/${goal.id}`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-kash-emerald100 text-kash-emeraldDark ring-1 ring-kash-emerald/30">
                        <Icon aria-hidden="true" size={21} strokeWidth={2.3} />
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate text-base font-extrabold text-slate-900">
                            {goal.name}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-600">
                            <CalendarDays aria-hidden="true" size={14} />
                            {formatDate(goal.deadline)}
                        </span>
                    </span>
                </div>
                {isCompleted ? (
                    <span className="rounded-full bg-kash-selected px-2.5 py-1 text-xs font-extrabold text-kash-emeraldDark">
                        Completed
                    </span>
                ) : null}
            </div>

            <div>
                <div className="flex items-end justify-between gap-3">
                    <p className="text-sm font-extrabold text-slate-900">
                        {formatCurrency(progress.current, "IDR")}{" "}
                        <span className="text-slate-600">
                            of {formatCurrency(progress.target, "IDR")}
                        </span>
                    </p>
                    <p className="text-sm font-extrabold text-kash-emerald">
                        {progress.percentage.toFixed(0)}%
                    </p>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                        className="h-full rounded-full bg-kash-emerald"
                        style={{ width: `${progress.percentage}%` }}
                    />
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-600">
                    Remaining {formatCurrency(progress.remaining, "IDR")}
                </p>
            </div>
        </Link>
    );
}

function CreateGoalModal({
    onClose,
    onSaved,
}: {
    onClose: () => void;
    onSaved: () => void;
}) {
    const [form, setForm] = useState(defaultForm);
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
                    "Couldn't create this goal. Please check the details and try again.",
                );
                setSaving(false);
                return;
            }

            emitGoalSaved();
            onSaved();
        } catch {
            setError(
                "Couldn't create this goal. Please sign in and try again.",
            );
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 overflow-x-hidden bg-slate-900/35"
            role="dialog"
            aria-modal="true"
        >
            <button
                className="absolute inset-0 h-full w-full cursor-default"
                aria-label="Close goal form"
                onClick={onClose}
            />
            <section className="absolute inset-x-0 bottom-0 max-h-[92vh] w-full max-w-full min-w-0 box-border overflow-y-auto overflow-x-hidden rounded-t-2xl bg-white p-4 shadow-soft md:left-1/2 md:top-1/2 md:bottom-auto md:max-h-[86vh] md:w-full md:max-w-xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-extrabold text-slate-900">
                            New Goal
                        </h2>
                        <p className="mt-1 text-sm font-semibold text-slate-700">
                            KASH will create a dedicated savings pocket wallet
                            for this goal.
                        </p>
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

                <form className="mt-5 grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
                    <FormField
                        id="goal-name"
                        label="Goal Name"
                        onChange={(event) =>
                            setForm((current) => ({
                                ...current,
                                name: event.target.value,
                            }))
                        }
                        placeholder="MacBook Pro"
                        value={form.name}
                    />
                    <FormField
                        id="goal-target"
                        inputMode="numeric"
                        label="Target Amount"
                        onChange={(event) =>
                            setForm((current) => ({
                                ...current,
                                targetAmount: formatMoneyDigits(
                                    event.target.value,
                                ),
                            }))
                        }
                        placeholder="25.000.000"
                        value={form.targetAmount}
                    />
                    <FormField
                        id="goal-deadline"
                        label="Deadline"
                        onChange={(event) =>
                            setForm((current) => ({
                                ...current,
                                deadline: event.target.value,
                            }))
                        }
                        type="date"
                        value={form.deadline}
                    />
                    <FormField
                        id="goal-pocket-institution"
                        label="Pocket Institution"
                        onChange={(event) =>
                            setForm((current) => ({
                                ...current,
                                pocketInstitution: event.target.value,
                            }))
                        }
                        placeholder="BCA, SeaBank, Jago Pocket"
                        value={form.pocketInstitution}
                    />
                    <SelectField
                        id="goal-icon"
                        label="Icon"
                        onChange={(event) =>
                            setForm((current) => ({
                                ...current,
                                icon: event.target.value,
                            }))
                        }
                        value={form.icon}
                    >
                        {iconOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </SelectField>
                    <FormField
                        id="goal-note"
                        label="Note"
                        onChange={(event) =>
                            setForm((current) => ({
                                ...current,
                                note: event.target.value,
                            }))
                        }
                        placeholder="Optional note"
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
                        Save Goal
                    </Button>
                </form>
            </section>
        </div>
    );
}

function GoalsSkeleton() {
    return (
        <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
                <div
                    className="h-36 rounded-lg border border-slate-200 bg-white p-4"
                    key={item}
                >
                    <div className="h-4 w-1/2 rounded-full bg-slate-100" />
                    <div className="mt-8 h-3 rounded-full bg-slate-100" />
                    <div className="mt-4 h-3 w-1/3 rounded-full bg-slate-100" />
                </div>
            ))}
        </div>
    );
}

export function GoalsPage() {
    const [goals, setGoals] = useState<GoalWithProgress[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateGoal, setShowCreateGoal] = useState(false);

    const loadGoals = async () => {
        setLoading(true);
        setError(null);
        const { data, error: loadError } = await getGoals();

        if (loadError || !data) {
            setError("Couldn't load goals. Please try again.");
            setLoading(false);
            return;
        }

        setGoals(data);
        setLoading(false);
    };

    useEffect(() => {
        void loadGoals();
    }, []);

    useAppEvent(appEvents.transactionSaved, () => void loadGoals());
    useAppEvent(appEvents.goalSaved, () => void loadGoals());

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

    return (
        <div className="mx-auto grid w-full max-w-7xl gap-5 p-4 md:p-6">
            <PageHeader
                eyebrow="Savings Goals"
                icon={Crosshair}
                title="Goals"
                description="Move money from existing wallets into dedicated goal pockets."
                actions={
                    <Button onClick={() => setShowCreateGoal(true)}>
                        <Plus aria-hidden="true" size={18} />
                        New Goal
                    </Button>
                }
            />

            <section className="grid gap-3 md:grid-cols-3">
                <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-normal text-slate-600">
                        Total in Goal Pockets
                    </p>
                    <p className="mt-2 text-xl font-extrabold text-slate-900">
                        {formatCurrency(summary.allocated, "IDR")}
                    </p>
                </article>
                <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-normal text-slate-600">
                        Active Goals
                    </p>
                    <p className="mt-2 text-xl font-extrabold text-slate-900">
                        {summary.active}
                    </p>
                </article>
                <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-normal text-slate-600">
                        Completed
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-xl font-extrabold text-slate-900">
                        <Trophy
                            aria-hidden="true"
                            className="text-kash-emerald"
                            size={21}
                        />
                        {summary.completed}
                    </p>
                </article>
            </section>

            {error ? (
                <section className="rounded-lg border border-kash-expense/30 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-extrabold text-slate-900">
                        Something went wrong.
                    </h3>
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                        {error}
                    </p>
                    <Button className="mt-4" onClick={() => void loadGoals()}>
                        Retry
                    </Button>
                </section>
            ) : null}

            {loading ? <GoalsSkeleton /> : null}

            {!loading && goals.length === 0 ? (
                <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-kash-emerald100 text-kash-emeraldDark ring-1 ring-kash-emerald/30">
                        <BadgeDollarSign
                            aria-hidden="true"
                            size={26}
                            strokeWidth={2.4}
                        />
                    </div>
                    <h3 className="mt-4 text-lg font-extrabold text-slate-900">
                        No goals yet.
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-slate-700">
                        Create a personal savings target. KASH will add a
                        dedicated pocket wallet, then you can move money into
                        it.
                    </p>
                    <Button
                        className="mt-5"
                        onClick={() => setShowCreateGoal(true)}
                    >
                        <Plus aria-hidden="true" size={18} />
                        New Goal
                    </Button>
                </section>
            ) : null}

            {!loading && goals.length > 0 ? (
                <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {goals.map((goal) => (
                        <GoalCard goal={goal} key={goal.id} />
                    ))}
                </section>
            ) : null}

            {showCreateGoal ? (
                <CreateGoalModal
                    onClose={() => setShowCreateGoal(false)}
                    onSaved={() => {
                        setShowCreateGoal(false);
                        void loadGoals();
                    }}
                />
            ) : null}
        </div>
    );
}
