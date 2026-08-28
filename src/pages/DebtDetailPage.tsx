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
import { EntityMoreActionsMenu } from "../components/ui/EntityMoreActionsMenu";
import { FormField } from "../components/ui/FormField";
import { IconButton } from "../components/ui/IconButton";
import { Modal } from "../components/ui/Modal";
import { FinancialHeroCard } from "../components/ui/FinancialHeroCard";
import { SelectField } from "../components/ui/SelectField";
import { useI18n } from "../i18n";
import { useAppEvent } from "../hooks/useAppEvent";
import { appEvents, emitDebtSaved, emitTransactionSaved } from "../lib/appEvents";
import {
  createDebt,
  createMultipleDebts,
  deleteOrCancelDebt,
  getCounterpartyDetail,
  recordCounterpartySettlement,
  renameCounterparty,
  updateDebt,
  type CounterpartyDetail,
  type CounterpartyWithSummary,
  type DebtPaymentWithMeta,
} from "../lib/debts";
import { formatCurrency, formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../lib/money";
import { getWallets, type WalletWithBalance } from "../lib/wallets";
import type { Counterparty, Debt, DebtProgress, DebtType, PaymentMode } from "../types/domain";
import { SettlementModal } from "./DebtsPage";
import { getPersonalSpace } from "../lib/spaces";
import { recordCrossSpaceSettlement } from "../lib/transactions";
import { supabase } from "../lib/supabase";
import { useActiveSpace } from "../context/ActiveSpaceContext";

type ActiveTab = "active" | "settled" | "history";

export function DebtDetailPage() {
  const { counterpartyId } = useParams<{ counterpartyId: string }>();
  const navigate = useNavigate();
  const { t, formatDate, formatCurrency } = useI18n();

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CounterpartyDetail | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("active");

  const [settlementTarget, setSettlementTarget] = useState<DebtType | null>(null);
  const [settlingItem, setSettlingItem] = useState<DebtProgress | null>(null);
  const [createItemModalOpen, setCreateItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DebtProgress | null>(null);
  const [deletingItem, setDeletingItem] = useState<DebtProgress | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);

  // Must be called unconditionally (before any early returns)
  const { activeSpace, userRole } = useActiveSpace();
  // Only Owner/Admin may settle Managed cross-space reimbursement Payables.
  const isManagedSpace = activeSpace?.space_type === "managed";
  const canSettleCrossSpace = !isManagedSpace || userRole === "owner" || userRole === "admin";

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
      <div className="w-full min-w-0 space-y-6 pb-20 pt-4 md:pb-8">
        <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white p-6" />
        <div className="h-44 animate-pulse rounded-xl border border-slate-200 bg-white p-6" />
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white p-6" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="w-full min-w-0 space-y-6 pb-20 pt-4 text-center md:pb-8">
        <div className="rounded-xl border border-slate-200 bg-white py-16 p-6 shadow-sm">
          <h2 className="text-xl font-extrabold text-slate-900">{t("debts.counterpartyNotFound") || "Pihak Terkait Tidak Ditemukan"}</h2>
          <p className="mt-2 text-sm text-slate-600">{t("debts.counterpartyNotFoundDesc") || "Orang atau pihak terkait yang diminta tidak tersedia."}</p>
          <div className="mt-6">
            <Link to="/debts">
              <Button variant="secondary">
                <ArrowLeft size={16} />
                {t("debts.backToDebts") || "Kembali ke Utang & Piutang"}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { counterparty, debts, payments, summary } = detail;
  const activeItems = debts.filter((d) => (d.status === "active" || d.status === "partially_paid") && Number(d.remaining_amount) > 0);
  const settledItems = debts.filter((d) => d.status === "settled" || d.status === "cancelled");
  const isCrossSpacePayable = (counterparty as any).linked_space?.space_type === "personal" || debts.some((d) => d.cross_space_event_id && d.cross_space_role === "managed_payable");

  const counterpartySummary: CounterpartyWithSummary = {
    ...counterparty,
    debtTotal: summary.totalDebtRemaining,
    debtOriginalTotal: summary.totalDebtOriginal,
    debtPaidTotal: summary.totalDebtPaid,
    receivableTotal: summary.totalReceivableRemaining,
    receivableOriginalTotal: summary.totalReceivableOriginal,
    receivablePaidTotal: summary.totalReceivablePaid,
    activeDebtCount: summary.activeDebtCount,
    activeReceivableCount: summary.activeReceivableCount,
    settledDebtCount: summary.settledDebtCount,
    settledReceivableCount: summary.settledReceivableCount,
    totalItemCount: debts.length,
  };
  const counterpartySummaryObject = counterpartySummary;

  const activeDebtItems = debts.filter((d) => d.type === "debt" && (d.status === "active" || d.status === "partially_paid") && Number(d.remaining_amount) > 0);
  const activeReceivableItems = debts.filter((d) => d.type === "receivable" && (d.status === "active" || d.status === "partially_paid") && Number(d.remaining_amount) > 0);

  const activeDebtOriginal = activeDebtItems.reduce((sum, d) => sum + (Number(d.original_amount) || 0), 0);
  const activeDebtPaid = activeDebtItems.reduce((sum, d) => sum + (Number(d.total_paid) || 0), 0);

  const activeReceivableOriginal = activeReceivableItems.reduce((sum, d) => sum + (Number(d.original_amount) || 0), 0);
  const activeReceivablePaid = activeReceivableItems.reduce((sum, d) => sum + (Number(d.total_paid) || 0), 0);

  const displayTotalDebtOriginal = activeDebtOriginal;
  const displayTotalDebtPaid = activeDebtPaid;

  const displayTotalReceivableOriginal = activeReceivableOriginal;
  const displayTotalReceivablePaid = activeReceivablePaid;

  return (
    <div className="w-full min-w-0 space-y-4">
      {/* Navigation Link */}
      <div>
        <Link
          to="/debts"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 transition hover:text-kash-emeraldDark"
        >
          <ArrowLeft size={14} />
          {t("debts.backToDebts") || "Kembali ke Utang & Piutang"}
        </Link>
      </div>

      {/* Main Single Emerald Hero Card */}
      <FinancialHeroCard
        icon={<User size={22} />}
        eyebrow={summary.totalDebtRemaining > 0 ? (t("debts.totalDebt") || "Utang") : (t("debts.totalReceivable") || "Piutang")}
        title={counterparty.name}
        badge={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-extrabold text-white border border-white/15 backdrop-blur-xs">
              {summary.totalDebtRemaining === 0 && summary.totalReceivableRemaining === 0 ? (
                <>
                  <CheckCircle2 size={13} /> {t("debts.settled") || "Lunas"}
                </>
              ) : (
                <>
                  <Clock size={13} /> {t("common.active") || "Belum Lunas"}
                </>
              )}
            </span>
            <EntityMoreActionsMenu
              triggerVariant="hero"
              ariaLabel={`Opsi ${counterparty.name}`}
              items={[
                {
                  label: t("debts.renamePerson") || "Ubah Nama",
                  icon: Edit2,
                  onClick: () => setRenameModalOpen(true),
                },
              ]}
            />
          </div>
        }
        primaryMetricLabel={summary.totalDebtRemaining > 0 ? (t("debts.remainingDebt") || "Sisa Utang") : (t("debts.remainingReceivable") || "Sisa Piutang")}
        primaryMetricValue={formatCurrency(summary.totalDebtRemaining > 0 ? summary.totalDebtRemaining : summary.totalReceivableRemaining, "IDR")}
        supportingMetrics={
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs font-semibold text-white/90">
            <div>
              <span className="text-white/60 font-semibold">{t("debts.totalOriginalDebt") || "Total Utang Awal"}</span>
              <p className="mt-0.5 text-sm font-extrabold text-white">
                {formatCurrency(displayTotalDebtOriginal, "IDR")}
              </p>
            </div>
            <div>
              <span className="text-white/60 font-semibold">{t("debts.paidAmount") || "Utang Terbayar"}</span>
              <p className="mt-0.5 text-sm font-extrabold text-white">
                {formatCurrency(displayTotalDebtPaid, "IDR")}
              </p>
            </div>
            <div>
              <span className="text-white/60 font-semibold">{t("debts.totalOriginalReceivable") || "Total Piutang Awal"}</span>
              <p className="mt-0.5 text-sm font-extrabold text-white">
                {formatCurrency(displayTotalReceivableOriginal, "IDR")}
              </p>
            </div>
            <div>
              <span className="text-white/60 font-semibold">{t("debts.collectedAmount") || "Piutang Diterima"}</span>
              <p className="mt-0.5 text-sm font-extrabold text-white">
                {formatCurrency(displayTotalReceivablePaid, "IDR")}
              </p>
            </div>
          </div>
        }
      />

      {/* Primary Actions Row Below Hero - Single Horizontal Scrollable Row Aligned Left */}
      <div className="flex flex-nowrap items-center justify-start gap-2 overflow-x-auto max-w-full py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {summary.totalDebtRemaining > 0 && canSettleCrossSpace && !isCrossSpacePayable && (
          <Button
            type="button"
            onClick={() => setSettlementTarget("debt")}
            className="shrink-0 whitespace-nowrap gap-1.5 min-h-9 px-3.5 py-1.5 text-xs font-extrabold"
          >
            <ArrowUpRight size={15} />
            {t("debts.pay") || "Bayar Utang"}
          </Button>
        )}
        {summary.totalReceivableRemaining > 0 && (
          <Button
            type="button"
            onClick={() => setSettlementTarget("receivable")}
            className="shrink-0 whitespace-nowrap gap-1.5 min-h-9 px-3.5 py-1.5 text-xs font-extrabold"
          >
            <ArrowDownLeft size={15} />
            {t("debts.collect") || "Terima Piutang"}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setCreateItemModalOpen(true)}
          className="shrink-0 whitespace-nowrap gap-1.5 min-h-9 px-3.5 py-1.5 text-xs font-extrabold text-slate-700"
        >
          <Plus size={15} />
          {t("debts.addItem") || "Tambah Item"}
        </Button>
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
          {t("debts.tabActiveItems") || "Item Aktif"} ({activeItems.length})
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
          {t("debts.tabSettledItems") || "Item Lunas"} ({settledItems.length})
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
          {t("debts.tabSettlementHistory") || "Riwayat Pelunasan"} ({payments.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "active" && (
        <div className="space-y-3">
          {activeItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
              <CheckCircle2 className="mx-auto text-kash-emerald" size={32} />
              <p className="mt-3 text-sm font-bold text-slate-900">{t("debts.noActiveObligations") || "Tidak ada kewajiban aktif"}</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">{t("debts.noActiveObligationsDesc") || "Semua item utang dan piutang telah lunas atau dibatalkan."}</p>
            </div>
          ) : (
            activeItems.map((item) => (
              <ItemCard
                key={item.debt_id}
                item={item}
                onSettle={
                  // Cross-space Managed Payables: only owner/admin may settle
                  item.cross_space_role === "managed_payable"
                    ? (canSettleCrossSpace ? () => setSettlingItem(item) : undefined)
                    : () => setSettlingItem(item)
                }
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
              <p className="text-sm font-bold text-slate-900">{t("debts.noSettledItemsYet") || "Belum ada item lunas"}</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">{t("debts.noSettledItemsYetDesc") || "Kewajiban yang selesai dan dibatalkan akan muncul di sini."}</p>
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
              <p className="mt-3 text-sm font-bold text-slate-900">{t("debts.noSettlementHistory") || "Belum ada riwayat pelunasan"}</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">{t("debts.noSettlementHistoryDesc") || "Catatan pembayaran dan penerimaan akan tercantum di sini."}</p>
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

      {settlingItem && (
        settlingItem.cross_space_event_id ? (
          <CrossSpaceItemSettlementModal
            counterparty={counterparty}
            item={settlingItem}
            onClose={() => setSettlingItem(null)}
            onSaved={() => {
              setSettlingItem(null);
              emitDebtSaved();
              emitTransactionSaved();
            }}
          />
        ) : (
          <ItemSettlementModal
            counterparty={counterparty}
            item={settlingItem}
            onClose={() => setSettlingItem(null)}
            onSaved={() => {
              setSettlingItem(null);
              emitDebtSaved();
              emitTransactionSaved();
            }}
          />
        )
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
          title={toNumber(deletingItem.total_paid) > 0 ? (t("debts.cancelObligation") || "Batalkan Kewajiban") : (t("debts.deleteObligation") || "Hapus Kewajiban")}
          description={
            toNumber(deletingItem.total_paid) > 0
              ? (t("debts.cancelObligationDesc") || "Item ini sudah memiliki alokasi pembayaran. Membatalkannya akan menandai sisa yang belum dibayar sebagai dihapuskan sambil tetap mempertahankan audit riwayat pembayaran.")
              : (t("debts.deleteObligationDesc") || "Apakah Anda yakin ingin menghapus kewajiban ini? Tindakan ini tidak dapat dibatalkan.")
          }
          confirmLabel={toNumber(deletingItem.total_paid) > 0 ? (t("debts.cancelObligation") || "Batalkan Kewajiban") : (t("common.delete") || "Hapus")}
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
  onSettle,
  onEdit,
  onDelete,
}: {
  item: DebtProgress;
  onSettle?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t, formatDate, formatCurrency } = useI18n();
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
              {isDebt ? (t("debts.tabDebts") || "Utang") : (t("debts.tabReceivables") || "Piutang")}
            </span>
            <h4 className="truncate text-base font-extrabold text-slate-900">{item.title}</h4>
          </div>

          {item.note && <p className="mt-1 text-xs font-semibold text-slate-600">{item.note}</p>}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={t("common.edit")}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("common.delete")}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-kash-expense"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3">
        <div>
          <span className="text-[11px] font-bold uppercase text-slate-600">{t("debts.originalAmount") || "Nominal Awal"}</span>
          <p className="text-sm font-black text-slate-900">{formatCurrency(original, "IDR")}</p>
        </div>
        <div>
          <span className="text-[11px] font-bold uppercase text-slate-600">{t("debts.paidAmount") || "Terbayar"}</span>
          <p className="text-sm font-black text-slate-900">{formatCurrency(paid, "IDR")}</p>
        </div>
        <div>
          <span className="text-[11px] font-bold uppercase text-slate-600">{t("debts.remaining") || "Sisa"}</span>
          <p className={`text-sm font-black ${remaining > 0 ? "text-slate-900" : "text-kash-emeraldDark"}`}>
            {formatCurrency(remaining, "IDR")}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
          <span>{t("debts.settlementProgress") || "Kemajuan Pelunasan"}</span>
          <span>{percent.toFixed(0)}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full transition-all duration-300 ${isDebt ? "bg-kash-expense" : "bg-kash-emerald"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Due Date, Status Footer & Settle Item Action */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] font-semibold text-slate-600">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1">
            <CalendarDays size={13} />
            {item.due_date
              ? `${t("debts.due") || "Jatuh Tempo"}: ${formatDate(new Date(`${item.due_date}T00:00:00`))}`
              : (t("debts.noDueDate") || "Tanpa jatuh tempo")}
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
            {item.status === "settled"
              ? t("debts.settled")
              : item.status === "partially_paid"
                ? (t("debts.partiallyPaid") || "Sebagian Lunas")
                : item.status === "cancelled"
                  ? (t("debts.cancelled") || "Dibatalkan")
                  : t("common.active")}
          </span>
        </div>

        {onSettle && remaining > 0 && (item.status === "active" || item.status === "partially_paid") ? (
          <button
            type="button"
            onClick={onSettle}
            className="inline-flex items-center gap-1.5 rounded-lg border border-kash-emerald/30 bg-kash-emerald/10 px-3 py-1.5 text-xs font-black text-kash-emeraldDark transition hover:bg-kash-emerald hover:text-white"
          >
            <HandCoins size={14} />
            {item.cross_space_role === "managed_payable"
              ? (t("debts.reimburseThisItem") || "Reimburse Item Ini")
              : (isDebt ? (t("debts.payThisItem") || "Bayar Item Ini") : (t("debts.collectThisItem") || "Terima Item Ini"))}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PaymentHistoryCard({ payment }: { payment: DebtPaymentWithMeta }) {
  const { t, formatDate, formatCurrency } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const isDebt = payment.debt_type === "debt";
  const isWallet = payment.payment_mode === "wallet";

  const formattedDate = formatDate(new Date(payment.payment_date));

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
              {isDebt ? (t("debts.debtPayment") || "Pembayaran Utang") : (t("debts.receivableCollection") || "Penerimaan Piutang")}
            </span>

            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
              {isWallet ? `${t("wallets.walletFallback") || "Dompet"}: ${payment.wallet?.name ?? "KASH Wallet"}` : (t("debts.recordPreviousPaymentTab") || "Riwayat Lampau (Luar Dompet)")}
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
              <span>{payment.allocations.length} {t("debts.allocations") || "alokasi"}</span>
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* Allocation breakdown */}
      {expanded && payment.allocations.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-100 bg-white p-3 text-xs shadow-none">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{t("debts.allocationBreakdown") || "Rincian Alokasi"}</p>
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
  const { t, formatCurrency } = useI18n();
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
        setError(batchError.message ?? (t("debts.createItemsFailed") || "Gagal menambahkan item. Silakan coba lagi."));
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
      title={`${t("debts.addItemsFor") || "Tambah Item untuk"} ${counterparty.name}`}
      description={t("debts.recordOneOrMoreItems") || "Catat satu atau lebih item kewajiban di bawah nama ini."}
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setType("debt")}
              className={`rounded-md py-2.5 text-xs font-black transition ${
                type === "debt" ? "bg-kash-emerald text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t("debts.iOwe") || "Saya Berutang (Utang)"}
            </button>
            <button
              type="button"
              onClick={() => setType("receivable")}
              className={`rounded-md py-2.5 text-xs font-black transition ${
                type === "receivable" ? "bg-kash-emerald text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t("debts.owedToMe") || "Orang Berutang ke Saya (Piutang)"}
            </button>
          </div>

          {/* Items Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                {t("debts.itemsToAdd") || "Item yang Ditambahkan"} ({items.length})
              </span>
              <button
                type="button"
                onClick={addItemRow}
                className="inline-flex items-center gap-1 text-xs font-bold text-kash-emerald transition hover:text-kash-emeraldDark hover:underline"
              >
                <Plus size={14} />
                {t("debts.addAnotherItem") || "Tambah Item Lain"}
              </button>
            </div>

            {items.map((item, index) => (
              <div
                key={item.id}
                className="relative space-y-3 rounded-xl border border-slate-200 bg-white p-4 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-700">{t("debts.item") || "Item"} #{index + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItemRow(item.id)}
                      className="text-xs font-bold text-kash-expense transition hover:underline"
                    >
                      {t("common.remove") || "Hapus"}
                    </button>
                  )}
                </div>

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
                      className="mt-1.5 block h-11 w-full max-w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 transition placeholder:text-slate-600 focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      {t("debts.amount") || "Nominal"} (Rp) *
                    </label>
                    <input
                      inputMode="numeric"
                      type="text"
                      placeholder="0"
                      value={item.originalAmount}
                      onChange={(e) => updateItemRow(item.id, "originalAmount", e.target.value)}
                      className="mt-1.5 block h-11 w-full max-w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 transition placeholder:text-slate-600 focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
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
                          className="text-[11px] font-bold text-kash-emerald transition hover:text-kash-emeraldDark hover:underline"
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
                      className="mt-1.5 block h-11 w-full max-w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-kash-emerald focus:outline-none focus:ring-2 focus:ring-kash-emerald/20"
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
              {t("debts.addAnotherItem") || "Tambah Item Lain"}
            </button>
          </div>

          {/* Optional Wallet Movement */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
            <label className="flex cursor-pointer select-none items-start gap-3">
              <input
                type="checkbox"
                checked={linkWallet}
                onChange={(e) => {
                  setLinkWallet(e.target.checked);
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
                  id="item-obligation-wallet"
                  label={type === "debt" ? `${t("debts.destinationWallet") || "Dompet Tujuan Penerimaan"} *` : `${t("debts.sourceWallet") || "Dompet Asal Pembayaran"} *`}
                  value={selectedWalletId}
                  onChange={(e) => setSelectedWalletId(e.target.value)}
                  required
                >
                  <option value="">{t("wallets.selectWallet") || "Pilih Dompet"}</option>
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
              <span className="text-xs font-bold uppercase text-slate-600">{t("common.total") || "Total"}</span>
              <p className="text-xs font-semibold text-slate-600">{items.length} {t("debts.items") || "item"}</p>
            </div>
            <p className="text-xl font-black text-slate-900">
              {formatCurrency(totalAmountSum, "IDR")}
            </p>
          </div>

          <div className="mt-2">
            <Button disabled={saving} type="submit">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
              {t("debts.saveObligationItems", { count: items.length }) || `Simpan ${items.length} Item`}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
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
  const { t, formatCurrency } = useI18n();
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
      setError(t("debts.itemTitleRequiredDirect") || "Judul item wajib diisi.");
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
        setError(editError.message ?? (t("debts.updateItemFailed") || "Gagal memperbarui item. Silakan coba lagi."));
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
      title={t("debts.editObligationItem") || "Edit Item Kewajiban"}
      description={t("debts.updateItemMetadata") || "Perbarui data untuk item ini."}
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <FormField
            id="edit-item-title"
            label={`${t("debts.itemTitleLabel") || "Judul Item"} *`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          {hasAllocations ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="text-xs font-bold uppercase text-slate-600">{t("debts.originalAmountLocked") || "Nominal Awal (Terkunci)"}</span>
              <p className="mt-1 text-sm font-black text-slate-900">{formatCurrency(toNumber(item.original_amount), "IDR")}</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-600">
                {t("debts.amountLockedDesc") || "Nominal tidak dapat diubah karena alokasi pelunasan sudah tercatat."}
              </p>
            </div>
          ) : (
            <FormField
              id="edit-item-amount"
              inputMode="numeric"
              label={`${t("debts.originalAmount") || "Nominal Awal"} *`}
              value={originalAmount}
              onChange={(e) => setOriginalAmount(formatMoneyDigits(e.target.value))}
              required
            />
          )}

          {/* Due Date (Optional & Clearable with emerald styling) */}
          <div className="w-full max-w-full min-w-0">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-900" htmlFor="edit-item-due-date">
                {t("debts.dueDateOptional") || "Jatuh Tempo (Opsional)"}
              </label>
              {dueDate ? (
                <button
                  type="button"
                  onClick={() => setDueDate("")}
                  className="text-xs font-bold text-kash-emerald transition hover:text-kash-emeraldDark hover:underline"
                >
                  {t("debts.clearDueDate") || "Hapus jatuh tempo"}
                </button>
              ) : (
                <span className="text-xs font-semibold text-slate-600">{t("debts.noDueDate") || "Tanpa jatuh tempo"}</span>
              )}
            </div>
            <DatePickerField
              id="edit-item-due-date"
              value={dueDate}
              placeholder={t("debts.selectDueDate") || "Pilih Jatuh Tempo"}
              onChange={(val) => setDueDate(val)}
            />
          </div>

          <FormField
            id="edit-item-note"
            label={t("debts.noteOptional") || "Catatan (Opsional)"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="mt-2">
            <Button disabled={saving} type="submit">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
              {t("common.saveChanges") || "Simpan Perubahan"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
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
  const { t } = useI18n();
  const [name, setName] = useState(counterparty.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("debts.nameRequired") || "Nama wajib diisi.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: renameError } = await renameCounterparty(counterparty.id, name);
      if (renameError) {
        setError(renameError.message ?? (t("debts.renameFailed") || "Gagal mengubah nama kontak."));
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
      maxWidth="md"
      title={t("debts.renamePerson") || "Ubah Nama Kontak"}
      description={t("debts.updateDisplayName") || "Perbarui nama tampilan untuk pihak terkait ini."}
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <FormField
            id="rename-counterparty-name"
            label={`${t("debts.name") || "Nama"} *`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div className="mt-2">
            <Button disabled={saving} type="submit">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
              {t("common.save") || "Simpan Nama"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

function ItemSettlementModal({
  item,
  counterparty,
  onClose,
  onSaved,
}: {
  item: DebtProgress;
  counterparty: Counterparty;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, formatCurrency } = useI18n();
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("wallet");
  const remaining = toNumber(item.remaining_amount);
  const [amount, setAmount] = useState(() => formatMoneyDigits(remaining.toString()));
  const [walletId, setWalletId] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [note, setNote] = useState("");
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDebt = item.type === "debt";

  useEffect(() => {
    const fetchWallets = async () => {
      const { data } = await getWallets();
      if (data && data.length > 0) {
        setWallets(data);
      }
    };
    void fetchWallets();
  }, []);

  const parsedAmount = toNumber(parseMoneyInputDigits(amount));
  const remainingAfterPayment = Math.max(0, remaining - parsedAmount);
  const selectedWallet = wallets.find((w) => w.id === walletId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (parsedAmount <= 0) {
      setError(t("debts.amountGreaterThanZero") || "Nominal pelunasan harus lebih besar dari 0.");
      return;
    }
    if (parsedAmount > remaining) {
      setError(t("debts.amountExceedsItemBalance", { remaining: formatCurrency(remaining, "IDR") }) || `Nominal tidak boleh melebihi sisa tagihan item (${formatCurrency(remaining, "IDR")}).`);
      return;
    }
    if (paymentMode === "wallet" && !walletId) {
      setError(t("debts.selectWalletError") || "Pilih dompet untuk transaksi.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: settlementError } = await recordCounterpartySettlement({
        counterpartyId: counterparty.id,
        debtType: item.type,
        paymentMode,
        amount: parseMoneyInputDigits(amount),
        walletId: paymentMode === "wallet" ? walletId : null,
        paymentDate: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString(),
        note: note.trim() || undefined,
        debtId: item.debt_id,
      });

      if (settlementError) {
        setError(settlementError.message ?? (t("debts.itemSettlementFailed") || "Gagal memproses pelunasan item."));
        setSaving(false);
        return;
      }

      onSaved();
    } catch (err: any) {
      setError(err?.message ?? (t("common.errorOccurred") || "Terjadi kesalahan tidak terduga."));
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title={
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-kash-emerald/10 px-2 py-0.5 text-[11px] font-black uppercase text-kash-emeraldDark">
              {t("debts.perItemSettlement") || "Pelunasan Per Item"}
            </span>
          </div>
          <h2 className="mt-1 text-xl font-extrabold text-slate-900">
            {isDebt ? `${t("debts.payDebt") || "Bayar Utang"}: ${item.title}` : `${t("debts.collectReceivable") || "Terima Piutang"}: ${item.title}`}
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            {t("debts.contactPerson") || "Pihak"}: <span className="font-bold text-slate-900">{counterparty.name}</span> • {t("debts.remainingItemBill") || "Sisa Tagihan Item"}:{" "}
            <span className="font-bold text-slate-900">{formatCurrency(remaining, "IDR")}</span>
          </p>
        </div>
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
              {isDebt ? (t("debts.payFromWalletTab") || "Bayar Lewat Dompet") : (t("debts.receiveIntoWalletTab") || "Terima Masuk Dompet")}
            </button>
            <button
              type="button"
              onClick={() => setPaymentMode("historical")}
              className={`rounded-lg py-2.5 text-xs font-black transition ${
                paymentMode === "historical" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {isDebt ? (t("debts.recordPreviousPaymentTab") || "Catat Riwayat (Luar Dompet)") : (t("debts.recordPreviousCollectionTab") || "Catat Riwayat (Luar Dompet)")}
            </button>
          </div>

          {paymentMode === "historical" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs font-semibold text-blue-900">
              {t("debts.itemHistoricalDesc") || "Mencatat pembayaran yang sudah terjadi di luar aplikasi. Sisa utang item ini akan berkurang tanpa mengubah saldo dompet Anda."}
            </div>
          )}

          {/* Amount input & Quick Full Settlement shortcut */}
          <div className="w-full max-w-full min-w-0">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-900" htmlFor="item-settlement-amount">
                {t("debts.settlementAmountLabel") || "Nominal Pelunasan"} *
              </label>
              <button
                type="button"
                onClick={() => setAmount(formatMoneyDigits(remaining.toString()))}
                className="text-xs font-bold text-kash-emerald transition hover:text-kash-emeraldDark hover:underline"
              >
                {t("debts.payFull") || "Bayar Penuh"} ({formatCurrency(remaining, "IDR")})
              </button>
            </div>
            <input
              id="item-settlement-amount"
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
              id="item-settlement-wallet"
              label={isDebt ? `${t("debts.payFromWalletLabel") || "Bayar dari Dompet"} *` : `${t("debts.receiveIntoWalletLabel") || "Masuk ke Dompet"} *`}
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              required
            >
              <option value="">{t("wallets.selectWallet") || "Pilih Dompet"}</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({formatCurrency(w.balance?.current_balance ?? w.initial_balance, w.currency)})
                </option>
              ))}
            </SelectField>
          )}

          {/* Payment Date */}
          <DatePickerField
            id="item-settlement-date"
            label={`${t("debts.settlementDateLabel") || "Tanggal & Waktu Pelunasan"} *`}
            enableTime
            value={paymentDate}
            onChange={(val) => setPaymentDate(val)}
          />

          {/* Note */}
          <FormField
            id="item-settlement-note"
            label={t("debts.noteOptional") || "Catatan (Opsional)"}
            placeholder={t("debts.itemSettlementNotePlaceholder") || "misal: Transfer BCA, bukti lunas"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {/* Live Preview */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">{t("debts.itemSettlementSummary") || "Ringkasan Pelunasan Item"}</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">{t("debts.targetItem") || "Target Item:"}</span>
                <span className="font-black text-slate-900">{item.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">{t("debts.settlementAmountLabel") || "Nominal Pelunasan:"}</span>
                <span className="font-black text-slate-900">{formatCurrency(parsedAmount, "IDR")}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">{t("debts.walletEffect") || "Efek ke Dompet:"}</span>
                <span className="font-black text-slate-900">
                  {paymentMode === "historical"
                    ? (t("debts.noChangeHistorical") || "Tidak ada perubahan (Riwayat)")
                    : isDebt
                      ? `-${formatCurrency(parsedAmount, "IDR")} (${selectedWallet?.name ?? (t("wallets.walletFallback") || "Dompet")})`
                      : `+${formatCurrency(parsedAmount, "IDR")} (${selectedWallet?.name ?? (t("wallets.walletFallback") || "Dompet")})`}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="font-bold text-slate-900">{t("debts.remainingItemBill") || "Sisa Tagihan Item Ini"}:</span>
                <span className={`font-black ${remainingAfterPayment === 0 ? "text-kash-emeraldDark" : "text-slate-900"}`}>
                  {formatCurrency(remainingAfterPayment, "IDR")} {remainingAfterPayment === 0 ? `(${t("debts.settled") || "Lunas"})` : ""}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2">
            <Button disabled={saving} type="submit">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
              {isDebt ? (t("debts.confirmPayThisItem") || "Konfirmasi Pembayaran Item Ini") : (t("debts.confirmCollectThisItem") || "Konfirmasi Penerimaan Item Ini")}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}


function CrossSpaceItemSettlementModal({
  item,
  counterparty,
  onClose,
  onSaved,
}: {
  item: DebtProgress;
  counterparty: Counterparty;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, formatCurrency } = useI18n();
  const remaining = toNumber(item.remaining_amount);
  const [amount, setAmount] = useState("");
  const [managedWalletId, setManagedWalletId] = useState("");
  
  const [paymentDate, setPaymentDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [note, setNote] = useState("");
  const [managedWallets, setManagedWallets] = useState<WalletWithBalance[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWallets = async () => {
      const eventRes = await supabase.from("cross_space_events").select("managed_space_id").eq("id", item.cross_space_event_id!).single();
      const managedSpaceId = eventRes.data?.managed_space_id;

      if (managedSpaceId) {
         const mWalletsRes = await getWallets(managedSpaceId);
         setManagedWallets(mWalletsRes.data ?? []);
      }
    };
    void fetchWallets();
  }, [item.cross_space_event_id]);

  const parsedAmount = toNumber(parseMoneyInputDigits(amount));
  const remainingAfterPayment = Math.max(0, remaining - parsedAmount);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (parsedAmount <= 0) {
      setError(t("debts.amountGreaterThanZero") || "Nominal pelunasan harus lebih besar dari 0.");
      return;
    }
    if (parsedAmount > remaining) {
      setError(t("debts.amountExceedsItemBalance", { remaining: formatCurrency(remaining, "IDR") }) || `Nominal tidak boleh melebihi sisa tagihan item (${formatCurrency(remaining, "IDR")}).`);
      return;
    }
    if (!managedWalletId) {
      setError(t("debts.selectWalletError") || "Pilih dompet Managed.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await recordCrossSpaceSettlement({
        eventId: item.cross_space_event_id!,
        amount: parsedAmount,
        managedWalletId,
        personalWalletId: managedWalletId,
        settlementDate: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString(),
        note: note.trim() || undefined,
      });

      onSaved();
    } catch (err: any) {
      setError(err?.message ?? (t("common.errorOccurred") || "Terjadi kesalahan tidak terduga."));
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title={
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[11px] font-black uppercase text-purple-700">
              Settlement Cross-Space
            </span>
          </div>
          <h2 className="mt-1 text-xl font-extrabold text-slate-900">
            {item.title}
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            {t("debts.remainingItemBill") || "Sisa Tagihan Item"}:{" "}
            <span className="font-bold text-slate-900">{formatCurrency(remaining, "IDR")}</span>
          </p>
        </div>
      }
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <div className="w-full max-w-full min-w-0">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-900" htmlFor="cross-space-amount">
                {t("debts.settlementAmountLabel") || "Nominal Pelunasan"} *
              </label>
              <button
                type="button"
                onClick={() => setAmount(formatMoneyDigits(remaining.toString()))}
                className="text-xs font-bold text-kash-emerald transition hover:text-kash-emeraldDark hover:underline"
              >
                {t("debts.payFull") || "Bayar Penuh"} ({formatCurrency(remaining, "IDR")})
              </button>
            </div>
            <input
              id="cross-space-amount"
              inputMode="numeric"
              type="text"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(formatMoneyDigits(e.target.value))}
              className="mt-2 block h-12 w-full max-w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-base font-semibold text-slate-900 transition placeholder:text-slate-600 focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-[rgba(16,185,129,0.20)] md:text-sm"
              required
            />
          </div>

          <SelectField
            id="cross-space-managed-wallet"
            label={`${t("debts.payFromWalletLabel") || "Pilih Dompet Pembayar (Managed)"} *`}
            value={managedWalletId}
            onChange={(e) => setManagedWalletId(e.target.value)}
            required
          >
            <option value="">{t("wallets.selectWallet") || "Pilih Dompet"}</option>
            {managedWallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({formatCurrency(w.balance?.current_balance ?? w.initial_balance, w.currency)})
              </option>
            ))}
          </SelectField>

          <DatePickerField
            id="cross-space-date"
            label={`${t("debts.settlementDateLabel") || "Tanggal & Waktu Pelunasan"} *`}
            enableTime
            value={paymentDate}
            onChange={(val) => setPaymentDate(val)}
          />

          <FormField
            id="cross-space-note"
            label={t("debts.noteOptional") || "Catatan (Opsional)"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="mt-2">
            <Button disabled={saving} type="submit">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
              {t("debts.confirmPayThisItem") || "Konfirmasi Pembayaran Item Ini"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
