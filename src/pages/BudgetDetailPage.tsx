import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Layers,
  PieChart,
  ReceiptText,
  Scale,
  Tag,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EditBudgetModal } from "../components/budgets/EditBudgetModal";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { DatePickerField } from "../components/ui/DatePickerField";
import { IconButton } from "../components/ui/IconButton";
import { PageHeader } from "../components/ui/PageHeader";
import { useActiveSpace } from "../context/ActiveSpaceContext";
import { useAppEvent } from "../hooks/useAppEvent";
import { useI18n } from "../i18n";
import { appEvents } from "../lib/appEvents";
import { archiveBudget, deleteBudget, getBudgetDetail, getBudgetMatchingTransactions } from "../lib/budgets";
import { getCategoryIcon } from "../lib/categoryMeta";
import type { BudgetWithProgress, Transaction } from "../types/domain";

export function BudgetDetailPage() {
  const { t, formatMonthYear, formatDate, formatCurrency } = useI18n();
  const { activeSpaceId } = useActiveSpace();
  const { id: budgetId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [currentMonth, setCurrentMonth] = useState(() => {
    const paramMonth = searchParams.get("month");
    if (paramMonth) return `${paramMonth.substring(0, 7)}-01`;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });

  const [budget, setBudget] = useState<BudgetWithProgress | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const currentMonthLabel = useMemo(() => {
    const [year, month] = currentMonth.split("-").map(Number);
    return formatMonthYear(new Date(year, month - 1, 1));
  }, [currentMonth, formatMonthYear]);

  // Synchronize state when URL month searchParam changes
  useEffect(() => {
    const paramMonth = searchParams.get("month");
    if (paramMonth) {
      const normalized = `${paramMonth.substring(0, 7)}-01`;
      setCurrentMonth((prev) => (prev !== normalized ? normalized : prev));
    }
  }, [searchParams]);

  const loadData = useCallback(async () => {
    if (!budgetId) return;
    setLoading(true);
    try {
      const bData = await getBudgetDetail(budgetId, currentMonth, activeSpaceId ?? undefined);
      setBudget(bData);
      if (bData) {
        const txList = await getBudgetMatchingTransactions(
          budgetId,
          currentMonth,
        );
        setTransactions(txList);
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.error("Error loading budget detail:", err);
    } finally {
      setLoading(false);
    }
  }, [budgetId, currentMonth, activeSpaceId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useAppEvent(appEvents.transactionSaved, () => {
    void loadData();
  });
  useAppEvent(appEvents.budgetSaved, () => {
    void loadData();
  });

  const handleMonthChange = (newMonth: string) => {
    const normalized = `${newMonth.substring(0, 7)}-01`;
    setCurrentMonth(normalized);
    setSearchParams({ month: normalized }, { replace: true });
  };

  const handlePrevMonth = () => {
    const [year, month] = currentMonth.split("-").map(Number);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    handleMonthChange(`${prevYear}-${String(prevMonth).padStart(2, "0")}-01`);
  };

  const handleNextMonth = () => {
    const [year, month] = currentMonth.split("-").map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    handleMonthChange(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`);
  };

  const handleArchive = async () => {
    if (!budgetId) return;
    setActionLoading(true);
    try {
      await archiveBudget(budgetId, currentMonth);
      setShowArchiveDialog(false);
      navigate(`/budgets?month=${currentMonth}`);
    } catch (err) {
      console.error("Failed to archive budget:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!budgetId) return;
    setActionLoading(true);
    try {
      await deleteBudget(budgetId);
      setShowDeleteDialog(false);
      navigate(`/budgets?month=${currentMonth}`);
    } catch (err) {
      console.error("Failed to delete budget:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const targetType = budget?.target_type ?? (budget?.type === "envelope" ? "envelope" : "category");

  const envelopeCategoryBreakdown = useMemo(() => {
    if (targetType !== "envelope" || transactions.length === 0) return [];
    const map = new Map<string, { id: string; name: string; icon: string; color: string; total: number; count: number }>();
    let total = 0;
    for (const tx of transactions) {
      const catId = (tx as any).category_id || "__uncategorized__";
      const catName = (tx as any).category?.name || (t("transactions.uncategorized") || "Tanpa Kategori");
      const catIcon = (tx as any).category?.icon || "tag";
      const catColor = (tx as any).category?.color || "#91A3BB";
      const amount = Number(tx.amount);
      total += amount;
      const existing = map.get(catId);
      if (existing) {
        existing.total += amount;
        existing.count += 1;
      } else {
        map.set(catId, { id: catId, name: catName, icon: catIcon, color: catColor, total: amount, count: 1 });
      }
    }
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        percentage: total > 0 ? (item.total / total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [targetType, transactions, t]);

  if (loading && !budget) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white p-6" />
      </div>
    );
  }

  if (!budget) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-xs">
          <Scale size={32} className="mx-auto text-slate-600 mb-3" />
          <h2 className="text-lg font-black text-slate-900">{t("budgets.budgetNotFound") || "Budget Tidak Ditemukan"}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            {t("budgets.budgetNotFoundDesc") || "Budget ini tidak aktif pada bulan yang dipilih atau telah dihapus."}
          </p>
          <Button onClick={() => navigate("/budgets")} className="mt-4">
            {t("budgets.backToBudgetList") || "Kembali ke Daftar Budget"}
          </Button>
        </div>
      </div>
    );
  }

  const isOverBudget = budget.status === "over_budget";
  const isNearLimit = budget.status === "near_limit";
  const progressPercent = Math.min(Math.max(budget.usage_percentage, 0), 100);

  const progressBarColor = isOverBudget
    ? "bg-kash-expense"
    : isNearLimit
    ? "bg-amber-500"
    : "bg-kash-emerald";

  const IconComp =
    targetType === "envelope"
      ? getCategoryIcon(budget.envelope_icon || "layers")
      : targetType === "debt"
      ? ReceiptText
      : targetType === "goal"
      ? getCategoryIcon(budget.wallet_icon || budget.goal_icon || "piggy-bank")
      : getCategoryIcon(budget.category_icon || "tag");

  const targetColor =
    targetType === "envelope"
      ? budget.envelope_color || "#4F7DF3"
      : targetType === "debt"
      ? "#F28C45"
      : targetType === "goal"
      ? budget.wallet_color || "#F5B82E"
      : budget.category_color || "#10B981";

  const targetLabel =
    targetType === "envelope"
      ? (t("budgets.shoppingEnvelope") || "Amplop Belanja")
      : targetType === "debt"
      ? (t("budgets.debtPaymentTarget") || "Target Cicilan Utang")
      : targetType === "goal"
      ? budget.wallet_id ? (t("budgets.savingsPocket") || "Kantong Tabungan") : (t("budgets.savingsGoalTarget") || "Target Tabungan / Goal")
      : (t("budgets.categoryBudget") || "Budget Kategori");

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-4">
      {/* Top Breadcrumb & Compact Month Selector */}
      <div className="flex items-center justify-between gap-3">
        <Link
          to={`/budgets?month=${currentMonth}`}
          className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-600 transition hover:text-kash-emeraldDark"
        >
          <ArrowLeft size={16} />
          {t("budgets.backToBudgets") || "Kembali ke Budgets"}
        </Link>

        {/* Month Selector Bar */}
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/60 bg-white px-2 py-1 shadow-card">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={t("common.prevMonth") || "Bulan Sebelumnya"}
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center gap-1.5 px-1.5 text-xs font-extrabold text-slate-800">
            <Calendar size={14} className="text-kash-emerald" />
            <span>{currentMonthLabel}</span>
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={t("common.nextMonth") || "Bulan Berikutnya"}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Main Dominant Hero Progress Surface (Directly below Month Picker) */}
      <section className="kash-hero-card p-5 sm:p-6 min-w-0 max-w-full">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg font-extrabold text-sm shadow-xs bg-white/15 text-white"
          >
            <IconComp size={22} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-white truncate">{budget.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-white/15 px-2 py-0.5 text-xs font-bold text-white/90">
                {targetLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-0.5 text-xs font-extrabold text-white">
                {isOverBudget || isNearLimit ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
                {budget.usage_percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Big Primary Spent Hero Value */}
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-white/60">
            {t("budgets.used") || "Terpakai"} / {t("budgets.effectiveTotal") || "Total Target"}
          </p>
          <p className="mt-1 break-words text-3xl font-extrabold text-white sm:text-4xl">
            {formatCurrency(budget.spent)}{" "}
            <span className="text-lg font-semibold text-white/70 sm:text-xl">
              / {formatCurrency(budget.effective_budget)}
            </span>
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="h-3 w-full overflow-hidden rounded-full bg-black/20">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isOverBudget ? "bg-red-400" : isNearLimit ? "bg-amber-300" : "bg-white"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Compact Inline Supporting Stats */}
        <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-white/15 text-xs font-semibold text-white/90">
          <span className="rounded-lg bg-white/15 px-2.5 py-1">
            {t("budgets.baseBudget") || "Base"}: {formatCurrency(budget.base_amount)}
          </span>
          {Number(budget.rollover_amount) > 0 ? (
            <span className="rounded-lg bg-white/15 px-2.5 py-1">
              {t("budgets.incomingRollover") || "Rollover"}: +{formatCurrency(budget.rollover_amount)}
            </span>
          ) : null}
          <span className="rounded-lg bg-white/15 px-2.5 py-1">
            {Number(budget.remaining) < 0 ? (t("budgets.overspent") || "Kelebihan") : (t("budgets.remainingAllocation") || "Sisa")}:{" "}
            {formatCurrency(Math.abs(Number(budget.remaining)))}
          </span>
        </div>
      </section>

      {/* Actions Row Below Hero - Single Horizontal Scrollable Row Aligned Left */}
      <div className="flex flex-nowrap items-center justify-start gap-2 overflow-x-auto max-w-full py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <Button
          variant="secondary"
          onClick={() => setShowEditModal(true)}
          className="shrink-0 whitespace-nowrap gap-1.5 min-h-9 px-3.5 py-1.5 text-xs font-extrabold"
        >
          <Edit2 size={14} />
          {t("budgets.editBudget") || "Edit Budget"}
        </Button>

        <Button
          variant="secondary"
          onClick={() => setShowArchiveDialog(true)}
          className="shrink-0 whitespace-nowrap gap-1.5 min-h-9 px-3.5 py-1.5 text-xs font-extrabold text-slate-600 hover:text-amber-800"
        >
          <Archive size={14} />
          {t("budgets.stopArchive") || "Hentikan / Arsipkan"}
        </Button>

        <Button
          variant="danger"
          onClick={() => setShowDeleteDialog(true)}
          className="shrink-0 whitespace-nowrap gap-1.5 min-h-9 px-3.5 py-1.5 text-xs font-extrabold"
        >
          <Trash2 size={14} />
          {t("common.deletePermanently") || "Hapus Permanen"}
        </Button>
      </div>

        {/* Target Meta Pill List */}
        {targetType === "category" && budget.included_category_names && budget.included_category_names.length > 0 ? (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <span className="text-xs font-extrabold uppercase text-slate-600">
              {t("budgets.relatedCategoriesInPeriod") || "Kategori Terkait dalam Periode Ini"}
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {budget.included_category_names.map((name, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700"
                >
                  <Tag size={12} className="text-kash-emerald" />
                  {name}
                </span>
              ))}
            </div>
          </div>
        ) : null}

      {/* Category Breakdown for Envelope Budgets */}
      {targetType === "envelope" ? (
        <section className="rounded-2xl border border-slate-200/60 bg-white p-5 sm:p-6 shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieChart size={17} className="text-kash-emerald" />
              <h3 className="text-sm font-extrabold text-slate-900">
                {t("budgets.envelopeCategoryDistribution") || "Rincian Distribusi Kategori Amplop"}
              </h3>
            </div>
            {budget.envelope_id && (
              <Link
                to={`/envelopes/${budget.envelope_id}?month=${currentMonth}`}
                className="text-xs font-bold text-kash-emerald hover:text-kash-emeraldDark"
              >
                {t("budgets.openEnvelopePage") || "Buka Halaman Amplop →"}
              </Link>
            )}
          </div>

          {envelopeCategoryBreakdown.length > 0 ? (
            <>
              {/* Stacked Multi-color Bar */}
              <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100 shadow-inner">
                {envelopeCategoryBreakdown.map((item) => (
                  <div
                    key={item.id}
                    style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                    className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                    title={`${item.name}: ${formatCurrency(item.total)} (${item.percentage.toFixed(1)}%)`}
                  />
                ))}
              </div>

              {/* Breakdown List */}
              <div className="grid gap-2 sm:grid-cols-2 pt-1">
                {envelopeCategoryBreakdown.map((item) => {
                  const CatIcon = getCategoryIcon(item.icon);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white text-[11px]"
                          style={{ backgroundColor: item.color }}
                        >
                          <CatIcon size={14} />
                        </span>
                        <span className="font-bold text-slate-800 truncate">{item.name}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-extrabold text-slate-900">{formatCurrency(item.total)}</span>
                        <span className="ml-1.5 font-bold text-slate-500">({item.percentage.toFixed(1)}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-xs font-semibold text-slate-500 bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
              {t("budgets.noEnvelopeTransactionsInMonth", { month: currentMonthLabel }) || `Belum ada transaksi pengeluaran di amplop ini pada ${currentMonthLabel}.`}
            </p>
          )}
        </section>
      ) : null}

      {/* Matching Transactions Section */}
      <section className="rounded-2xl border border-slate-200/60 bg-white p-5 sm:p-6 shadow-card">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <ReceiptText size={18} className="text-kash-emerald" />
            <h2 className="text-base font-extrabold text-slate-900">
              {targetType === "debt"
                ? `${t("budgets.debtPaymentHistory") || "Riwayat Pembayaran Cicilan"} (${transactions.length})`
                : targetType === "goal"
                ? `${t("budgets.savingsAllocationHistory") || "Riwayat Alokasi Menabung"} (${transactions.length})`
                : `${t("budgets.monthlyExpenseTransactions") || "Transaksi Pengeluaran Bulan Ini"} (${transactions.length})`}
            </h2>
          </div>
          <span className="text-xs font-bold text-slate-600">
            {t("common.total")}: {formatCurrency(budget.spent)}
          </span>
        </div>

        {transactions.length === 0 ? (
          <div className="py-10 text-center text-xs font-semibold text-slate-600">
            {t("budgets.noFinancialActivityRecorded") || "Belum ada aktivitas finansial yang tercatat untuk target ini pada bulan terpilih."}
          </div>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {transactions.map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between py-3">
                <div className="min-w-0 pr-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {tx.title || tx.category?.name || (t("transactions.activity") || "Aktivitas")}
                    </p>
                    {tx.category?.name && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        {tx.category.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-600">
                    {formatDate(new Date(tx.transaction_date))}{" "}
                    &bull; {tx.wallet?.name || (t("wallets.walletFallback") || "Dompet")}
                  </p>
                </div>

                <span className={`text-sm font-black whitespace-nowrap ${targetType === "debt" ? "text-orange-600" : targetType === "goal" ? "text-amber-600" : "text-kash-expense"}`}>
                  -{formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Edit Budget Modal */}
      {showEditModal && (
        <EditBudgetModal
          budget={budget}
          effectivePeriod={currentMonth}
          onClose={() => setShowEditModal(false)}
          onSaved={() => void loadData()}
        />
      )}

      {/* Archive / End Period Confirmation Dialog */}
      {showArchiveDialog && (
        <ConfirmationDialog
          title={t("budgets.stopBudgetTitle") || "Hentikan Budget Ini?"}
          description={t("budgets.stopBudgetDesc") || "Budget ini tidak akan muncul lagi di bulan-bulan berikutnya. Riwayat dan perhitungan transaksi di bulan-bulan sebelumnya akan tetap tersimpan aman."}
          confirmLabel={actionLoading ? t("common.processing") : (t("budgets.confirmStop") || "Ya, Hentikan")}
          isLoading={actionLoading}
          tone="warning"
          onConfirm={() => void handleArchive()}
          onCancel={() => setShowArchiveDialog(false)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <ConfirmationDialog
          title={t("budgets.deleteBudgetTitle") || "Hapus Budget Permanen?"}
          description={t("budgets.deleteBudgetDesc") || "Apakah Anda yakin ingin menghapus definisi budget ini secara permanen? Transaksi Anda tidak akan terhapus."}
          confirmLabel={actionLoading ? t("common.deleting") : (t("common.deletePermanently") || "Hapus Permanen")}
          isLoading={actionLoading}
          tone="danger"
          onConfirm={() => void handleDelete()}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}
    </div>
  );
}
