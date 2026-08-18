import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit2,
  Edit3,
  HandCoins,
  History,
  Info,
  Loader2,
  Plus,
  Receipt,
  Trash2,
  User,
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
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { useAppEvent } from "../hooks/useAppEvent";
import { appEvents, emitDebtSaved, emitTransactionSaved } from "../lib/appEvents";
import {
  createDebt,
  createMultipleDebts,
  deleteOrCancelDebt,
  getCounterpartyDetail,
  renameCounterparty,
  updateDebt,
  type CounterpartyDetail,
  type CounterpartyWithSummary,
  type DebtPaymentWithMeta,
} from "../lib/debts";
import { formatCurrency, formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../lib/money";
import { getWallets, type WalletWithBalance } from "../lib/wallets";
import type { Debt, DebtProgress, DebtType } from "../types/domain";
import { SettlementModal } from "./DebtsPage";

type ActiveTab = "active" | "settled" | "history";

export function DebtDetailPage() {
  const { counterpartyId } = useParams<{ counterpartyId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CounterpartyDetail | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("active");

  const [settlementTarget, setSettlementTarget] = useState<DebtType | null>(null);
  const [createItemModalOpen, setCreateItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DebtProgress | null>(null);
  const [deletingItem, setDeletingItem] = useState<DebtProgress | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);

  const loadData = async () => {
    if (!counterpartyId) return;
    try {
      setLoading(true);
      const data = await getCounterpartyDetail(counterpartyId);
      setDetail(data);
    } catch (err) {
      console.error("Failed to load counterparty detail", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [counterpartyId]);

  useAppEvent(appEvents.debtSaved, loadData);
  useAppEvent(appEvents.transactionSaved, loadData);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-20 pt-4 md:pb-8">
        <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white p-6" />
        <div className="h-44 animate-pulse rounded-xl border border-slate-200 bg-white p-6" />
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white p-6" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-20 pt-4 text-center md:pb-8">
        <div className="rounded-xl border border-slate-200 bg-white py-16 p-6 shadow-sm">
          <h2 className="text-xl font-extrabold text-slate-900">Counterparty not found</h2>
          <p className="mt-2 text-sm text-slate-600">The requested person or counterparty does not exist.</p>
          <div className="mt-6">
            <Link to="/debts">
              <Button variant="secondary">
                <ArrowLeft size={16} />
                Back to Debt & Receivable
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { counterparty, debts, payments, summary } = detail;
  const activeItems = debts.filter((d) => d.status === "active" || d.status === "partially_paid");
  const settledItems = debts.filter((d) => d.status === "settled" || d.status === "cancelled");

  // Summary object for SettlementModal
  const counterpartySummaryObject: CounterpartyWithSummary = {
    ...counterparty,
    debtTotal: summary.totalDebtRemaining,
    receivableTotal: summary.totalReceivableRemaining,
    activeDebtCount: summary.activeDebtCount,
    activeReceivableCount: summary.activeReceivableCount,
    settledDebtCount: summary.settledDebtCount,
    settledReceivableCount: summary.settledReceivableCount,
    totalItemCount: debts.length,
  };

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-4">
      {/* Navigation & Header */}
      <div>
        <Link
          to="/debts"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 transition hover:text-slate-900"
        >
          <ArrowLeft size={15} />
          Back to Debt & Receivable
        </Link>

        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-kash-emerald100 text-kash-emeraldDark ring-1 ring-kash-emerald/30">
              <User size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900">{counterparty.name}</h1>
                <button
                  type="button"
                  onClick={() => setRenameModalOpen(true)}
                  aria-label="Rename counterparty"
                  className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  <Edit2 size={15} />
                </button>
              </div>
              <p className="text-xs font-semibold text-slate-600">
                {debts.length} total obligation item{debts.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {summary.totalDebtRemaining > 0 && (
              <Button onClick={() => setSettlementTarget("debt")}>
                Pay Debt
              </Button>
            )}
            {summary.totalReceivableRemaining > 0 && (
              <Button onClick={() => setSettlementTarget("receivable")}>
                Collect
              </Button>
            )}
            <Button onClick={() => setCreateItemModalOpen(true)} variant="secondary">
              <Plus size={16} />
              Add Item
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Debt Card */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-normal text-slate-600">You Owe {counterparty.name}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-kash-expense/10 text-kash-expense">
              <ArrowUpRight size={17} strokeWidth={2.4} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 md:text-3xl">
            {formatCurrency(summary.totalDebtRemaining, "IDR")}
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs font-semibold text-slate-600">
            <span>Original: {formatCurrency(summary.totalDebtOriginal, "IDR")}</span>
            <span>Paid: {formatCurrency(summary.totalDebtPaid, "IDR")}</span>
          </div>
        </section>

        {/* Receivable Card */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-normal text-slate-600">{counterparty.name} Owes You</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-kash-emerald/10 text-kash-emerald">
              <ArrowDownLeft size={17} strokeWidth={2.4} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 md:text-3xl">
            {formatCurrency(summary.totalReceivableRemaining, "IDR")}
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs font-semibold text-slate-600">
            <span>Original: {formatCurrency(summary.totalReceivableOriginal, "IDR")}</span>
            <span>Collected: {formatCurrency(summary.totalReceivablePaid, "IDR")}</span>
          </div>
        </section>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("active")}
          className={`border-b-2 px-4 py-2.5 text-xs font-black transition ${
            activeTab === "active"
              ? "border-kash-emerald text-kash-emeraldDark"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Active Items ({activeItems.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("settled")}
          className={`border-b-2 px-4 py-2.5 text-xs font-black transition ${
            activeTab === "settled"
              ? "border-kash-emerald text-kash-emeraldDark"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Settled Items ({settledItems.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`border-b-2 px-4 py-2.5 text-xs font-black transition ${
            activeTab === "history"
              ? "border-kash-emerald text-kash-emeraldDark"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Settlement History ({payments.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "active" && (
        <div className="space-y-3">
          {activeItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
              <CheckCircle2 className="mx-auto text-kash-emerald" size={32} />
              <p className="mt-3 text-sm font-bold text-slate-900">No active obligations</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">All debt and receivable items are settled or cancelled.</p>
            </div>
          ) : (
            activeItems.map((item) => (
              <ItemCard
                key={item.debt_id}
                item={item}
                onEdit={() => setEditingItem(item)}
                onDelete={() => setDeletingItem(item)}
              />
            ))
          )}
        </div>
      )}

      {activeTab === "settled" && (
        <div className="space-y-3">
          {settledItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
              <p className="text-sm font-bold text-slate-900">No settled items yet</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">Completed and cancelled obligations will appear here.</p>
            </div>
          ) : (
            settledItems.map((item) => (
              <ItemCard
                key={item.debt_id}
                item={item}
                onEdit={() => setEditingItem(item)}
                onDelete={() => setDeletingItem(item)}
              />
            ))
          )}
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-3">
          {payments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
              <History className="mx-auto text-slate-600" size={32} />
              <p className="mt-3 text-sm font-bold text-slate-900">No settlement history</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">Recorded payments and collections will be listed here.</p>
            </div>
          ) : (
            payments.map((payment) => <PaymentHistoryCard key={payment.id} payment={payment} />)
          )}
        </div>
      )}

      {/* Modals */}
      {settlementTarget && (
        <SettlementModal
          counterparty={counterpartySummaryObject}
          debtType={settlementTarget}
          onClose={() => setSettlementTarget(null)}
          onSaved={() => {
            setSettlementTarget(null);
            emitDebtSaved();
            emitTransactionSaved();
          }}
        />
      )}

      {createItemModalOpen && (
        <CreateItemModal
          counterparty={counterparty}
          onClose={() => setCreateItemModalOpen(false)}
          onSaved={() => {
            setCreateItemModalOpen(false);
            emitDebtSaved();
          }}
        />
      )}

      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null);
            emitDebtSaved();
          }}
        />
      )}

      {deletingItem && (
        <ConfirmationDialog
          title={toNumber(deletingItem.total_paid) > 0 ? "Cancel Obligation" : "Delete Obligation"}
          description={
            toNumber(deletingItem.total_paid) > 0
              ? "This item already has payment allocations. Cancelling it will mark the remaining unpaid amount as written off while preserving historical payment audit records."
              : "Are you sure you want to delete this obligation? This action cannot be undone."
          }
          confirmLabel={toNumber(deletingItem.total_paid) > 0 ? "Cancel Obligation" : "Delete"}
          tone="danger"
          onCancel={() => setDeletingItem(null)}
          onConfirm={async () => {
            await deleteOrCancelDebt(deletingItem.debt_id);
            setDeletingItem(null);
            emitDebtSaved();
          }}
        />
      )}

      {renameModalOpen && (
        <RenameCounterpartyModal
          counterparty={counterparty}
          onClose={() => setRenameModalOpen(false)}
          onSaved={() => {
            setRenameModalOpen(false);
            emitDebtSaved();
          }}
        />
      )}
    </div>
  );
}

function ItemCard({
  item,
  onEdit,
  onDelete,
}: {
  item: DebtProgress;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isDebt = item.type === "debt";
  const original = toNumber(item.original_amount);
  const paid = toNumber(item.total_paid);
  const remaining = toNumber(item.remaining_amount);
  const percent = toNumber(item.percentage);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-black uppercase ${
                isDebt ? "bg-kash-expense/10 text-kash-expense" : "bg-kash-emerald/10 text-kash-emeraldDark"
              }`}
            >
              {isDebt ? "Debt" : "Receivable"}
            </span>
            <h4 className="truncate text-base font-extrabold text-slate-900">{item.title}</h4>
          </div>

          {item.note && <p className="mt-1 text-xs font-semibold text-slate-600">{item.note}</p>}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit item"
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete item"
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-kash-expense"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3">
        <div>
          <span className="text-[11px] font-bold uppercase text-slate-600">Original Amount</span>
          <p className="text-sm font-black text-slate-900">{formatCurrency(original, "IDR")}</p>
        </div>
        <div>
          <span className="text-[11px] font-bold uppercase text-slate-600">Allocated / Paid</span>
          <p className="text-sm font-black text-slate-900">{formatCurrency(paid, "IDR")}</p>
        </div>
        <div>
          <span className="text-[11px] font-bold uppercase text-slate-600">Remaining</span>
          <p className={`text-sm font-black ${remaining > 0 ? "text-slate-900" : "text-kash-emeraldDark"}`}>
            {formatCurrency(remaining, "IDR")}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
          <span>Settlement Progress</span>
          <span>{percent.toFixed(0)}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full transition-all duration-300 ${isDebt ? "bg-kash-expense" : "bg-kash-emerald"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Due Date & Status Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] font-semibold text-slate-600">
        <span className="flex items-center gap-1">
          <CalendarDays size={13} />
          {item.due_date
            ? `Due: ${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(
                new Date(`${item.due_date}T00:00:00`),
              )}`
            : "No due date"}
        </span>

        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
            item.status === "settled"
              ? "bg-emerald-50 text-emerald-700"
              : item.status === "cancelled"
                ? "bg-slate-100 text-slate-600"
                : item.status === "partially_paid"
                  ? "bg-blue-50 text-blue-700"
                  : "bg-slate-100 text-slate-700"
          }`}
        >
          {item.status.replace("_", " ")}
        </span>
      </div>
    </div>
  );
}

function PaymentHistoryCard({ payment }: { payment: DebtPaymentWithMeta }) {
  const [expanded, setExpanded] = useState(false);
  const isDebt = payment.debt_type === "debt";
  const isWallet = payment.payment_mode === "wallet";

  const formattedDate = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(payment.payment_date));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-black uppercase ${
                isDebt ? "bg-kash-expense/10 text-kash-expense" : "bg-kash-emerald/10 text-kash-emeraldDark"
              }`}
            >
              {isDebt ? "Debt Payment" : "Receivable Collection"}
            </span>

            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
              {isWallet ? `Wallet: ${payment.wallet?.name ?? "KASH Wallet"}` : "Previous Payment (Historical)"}
            </span>
          </div>

          <p className="mt-1 text-xs font-semibold text-slate-600">{formattedDate}</p>
          {payment.note && <p className="mt-1 text-xs font-medium text-slate-700">{payment.note}</p>}
        </div>

        <div className="text-right">
          <p className="text-base font-black text-slate-900">
            {formatCurrency(toNumber(payment.total_amount), "IDR")}
          </p>
          {payment.allocations.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-extrabold text-kash-emerald hover:text-kash-emeraldDark hover:underline"
            >
              <span>{payment.allocations.length} allocation{payment.allocations.length !== 1 ? "s" : ""}</span>
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* Allocation breakdown */}
      {expanded && payment.allocations.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-100 bg-white p-3 text-xs shadow-none">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Allocation Breakdown</p>
          <div className="mt-2 divide-y divide-slate-200">
            {payment.allocations.map((alloc) => (
              <div key={alloc.id} className="flex justify-between py-1.5">
                <span className="font-semibold text-slate-700">{alloc.debtTitle}</span>
                <span className="font-black text-slate-900">
                  {formatCurrency(toNumber(alloc.allocated_amount), "IDR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateItemModal({
  counterparty,
  onClose,
  onSaved,
}: {
  counterparty: { id: string; name: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<DebtType>("debt");
  const [items, setItems] = useState<
    { id: string; title: string; originalAmount: string; dueDate: string; note: string }[]
  >([{ id: "1", title: "", originalAmount: "", dueDate: "", note: "" }]);
  const [linkWallet, setLinkWallet] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWallets()
      .then((res) => {
        if (res.data) {
          setWallets(res.data);
          if (res.data.length > 0) setSelectedWalletId(res.data[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const addItemRow = () => {
    setItems((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2, 9), title: "", originalAmount: "", dueDate: "", note: "" },
    ]);
  };

  const removeItemRow = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItemRow = (
    id: string,
    field: "title" | "originalAmount" | "dueDate" | "note",
    value: string,
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          [field]: field === "originalAmount" ? formatMoneyDigits(value) : value,
        };
      }),
    );
  };

  const totalAmountSum = useMemo(() => {
    return items.reduce((acc, curr) => {
      const num = toNumber(parseMoneyInputDigits(curr.originalAmount) || "0");
      return acc + num;
    }, 0);
  }, [items]);

  const selectedWallet = useMemo(
    () => wallets.find((w) => w.id === selectedWalletId),
    [wallets, selectedWalletId],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.title.trim()) {
        setError(`Item #${i + 1} requires a title / purpose.`);
        return;
      }
      const rawDigits = parseMoneyInputDigits(item.originalAmount);
      if (!rawDigits || toNumber(rawDigits) <= 0) {
        setError(`Item #${i + 1} ("${item.title}") must have an amount greater than zero.`);
        return;
      }
    }

    if (linkWallet && !selectedWalletId) {
      setError("Please select a wallet to process the funds.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const debtInputs = items.map((item) => ({
        counterpartyId: counterparty.id,
        type,
        title: item.title.trim(),
        originalAmount: parseMoneyInputDigits(item.originalAmount),
        dueDate: item.dueDate.trim() || null,
        note: item.note.trim() || null,
      }));

      const { error: batchError } = await createMultipleDebts(debtInputs, {
        walletId: linkWallet ? selectedWalletId : null,
        counterpartyName: counterparty.name,
      });

      if (batchError) {
        setError(batchError.message ?? "Failed to create items. Please try again.");
        setSaving(false);
        return;
      }

      if (linkWallet) {
        emitTransactionSaved();
      }
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? "An unexpected error occurred.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-x-hidden bg-slate-900/35" role="dialog" aria-modal="true">
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close form" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 max-h-[92vh] w-full max-w-full min-w-0 box-border overflow-y-auto overflow-x-hidden rounded-t-2xl bg-white p-4 shadow-soft md:left-1/2 md:top-1/2 md:bottom-auto md:max-h-[86vh] md:w-full md:max-w-xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Add Items for {counterparty.name}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-700">Record one or more obligation items under this person.</p>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="mt-5 grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setType("debt")}
              className={`rounded-md py-2.5 text-xs font-black transition ${
                type === "debt" ? "bg-kash-emerald text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Debt (I Owe)
            </button>
            <button
              type="button"
              onClick={() => setType("receivable")}
              className={`rounded-md py-2.5 text-xs font-black transition ${
                type === "receivable" ? "bg-kash-emerald text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Receivable (Owed to Me)
            </button>
          </div>

          {/* Items Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                Items to Add ({items.length})
              </span>
              <button
                type="button"
                onClick={addItemRow}
                className="inline-flex items-center gap-1 text-xs font-bold text-kash-emerald transition hover:text-kash-emeraldDark hover:underline"
              >
                <Plus size={14} />
                Add another item
              </button>
            </div>

            {items.map((item, index) => (
              <div
                key={item.id}
                className="relative space-y-3 rounded-xl border border-slate-200 bg-white p-4 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-700">Item #{index + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItemRow(item.id)}
                      className="text-xs font-bold text-kash-expense hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      Title / Item Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Tiket Konser, Beli Jaket"
                      value={item.title}
                      onChange={(e) => updateItemRow(item.id, "title", e.target.value)}
                      className="mt-1.5 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:outline-none focus:ring-2 focus:ring-kash-emerald/20"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      Amount *
                    </label>
                    <input
                      inputMode="numeric"
                      type="text"
                      placeholder="0"
                      value={item.originalAmount}
                      onChange={(e) => updateItemRow(item.id, "originalAmount", e.target.value)}
                      className="mt-1.5 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:outline-none focus:ring-2 focus:ring-kash-emerald/20"
                      required
                    />
                  </div>
                </div>

                {/* Due date & Note Row */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-800">
                        Due Date (Optional)
                      </label>
                      {item.dueDate ? (
                        <button
                          type="button"
                          onClick={() => updateItemRow(item.id, "dueDate", "")}
                          className="text-[11px] font-bold text-kash-emerald hover:underline"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                    <DatePickerField
                      value={item.dueDate}
                      placeholder="Select Due Date"
                      onChange={(val) => updateItemRow(item.id, "dueDate", val)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      Note (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Optional details..."
                      value={item.note}
                      onChange={(e) => updateItemRow(item.id, "note", e.target.value)}
                      className="mt-1.5 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:outline-none focus:ring-2 focus:ring-kash-emerald/20"
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addItemRow}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-xs font-bold text-slate-700 transition hover:border-kash-emerald hover:bg-emerald-50/50 hover:text-kash-emeraldDark"
            >
              <Plus size={15} />
              Add Another Item
            </button>
          </div>

          {/* Optional Wallet Movement (Pinjam masuk rekening / Nalangin potong rekening) */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
            <label className="flex cursor-pointer select-none items-start gap-3">
              <input
                type="checkbox"
                checked={linkWallet}
                onChange={(e) => {
                  setLinkWallet(e.target.checked);
                  if (e.target.checked && !selectedWalletId && wallets.length > 0) {
                    setSelectedWalletId(wallets[0].id);
                  }
                }}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-kash-emerald focus:ring-kash-emerald"
              />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900">
                  {type === "debt"
                    ? "Deposit money into my wallet (Uang pinjaman masuk ke rekening)"
                    : "Pay from my wallet (Uang ditalangin / dipinjamkan keluar dari rekening)"}
                </p>
                <p className="text-[11px] font-medium text-slate-600">
                  {type === "debt"
                    ? "Centang jika uang pinjaman ini Anda terima langsung ke rekening/dompet KASH saat ini."
                    : "Centang jika Anda membayarkan/mentransfer uang ini dari rekening KASH sekarang (misal: ditalangin dulu untuk di-reimburse nanti)."}
                </p>
              </div>
            </label>

            {linkWallet && (
              <div className="space-y-2 border-t border-slate-100 pt-2">
                <SelectField
                  id="item-obligation-wallet"
                  label={type === "debt" ? "Destination Wallet *" : "Source Wallet *"}
                  value={selectedWalletId}
                  onChange={(e) => setSelectedWalletId(e.target.value)}
                  required
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({formatCurrency(w.balance?.current_balance ?? w.initial_balance, "IDR")})
                    </option>
                  ))}
                </SelectField>

                {selectedWallet && (
                  <div className="flex items-center justify-between rounded-lg bg-emerald-50/70 p-2.5 text-xs font-semibold text-slate-800">
                    <span>
                      {type === "debt" ? "Wallet will receive:" : "Wallet will be deducted by:"}
                    </span>
                    <span className={`font-extrabold ${type === "debt" ? "text-kash-emeraldDark" : "text-kash-expense"}`}>
                      {type === "debt" ? "+" : "-"}{formatCurrency(totalAmountSum, "IDR")}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Live Total Summary */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3.5">
            <div>
              <span className="text-xs font-bold uppercase text-slate-600">Total</span>
              <p className="text-xs font-semibold text-slate-600">{items.length} item{items.length !== 1 ? "s" : ""}</p>
            </div>
            <p className="text-xl font-black text-slate-900">
              {formatCurrency(totalAmountSum, "IDR")}
            </p>
          </div>

          <div className="mt-2">
            <Button disabled={saving} type="submit">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
              Save {items.length} Item{items.length !== 1 ? "s" : ""}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function EditItemModal({
  item,
  onClose,
  onSaved,
}: {
  item: DebtProgress;
  onClose: () => void;
  onSaved: () => void;
}) {
  const hasAllocations = toNumber(item.total_paid) > 0;
  const [title, setTitle] = useState(item.title);
  const [originalAmount, setOriginalAmount] = useState(formatMoneyDigits(item.original_amount.toString()));
  const [dueDate, setDueDate] = useState(item.due_date ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Item title is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: editError } = await updateDebt(item.debt_id, {
        title: title.trim(),
        originalAmount: hasAllocations ? undefined : parseMoneyInputDigits(originalAmount),
        dueDate: dueDate.trim() || null,
        note: note.trim() || null,
      });

      if (editError) {
        setError(editError.message ?? "Failed to update item. Please try again.");
        setSaving(false);
        return;
      }

      onSaved();
    } catch (err: any) {
      setError(err?.message ?? "An unexpected error occurred.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-x-hidden bg-slate-900/35" role="dialog" aria-modal="true">
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close edit form" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 max-h-[92vh] w-full max-w-full min-w-0 box-border overflow-y-auto overflow-x-hidden rounded-t-2xl bg-white p-4 shadow-soft md:left-1/2 md:top-1/2 md:bottom-auto md:max-h-[86vh] md:w-full md:max-w-xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Edit Obligation Item</h2>
            <p className="mt-1 text-sm font-semibold text-slate-700">Update metadata for this item.</p>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="mt-5 grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <FormField
            id="edit-item-title"
            label="Item Title *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          {hasAllocations ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="text-xs font-bold uppercase text-slate-600">Original Amount (Locked)</span>
              <p className="mt-1 text-sm font-black text-slate-900">{formatCurrency(toNumber(item.original_amount), "IDR")}</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-600">
                Amount cannot be modified because settlement allocations already exist.
              </p>
            </div>
          ) : (
            <FormField
              id="edit-item-amount"
              inputMode="numeric"
              label="Original Amount *"
              value={originalAmount}
              onChange={(e) => setOriginalAmount(formatMoneyDigits(e.target.value))}
              required
            />
          )}

          {/* Due Date (Optional & Clearable with emerald styling) */}
          <div className="w-full max-w-full min-w-0">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-900" htmlFor="edit-item-due-date">
                Due Date (Optional)
              </label>
              {dueDate ? (
                <button
                  type="button"
                  onClick={() => setDueDate("")}
                  className="text-xs font-bold text-kash-emerald transition hover:text-kash-emeraldDark hover:underline"
                >
                  Clear due date
                </button>
              ) : (
                <span className="text-xs font-semibold text-slate-600">No due date</span>
              )}
            </div>
            <DatePickerField
              id="edit-item-due-date"
              value={dueDate}
              placeholder="Select Due Date"
              onChange={(val) => setDueDate(val)}
            />
          </div>

          <FormField
            id="edit-item-note"
            label="Note (Optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="mt-2">
            <Button disabled={saving} type="submit">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
              Save Changes
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function RenameCounterpartyModal({
  counterparty,
  onClose,
  onSaved,
}: {
  counterparty: { id: string; name: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(counterparty.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: renameError } = await renameCounterparty(counterparty.id, name);
      if (renameError) {
        setError(renameError.message ?? "Failed to rename counterparty.");
        setSaving(false);
        return;
      }

      onSaved();
    } catch (err: any) {
      setError(err?.message ?? "An unexpected error occurred.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-x-hidden bg-slate-900/35" role="dialog" aria-modal="true">
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close rename form" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 max-h-[92vh] w-full max-w-full min-w-0 box-border overflow-y-auto overflow-x-hidden rounded-t-2xl bg-white p-4 shadow-soft md:left-1/2 md:top-1/2 md:bottom-auto md:max-h-[86vh] md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Rename Person</h2>
            <p className="mt-1 text-sm font-semibold text-slate-700">Update display name for this counterparty.</p>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="mt-5 grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <FormField
            id="rename-counterparty-name"
            label="Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div className="mt-2">
            <Button disabled={saving} type="submit">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
              Save Name
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
