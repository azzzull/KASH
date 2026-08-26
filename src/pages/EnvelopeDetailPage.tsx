import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Layers,
  PieChart,
  Plus,
  ReceiptText,
  Target,
  Trash2,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CreateBudgetModal } from "../components/budgets/CreateBudgetModal";
import { QuickCreateEnvelopeModal } from "../components/envelopes/QuickCreateEnvelopeModal";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { DatePickerField } from "../components/ui/DatePickerField";
import { EntityMoreActionsMenu } from "../components/ui/EntityMoreActionsMenu";
import { IconButton } from "../components/ui/IconButton";
import { PageHeader } from "../components/ui/PageHeader";
import { useAppEvent } from "../hooks/useAppEvent";
import { useI18n } from "../i18n";
import { appEvents } from "../lib/appEvents";
import { getCategoryIcon } from "../lib/categoryMeta";
import {
  deleteEnvelope,
  getEnvelopeMonthlyAnalytics,
  updateEnvelope,
  type EnvelopeMonthlyAnalytics,
} from "../lib/envelopes";

export function EnvelopeDetailPage() {
  const { t, formatMonthYear, formatDate, formatCurrency } = useI18n();
  const { id: envelopeId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [currentMonth, setCurrentMonth] = useState(() => {
    const paramMonth = searchParams.get("month");
    if (paramMonth) return `${paramMonth.substring(0, 7)}-01`;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });

  const [data, setData] = useState<EnvelopeMonthlyAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateBudgetModal, setShowCreateBudgetModal] = useState(false);
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

  const loadAnalytics = useCallback(async () => {
    if (!envelopeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getEnvelopeMonthlyAnalytics(envelopeId, currentMonth);
      if (!res) {
        setError(t("categories.envelopeNotFoundOrNoAccess") || "Amplop tidak ditemukan atau Anda tidak memiliki akses.");
      } else {
        setData(res);
      }
    } catch (err: any) {
      setError(err.message || (t("categories.loadAnalyticsFailed") || "Gagal memuat analitik amplop."));
    } finally {
      setLoading(false);
    }
  }, [envelopeId, currentMonth, t]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  useAppEvent(appEvents.transactionSaved, () => {
    void loadAnalytics();
  });
  useAppEvent(appEvents.budgetSaved, () => {
    void loadAnalytics();
  });

  const handleMonthChange = (newMonthDate: string) => {
    const norm = `${newMonthDate.substring(0, 7)}-01`;
    setCurrentMonth(norm);
    setSearchParams({ month: norm }, { replace: true });
  };

  const handlePrevMonth = () => {
    const [year, month] = currentMonth.split("-").map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const yStr = prevDate.getFullYear();
    const mStr = String(prevDate.getMonth() + 1).padStart(2, "0");
    handleMonthChange(`${yStr}-${mStr}-01`);
  };

  const handleNextMonth = () => {
    const [year, month] = currentMonth.split("-").map(Number);
    const nextDate = new Date(year, month, 1);
    const yStr = nextDate.getFullYear();
    const mStr = String(nextDate.getMonth() + 1).padStart(2, "0");
    handleMonthChange(`${yStr}-${mStr}-01`);
  };

  const handleArchive = async () => {
    if (!envelopeId) return;
    setActionLoading(true);
    try {
      await updateEnvelope(envelopeId, {
        name: data?.envelope.name ?? "Amplop",
        isArchived: true,
      });
      setShowArchiveDialog(false);
      navigate("/settings/categories");
    } catch (err: any) {
      setError(err.message || (t("categories.archiveEnvFailed") || "Gagal mengarsipkan amplop."));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!envelopeId) return;
    setActionLoading(true);
    try {
      const { success, error: delErr } = await deleteEnvelope(envelopeId);
      if (!success && delErr) throw delErr;
      setShowDeleteDialog(false);
      navigate("/settings/categories");
    } catch (err: any) {
      setError(err.message || (t("categories.deleteEnvFailed") || "Gagal menghapus amplop."));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="mx-auto grid w-full max-w-4xl gap-5 p-4 md:p-6 animate-pulse">
        <div className="h-6 w-32 rounded-full bg-slate-200" />
        <div className="h-28 rounded-2xl bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="h-20 rounded-xl bg-slate-200" />
          <div className="h-20 rounded-xl bg-slate-200" />
          <div className="h-20 rounded-xl bg-slate-200" />
        </div>
        <div className="h-44 rounded-2xl bg-slate-200" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto grid w-full max-w-4xl gap-5 p-4 md:p-6">
        <Link
          to="/settings/categories"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 transition hover:text-kash-emerald"
        >
          <ArrowLeft size={16} />
          {t("categories.backToCategoriesAndEnvelopes") || "Kembali ke Kategori & Amplop"}
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto text-kash-expense mb-3" size={36} />
          <h2 className="text-base font-black text-slate-900">{error || (t("categories.envelopeNotFound") || "Amplop Tidak Ditemukan")}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            {t("categories.envelopeNotFoundDesc") || "Amplop yang Anda cari mungkin telah dihapus atau tidak tersedia."}
          </p>
          <Button onClick={() => navigate("/settings/categories")} className="mt-4">
            {t("categories.backToEnvelopeList") || "Kembali ke Daftar Amplop"}
          </Button>
        </div>
      </div>
    );
  }

  const { envelope, totalSpent, transactionCount, categoryBreakdown, transactions, activeBudget } = data;
  const IconComp = getCategoryIcon(envelope.icon || "layers");
  const envelopeColor = envelope.color || "#4F7DF3";
  const topCategory = categoryBreakdown[0] || null;

  return (
    <div className="w-full min-w-0 space-y-4">
      {/* Top Breadcrumb, Month Selector & Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/settings/categories"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 transition hover:text-kash-emerald"
        >
          <ArrowLeft size={16} />
          {t("categories.backToCategoriesAndEnvelopes") || "Kembali ke Kategori & Amplop"}
        </Link>

        {/* Month Navigator Controls */}
        <div className="flex items-center justify-between sm:justify-end gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-kash-emeraldDark"
            title={t("common.prevMonth") || "Bulan Sebelumnya"}
          >
            <ChevronLeft size={16} />
          </button>

          <div className="w-44">
            <DatePickerField
              id="envelope-period-picker"
              value={currentMonth}
              onChange={(newVal) => handleMonthChange(newVal)}
            />
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-kash-emeraldDark"
            title={t("common.nextMonth") || "Bulan Berikutnya"}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Main Header Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-md text-xl"
              style={{ backgroundColor: envelopeColor }}
            >
              <IconComp aria-hidden="true" size={28} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-extrabold text-blue-700 border border-blue-200/60">
                  {t("nav.envelopes") || "Amplop Pengeluaran"}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  {t("common.period") || "Periode"}: {currentMonthLabel}
                </span>
              </div>
              <h1 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl truncate">
                {envelope.name}
              </h1>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                {envelope.note || (t("categories.envelopeDefaultNote") || "Pengelompokan tujuan pengeluaran mandiri lintas kategori.")}
              </p>
            </div>
          </div>

          {/* Envelope Action Buttons */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            <EntityMoreActionsMenu
              triggerVariant="default"
              ariaLabel={`Opsi amplop ${envelope.name}`}
              items={[
                {
                  label: t("common.edit") || "Edit",
                  icon: Edit3,
                  onClick: () => setShowEditModal(true),
                },
                {
                  label: envelope.is_archived
                    ? (t("common.unarchive") || "Keluarkan dari Arsip")
                    : (t("common.archive") || "Arsipkan"),
                  icon: Archive,
                  onClick: () => setShowArchiveDialog(true),
                },
                {
                  label: t("common.delete") || "Hapus",
                  icon: Trash2,
                  isDestructive: true,
                  separatorBefore: true,
                  onClick: () => setShowDeleteDialog(true),
                },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Active Budget Relationship Banner */}
      {activeBudget ? (
        <section className="rounded-2xl border border-kash-emerald/30 bg-kash-selected/40 p-4 sm:p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Target size={16} className="text-kash-emeraldDark" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-kash-emeraldDark">
                  {t("budgets.activeBudgetThisMonth") || "Target Budget Aktif Bulan Ini"}
                </span>
                {activeBudget.status === "over_budget" ? (
                  <span className="rounded-full bg-kash-expense/15 px-2 py-0.5 text-[10px] font-extrabold text-kash-expense">
                    {t("budgets.overBudget") || "Over Budget"}
                  </span>
                ) : activeBudget.status === "near_limit" ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
                    {t("budgets.nearLimit") || "Hampir Batas"}
                  </span>
                ) : (
                  <span className="rounded-full bg-kash-emerald/15 px-2 py-0.5 text-[10px] font-extrabold text-kash-emeraldDark">
                    {t("budgets.healthy") || "Aman"}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm font-bold text-slate-900">
                {t("budgets.budgetSummaryLine", {
                  budget: formatCurrency(activeBudget.effective_budget),
                  spent: formatCurrency(activeBudget.spent),
                  percent: activeBudget.usage_percentage.toFixed(1),
                  remaining: formatCurrency(activeBudget.remaining),
                }) || `Budget: ${formatCurrency(activeBudget.effective_budget)} • Terpakai: ${formatCurrency(activeBudget.spent)} (${activeBudget.usage_percentage.toFixed(1)}%) • Sisa: ${formatCurrency(activeBudget.remaining)}`}
              </p>
            </div>

            <Link
              to={`/budgets/${activeBudget.budget_id}?month=${currentMonth}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-kash-emerald px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-kash-emeraldDark self-start sm:self-center"
            >
              {t("budgets.viewBudgetDetail") || "Lihat Detail Budget →"}
            </Link>
          </div>

          {/* Budget Progress Bar */}
          <div className="mt-3.5">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200/70">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  activeBudget.status === "over_budget"
                    ? "bg-kash-expense"
                    : activeBudget.status === "near_limit"
                    ? "bg-amber-500"
                    : "bg-kash-emerald"
                }`}
                style={{ width: `${Math.min(Math.max(activeBudget.usage_percentage, 0), 100)}%` }}
              />
            </div>
          </div>
        </section>
      ) : (
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-xs">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
              {t("budgets.monthlyBudgetTarget") || "Target Budget Bulanan"}
            </p>
            <p className="text-xs font-semibold text-slate-700 mt-0.5">
              {t("budgets.noBudgetForEnvelopeInMonth", { month: currentMonthLabel }) || `Amplop ini belum memiliki target budget di ${currentMonthLabel}. Anda tetap dapat memantau realisasi dan rincian kategori secara independen.`}
            </p>
          </div>
          <Button
            onClick={() => setShowCreateBudgetModal(true)}
            className="gap-1.5 min-h-9 px-3 text-xs self-start sm:self-center shrink-0"
          >
            <Plus size={14} />
            {t("budgets.createEnvelopeBudget") || "Buat Budget Amplop"}
          </Button>
        </section>
      )}

      {/* Metrics Row */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-normal text-slate-600">
            {t("categories.totalEnvelopeExpenses") || "Total Pengeluaran Amplop"}
          </span>
          <p className="mt-1.5 text-xl font-black text-slate-900">
            {formatCurrency(totalSpent)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-normal text-slate-600">
            {t("categories.transactionCount") || "Jumlah Transaksi"}
          </span>
          <p className="mt-1.5 text-xl font-black text-slate-900">
            {transactionCount} {t("categories.transactions") || "transaksi"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-normal text-slate-600">
            {t("categories.topCategory") || "Kategori Terbesar"}
          </span>
          <p className="mt-1.5 text-base font-black text-slate-900 truncate">
            {topCategory ? `${topCategory.categoryName} (${topCategory.percentage.toFixed(1)}%)` : "—"}
          </p>
        </div>
      </section>

      {/* Dynamic Category Breakdown & Visual Distribution Bar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <PieChart size={18} className="text-kash-emerald" />
            <h2 className="text-base font-extrabold text-slate-900">
              {t("categories.categoryDistributionInEnvelope") || "Distribusi Kategori dalam Amplop Ini"}
            </h2>
          </div>
          <span className="text-xs font-bold text-slate-600">
            {categoryBreakdown.length} {t("categories.categoriesInvolved") || "Kategori Terlibat"}
          </span>
        </div>

        {categoryBreakdown.length === 0 ? (
          <div className="py-8 text-center text-xs font-semibold text-slate-500">
            {t("categories.noEnvelopeExpensesRecordedInMonth", { month: currentMonthLabel }) || `Belum ada transaksi pengeluaran yang dicatat pada amplop ini di ${currentMonthLabel}.`}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Visual Multi-color Stacked Bar */}
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100 shadow-inner">
              {categoryBreakdown.map((item) => (
                <div
                  key={item.categoryId}
                  style={{
                    width: `${item.percentage}%`,
                    backgroundColor: item.categoryColor || "#10B981",
                  }}
                  className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                  title={`${item.categoryName}: ${formatCurrency(item.totalSpent)} (${item.percentage.toFixed(1)}%)`}
                />
              ))}
            </div>

            {/* Category Breakdown Table / List */}
            <div className="divide-y divide-slate-100">
              {categoryBreakdown.map((item) => {
                const ItemIcon = getCategoryIcon(item.categoryIcon || "tag");
                const color = item.categoryColor || "#10B981";

                return (
                  <div key={item.categoryId} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-2xs text-sm"
                        style={{ backgroundColor: color }}
                      >
                        <ItemIcon size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-slate-900 truncate">
                          {item.categoryName}
                        </p>
                        <p className="text-[11px] font-semibold text-slate-500">
                          {item.transactionCount} {t("categories.transactions") || "transaksi"}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-black text-slate-900">
                        {formatCurrency(item.totalSpent)}
                      </p>
                      <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-700">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Transaction History Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <ReceiptText size={18} className="text-kash-emerald" />
            <h2 className="text-base font-extrabold text-slate-900">
              {t("categories.envelopeTransactionHistory") || "Riwayat Transaksi Amplop"} ({transactions.length})
            </h2>
          </div>
          <span className="text-xs font-bold text-slate-600">
            {t("common.total")}: {formatCurrency(totalSpent)}
          </span>
        </div>

        {transactions.length === 0 ? (
          <div className="py-10 text-center text-xs font-semibold text-slate-600">
            {t("categories.noTransactionsTaggedInMonth", { month: currentMonthLabel }) || `Belum ada transaksi yang ditandai dengan amplop ini pada ${currentMonthLabel}.`}
          </div>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {transactions.map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between py-3">
                <div className="min-w-0 pr-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {tx.title || tx.category?.name || (t("transactions.transaction") || "Transaksi")}
                    </p>
                    {tx.category?.name && (
                      <span
                        className="rounded-md px-2 py-0.5 text-[10px] font-extrabold text-white"
                        style={{ backgroundColor: tx.category?.color || "#10B981" }}
                      >
                        {tx.category.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-600">
                    {formatDate(new Date(tx.transaction_date))}{" "}
                    • {(tx as any).wallet?.name || (t("wallets.walletFallback") || "Dompet")}
                    {tx.note ? ` — "${tx.note}"` : ""}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <span className="text-sm font-extrabold text-kash-expense">
                    -{formatCurrency(tx.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Edit Envelope Modal */}
      <QuickCreateEnvelopeModal
        isOpen={showEditModal}
        envelopeToEdit={envelope}
        onClose={() => setShowEditModal(false)}
        onCreated={() => {
          setShowEditModal(false);
          void loadAnalytics();
        }}
      />

      {/* Create Budget Modal with envelope preselected */}
      {showCreateBudgetModal && (
        <CreateBudgetModal
          initialMonth={currentMonth}
          onClose={() => setShowCreateBudgetModal(false)}
          onSaved={() => {
            setShowCreateBudgetModal(false);
            void loadAnalytics();
          }}
        />
      )}

      {/* Archive Confirmation Dialog */}
      {showArchiveDialog && (
        <ConfirmationDialog
          confirmLabel={t("categories.archiveEnvelopeConfirm") || "Arsipkan Amplop"}
          description={t("categories.archiveEnvelopeDesc") || "Amplop ini akan disembunyikan dari pilihan transaksi baru tetapi seluruh riwayat transaksi masa lalu tetap tersimpan utuh."}
          icon={Archive}
          isLoading={actionLoading}
          onCancel={() => setShowArchiveDialog(false)}
          onConfirm={handleArchive}
          title={t("categories.archiveItemTitle", { name: envelope.name }) || `Arsipkan ${envelope.name}?`}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <ConfirmationDialog
          confirmLabel={t("common.deletePermanently") || "Hapus Permanen"}
          description={t("categories.deleteEnvelopeDefDesc") || "Amplop ini akan dihapus secara permanen. Transaksi yang sebelumnya menggunakan amplop ini tetap ada namun tidak lagi terikat pada amplop ini."}
          icon={Trash2}
          isLoading={actionLoading}
          onCancel={() => setShowDeleteDialog(false)}
          onConfirm={handleDelete}
          title={t("categories.deleteItemTitle", { name: envelope.name }) || `Hapus ${envelope.name}?`}
          tone="danger"
        />
      )}
    </div>
  );
}

export default EnvelopeDetailPage;
