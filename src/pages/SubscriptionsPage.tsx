import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  History,
  Loader2,
  Plus,
  Receipt,
  Repeat,
  Search,
  Sparkles,
  TrendingUp,
  Wallet as WalletIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CreateObligationModal } from "../components/subscriptions/CreateObligationModal";
import { PaymentModal } from "../components/subscriptions/PaymentModal";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { useAppEvent } from "../hooks/useAppEvent";
import { appEvents } from "../lib/appEvents";
import { formatCurrency, toNumber } from "../../src/lib/money";
import {
  getRecurringObligations,
  type RecurringObligationWithMeta,
} from "../lib/subscriptions";
import { getWallets, type WalletWithBalance } from "../lib/wallets";
import type { RecurringPayment } from "../types/domain";

type TabFilter = "all" | "subscriptions" | "installments" | "due_soon";

export function SubscriptionsPage() {
  const navigate = useNavigate();
  const [obligations, setObligations] = useState<RecurringObligationWithMeta[]>([]);
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [payingItem, setPayingItem] = useState<{
    obligation: RecurringObligationWithMeta;
    payment: RecurringPayment;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [obRes, walRes] = await Promise.all([getRecurringObligations(), getWallets()]);
    if (obRes.data) setObligations(obRes.data);
    if (walRes.data) setWallets(walRes.data);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  useAppEvent(appEvents.transactionSaved, () => void loadData());
  useAppEvent(appEvents.notificationsUpdated, () => void loadData());

  // Calculations for Summary Metrics
  const summaryMetrics = useMemo(() => {
    let monthlyRecurringTotal = 0;
    let dueSoonCount = 0;
    let dueSoonAmount = 0;
    let activeSubsCount = 0;
    let activeInstallmentsCount = 0;
    let totalInstallmentRemaining = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const ob of obligations) {
      if (ob.status !== "active") continue;

      const amt = toNumber(ob.amount);

      // Monthly recurring equivalent
      if (ob.type === "subscription" || ob.type === "bill") {
        activeSubsCount++;
        if (ob.frequency === "monthly") monthlyRecurringTotal += amt;
        else if (ob.frequency === "yearly") monthlyRecurringTotal += amt / 12;
        else if (ob.frequency === "weekly") monthlyRecurringTotal += (amt * 52) / 12;
        else if (ob.frequency === "quarterly") monthlyRecurringTotal += amt / 3;
      } else {
        // Installment / PayLater
        activeInstallmentsCount++;
        monthlyRecurringTotal += amt;
        totalInstallmentRemaining += toNumber(ob.remaining_amount);
      }

      // Due soon calculation (< 7 days or overdue)
      if (ob.next_due_date) {
        const dueDate = new Date(ob.next_due_date);
        dueDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
        if (diffDays <= 7) {
          dueSoonCount++;
          dueSoonAmount += amt;
        }
      }
    }

    return {
      monthlyRecurringTotal,
      dueSoonCount,
      dueSoonAmount,
      activeSubsCount,
      activeInstallmentsCount,
      totalInstallmentRemaining,
    };
  }, [obligations]);

  // Filtered List
  const filteredObligations = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return obligations.filter((ob) => {
      // Tab filter
      if (activeTab === "subscriptions") {
        if (ob.type !== "subscription" && ob.type !== "bill") return false;
      } else if (activeTab === "installments") {
        if (ob.type !== "paylater" && ob.type !== "installment") return false;
      } else if (activeTab === "due_soon") {
        if (!ob.next_due_date || ob.status !== "active") return false;
        const dueDate = new Date(ob.next_due_date);
        dueDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
        if (diffDays > 7) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = ob.name.toLowerCase().includes(q);
        const matchesProvider = ob.provider?.toLowerCase().includes(q);
        const matchesCat = ob.category?.name.toLowerCase().includes(q);
        if (!matchesName && !matchesProvider && !matchesCat) return false;
      }

      return true;
    });
  }, [obligations, activeTab, searchQuery]);

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      {/* Page Header */}
      <PageHeader
        eyebrow="Finance"
        icon={Repeat}
        title="Bills & Subscriptions"
        description="Manage recurring bills, subscriptions, PayLater, and installments."
        actions={
          <Button onClick={() => setCreateModalOpen(true)} className="gap-2">
            <Plus size={18} strokeWidth={2.4} />
            Add Obligation
          </Button>
        }
      />

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Monthly Recurring Cost */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-xs font-bold uppercase tracking-wider">
              Est. Monthly Cost
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-kash-selected text-kash-emeraldDark">
              <Repeat size={15} />
            </span>
          </div>
          <p className="mt-2 text-xl font-black text-slate-900">
            {formatCurrency(summaryMetrics.monthlyRecurringTotal)}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            Across active subscriptions & bills
          </p>
        </div>

        {/* Card 2: Due Soon */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-xs font-bold uppercase tracking-wider">
              Due Within 7 Days
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F28C45]/15 text-[#F28C45]">
              <AlertCircle size={15} />
            </span>
          </div>
          <p className="mt-2 text-xl font-black text-slate-900">
            {formatCurrency(summaryMetrics.dueSoonAmount)}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#F28C45]">
            {summaryMetrics.dueSoonCount} item{summaryMetrics.dueSoonCount !== 1 ? "s" : ""} requiring payment
          </p>
        </div>

        {/* Card 3: Active Subscriptions */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-xs font-bold uppercase tracking-wider">
              Active Subscriptions
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Receipt size={15} />
            </span>
          </div>
          <p className="mt-2 text-xl font-black text-slate-900">
            {summaryMetrics.activeSubsCount}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            Auto-renewing services
          </p>
        </div>

        {/* Card 4: Installment Remaining */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-xs font-bold uppercase tracking-wider">
              Installments Remaining
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <CreditCard size={15} />
            </span>
          </div>
          <p className="mt-2 text-xl font-black text-slate-900">
            {formatCurrency(summaryMetrics.totalInstallmentRemaining)}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            Across {summaryMetrics.activeInstallmentsCount} PayLater / Installments
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: "all", label: "All" },
            { id: "subscriptions", label: "Subscriptions & Bills" },
            { id: "installments", label: "PayLater & Installments" },
            { id: "due_soon", label: "Due Soon / Overdue" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabFilter)}
              className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            type="text"
            placeholder="Search obligations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs font-semibold text-slate-900 placeholder:text-slate-600 focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
          />
        </div>
      </div>

      {/* Obligations List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-kash-emerald" />
        </div>
      ) : filteredObligations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-kash-selected text-kash-emerald">
            <Repeat size={22} />
          </div>
          <h4 className="mt-4 text-base font-extrabold text-slate-900">No recurring obligations found</h4>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            {searchQuery
              ? "Try adjusting your search query or active filter."
              : "Track your monthly Netflix, Spotify, PLN electricity, or installment plans effortlessly."}
          </p>
          {!searchQuery && (
            <Button onClick={() => setCreateModalOpen(true)} className="mt-4 gap-2">
              <Plus size={16} />
              Add Your First Obligation
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredObligations.map((ob) => {
            const isInstallment = ob.type === "paylater" || ob.type === "installment";
            const isCompleted = ob.status === "completed";
            const isCancelled = ob.status === "cancelled";

            // Next Due Status calculations
            let dueStatusLabel = "Active";
            let dueBadgeClass = "bg-slate-100 text-slate-700";

            if (ob.next_due_date && ob.status === "active") {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const dueDate = new Date(ob.next_due_date);
              dueDate.setHours(0, 0, 0, 0);
              const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

              if (diffDays < 0) {
                dueStatusLabel = `Overdue (${Math.abs(diffDays)}d ago)`;
                dueBadgeClass = "bg-kash-expense/15 text-kash-expense font-bold";
              } else if (diffDays === 0) {
                dueStatusLabel = "Due Today";
                dueBadgeClass = "bg-[#F28C45]/15 text-[#F28C45] font-bold";
              } else if (diffDays <= 7) {
                dueStatusLabel = `Due in ${diffDays} day${diffDays > 1 ? "s" : ""}`;
                dueBadgeClass = "bg-kash-selected text-kash-emeraldDark font-bold";
              } else {
                dueStatusLabel = `Due ${dueDate.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`;
                dueBadgeClass = "bg-slate-100 text-slate-700 font-semibold";
              }
            } else if (isCompleted) {
              dueStatusLabel = "Completed";
              dueBadgeClass = "bg-kash-selected text-kash-emeraldDark font-bold";
            } else if (isCancelled) {
              dueStatusLabel = "Cancelled";
              dueBadgeClass = "bg-slate-100 text-slate-600 font-semibold";
            }

            return (
              <div
                key={ob.id}
                onClick={() => navigate(`/subscriptions/${ob.id}`)}
                className="group flex w-full cursor-pointer flex-col justify-between gap-3.5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-kash-emerald/40 hover:shadow-md sm:flex-row sm:items-center sm:p-5"
              >
                {/* Left: Icon & Info */}
                <div className="flex min-w-0 flex-1 items-center gap-3.5">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105 ${
                      isInstallment
                        ? "bg-[#F28C45]/15 text-[#F28C45]"
                        : "bg-kash-selected text-kash-emeraldDark"
                    }`}
                  >
                    {isInstallment ? <CreditCard size={20} /> : <Repeat size={20} />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="truncate text-base font-extrabold text-slate-900 transition group-hover:text-kash-emerald"
                      >
                        {ob.name}
                      </span>
                      {ob.provider && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                          {ob.provider}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                      {ob.category && (
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          {ob.category.name}
                        </span>
                      )}
                      <span>•</span>
                      <span className="capitalize">{isInstallment ? "Monthly Installment" : `${ob.frequency}`}</span>
                      {ob.defaultWallet && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-slate-600">
                            <WalletIcon size={12} />
                            {ob.defaultWallet.name}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Installment Progress Bar */}
                    {isInstallment && (
                      <div className="mt-2.5 flex items-center gap-3">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-kash-emerald transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, toNumber(ob.progress_percentage)))}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-slate-600">
                          {ob.paid_count} / {ob.installment_count} paid ({ob.progress_percentage}%)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Amount & Actions */}
                <div className="flex items-center justify-between gap-3 border-t border-slate-100/80 pt-3 sm:border-0 sm:pt-0 sm:justify-end sm:gap-4">
                  <div className="text-left sm:text-right">
                    <p className="text-base font-black leading-tight text-slate-900">
                      {formatCurrency(ob.amount)}
                      <span className="text-xs font-bold text-slate-600">
                        {isInstallment ? " /mo" : ` /${ob.frequency === "monthly" ? "mo" : ob.frequency === "yearly" ? "yr" : ob.frequency}`}
                      </span>
                    </p>
                    <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-[11px] ${dueBadgeClass}`}>
                      {dueStatusLabel}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {ob.status === "active" && ob.currentPayment && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPayingItem({ obligation: ob, payment: ob.currentPayment! });
                        }}
                        className="gap-1.5 min-h-9 px-3 py-1.5 text-xs font-extrabold"
                      >
                        <CheckCircle2 size={14} />
                        Pay
                      </Button>
                    )}

                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-kash-emerald"
                    >
                      <ChevronRight size={18} />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {createModalOpen && (
        <CreateObligationModal
          onClose={() => setCreateModalOpen(false)}
          onSaved={() => {
            setCreateModalOpen(false);
            void loadData();
          }}
        />
      )}

      {/* Payment Modal */}
      {payingItem && (
        <PaymentModal
          obligation={payingItem.obligation}
          payment={payingItem.payment}
          wallets={wallets}
          onClose={() => setPayingItem(null)}
          onPaid={() => {
            setPayingItem(null);
            void loadData();
          }}
        />
      )}
    </div>
  );
}
