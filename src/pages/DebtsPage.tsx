import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit2,
  HandCoins,
  History,
  Loader2,
  Plus,
  Receipt,
  Search,
  User,
  WalletCards,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { FormField } from "../components/ui/FormField";
import { IconButton } from "../components/ui/IconButton";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { useAppEvent } from "../hooks/useAppEvent";
import { appEvents, emitDebtSaved, emitTransactionSaved } from "../lib/appEvents";
import {
  createDebt,
  createMultipleDebts,
  findOrCreateCounterparty,
  getCounterparties,
  recordCounterpartySettlement,
  type CounterpartyWithSummary,
  type CreateDebtInput,
} from "../lib/debts";
import { formatCurrency, formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../lib/money";
import { getWallets, type WalletWithBalance } from "../lib/wallets";
import type { Counterparty, DebtType, PaymentMode } from "../types/domain";

type TypeFilter = "all" | "debt" | "receivable";
type StatusFilter = "active" | "settled" | "all";

export function DebtsPage() {
  const [loading, setLoading] = useState(true);
  const [counterparties, setCounterparties] = useState<CounterpartyWithSummary[]>([]);
  const [allCounterparties, setAllCounterparties] = useState<Counterparty[]>([]);
  const [totalDebt, setTotalDebt] = useState(0);
  const [totalReceivable, setTotalReceivable] = useState(0);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [searchQuery, setSearchQuery] = useState("");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [settlementTarget, setSettlementTarget] = useState<{
    counterparty: CounterpartyWithSummary;
    debtType: DebtType;
  } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getCounterparties({
        type: typeFilter,
        status: statusFilter,
        query: searchQuery,
      });
      setCounterparties(data.counterparties);
      setAllCounterparties(data.allCounterparties);
      setTotalDebt(data.totalDebt);
      setTotalReceivable(data.totalReceivable);
    } catch (err) {
      console.error("Failed to load debts", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [typeFilter, statusFilter, searchQuery]);

  useAppEvent(appEvents.debtSaved, loadData);
  useAppEvent(appEvents.transactionSaved, loadData);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-20 pt-2 md:pb-8">
      <PageHeader
        eyebrow="Finance"
        icon={HandCoins}
        title="Debt & Receivable"
        description="Track obligations and record settlements at the counterparty level."
        actions={
          <Button onClick={() => setCreateModalOpen(true)}>
            <Plus aria-hidden="true" size={18} />
            New Obligation
          </Button>
        }
      />

      {/* Overview Totals (Never Netted) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">Total You Owe</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-kash-expense/10 text-kash-expense">
              <ArrowUpRight aria-hidden="true" size={19} strokeWidth={2.4} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900 md:text-3xl">
            {formatCurrency(totalDebt, "IDR")}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            Money you need to pay to others
          </p>
        </section>

        <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">Total Owed to You</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-kash-emerald/10 text-kash-emerald">
              <ArrowDownLeft aria-hidden="true" size={19} strokeWidth={2.4} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900 md:text-3xl">
            {formatCurrency(totalReceivable, "IDR")}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            Money others need to pay back to you
          </p>
        </section>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        {/* Type Segments */}
        <div className="flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTypeFilter("all")}
            className={`rounded-md px-3 py-1.5 text-xs font-extrabold transition ${typeFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter("debt")}
            className={`rounded-md px-3 py-1.5 text-xs font-extrabold transition ${typeFilter === "debt" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
          >
            Debt (You Owe)
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter("receivable")}
            className={`rounded-md px-3 py-1.5 text-xs font-extrabold transition ${typeFilter === "receivable" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
          >
            Receivable (Owed to You)
          </button>
        </div>

        {/* Status & Search */}
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 focus:border-kash-emerald focus:outline-none focus:ring-2 focus:ring-kash-emerald/30"
          >
            <option value="active">Active Obligations</option>
            <option value="settled">Settled Obligations</option>
            <option value="all">All Statuses</option>
          </select>

          <div className="relative min-w-[180px] flex-1 sm:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={15} />
            <input
              type="text"
              placeholder="Search person..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs font-bold text-slate-900 placeholder:text-slate-600 focus:border-kash-emerald focus:outline-none focus:ring-2 focus:ring-kash-emerald/30"
            />
          </div>
        </div>
      </div>

      {/* Counterparty List */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border border-slate-200 bg-white p-5 shadow-sm" />
          ))}
        </div>
      ) : counterparties.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <HandCoins size={28} />
          </div>
          <h3 className="mt-4 text-base font-extrabold text-slate-900">No counterparties found</h3>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            {searchQuery
              ? `No results matching "${searchQuery}".`
              : "Track your first debt or receivable obligation."}
          </p>
          {!searchQuery && (
            <div className="mt-5">
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus aria-hidden="true" size={16} />
                Add Obligation
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {counterparties.map((cp) => {
            const hasDebt = cp.debtTotal > 0 || cp.activeDebtCount > 0;
            const hasReceivable = cp.receivableTotal > 0 || cp.activeReceivableCount > 0;
            const isAllSettled = cp.activeDebtCount === 0 && cp.activeReceivableCount === 0 && (cp.settledDebtCount > 0 || cp.settledReceivableCount > 0);

            return (
              <div
                key={cp.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-soft transition hover:border-slate-300"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-black text-slate-900">
                        {cp.name}
                      </h3>
                      <p className="mt-0.5 text-xs font-semibold text-slate-600">
                        {cp.totalItemCount} total item{cp.totalItemCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    {isAllSettled && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-700">
                        <CheckCircle2 size={12} />
                        Settled
                      </span>
                    )}
                  </div>

                  <div className="mt-4 space-y-3">
                    {/* Debt Row */}
                    {(hasDebt || cp.settledDebtCount > 0) && (
                      <div className="rounded-lg bg-slate-50 p-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-600">You Owe:</span>
                          <span className="font-black text-slate-900">
                            {formatCurrency(cp.debtTotal, "IDR")}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
                          <span>{cp.activeDebtCount} active debt{cp.activeDebtCount !== 1 ? "s" : ""}</span>
                          {cp.debtTotal > 0 && (
                            <button
                              type="button"
                              onClick={() => setSettlementTarget({ counterparty: cp, debtType: "debt" })}
                              className="font-extrabold text-kash-emerald hover:text-kash-emeraldDark hover:underline"
                            >
                              Pay
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Receivable Row */}
                    {(hasReceivable || cp.settledReceivableCount > 0) && (
                      <div className="rounded-lg bg-slate-50 p-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-600">Owes You:</span>
                          <span className="font-black text-slate-900">
                            {formatCurrency(cp.receivableTotal, "IDR")}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
                          <span>{cp.activeReceivableCount} active receivable{cp.activeReceivableCount !== 1 ? "s" : ""}</span>
                          {cp.receivableTotal > 0 && (
                            <button
                              type="button"
                              onClick={() => setSettlementTarget({ counterparty: cp, debtType: "receivable" })}
                              className="font-extrabold text-kash-emerald hover:text-kash-emeraldDark hover:underline"
                            >
                              Collect
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 border-t border-slate-100 pt-3">
                  <Link
                    to={`/debts/${cp.id}`}
                    className="flex items-center justify-between text-xs font-extrabold text-kash-emerald hover:text-kash-emeraldDark hover:underline"
                  >
                    <span>View Details & History</span>
                    <ChevronRight size={15} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Obligation Modal */}
      {createModalOpen && (
        <CreateObligationModal
          allCounterparties={allCounterparties}
          onClose={() => setCreateModalOpen(false)}
          onSaved={() => {
            setCreateModalOpen(false);
            emitDebtSaved();
          }}
        />
      )}

      {/* Settlement Modal */}
      {settlementTarget && (
        <SettlementModal
          counterparty={settlementTarget.counterparty}
          debtType={settlementTarget.debtType}
          onClose={() => setSettlementTarget(null)}
          onSaved={() => {
            setSettlementTarget(null);
            emitDebtSaved();
            emitTransactionSaved();
          }}
        />
      )}
    </div>
  );
}

function CreateObligationModal({
  allCounterparties,
  onClose,
  onSaved,
}: {
  allCounterparties: Counterparty[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<DebtType>("debt");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [items, setItems] = useState<
    { id: string; title: string; originalAmount: string; dueDate: string; note: string }[]
  >([{ id: "1", title: "", originalAmount: "", dueDate: "", note: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!counterpartyName.trim()) {
      setError("Counterparty name is required.");
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.title.trim()) {
        setError(`Item #${i + 1} requires a title/description.`);
        return;
      }
      const rawDigits = parseMoneyInputDigits(item.originalAmount);
      if (!rawDigits || toNumber(rawDigits) <= 0) {
        setError(`Item #${i + 1} ("${item.title}") must have an amount greater than zero.`);
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      // Find or create counterparty safely
      const { data: cp, error: cpError } = await findOrCreateCounterparty(counterpartyName);
      if (cpError || !cp) {
        setError("Failed to resolve counterparty. Please try again.");
        setSaving(false);
        return;
      }

      // Create all obligation items in batch
      const debtInputs = items.map((item) => ({
        counterpartyId: cp.id,
        type,
        title: item.title.trim(),
        originalAmount: parseMoneyInputDigits(item.originalAmount),
        dueDate: item.dueDate.trim() || null,
        note: item.note.trim() || null,
      }));

      const { error: batchError } = await createMultipleDebts(debtInputs);

      if (batchError) {
        setError(batchError.message ?? "Failed to create obligation records. Please try again.");
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
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close form" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 max-h-[92vh] w-full max-w-full min-w-0 box-border overflow-y-auto overflow-x-hidden rounded-t-2xl bg-white p-4 shadow-soft md:left-1/2 md:top-1/2 md:bottom-auto md:max-h-[86vh] md:w-full md:max-w-xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">New Obligation</h2>
            <p className="mt-1 text-sm font-semibold text-slate-700">
              Record one or more items you owe or someone owes to you.
            </p>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="mt-5 grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          {/* Type Toggle */}
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setType("debt")}
              className={`rounded-md py-2.5 text-xs font-black transition ${type === "debt"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
                }`}
            >
              Debt (I Owe)
            </button>
            <button
              type="button"
              onClick={() => setType("receivable")}
              className={`rounded-md py-2.5 text-xs font-black transition ${type === "receivable"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
                }`}
            >
              Receivable (Owed to Me)
            </button>
          </div>

          {/* Counterparty Name with datalist suggestions */}
          <div className="w-full max-w-full min-w-0">
            <label className="block text-sm font-bold text-slate-900" htmlFor="counterparty-name">
              Person / Counterparty *
            </label>
            <input
              id="counterparty-name"
              list="existing-counterparties"
              type="text"
              placeholder="e.g. Budi, Andi"
              value={counterpartyName}
              onChange={(e) => setCounterpartyName(e.target.value)}
              className="mt-2 block h-12 w-full max-w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-base font-semibold text-slate-900 transition placeholder:text-slate-600 focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-[rgba(16,185,129,0.20)] md:text-sm"
              required
            />
            <datalist id="existing-counterparties">
              {allCounterparties.map((cp) => (
                <option key={cp.id} value={cp.name} />
              ))}
            </datalist>
          </div>

          {/* Items Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                Items to Track ({items.length})
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
                className="relative space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition"
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
                    <input
                      type="date"
                      value={item.dueDate}
                      onChange={(e) => updateItemRow(item.id, "dueDate", e.target.value)}
                      className="mt-1.5 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:outline-none focus:ring-2 focus:ring-kash-emerald/20"
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
              Add Another Item for {counterpartyName || "this Person"}
            </button>
          </div>

          {/* Live Total Summary */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div>
              <span className="text-xs font-bold uppercase text-slate-600">Total Obligation</span>
              <p className="text-xs font-semibold text-slate-600">{items.length} item{items.length !== 1 ? "s" : ""}</p>
            </div>
            <p className="text-xl font-black text-slate-900">
              {formatCurrency(totalAmountSum, "IDR")}
            </p>
          </div>

          <div className="mt-2">
            <Button disabled={saving} type="submit">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
              Save {items.length} Obligation Item{items.length !== 1 ? "s" : ""}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function SettlementModal({
  counterparty,
  debtType,
  onClose,
  onSaved,
}: {
  counterparty: CounterpartyWithSummary;
  debtType: DebtType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("wallet");
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  });
  const [note, setNote] = useState("");
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalOutstanding = debtType === "debt" ? counterparty.debtTotal : counterparty.receivableTotal;
  const isDebt = debtType === "debt";

  useEffect(() => {
    getWallets().then((res) => {
      if (res.data) {
        setWallets(res.data);
        const liquid = res.data.find((w) => !w.is_archived);
        if (liquid) setWalletId(liquid.id);
      }
    });
  }, []);

  const parsedAmount = toNumber(parseMoneyInputDigits(amount) || "0");
  const remainingAfterPayment = Math.max(totalOutstanding - parsedAmount, 0);
  const selectedWallet = wallets.find((w) => w.id === walletId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (parsedAmount <= 0) {
      setError("Settlement amount must be greater than zero.");
      return;
    }
    if (parsedAmount > totalOutstanding) {
      setError(`Payment amount cannot exceed the total outstanding balance of ${formatCurrency(totalOutstanding, "IDR")}.`);
      return;
    }
    if (paymentMode === "wallet" && !walletId) {
      setError("Please select a wallet.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: settlementError } = await recordCounterpartySettlement({
        counterpartyId: counterparty.id,
        debtType,
        paymentMode,
        amount: parseMoneyInputDigits(amount),
        walletId: paymentMode === "wallet" ? walletId : null,
        paymentDate: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString(),
        note: note.trim() || null,
      });

      if (settlementError) {
        setError(settlementError.message ?? "Failed to record settlement. Please try again.");
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
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close settlement form" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 max-h-[92vh] w-full max-w-full min-w-0 box-border overflow-y-auto overflow-x-hidden rounded-t-2xl bg-white p-4 shadow-soft md:left-1/2 md:top-1/2 md:bottom-auto md:max-h-[86vh] md:w-full md:max-w-xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">
              {isDebt ? `Record Payment to ${counterparty.name}` : `Record Collection from ${counterparty.name}`}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-700">
              {isDebt
                ? `Total Outstanding Debt: ${formatCurrency(totalOutstanding, "IDR")}`
                : `Total Outstanding Receivable: ${formatCurrency(totalOutstanding, "IDR")}`}
            </p>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="mt-5 grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setPaymentMode("wallet")}
              className={`rounded-md py-2.5 text-xs font-black transition ${paymentMode === "wallet" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
            >
              {isDebt ? "Pay from Wallet" : "Receive into Wallet"}
            </button>
            <button
              type="button"
              onClick={() => setPaymentMode("historical")}
              className={`rounded-md py-2.5 text-xs font-black transition ${paymentMode === "historical" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
            >
              {isDebt ? "Record Previous Payment" : "Record Previous Collection"}
            </button>
          </div>

          {/* Historical Explanation */}
          {paymentMode === "historical" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs font-semibold text-blue-900">
              This records a payment that already happened outside KASH. It reduces the outstanding obligation balance without changing your wallet balances.
            </div>
          )}

          {/* Amount input & Quick Full Settlement shortcut */}
          <div className="w-full max-w-full min-w-0">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-900" htmlFor="settlement-amount">
                Amount *
              </label>
              <button
                type="button"
                onClick={() => setAmount(formatMoneyDigits(totalOutstanding.toString()))}
                className="text-xs font-bold text-kash-emerald transition hover:text-kash-emeraldDark hover:underline"
              >
                Pay Full ({formatCurrency(totalOutstanding, "IDR")})
              </button>
            </div>
            <input
              id="settlement-amount"
              inputMode="numeric"
              type="text"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(formatMoneyDigits(e.target.value))}
              className="mt-2 block h-12 w-full max-w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-base font-semibold text-slate-900 transition placeholder:text-slate-600 focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-[rgba(16,185,129,0.20)] md:text-sm"
              required
            />
          </div>

          {/* Wallet Selector (Wallet mode only) */}
          {paymentMode === "wallet" && (
            <SelectField
              id="settlement-wallet"
              label={isDebt ? "Paid from Wallet *" : "Received into Wallet *"}
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              required
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({formatCurrency(w.balance?.current_balance ?? w.initial_balance, w.currency)})
                </option>
              ))}
            </SelectField>
          )}

          {/* Payment Date */}
          <div className="w-full max-w-full min-w-0">
            <label className="block text-sm font-bold text-slate-900" htmlFor="settlement-date">
              Payment Date & Time *
            </label>
            <input
              id="settlement-date"
              type="datetime-local"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="mt-2 block h-12 w-full max-w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-base font-semibold text-slate-900 transition focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-[rgba(16,185,129,0.20)] md:text-sm"
              required
            />
          </div>

          {/* Note */}
          <FormField
            id="settlement-note"
            label="Note (Optional)"
            placeholder="e.g. Bank transfer reference, note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {/* Real-Time Live Preview */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Settlement Preview</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Settlement Amount:</span>
                <span className="font-black text-slate-900">{formatCurrency(parsedAmount, "IDR")}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Wallet Effect:</span>
                <span className="font-black text-slate-900">
                  {paymentMode === "historical"
                    ? "No change (Historical)"
                    : isDebt
                      ? `-${formatCurrency(parsedAmount, "IDR")} (${selectedWallet?.name ?? "Wallet"})`
                      : `+${formatCurrency(parsedAmount, "IDR")} (${selectedWallet?.name ?? "Wallet"})`}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="font-bold text-slate-900">Remaining {isDebt ? "Debt" : "Receivable"}:</span>
                <span className="font-black text-slate-900">{formatCurrency(remainingAfterPayment, "IDR")}</span>
              </div>
            </div>
          </div>

          <div className="mt-2">
            <Button disabled={saving} type="submit">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
              {isDebt ? "Confirm Debt Payment" : "Confirm Collection"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
