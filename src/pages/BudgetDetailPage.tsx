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
  ReceiptText,
  Scale,
  Tag,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EditBudgetModal } from "../components/budgets/EditBudgetModal";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { DatePickerField } from "../components/ui/DatePickerField";
import { IconButton } from "../components/ui/IconButton";
import { PageHeader } from "../components/ui/PageHeader";
import { useAppEvent } from "../hooks/useAppEvent";
import { appEvents } from "../lib/appEvents";
import { archiveBudget, deleteBudget, getBudgetDetail, getBudgetMatchingTransactions } from "../lib/budgets";
import { formatCurrency } from "../lib/money";
import type { BudgetWithProgress, Transaction } from "../types/domain";

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function formatMonthYearLabel(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month] = dateStr.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function BudgetDetailPage() {
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
      const bData = await getBudgetDetail(budgetId, currentMonth);
      setBudget(bData);
      if (bData) {
        const txList = await getBudgetMatchingTransactions(
          budgetId,
          currentMonth,
          bData.included_category_ids,
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
  }, [budgetId, currentMonth]);

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
          <h2 className="text-lg font-black text-slate-900">Budget Tidak Ditemukan</h2>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            Budget ini tidak aktif pada bulan yang dipilih atau telah dihapus.
          </p>
          <Button onClick={() => navigate("/budgets")} className="mt-4">
            Kembali ke Daftar Budget
          </Button>
        </div>
      </div>
    );
  }

  const isEnvelope = budget.type === "envelope";
  const isOverBudget = budget.status === "over_budget";
  const isNearLimit = budget.status === "near_limit";
  const progressPercent = Math.min(Math.max(budget.usage_percentage, 0), 100);

  const progressBarColor = isOverBudget
    ? "bg-kash-expense"
    : isNearLimit
    ? "bg-amber-500"
    : "bg-kash-emerald";

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5 p-4 md:p-6">
      {/* Top Breadcrumb, Month Selector & Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to={`/budgets?month=${currentMonth}`}
          className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-600 transition hover:text-kash-emeraldDark"
        >
          <ArrowLeft size={16} />
          Kembali ke Budgets
        </Link>

        {/* Month Selector Bar */}
        <div className="flex items-center justify-between gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-xs">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Bulan Sebelumnya"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center gap-1.5 px-1.5 text-xs font-extrabold text-slate-800">
            <Calendar size={14} className="text-kash-emerald" />
            <span>{formatMonthYearLabel(currentMonth)}</span>
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Bulan Berikutnya"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowEditModal(true)}
            className="gap-1.5 min-h-9 px-3 py-1.5 text-xs font-extrabold"
          >
            <Edit2 size={14} />
            Edit Budget
          </Button>

          <Button
            variant="secondary"
            onClick={() => setShowArchiveDialog(true)}
            className="gap-1.5 min-h-9 px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:text-amber-800"
          >
            <Archive size={14} />
            Hentikan / Arsipkan
          </Button>

          <IconButton
            icon={Trash2}
            label="Hapus Permanen"
            onClick={() => setShowDeleteDialog(true)}
            className="text-slate-600 hover:text-kash-expense"
          />
        </div>
      </div>

      {/* Main Budget Card Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-slate-100 pb-5">
          <div className="flex items-start gap-3.5">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-xs font-black text-base"
              style={{
                backgroundColor: isEnvelope
                  ? "#047857"
                  : budget.category_color || "#10B981",
              }}
            >
              {isEnvelope ? <Layers size={22} /> : <Tag size={22} />}
            </span>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900">{budget.name}</h1>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-extrabold text-slate-600">
                  {isEnvelope ? "Amplop Belanja" : "Budget Kategori"}
                </span>
              </div>

              <p className="mt-1 text-xs font-semibold text-slate-600">
                {budget.note || "Tidak ada catatan."}
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <div>
            {isOverBudget ? (
              <span className="flex items-center gap-1.5 rounded-full bg-kash-expense/15 px-3 py-1 text-xs font-black text-kash-expense">
                <AlertCircle size={14} />
                Over Budget ({budget.usage_percentage.toFixed(1)}%)
              </span>
            ) : isNearLimit ? (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                <AlertCircle size={14} />
                Mendekati Batas ({budget.usage_percentage.toFixed(1)}%)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-kash-selected px-3 py-1 text-xs font-black text-kash-emeraldDark">
                <CheckCircle2 size={14} />
                Aman ({budget.usage_percentage.toFixed(1)}%)
              </span>
            )}
          </div>
        </div>

        {/* Financial Breakdown Grid */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
          <div className="rounded-xl bg-slate-50 p-3">
            <span className="font-bold text-slate-600">Base Budget</span>
            <p className="mt-0.5 text-sm font-black text-slate-900">
              {formatCurrency(budget.base_amount)}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <span className="font-bold text-slate-600">Rollover Masuk</span>
            <p className="mt-0.5 text-sm font-black text-amber-800">
              +{formatCurrency(budget.rollover_amount)}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <span className="font-bold text-slate-600">Total Efektif</span>
            <p className="mt-0.5 text-sm font-black text-slate-900">
              {formatCurrency(budget.effective_budget)}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <span className="font-bold text-slate-600">
              {Number(budget.remaining) < 0 ? "Kelebihan" : "Sisa Budget"}
            </span>
            <p
              className={`mt-0.5 text-sm font-black ${
                Number(budget.remaining) < 0 ? "text-kash-expense" : "text-kash-emeraldDark"
              }`}
            >
              {formatCurrency(Math.abs(Number(budget.remaining)))}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-5">
          <div className="h-3.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-300 ${progressBarColor}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Terpakai: {formatCurrency(budget.spent)}</span>
            <span>{budget.usage_percentage.toFixed(1)}%</span>
          </div>
        </div>

        {/* Included Categories Pill List */}
        <div className="mt-5 border-t border-slate-100 pt-4">
          <span className="text-xs font-extrabold uppercase text-slate-600">
            Kategori Terkait dalam Periode Ini
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {budget.included_category_names?.map((name, i) => (
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
      </div>

      {/* Matching Transactions Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <ReceiptText size={18} className="text-kash-emerald" />
            <h2 className="text-base font-extrabold text-slate-900">
              Transaksi Pengeluaran Bulan Ini ({transactions.length})
            </h2>
          </div>
          <span className="text-xs font-bold text-slate-600">
            Total: {formatCurrency(budget.spent)}
          </span>
        </div>

        {transactions.length === 0 ? (
          <div className="py-10 text-center text-xs font-semibold text-slate-600">
            Belum ada transaksi pengeluaran pada kategori ini untuk bulan terpilih.
          </div>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {tx.title || (tx as any).category?.name || "Pengeluaran"}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-600">
                    {new Date(tx.transaction_date).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    &bull; {(tx as any).wallet?.name || "Dompet"}
                  </p>
                </div>

                <span className="text-sm font-black text-kash-expense">
                  -{formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

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
          title="Hentikan Budget Ini?"
          description="Budget ini tidak akan muncul lagi di bulan-bulan berikutnya. Riwayat dan perhitungan transaksi di bulan-bulan sebelumnya akan tetap tersimpan aman."
          confirmLabel={actionLoading ? "Memproses..." : "Ya, Hentikan"}
          isLoading={actionLoading}
          tone="warning"
          onConfirm={() => void handleArchive()}
          onCancel={() => setShowArchiveDialog(false)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <ConfirmationDialog
          title="Hapus Budget Permanen?"
          description="Apakah Anda yakin ingin menghapus definisi budget ini secara permanen? Transaksi Anda tidak akan terhapus."
          confirmLabel={actionLoading ? "Menghapus..." : "Hapus Permanen"}
          isLoading={actionLoading}
          tone="danger"
          onConfirm={() => void handleDelete()}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}
    </div>
  );
}
