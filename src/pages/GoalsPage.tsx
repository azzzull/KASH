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
    X,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { ContextualCreateAction } from "../components/ui/ContextualCreateAction";
import { DatePickerField } from "../components/ui/DatePickerField";
import { FormField } from "../components/ui/FormField";
import { IconButton } from "../components/ui/IconButton";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { useI18n } from "../i18n";
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
    const { t, formatDate, formatCurrency } = useI18n();
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
                            {goal.deadline
                                ? formatDate(new Date(`${goal.deadline}T00:00:00`))
                                : (t("goals.noDeadline") || "Tanpa tenggat")}
                        </span>
                    </span>
                </div>
                {isCompleted ? (
                    <span className="rounded-full bg-kash-selected px-2.5 py-1 text-xs font-extrabold text-kash-emeraldDark">
                        {t("goals.completed") || "Tercapai"}
                    </span>
                ) : null}
            </div>

            <div>
                <div className="flex items-end justify-between gap-3">
                    <p className="text-sm font-extrabold text-slate-900">
                        {formatCurrency(progress.current, "IDR")}{" "}
                        <span className="text-slate-600">
                            {t("common.of") || "dari"} {formatCurrency(progress.target, "IDR")}
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
                    {t("debts.remaining") || "Sisa"} {formatCurrency(progress.remaining, "IDR")}
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
                    <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
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
    const { t, formatCurrency } = useI18n();
    const [goals, setGoals] = useState<GoalWithProgress[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateGoal, setShowCreateGoal] = useState(false);

    const loadGoals = async () => {
        setLoading(true);
        setError(null);
        const { data, error: loadError } = await getGoals();

        if (loadError || !data) {
            setError(t("goals.loadError") || "Gagal memuat target. Silakan coba lagi.");
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

    const createActionRef = useRef<HTMLDivElement>(null);

    return (
        <div className="w-full min-w-0 space-y-5">
            <PageHeader
                eyebrow={t("goals.title")}
                icon={Crosshair}
                title={t("goals.title")}
                description={t("goals.subtitle")}
                actions={
                    <div ref={createActionRef}>
                        <Button onClick={() => setShowCreateGoal(true)}>
                            <Plus aria-hidden="true" size={18} />
                            {t("goals.create")}
                        </Button>
                    </div>
                }
            />

            <section className="grid gap-3 md:grid-cols-3">
                <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-normal text-slate-600">
                        {t("wallets.allocatedToGoals")}
                    </p>
                    <p className="mt-2 text-xl font-extrabold text-slate-900">
                        {formatCurrency(summary.allocated, "IDR")}
                    </p>
                </article>
                <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-normal text-slate-600">
                        {t("goals.activeGoals") || "Target Aktif"}
                    </p>
                    <p className="mt-2 text-xl font-extrabold text-slate-900">
                        {summary.active}
                    </p>
                </article>
                <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-normal text-slate-600">
                        {t("goals.completedGoals") || "Tercapai"}
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
                <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-kash-emerald100 text-kash-emeraldDark ring-1 ring-kash-emerald/30">
                        <BadgeDollarSign
                            aria-hidden="true"
                            size={26}
                            strokeWidth={2.4}
                        />
                    </div>
                    <h3 className="mt-4 text-lg font-extrabold text-slate-900">
                        {t("goals.emptyTitle")}
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-slate-700">
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
            ) : null}

            {!loading && goals.length > 0 ? (
                <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {goals.map((goal) => (
                        <GoalCard goal={goal} key={goal.id} />
                    ))}
                </section>
            ) : null}

            <ContextualCreateAction
                targetRef={createActionRef}
                onClick={() => setShowCreateGoal(true)}
                label={t("goals.create")}
            />

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
