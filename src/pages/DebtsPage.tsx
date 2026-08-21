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
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CounterpartyCombobox } from "../components/debts/CounterpartyCombobox";
import { Button } from "../components/ui/Button";
import { ContextualCreateAction } from "../components/ui/ContextualCreateAction";
import { DatePickerField } from "../components/ui/DatePickerField";
import { FilterTabs } from "../components/ui/FilterTabs";
import { FormField } from "../components/ui/FormField";
import { IconButton } from "../components/ui/IconButton";
import { Modal } from "../components/ui/Modal";
import { FinancialHeroCard } from "../components/ui/FinancialHeroCard";
import { ProgressBar } from "../components/ui/ProgressBar";
import { SelectField } from "../components/ui/SelectField";
import { useI18n } from "../i18n";
import { useAppEvent } from "../hooks/useAppEvent";
import { appEvents, emitDebtSaved, emitTransactionSaved } from "../lib/appEvents";
import {
  createDebt,
  createMultipleDebts,
  findOrCreateCounterparty,
  getCounterparties,
  getOpenDebtItems,
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
  const navigate = useNavigate();
  const { t } = useI18n();
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

  const typeFilterOptions = useMemo(() => [
    { label: t("debts.tabAll"), value: "all" },
    { label: t("debts.tabDebts"), value: "debt" },
    { label: t("debts.tabReceivables"), value: "receivable" },
  ], [t]);

  const createActionRef = useRef<HTMLDivElement>(null);

  return (
    <div className="w-full min-w-0 space-y-4 -mt-2 sm:mt-0">
      {/* 1. Compact Top Bar with Title + Desktop Create Button */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <HandCoins className="text-kash-emerald shrink-0" size={22} />
          <h1 className="text-lg font-black text-slate-900 truncate">{t("debts.title") || "Utang & Piutang"}</h1>
        </div>

        <div ref={createActionRef} className="hidden sm:block shrink-0">
          <Button onClick={() => setCreateModalOpen(true)} className="gap-1.5 min-h-9 px-3.5 py-1.5 text-xs font-extrabold">
            <Plus aria-hidden="true" size={15} />
            {t("debts.createDebt") || "Catat Utang / Piutang"}
          </Button>
        </div>
      </div>

      {/* 2. Unified Emerald Hero Card for Debt & Receivable Posture */}
      <FinancialHeroCard
        icon={<HandCoins size={22} />}
        eyebrow={t("debts.financeEyebrow") || "Keuangan"}
        title={t("debts.title") || "Utang & Piutang"}
        primaryMetricLabel={t("debts.totalDebt") || "Total Kewajiban Utang"}
        primaryMetricValue={formatCurrency(totalDebt, "IDR")}
        supportingMetrics={
          <div className="grid grid-cols-2 gap-3 text-xs font-semibold text-white/90">
            <div>
              <span className="text-white/60 font-semibold">{t("debts.totalDebt") || "Total Utang"}</span>
              <p className="mt-0.5 text-sm sm:text-base font-extrabold text-white">
                {formatCurrency(totalDebt, "IDR")}
              </p>
            </div>
            <div>
              <span className="text-white/60 font-semibold">{t("debts.totalReceivable") || "Total Piutang"}</span>
              <p className="mt-0.5 text-sm sm:text-base font-extrabold text-white">
                {formatCurrency(totalReceivable, "IDR")}
              </p>
            </div>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Type Segments */}
        <FilterTabs
          options={typeFilterOptions}
          value={typeFilter}
          onChange={(val) => setTypeFilter(val as TypeFilter)}
        />

        {/* Status & Search */}
        <div className="flex flex-wrap items-end gap-3 sm:flex-nowrap">
          <div className="min-w-[190px]">
            <SelectField
              label={t("common.status") || "Status"}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="active">{t("common.active")}</option>
              <option value="settled">{t("debts.settled")}</option>
              <option value="all">{t("common.all")}</option>
            </SelectField>
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder={t("common.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-900 placeholder:text-slate-600 focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
          </div>
        </div>
      </div>

      {/* Counterparty Cards List */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm font-bold text-slate-600">
          <Loader2 className="animate-spin" size={20} />
          {t("common.loading")}
        </div>
      ) : counterparties.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <HandCoins size={28} />
          </div>
          <h3 className="mt-4 text-base font-extrabold text-slate-900">
            {t("debts.emptyTitle")}
          </h3>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            {searchQuery
              ? (t("debts.noMatchingDebts", { query: searchQuery }) || `Tidak ditemukan hasil yang cocok dengan "${searchQuery}".`)
              : t("debts.emptyDesc")}
          </p>
          {!searchQuery && (
            <div className="mt-5">
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus aria-hidden="true" size={16} />
                {t("debts.createDebt")}
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

            const debtTotal = cp.debtOriginalTotal || (cp.debtTotal + cp.debtPaidTotal);
            const debtPaid = cp.debtPaidTotal;
            const debtProgress = debtTotal > 0 ? (debtPaid / debtTotal * 100) : (cp.debtTotal === 0 ? 100 : 0);

            const recTotal = cp.receivableOriginalTotal || (cp.receivableTotal + cp.receivablePaidTotal);
            const recPaid = cp.receivablePaidTotal;
            const recProgress = recTotal > 0 ? (recPaid / recTotal * 100) : (cp.receivableTotal === 0 ? 100 : 0);

            return (
              <div
                key={cp.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/debts/${cp.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/debts/${cp.id}`);
                  }
                }}
                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-kash-emerald/50 hover:shadow-md hover:bg-kash-selected/10 cursor-pointer focus:outline-none focus:ring-4 focus:ring-kash-emerald/20 text-left"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-black text-slate-900 group-hover:text-kash-emeraldDark transition-colors">
                        {cp.name}
                      </h3>
                      <p className="mt-0.5 text-xs font-semibold text-slate-600">
                        {cp.totalItemCount} {t("debts.totalItems") || "total item"}
                      </p>
                    </div>
                    {isAllSettled && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-700">
                        <CheckCircle2 size={12} />
                        {t("debts.settled")}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 space-y-3">
                    {/* Debt Row with Progress */}
                    {(hasDebt || cp.settledDebtCount > 0) && (
                      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-600">{t("debts.totalDebt")}:</span>
                          <span className="font-black text-slate-900">
                            {formatCurrency(debtTotal, "IDR")}
                          </span>
                        </div>
                        {debtPaid > 0 ? (
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-600">{t("debts.paidAmount")}:</span>
                            <span className="font-black text-kash-emeraldDark">
                              {formatCurrency(debtPaid, "IDR")}
                            </span>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between text-xs border-t border-slate-200/50 pt-1.5">
                          <span className="font-bold text-slate-700">{t("debts.remainingDebt")}:</span>
                          <span className="font-black text-kash-expense">
                            {formatCurrency(cp.debtTotal, "IDR")}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1 pt-1">
                          <div className="flex justify-between text-[11px] font-extrabold text-slate-600">
                            <span>{t("debts.progress")}</span>
                            <span>{debtProgress.toFixed(1)}%</span>
                          </div>
                          <ProgressBar percentage={debtProgress} tone="emerald" height="xs" />
                        </div>

                        {cp.debtTotal > 0 && (
                          <div className="pt-1 flex justify-end">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSettlementTarget({ counterparty: cp, debtType: "debt" });
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-kash-emerald px-3.5 py-1.5 text-xs font-black text-white shadow-xs transition hover:bg-kash-emeraldDark focus:outline-none focus:ring-2 focus:ring-kash-emerald/30"
                            >
                              {t("debts.pay")}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Receivable Row with Progress */}
                    {(hasReceivable || cp.settledReceivableCount > 0) && (
                      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-600">{t("debts.totalReceivable")}:</span>
                          <span className="font-black text-slate-900">
                            {formatCurrency(recTotal, "IDR")}
                          </span>
                        </div>
                        {recPaid > 0 ? (
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-600">{t("debts.collectedAmount")}:</span>
                            <span className="font-black text-kash-emeraldDark">
                              {formatCurrency(recPaid, "IDR")}
                            </span>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between text-xs border-t border-slate-200/50 pt-1.5">
                          <span className="font-bold text-slate-700">{t("debts.remainingReceivable")}:</span>
                          <span className="font-black text-teal-600">
                            {formatCurrency(cp.receivableTotal, "IDR")}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1 pt-1">
                          <div className="flex justify-between text-[11px] font-extrabold text-slate-600">
                            <span>{t("debts.progress")}</span>
                            <span>{recProgress.toFixed(1)}%</span>
                          </div>
                          <ProgressBar percentage={recProgress} tone="emerald" height="xs" />
                        </div>

                        {cp.receivableTotal > 0 && (
                          <div className="pt-1 flex justify-end">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSettlementTarget({ counterparty: cp, debtType: "receivable" });
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-black text-white shadow-xs transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-600/30"
                            >
                              {t("debts.collect")}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 border-t border-slate-100 pt-3 flex items-center justify-between text-xs font-extrabold text-kash-emerald group-hover:text-kash-emeraldDark">
                  <span>{t("common.viewDetail")}</span>
                  <ChevronRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
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
      <ContextualCreateAction
        targetRef={createActionRef}
        onClick={() => setCreateModalOpen(true)}
        label={t("debts.createDebt")}
      />
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
  const { t, formatCurrency } = useI18n();
  const [type, setType] = useState<DebtType>("debt");
  const [counterpartyName, setCounterpartyName] = useState("");
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
    if (!counterpartyName.trim()) {
      setError(t("debts.counterpartyRequired") || "Nama orang / kontak wajib diisi.");
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.title.trim()) {
        setError(t("debts.itemTitleRequired", { index: i + 1 }) || `Item #${i + 1} memerlukan judul / keterangan.`);
        return;
      }
      const rawDigits = parseMoneyInputDigits(item.originalAmount);
      if (!rawDigits || toNumber(rawDigits) <= 0) {
        setError(t("debts.itemAmountRequired", { index: i + 1, title: item.title }) || `Item #${i + 1} ("${item.title}") harus memiliki nominal lebih dari nol.`);
        return;
      }
    }

    if (linkWallet && !selectedWalletId) {
      setError(t("debts.selectWalletError") || "Silakan pilih dompet untuk memproses dana.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Find or create counterparty safely
      const { data: cp, error: cpError } = await findOrCreateCounterparty(counterpartyName);
      if (cpError || !cp) {
        setError(t("debts.resolveCounterpartyFailed") || "Gagal memproses pihak terkait. Silakan coba lagi.");
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

      const { error: batchError } = await createMultipleDebts(debtInputs, {
        walletId: linkWallet ? selectedWalletId : null,
        counterpartyName: cp.name,
      });

      if (batchError) {
        setError(batchError.message ?? (t("debts.createObligationFailed") || "Gagal membuat catatan kewajiban. Silakan coba lagi."));
        setSaving(false);
        return;
      }

      if (linkWallet) {
        emitTransactionSaved();
      }
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? (t("common.errorOccurred") || "Terjadi kesalahan yang tidak terduga."));
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title={type === "debt" ? (t("debts.newDebtTitle") || "Catat Utang Baru") : (t("debts.newReceivableTitle") || "Catat Piutang Baru")}
      description={t("debts.obligationModalDesc") || "Catat satu atau beberapa item yang Anda pinjam atau pinjamkan."}
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          {/* Type Toggle */}
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setType("debt")}
              className={`rounded-md py-2.5 text-xs font-black transition ${type === "debt"
                  ? "bg-kash-emerald text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
                }`}
            >
              {t("debts.iOwe") || "Saya Berutang (Utang)"}
            </button>
            <button
              type="button"
              onClick={() => setType("receivable")}
              className={`rounded-md py-2.5 text-xs font-black transition ${type === "receivable"
                  ? "bg-kash-emerald text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
                }`}
            >
              {t("debts.owedToMe") || "Orang Berutang ke Saya (Piutang)"}
            </button>
          </div>

          <div className="w-full max-w-full min-w-0">
            <label className="block text-sm font-bold text-slate-900" htmlFor="counterparty-name">
              {t("debts.personOrBusiness") || "Orang atau Pihak Terkait"} *
            </label>
            <div className="mt-1">
              <CounterpartyCombobox
                id="obligation-counterparty"
                counterparties={allCounterparties}
                onChange={(selected) => setCounterpartyName(selected)}
                placeholder={t("debts.searchOrAddPerson") || "Cari atau tambah nama orang / pihak..."}
                value={counterpartyName}
                required
              />
            </div>
            <p className="mt-1.5 text-xs font-semibold text-slate-600">
              {t("debts.typeNameToSearch") || "Ketik nama untuk mencari kontak yang sudah ada atau menambahkan baru."}
            </p>
          </div>

          {/* Dynamic Item Rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">{t("debts.itemsObligations") || "Daftar Item / Kewajiban"} *</span>
              <button
                type="button"
                onClick={addItemRow}
                className="inline-flex items-center gap-1 text-xs font-black text-kash-emerald hover:text-kash-emeraldDark"
              >
                <Plus size={14} /> {t("debts.addAnotherItem") || "Tambah Item Lain"}
              </button>
            </div>

            {items.map((item, index) => (
              <div key={item.id} className="relative rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
                {items.length > 1 && (
                  <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
                    <span className="text-xs font-black text-slate-500">{t("debts.item") || "Item"} #{index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeItemRow(item.id)}
                      className="text-xs font-bold text-kash-expense hover:underline"
                    >
                      {t("common.remove") || "Hapus"}
                    </button>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      {t("debts.itemTitleLabel") || "Nama / Keterangan Item"} *
                    </label>
                    <input
                      type="text"
                      placeholder={t("debts.itemTitlePlaceholder") || "misal: Tiket Konser, Beli Jaket"}
                      value={item.title}
                      onChange={(e) => updateItemRow(item.id, "title", e.target.value)}
                      className="mt-1.5 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:outline-none focus:ring-2 focus:ring-kash-emerald/20"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      {t("debts.amount") || "Nominal"} *
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
                        {t("debts.dueDateOptional") || "Jatuh Tempo (Opsional)"}
                      </label>
                      {item.dueDate ? (
                        <button
                          type="button"
                          onClick={() => updateItemRow(item.id, "dueDate", "")}
                          className="text-[11px] font-bold text-kash-emerald hover:underline"
                        >
                          {t("common.clear") || "Hapus"}
                        </button>
                      ) : null}
                    </div>
                    <DatePickerField
                      value={item.dueDate}
                      placeholder={t("debts.selectDueDate") || "Pilih Jatuh Tempo"}
                      onChange={(val) => updateItemRow(item.id, "dueDate", val)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      {t("debts.noteOptional") || "Catatan (Opsional)"}
                    </label>
                    <input
                      type="text"
                      placeholder={t("debts.notePlaceholder") || "Keterangan tambahan..."}
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
              {t("debts.addAnotherItemForPerson", { name: counterpartyName || (t("debts.thisPerson") || "pihak ini") }) || `Tambah Item Lain untuk ${counterpartyName || "pihak ini"}`}
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
                    ? (t("debts.depositToWallet") || "Uang pinjaman masuk ke rekening")
                    : (t("debts.payFromWallet") || "Uang ditalangin / dipinjamkan keluar dari rekening")}
                </p>
                <p className="text-[11px] font-medium text-slate-600">
                  {type === "debt"
                    ? (t("debts.depositToWalletDesc") || "Centang jika uang pinjaman ini Anda terima langsung ke rekening/dompet KASH saat ini.")
                    : (t("debts.payFromWalletDesc") || "Centang jika Anda membayarkan/mentransfer uang ini dari rekening KASH sekarang (misal: ditalangin dulu untuk di-reimburse nanti).")}
                </p>
              </div>
            </label>

            {linkWallet && (
              <div className="space-y-2 border-t border-slate-100 pt-2">
                <SelectField
                  id="obligation-wallet"
                  label={type === "debt" ? `${t("debts.destinationWallet") || "Dompet Tujuan Penerimaan"} *` : `${t("debts.sourceWallet") || "Dompet Asal Pembayaran"} *`}
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
                      {type === "debt" ? (t("debts.walletWillReceive") || "Saldo dompet akan bertambah:") : (t("debts.walletWillBeDeducted") || "Saldo dompet akan berkurang:")}
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
              <span className="text-xs font-bold uppercase text-slate-600">{t("debts.totalObligation") || "Total Kewajiban"}</span>
              <p className="text-xs font-semibold text-slate-600">{items.length} {t("debts.items") || "item"}</p>
            </div>
            <p className="text-xl font-black text-slate-900">
              {formatCurrency(totalAmountSum, "IDR")}
            </p>
          </div>

          <div className="mt-2">
            <Button disabled={saving} type="submit">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
              {t("debts.saveObligationItems", { count: items.length }) || `Simpan ${items.length} Item Kewajiban`}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
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
  const { t, formatCurrency } = useI18n();
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
      setError(t("debts.amountGreaterThanZero") || "Nominal pelunasan harus lebih dari nol.");
      return;
    }
    if (parsedAmount > totalOutstanding) {
      setError(t("debts.amountExceedsBalance", { total: formatCurrency(totalOutstanding, "IDR") }) || `Nominal pembayaran tidak boleh melebihi sisa total ${formatCurrency(totalOutstanding, "IDR")}.`);
      return;
    }

    if (paymentMode === "wallet" && !walletId) {
      setError(t("debts.selectWalletError") || "Silakan pilih dompet.");
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
        debtId: null,
      });

      if (settlementError) {
        setError(settlementError.message ?? (t("debts.recordSettlementFailed") || "Gagal mencatat pelunasan. Silakan coba lagi."));
        setSaving(false);
        return;
      }

      onSaved();
    } catch (err: any) {
      setError(err?.message ?? (t("common.errorOccurred") || "Terjadi kesalahan yang tidak terduga."));
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title={isDebt ? (t("debts.recordPaymentTo", { name: counterparty.name }) || `Catat Pembayaran ke ${counterparty.name}`) : (t("debts.recordCollectionFrom", { name: counterparty.name }) || `Catat Penerimaan dari ${counterparty.name}`)}
      description={
        isDebt
          ? `${t("debts.remainingDebt")}: ${formatCurrency(totalOutstanding, "IDR")}`
          : `${t("debts.remainingReceivable")}: ${formatCurrency(totalOutstanding, "IDR")}`
      }
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          {/* Payment Method Switcher */}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setPaymentMode("wallet")}
              className={`rounded-lg py-2.5 text-xs font-black transition ${
                paymentMode === "wallet" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {isDebt ? (t("debts.payFromWalletTab") || "Bayar dari Dompet") : (t("debts.receiveIntoWalletTab") || "Terima ke Dompet")}
            </button>
            <button
              type="button"
              onClick={() => setPaymentMode("historical")}
              className={`rounded-lg py-2.5 text-xs font-black transition ${
                paymentMode === "historical" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {isDebt ? (t("debts.recordPreviousPaymentTab") || "Catat Pembayaran Masa Lalu") : (t("debts.recordPreviousCollectionTab") || "Catat Penerimaan Masa Lalu")}
            </button>
          </div>

          {/* Historical Explanation */}
          {paymentMode === "historical" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs font-semibold text-blue-900">
              {t("debts.historicalSettlementDesc") || "Mencatat pelunasan yang sudah terjadi di luar KASH. Mengurangi sisa kewajiban tanpa mempengaruhi saldo dompet Anda."}
            </div>
          )}

          {/* Amount input & Quick Full Settlement shortcut */}
          <div className="w-full max-w-full min-w-0">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-900" htmlFor="settlement-amount">
                {t("debts.amount") || "Nominal"} *
              </label>
              <button
                type="button"
                onClick={() => setAmount(formatMoneyDigits(totalOutstanding.toString()))}
                className="text-xs font-bold text-kash-emerald transition hover:text-kash-emeraldDark hover:underline"
              >
                {t("debts.payFull") || "Bayar Penuh"} ({formatCurrency(totalOutstanding, "IDR")})
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

          {/* Wallet selector (if wallet mode) */}
          {paymentMode === "wallet" && (
            <SelectField
              id="settlement-wallet"
              label={isDebt ? `${t("debts.fromWalletSource") || "Dari Dompet (Sumber)"} *` : `${t("debts.toWalletDestination") || "Ke Dompet (Tujuan)"} *`}
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
            >
              {wallets.length === 0 ? <option value="">{t("wallets.noWalletsFound") || "Tidak ada dompet tersedia"}</option> : null}
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} - {t("wallets.balance") || "Saldo"}: {formatCurrency(w.balance?.current_balance ?? w.initial_balance, "IDR")}
                </option>
              ))}
            </SelectField>
          )}

          {/* Date Picker */}
          <DatePickerField
            id="settlement-date"
            label={`${t("debts.paymentDate") || "Tanggal Pembayaran"} *`}
            enableTime
            value={paymentDate}
            onChange={(val) => setPaymentDate(val)}
          />

          {/* Notes */}
          <FormField
            id="settlement-note"
            label={t("debts.noteOptional") || "Catatan (Opsional)"}
            placeholder={t("debts.settlementNotePlaceholder") || "e.g. Ditransfer via BCA / Tunai"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {/* Real-Time Live Preview */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">{t("debts.settlementPreview") || "Pratinjau Pelunasan"}</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">{t("debts.settlementMode") || "Metode Alokasi:"}</span>
                <span className="font-black text-slate-900">{t("debts.autoAllocationFifo") || "Alokasi Otomatis (FIFO)"}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">{t("debts.settlementAmountLabel") || "Nominal Pelunasan:"}</span>
                <span className="font-black text-slate-900">{formatCurrency(parsedAmount, "IDR")}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">{t("debts.walletEffect") || "Dampak ke Dompet:"}</span>
                <span className="font-black text-slate-900">
                  {paymentMode === "historical"
                    ? (t("debts.noChangeHistorical") || "Tidak berubah (Histori Lampau)")
                    : isDebt
                      ? `-${formatCurrency(parsedAmount, "IDR")} (${selectedWallet?.name ?? (t("wallets.walletFallback") || "Dompet")})`
                      : `+${formatCurrency(parsedAmount, "IDR")} (${selectedWallet?.name ?? (t("wallets.walletFallback") || "Dompet")})`}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="font-bold text-slate-900">{t("debts.remainingObligation") || "Sisa"} {isDebt ? (t("debts.tabDebts") || "Utang") : (t("debts.tabReceivables") || "Piutang")}:</span>
                <span className="font-black text-slate-900">{formatCurrency(remainingAfterPayment, "IDR")}</span>
              </div>
            </div>
          </div>

          <div className="mt-2">
            <Button disabled={saving} type="submit">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
              {isDebt ? (t("debts.confirmDebtPayment") || "Konfirmasi Pembayaran Utang") : (t("debts.confirmCollection") || "Konfirmasi Penerimaan Piutang")}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
