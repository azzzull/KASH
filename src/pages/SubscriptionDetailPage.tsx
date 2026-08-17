import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  History,
  Loader2,
  Plus,
  Receipt,
  Repeat,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PaymentModal } from "../components/subscriptions/PaymentModal";
import { SettleInstallmentModal } from "../components/subscriptions/SettleInstallmentModal";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { PageHeader } from "../components/ui/PageHeader";
import { useAppEvent } from "../hooks/useAppEvent";
import { appEvents } from "../lib/appEvents";
import { formatCurrency, toNumber } from "../../src/lib/money";
import {
  cancelRecurringObligation,
  deleteRecurringObligation,
  getRecurringObligationById,
  type RecurringObligationWithMeta,
} from "../lib/subscriptions";
import { getWallets, type WalletWithBalance } from "../lib/wallets";
import type { RecurringPayment, Wallet as WalletType } from "../types/domain";

export function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [obligation, setObligation] = useState<RecurringObligationWithMeta | null>(null);
  const [payments, setPayments] = useState<RecurringPayment[]>([]);
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [payModalPayment, setPayModalPayment] = useState<RecurringPayment | null>(null);
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const [obRes, walRes] = await Promise.all([
      getRecurringObligationById(id),
      getWallets(),
    ]);

    if (obRes.error || !obRes.data) {
      setError(obRes.error?.message || "Obligation not found.");
    } else {
      setObligation(obRes.data.obligation);
      setPayments(obRes.data.payments);
    }

    if (walRes.data) setWallets(walRes.data);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [id]);

  useAppEvent(appEvents.transactionSaved, () => void loadData());
  useAppEvent(appEvents.notificationsUpdated, () => void loadData());

  const handleCancel = async () => {
    if (!obligation) return;
    setActionLoading(true);
    const { error: cancelError } = await cancelRecurringObligation(obligation.id);
    setActionLoading(false);
    if (cancelError) {
      alert(cancelError.message);
      return;
    }
    setCancelModalOpen(false);
    void loadData();
  };

  const handleDelete = async () => {
    if (!obligation) return;
    setActionLoading(true);
    const { error: delError } = await deleteRecurringObligation(obligation.id);
    setActionLoading(false);
    if (delError) {
      alert(delError.message);
      return;
    }
    setDeleteModalOpen(false);
    navigate("/subscriptions", { replace: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-kash-emerald" />
      </div>
    );
  }

  if (error || !obligation) {
    return (
      <div className="mx-auto max-w-[1180px] space-y-4 py-8 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-base font-extrabold text-slate-900">{error || "Obligation not found."}</p>
          <Link to="/subscriptions" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-kash-emerald hover:underline">
            <ArrowLeft size={16} /> Back to Bills & Subscriptions
          </Link>
        </div>
      </div>
    );
  }

  const isInstallment = obligation.type === "paylater" || obligation.type === "installment";
  const openPendingPayment = payments.find((p) => p.status === "pending" || p.status === "overdue");
  const canHardDelete = payments.length === 0;

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      {/* Back Button */}
      <Link
        to="/subscriptions"
        className="inline-flex items-center gap-2 text-xs font-extrabold text-slate-600 transition hover:text-slate-900"
      >
        <ArrowLeft size={15} /> Back to Bills & Subscriptions
      </Link>

      {/* Main Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div className="flex items-start gap-4">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
              isInstallment
                ? "bg-[#F28C45]/15 text-[#F28C45]"
                : "bg-kash-selected text-kash-emeraldDark"
            }`}
          >
            {isInstallment ? <CreditCard size={24} /> : <Repeat size={24} />}
          </span>

          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-black text-slate-900">{obligation.name}</h2>
              {obligation.provider && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                  {obligation.provider}
                </span>
              )}
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold capitalize ${
                  obligation.status === "active"
                    ? "bg-kash-selected text-kash-emeraldDark"
                    : obligation.status === "completed"
                      ? "bg-indigo-50 text-indigo-700"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {obligation.status}
              </span>
            </div>

            <p className="mt-1 text-xs font-semibold text-slate-600">
              {obligation.category?.name || "Uncategorized"} • Created on{" "}
              {new Date(obligation.start_date).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {obligation.status === "active" && openPendingPayment && (
            <Button
              onClick={() => setPayModalPayment(openPendingPayment)}
              className="gap-2 text-xs font-extrabold"
            >
              <CheckCircle2 size={16} />
              Pay Current Bill
            </Button>
          )}

          {isInstallment && obligation.status === "active" && obligation.remaining_count > 0 && (
            <Button
              variant="secondary"
              onClick={() => setSettleModalOpen(true)}
              className="gap-2 text-xs font-extrabold"
            >
              <CreditCard size={15} />
              Early Settlement
            </Button>
          )}

          {!isInstallment && obligation.status === "active" && (
            <Button
              variant="secondary"
              onClick={() => setCancelModalOpen(true)}
              className="gap-2 border-kash-expense/30 text-xs font-extrabold text-kash-expense hover:bg-kash-expense/10"
            >
              <XCircle size={15} />
              Cancel Subscription
            </Button>
          )}

          {canHardDelete && (
            <Button
              variant="secondary"
              onClick={() => setDeleteModalOpen(true)}
              className="text-xs font-extrabold text-slate-600 hover:text-kash-expense"
            >
              <Trash2 size={15} />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Card 1: Amount & Billing Cycle */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            {isInstallment ? "Installment Rate" : "Billing Cycle"}
          </span>
          <p className="mt-2 text-2xl font-black text-slate-900">
            {formatCurrency(obligation.amount)}
            <span className="text-xs font-bold text-slate-600">
              {" "}
              / {isInstallment ? "month" : obligation.frequency}
            </span>
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Calendar size={14} />
            <span>
              {obligation.next_due_date
                ? `Next Due: ${new Date(obligation.next_due_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`
                : "No active upcoming due date"}
            </span>
          </div>
        </div>

        {/* Card 2: Installment or Default Wallet */}
        {isInstallment ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Contract Progress
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-2xl font-black text-slate-900">
                {obligation.paid_count} / {obligation.installment_count}
              </p>
              <span className="text-xs font-extrabold text-kash-emeraldDark">
                {obligation.progress_percentage}% completed
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-kash-emerald transition-all"
                style={{ width: `${Math.min(100, Math.max(0, toNumber(obligation.progress_percentage)))}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Default Payment Wallet
            </span>
            <div className="mt-2 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Wallet size={16} />
              </span>
              <div>
                <p className="text-base font-extrabold text-slate-900">
                  {obligation.defaultWallet?.name || "No default wallet"}
                </p>
                <p className="text-xs font-semibold text-slate-600">
                  {obligation.defaultWallet ? "Default wallet configured" : "Select wallet during payment"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Card 3: Reminder Settings */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Active Reminders
          </span>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {obligation.reminder_offsets && obligation.reminder_offsets.length > 0 ? (
              obligation.reminder_offsets.map((offset) => (
                <span
                  key={offset}
                  className="rounded-full bg-kash-selected px-2.5 py-1 text-[11px] font-bold text-kash-emeraldDark"
                >
                  {offset === 0 ? "Due Day" : `${offset} days before`}
                </span>
              ))
            ) : (
              <span className="text-xs font-semibold text-slate-600">No upcoming reminders</span>
            )}
            {obligation.overdue_reminder_enabled && (
              <span className="rounded-full bg-kash-expense/15 px-2.5 py-1 text-[11px] font-bold text-kash-expense">
                Overdue Alert
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Payment History Section */}
      <div className="space-y-3 pt-2">
        <h3 className="text-base font-extrabold text-slate-900">Payment Occurrences & History</h3>

        {payments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs font-semibold text-slate-600">
            No payment history recorded yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {payments.map((p) => {
                const isPaid = p.status === "paid";
                const isHistorical = p.payment_mode === "historical";

                return (
                  <div
                    key={p.id}
                    className="flex flex-col justify-between gap-3 p-4 transition hover:bg-slate-50/50 sm:flex-row sm:items-center"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          isPaid
                            ? "bg-kash-selected text-kash-emerald"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {isPaid ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                      </span>

                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-extrabold text-slate-900">
                            {isInstallment && p.installment_number
                              ? `Installment #${p.installment_number}`
                              : `Billing Cycle (${new Date(p.due_date).toLocaleDateString("id-ID", { month: "short", year: "numeric" })})`}
                          </p>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${
                              isPaid
                                ? "bg-kash-selected text-kash-emeraldDark"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>

                        <p className="mt-0.5 text-xs font-semibold text-slate-600">
                          Due: {new Date(p.due_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                          {p.paid_at && ` • Paid on ${new Date(p.paid_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`}
                        </p>

                        {isHistorical && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-slate-600">
                            <History size={12} /> Previous Payment (No wallet deduction)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <p className="text-sm font-black text-slate-900">
                        {formatCurrency(p.amount)}
                      </p>

                      {!isPaid && obligation.status === "active" && (
                        <Button
                          onClick={() => setPayModalPayment(p)}
                          className="gap-1 min-h-9 px-3 py-1.5 text-xs font-extrabold"
                        >
                          <CheckCircle2 size={13} /> Pay
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {payModalPayment && (
        <PaymentModal
          obligation={obligation}
          payment={payModalPayment}
          wallets={wallets}
          onClose={() => setPayModalPayment(null)}
          onPaid={() => {
            setPayModalPayment(null);
            void loadData();
          }}
        />
      )}

      {/* Settle Installment Modal */}
      {settleModalOpen && (
        <SettleInstallmentModal
          obligation={obligation}
          wallets={wallets}
          onClose={() => setSettleModalOpen(false)}
          onSettled={() => {
            setSettleModalOpen(false);
            void loadData();
          }}
        />
      )}

      {/* Cancel Subscription Confirmation */}
      {cancelModalOpen && (
        <ConfirmationDialog
          title="Cancel Subscription"
          description="Cancelling this subscription will stop future recurring billing cycles and reminders from now forward. Past payment records and Expense transactions will remain preserved."
          confirmLabel={actionLoading ? "Cancelling..." : "Cancel Subscription"}
          tone="danger"
          isLoading={actionLoading}
          onConfirm={() => void handleCancel()}
          onCancel={() => setCancelModalOpen(false)}
        />
      )}

      {/* Delete Obligation Confirmation */}
      {deleteModalOpen && (
        <ConfirmationDialog
          title="Delete Obligation"
          description="Are you sure you want to delete this recurring obligation? This cannot be undone."
          confirmLabel={actionLoading ? "Deleting..." : "Delete Obligation"}
          tone="danger"
          isLoading={actionLoading}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteModalOpen(false)}
        />
      )}
    </div>
  );
}
