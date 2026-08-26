import {
  AlertCircle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Crown,
  Edit,
  HandCoins,
  History,
  Info,
  Landmark,
  Loader2,
  LogOut,
  Mail,
  MoreVertical,
  Plus,
  Receipt,
  RotateCcw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Target,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useActiveSpace } from "../context/ActiveSpaceContext";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { FinancialHeroCard } from "../components/ui/FinancialHeroCard";
import { IconButton } from "../components/ui/IconButton";
import { Modal } from "../components/ui/Modal";
import { ContributeSharedModal } from "../components/sharedSavings/ContributeSharedModal";
import { WithdrawSharedModal } from "../components/sharedSavings/WithdrawSharedModal";
import { SharedSpendingModal } from "../components/sharedSavings/SharedSpendingModal";
import { InviteMemberModal } from "../components/sharedSavings/InviteMemberModal";
import { EditSharedSavingsModal } from "../components/sharedSavings/EditSharedSavingsModal";
import { ManageApproversModal } from "../components/sharedSavings/ManageApproversModal";
import { TransferOwnershipModal } from "../components/sharedSavings/TransferOwnershipModal";
import { SetAccountHolderModal } from "../components/sharedSavings/SetAccountHolderModal";
import {
  approveSharedContribution,
  approveSharedSpending,
  approveSharedWithdrawal,
  cancelSharedRequest,
  getSharedSavingsDetail,
  rejectSharedRequest,
  removeSharedSavingsMember,
} from "../lib/sharedSavings";
import { toNumber } from "../lib/money";
import type {
  SharedSavingsBalance,
  SharedSavingsInvite,
  SharedSavingsLedger,
  SharedSavingsMemberShare,
  SharedSavingsRequest,
} from "../types/domain";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";

type SharedSavingsConfirmation =
  | {
      type: "leave";
    }
  | {
      type: "remove-member";
      userId: string;
      memberName: string;
    }
  | {
      type: "cancel-request";
      requestId: string;
    }
  | {
      type: "blocked";
      title: string;
      description: string;
      itemLabel?: string;
    };

export function SharedSavingsDetailPage() {
  const { t, formatCurrency, formatDate } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { activeSpace, loading: spaceLoading } = useActiveSpace();
  const isManaged = activeSpace?.space_type === "managed";
  const navigate = useNavigate();

  const [space, setSpace] = useState<SharedSavingsBalance | null>(null);
  const [members, setMembers] = useState<SharedSavingsMemberShare[]>([]);
  const [requests, setRequests] = useState<SharedSavingsRequest[]>([]);
  const [ledger, setLedger] = useState<SharedSavingsLedger[]>([]);
  const [invites, setInvites] = useState<SharedSavingsInvite[]>([]);
  const [approvers, setApprovers] = useState<string[]>([]);
  const [myShare, setMyShare] = useState(0);
  const [isOwner, setIsOwner] = useState(false);
  const [isAccountHolder, setIsAccountHolder] = useState(false);
  const [isApprover, setIsApprover] = useState(false);
  const [otherApproversCount, setOtherApproversCount] = useState(0);

  const [activeTab, setActiveTab] = useState<"members" | "requests" | "ledger" | "settings">("members");
  const [requestFilter, setRequestFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<SharedSavingsConfirmation | null>(null);
  const [leavingSpace, setLeavingSpace] = useState(false);

  // Modal States
  const [showContributeModal, setShowContributeModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showSpendingModal, setShowSpendingModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showApproversModal, setShowApproversModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAccountHolderModal, setShowAccountHolderModal] = useState(false);

  // Rejection Dialog State
  const [rejectingRequest, setRejectingRequest] = useState<SharedSavingsRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const loadData = useCallback(async () => {
    if (!id || spaceLoading || isManaged) {
      setSpace(null);
      setMembers([]);
      setRequests([]);
      setLedger([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const detail = await getSharedSavingsDetail(id);
      setSpace(detail.space);
      setMembers(detail.members);
      setRequests(detail.requests);
      setLedger(detail.ledger);
      setInvites(detail.invites ?? []);
      setApprovers(detail.approvers);
      setMyShare(detail.myShare);
      setIsOwner(detail.isOwner);
      setIsAccountHolder(detail.isAccountHolder);
      setIsApprover(detail.isApprover);
      setOtherApproversCount(detail.otherApproversCount);
    } catch (err: any) {
      setError(err.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [id, isManaged, spaceLoading, t]);

  useEffect(() => {
    if (!spaceLoading) {
      if (isManaged) {
        setSpace(null);
        setMembers([]);
        setRequests([]);
        setLedger([]);
        navigate("/dashboard", { replace: true });
      } else {
        void loadData();
      }
    }
  }, [id, isManaged, loadData, navigate, spaceLoading]);

  const currency = profile?.default_currency ?? "IDR";
  const currentUserId = profile?.id ?? "";

  const activeMembersCount = useMemo(
    () => members.filter((m) => m.member_status === "active").length,
    [members]
  );

  const activeMembers = useMemo(
    () => members.filter((m) => m.member_status === "active"),
    [members]
  );

  const pendingRequestsCount = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests]
  );

  const handleApprove = async (request: SharedSavingsRequest) => {
    setProcessingRequestId(request.id);
    try {
      if (request.request_type === "contribution") {
        await approveSharedContribution(request.id);
      } else if (request.request_type === "withdrawal") {
        await approveSharedWithdrawal(request.id);
      } else if (request.request_type === "shared_spending") {
        await approveSharedSpending(request.id);
      }
      await loadData();
    } catch (err: any) {
      alert(err.message || "Gagal menyetujui permintaan.");
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingRequest) return;
    setProcessingRequestId(rejectingRequest.id);
    try {
      await rejectSharedRequest(rejectingRequest.id, rejectReason.trim() || undefined);
      setRejectingRequest(null);
      setRejectReason("");
      await loadData();
    } catch (err: any) {
      alert(err.message || "Gagal menolak permintaan.");
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleCancel = async (requestId: string) => {
    setProcessingRequestId(requestId);
    try {
      await cancelSharedRequest(requestId);
      setConfirmation(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Gagal membatalkan pengajuan.");
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRemoveMember = async (userId: string, memberName: string) => {
    try {
      if (!id) return;
      await removeSharedSavingsMember(id, userId);
      setConfirmation(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Gagal menghapus anggota.");
    }
  };

  const handleLeaveSpace = async () => {
    if (!id || !space) return;
    if (myShare > 0) {
      setConfirmation({
        type: "blocked",
        title: "Belum bisa keluar",
        description: "Anda masih memiliki porsi saldo. Silakan tarik seluruh porsi Anda terlebih dahulu sebelum keluar.",
        itemLabel: formatCurrency(myShare, currency),
      });
      return;
    }
    if (isOwner) {
      setConfirmation({
        type: "blocked",
        title: "Owner belum bisa keluar",
        description: "Anda adalah Owner tabungan ini. Silakan alihkan kepemilikan ke anggota lain terlebih dahulu sebelum keluar.",
        itemLabel: space.name,
      });
      return;
    }
    if (isAccountHolder) {
      setConfirmation({
        type: "blocked",
        title: "Account Holder belum bisa keluar",
        description: "Anda adalah Account Holder tabungan ini. Silakan tunjuk anggota lain sebagai Account Holder terlebih dahulu sebelum keluar.",
        itemLabel: space.name,
      });
      return;
    }
    setConfirmation({ type: "leave" });
  };

  const confirmLeaveSpace = async () => {
    if (!id) return;
    setLeavingSpace(true);
    try {
      await removeSharedSavingsMember(id, currentUserId);
      setConfirmation(null);
      navigate("/shared-savings");
    } catch (err: any) {
      alert(err.message || "Gagal keluar dari tabungan.");
      setLeavingSpace(false);
    }
  };

  if (isManaged) {
    return null;
  }

  if (loading || spaceLoading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8 md:px-6">
        <div className="h-6 w-32 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" />
        <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" />
      </div>
    );
  }

  if (error || !space) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8 md:px-6">
        <Link
          to="/shared-savings"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={14} /> {t("shared.backToSpaces")}
        </Link>
        <section className="rounded-2xl border border-kash-expense/30 bg-white p-6 shadow-sm">
          <h3 className="text-base font-extrabold text-slate-900">{t("shared.spaceNotFound")}</h3>
          <p className="mt-2 text-xs font-semibold text-slate-600">{error || t("shared.spaceNotFoundDesc")}</p>
          <Button className="mt-4" onClick={() => navigate("/shared-savings")}>
            {t("common.back")}
          </Button>
        </section>
      </div>
    );
  }

  const target = space.target_amount ? toNumber(space.target_amount) : null;
  const balance = toNumber(space.current_balance);
  const progressPct = target && target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : null;

  const filteredRequests = requests.filter((r) => {
    if (requestFilter === "pending") return r.status === "pending";
    if (requestFilter === "approved") return r.status === "approved";
    if (requestFilter === "rejected") return r.status === "rejected" || r.status === "cancelled";
    return true;
  });

  return (
    <div className="w-full min-w-0 space-y-4">
      {/* Back Navigation */}
      <div>
        <Link
          to="/shared-savings"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-kash-emeraldDark transition"
        >
          <ArrowLeft size={14} /> {t("shared.backToSpaces")}
        </Link>
      </div>

      {/* Main Single Emerald Hero Card */}
      <FinancialHeroCard
        icon={<Users size={22} />}
        eyebrow={t("shared.title") || "Tabungan Bersama"}
        title={space.name}
        statusBadges={
          <>
            {isOwner && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 border border-white/15 px-2.5 py-0.5 text-xs font-extrabold text-white">
                <Crown size={12} /> {t("shared.youOwner")}
              </span>
            )}
            {isAccountHolder && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 border border-white/15 px-2.5 py-0.5 text-xs font-extrabold text-white">
                <Landmark size={12} /> {t("shared.accountHolder")}
              </span>
            )}
            {isApprover && !isOwner && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 border border-white/15 px-2.5 py-0.5 text-xs font-extrabold text-white">
                <ShieldCheck size={12} /> {t("shared.approver")}
              </span>
            )}
          </>
        }
        primaryMetricLabel={t("shared.totalPoolBalance") || "Total Saldo Pool"}
        primaryMetricValue={formatCurrency(balance, currency)}
        primaryMetricSubtext={
          target ? (
            <span className="text-base font-semibold text-white/70">
              / {formatCurrency(target, currency)}
            </span>
          ) : undefined
        }
        supportingMetrics={
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-xs font-semibold text-white/90">
            <div>
              <span className="text-white/60 font-semibold">{t("shared.myShareHighlight") || "Porsi Saldo Saya"}</span>
              <p className="mt-0.5 text-sm sm:text-base font-extrabold text-white">
                {formatCurrency(myShare, currency)}
              </p>
            </div>
            <div>
              <span className="text-white/60 font-semibold">{t("shared.members") || "Anggota"}</span>
              <p className="mt-0.5 text-sm sm:text-base font-extrabold text-white">
                {activeMembersCount} {t("shared.members") || "Anggota"}
              </p>
            </div>
            {space.deadline && (
              <div>
                <span className="text-white/60 font-semibold">{t("shared.deadline") || "Batas Waktu"}</span>
                <p className="mt-0.5 text-sm sm:text-base font-extrabold text-white">
                  {formatDate(space.deadline)}
                </p>
              </div>
            )}
          </div>
        }
        progress={
          target && target > 0
            ? {
                percent: progressPct ?? 0,
                labelLeft: `${progressPct}% ${t("shared.targetGoal") || "terkumpul"}`,
                labelRight: `Target: ${formatCurrency(target, currency)}`,
                barColorClass: "bg-white",
              }
            : undefined
        }
      />

      {/* Primary Actions Row Below Hero - Single Horizontal Scrollable Row Aligned Left */}
      <div className="flex flex-nowrap items-center justify-start gap-2 overflow-x-auto max-w-full py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <Button
          type="button"
          onClick={() => setShowContributeModal(true)}
          className="shrink-0 whitespace-nowrap gap-1.5 min-h-9 px-3.5 py-1.5 text-xs font-extrabold"
        >
          <ArrowDownRight size={15} />
          {t("shared.contribute") || "Setor Modal"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setShowWithdrawModal(true)}
          disabled={myShare <= 0}
          className="shrink-0 whitespace-nowrap gap-1.5 min-h-9 px-3.5 py-1.5 text-xs font-extrabold text-slate-700 hover:text-kash-emeraldDark"
        >
          <ArrowUpLeft size={15} />
          {t("shared.withdraw") || "Tarik Porsi Saya"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setShowSpendingModal(true)}
          className="shrink-0 whitespace-nowrap gap-1.5 min-h-9 px-3.5 py-1.5 text-xs font-extrabold text-slate-700 hover:text-kash-emeraldDark"
        >
          <Receipt size={15} />
          {t("shared.spend") || "Catat Belanja"}
        </Button>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("members")}
          className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
            activeTab === "members"
              ? "bg-kash-emerald text-white shadow-xs"
              : "border border-slate-200 bg-white text-slate-600 hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-slate-900"
          }`}
        >
          <Users size={14} />
          {t("shared.membersTab")} ({activeMembersCount})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
            activeTab === "requests"
              ? "bg-kash-emerald text-white shadow-xs"
              : "border border-slate-200 bg-white text-slate-600 hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-slate-900"
          }`}
        >
          <HandCoins size={14} />
          {t("shared.requestsTab")}
          {pendingRequestsCount > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-black text-white">
              {pendingRequestsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ledger")}
          className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
            activeTab === "ledger"
              ? "bg-kash-emerald text-white shadow-xs"
              : "border border-slate-200 bg-white text-slate-600 hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-slate-900"
          }`}
        >
          <History size={14} />
          {t("shared.ledgerTab")} ({ledger.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
            activeTab === "settings"
              ? "bg-kash-emerald text-white shadow-xs"
              : "border border-slate-200 bg-white text-slate-600 hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-slate-900"
          }`}
        >
          <Settings size={14} />
          {t("shared.settingsTab")}
        </button>
      </div>

      {/* Tab 1: Members Breakdown */}
      {activeTab === "members" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900">{t("shared.membersTab")}</h3>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowInviteModal(true)}
              className="min-h-8 px-3 text-xs"
            >
              <UserPlus size={14} /> {t("shared.invite")}
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {activeMembers.map((m) => {
              const currentShare = toNumber(m.current_share);
              const sharePct = balance > 0 ? Math.round((currentShare / balance) * 100) : 0;
              const isCurrentUser = m.user_id === currentUserId;

              return (
                <div
                  key={m.user_id}
                  className={`rounded-2xl border p-4 shadow-sm transition ${
                    isCurrentUser ? "border-kash-emerald/40 bg-kash-selected/20" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-extrabold text-slate-900 truncate">
                          {m.member_name || m.member_email}
                        </p>
                        {isCurrentUser && (
                          <span className="rounded-full bg-kash-emerald px-2 py-0.2 text-[10px] font-black text-white">
                            {t("shared.you")}
                          </span>
                        )}
                        {m.is_owner && (
                          <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.2 text-[10px] font-black text-amber-800">
                            <Crown size={10} /> {t("shared.owner")}
                          </span>
                        )}
                        {m.is_account_holder && (
                          <span className="flex items-center gap-0.5 rounded-full bg-blue-100 px-2 py-0.2 text-[10px] font-black text-blue-800">
                            <Landmark size={10} /> {t("shared.accountHolder")}
                          </span>
                        )}
                        {m.is_approver && !m.is_owner && (
                          <span className="flex items-center gap-0.5 rounded-full bg-kash-selected px-2 py-0.2 text-[10px] font-black text-kash-emeraldDark">
                            <ShieldCheck size={10} /> {t("shared.approver")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{m.member_email}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-base font-black text-kash-emeraldDark">
                        {formatCurrency(currentShare, currency)}
                      </p>
                      <p className="text-[11px] font-extrabold text-slate-500">{sharePct}% {t("shared.ofTotal")}</p>
                    </div>
                  </div>

                  {/* Member Stats */}
                  <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2.5 text-center text-xs">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500">{t("shared.contributed")}</p>
                      <p className="font-extrabold text-slate-800">
                        {formatCurrency(toNumber(m.total_contributed), currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500">{t("shared.withdrawn")}</p>
                      <p className="font-extrabold text-slate-800">
                        {formatCurrency(toNumber(m.total_withdrawn), currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500">{t("shared.spendingShare")}</p>
                      <p className="font-extrabold text-slate-800">
                        {formatCurrency(toNumber(m.total_spent_allocated), currency)}
                      </p>
                    </div>
                  </div>

                  {/* Remove Member Action (Owner Only for other members with 0 share) */}
                  {isOwner && !isCurrentUser && !m.is_account_holder && currentShare === 0 && (
                    <div className="mt-3 flex justify-end border-t border-slate-100 pt-2">
                      <button
                        type="button"
                        onClick={() => setConfirmation({
                          type: "remove-member",
                          userId: m.user_id,
                          memberName: m.member_name || m.member_email,
                        })}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-kash-expense hover:underline"
                      >
                        <UserMinus size={12} /> {t("common.delete")} (0)
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pending Sent Invites */}
          {invites.length > 0 && (
            <div className="space-y-3 pt-3">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                {t("shared.sentInvites", { count: invites.length })}
              </h4>
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-3.5 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Mail size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-slate-900 truncate">{inv.invited_email}</p>
                        <p className="text-[11px] text-slate-500">
                          {t("shared.validUntil", { date: formatDate(inv.expires_at) })}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-black text-amber-800 shrink-0">
                      {t("shared.waitingConfirmation")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Tab 2: Requests & Approvals */}
      {activeTab === "requests" && (
        <section className="space-y-4">
          {/* Sub-filter tabs */}
          <div className="flex items-center gap-2">
            {(["pending", "approved", "rejected", "all"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setRequestFilter(filter)}
                className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition capitalize ${
                  requestFilter === filter
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {filter === "pending"
                  ? `${t("shared.pending")} (${pendingRequestsCount})`
                  : filter === "approved"
                  ? t("shared.approved")
                  : filter === "rejected"
                  ? t("shared.rejected")
                  : t("shared.all")}
              </button>
            ))}
          </div>

          {filteredRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-xs">
              <p className="text-xs font-semibold text-slate-600">{t("shared.noRequests")}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredRequests.map((r) => {
                const isRequester = r.requested_by_user_id === currentUserId;
                const isProcessing = processingRequestId === r.id;
                const amount = toNumber(r.amount);

                // Self-approval logic:
                const canApprove =
                  isApprover &&
                  r.status === "pending" &&
                  (!isRequester || otherApproversCount === 0);

                const waitingForOtherApprover =
                  isApprover && isRequester && r.status === "pending" && otherApproversCount > 0;

                return (
                  <div
                    key={r.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-xs ${
                          r.request_type === "contribution"
                            ? "bg-kash-emerald"
                            : r.request_type === "withdrawal"
                            ? "bg-blue-600"
                            : "bg-amber-500"
                        }`}
                      >
                        {r.request_type === "contribution" ? (
                          <ArrowDownRight size={18} />
                        ) : r.request_type === "withdrawal" ? (
                          <ArrowUpLeft size={18} />
                        ) : (
                          <Receipt size={18} />
                        )}
                      </span>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-extrabold text-slate-900">
                            {r.request_type === "contribution"
                              ? t("shared.contributionRequest")
                              : r.request_type === "withdrawal"
                              ? t("shared.withdrawalRequest")
                              : r.title || t("shared.spendingRequest")}
                          </h4>
                          <span
                            className={`rounded-full px-2 py-0.2 text-[10px] font-black capitalize ${
                              r.status === "pending"
                                ? "bg-amber-100 text-amber-800"
                                : r.status === "approved"
                                ? "bg-kash-selected text-kash-emeraldDark"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {r.status}
                          </span>
                        </div>

                        <p className="mt-0.5 text-xs text-slate-600">
                          {t("shared.requestedBy")}: <span className="font-bold text-slate-800">{r.requester_name || r.requester_email}</span>
                          {isRequester && ` (${t("shared.you")})`}
                        </p>

                        {r.note && (
                          <p className="mt-1 text-xs italic text-slate-500 bg-slate-50 px-2 py-1 rounded-md">
                            "{r.note}"
                          </p>
                        )}

                        <p className="mt-1 text-[11px] text-slate-500">
                          {formatDate(r.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:items-end gap-2 shrink-0">
                      <p className="text-base font-black text-slate-900">{formatCurrency(amount, currency)}</p>

                      {/* Action buttons */}
                      {r.status === "pending" && (
                        <div className="flex items-center gap-2">
                          {waitingForOtherApprover && (
                            <span className="rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 border border-amber-200">
                              {t("shared.waitingOtherApprover")}
                            </span>
                          )}

                          {canApprove && (
                            <>
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={isProcessing}
                                onClick={() => setRejectingRequest(r)}
                                className="min-h-8 px-2.5 text-xs text-kash-expense hover:bg-red-50"
                              >
                                <X size={14} />
                                {t("shared.rejectInvite")}
                              </Button>
                              <Button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => void handleApprove(r)}
                                className="min-h-8 px-3 text-xs"
                              >
                                {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                {t("shared.confirmApprove")}
                              </Button>
                            </>
                          )}

                          {isRequester && (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={isProcessing}
                              onClick={() => setConfirmation({ type: "cancel-request", requestId: r.id })}
                              className="min-h-8 px-2.5 text-xs text-slate-600 hover:text-kash-expense"
                            >
                              {t("shared.confirmCancel")}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Tab 3: Ledger & Activity History */}
      {activeTab === "ledger" && (
        <section className="space-y-4">
          {ledger.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-xs">
              <p className="text-xs font-semibold text-slate-600">{t("shared.noLedger")}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {ledger.map((l) => {
                const amount = toNumber(l.amount);

                return (
                  <div key={l.id} className="flex items-center justify-between p-4 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-xs ${
                          l.event_type === "contribution"
                            ? "bg-kash-emerald"
                            : l.event_type === "personal_withdrawal"
                            ? "bg-blue-600"
                            : "bg-amber-500"
                        }`}
                      >
                        {l.event_type === "contribution" ? (
                          <ArrowDownRight size={16} />
                        ) : l.event_type === "personal_withdrawal" ? (
                          <ArrowUpLeft size={16} />
                        ) : (
                          <Receipt size={16} />
                        )}
                      </span>

                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-slate-900 truncate">
                          {l.event_type === "contribution"
                            ? t("shared.contribute")
                            : l.event_type === "personal_withdrawal"
                            ? t("shared.withdrawalRequest")
                            : (l.title || t("shared.spendingRequest"))}
                        </p>
                        <p className="text-[11px] font-bold text-slate-700 truncate">
                          {l.event_type === "shared_spending"
                            ? `${t("shared.requestedBy")}: ${l.requester_name || t("shared.members")}`
                            : (l.requester_name || t("shared.members"))}
                        </p>
                        {l.note && <p className="text-[11px] text-slate-500 truncate">{l.note}</p>}
                        <p className="text-[10px] text-slate-400">
                          {formatDate(l.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-black ${
                          l.event_type === "contribution"
                            ? "text-kash-emeraldDark"
                            : l.event_type === "personal_withdrawal"
                            ? "text-blue-600"
                            : "text-slate-900"
                        }`}
                      >
                        {l.event_type === "contribution" ? "+" : "-"}
                        {formatCurrency(amount, currency)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Tab 4: Management & Settings */}
      {activeTab === "settings" && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900">{t("shared.settingsTab")}</h3>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Edit Details (Owner only) */}
              <button
                type="button"
                disabled={!isOwner}
                onClick={() => setShowEditModal(true)}
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 text-left transition hover:border-kash-emerald hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none"
              >
                <div>
                  <p className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Edit size={14} className="text-kash-emerald" />
                    {t("shared.editInfo")}
                  </p>
                  <p className="text-[11px] text-slate-500">{t("shared.editInfoDesc")}</p>
                </div>
              </button>

              {/* Manage Approvers (Owner only) */}
              <button
                type="button"
                disabled={!isOwner}
                onClick={() => setShowApproversModal(true)}
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 text-left transition hover:border-kash-emerald hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none"
              >
                <div>
                  <p className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-amber-500" />
                    {t("shared.manageApproversControl")}
                  </p>
                  <p className="text-[11px] text-slate-500">{t("shared.manageApproversControlDesc")}</p>
                </div>
              </button>

              {/* Set Account Holder (Owner only) */}
              <button
                type="button"
                disabled={!isOwner}
                onClick={() => setShowAccountHolderModal(true)}
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 text-left transition hover:border-kash-emerald hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none"
              >
                <div>
                  <p className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Landmark size={14} className="text-blue-500" />
                    {t("shared.setAccountHolderControl")}
                  </p>
                  <p className="text-[11px] text-slate-500">{t("shared.setAccountHolderControlDesc")}</p>
                </div>
              </button>

              {/* Transfer Ownership (Owner only) */}
              <button
                type="button"
                disabled={!isOwner}
                onClick={() => setShowTransferModal(true)}
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 text-left transition hover:border-kash-emerald hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none"
              >
                <div>
                  <p className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Crown size={14} className="text-amber-500" />
                    {t("shared.transferOwnershipControl")}
                  </p>
                  <p className="text-[11px] text-slate-500">{t("shared.transferOwnershipControlDesc")}</p>
                </div>
              </button>
            </div>
          </div>

          {/* Leave Space Card */}
          <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5 space-y-3">
            <h4 className="text-xs font-extrabold text-red-900">{t("shared.leaveSpaceTitle")}</h4>
            <p className="text-xs text-red-700">
              {t("shared.leaveSpaceDesc")}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={handleLeaveSpace}
              className="min-h-9 px-3.5 text-xs text-kash-expense hover:bg-red-100"
            >
              <LogOut size={14} /> {t("shared.leaveSpaceBtn")}
            </Button>
          </div>
        </section>
      )}

      {/* Modals */}
      <ContributeSharedModal
        isOpen={showContributeModal}
        spaceId={space.shared_savings_id}
        spaceName={space.name}
        spaceColor={space.color}
        onClose={() => setShowContributeModal(false)}
        onSubmitted={() => void loadData()}
      />

      <WithdrawSharedModal
        isOpen={showWithdrawModal}
        spaceId={space.shared_savings_id}
        spaceName={space.name}
        myAvailableShare={myShare}
        spaceColor={space.color}
        onClose={() => setShowWithdrawModal(false)}
        onSubmitted={() => void loadData()}
      />

      <SharedSpendingModal
        isOpen={showSpendingModal}
        spaceId={space.shared_savings_id}
        spaceName={space.name}
        activeMembersCount={activeMembersCount}
        spaceColor={space.color}
        onClose={() => setShowSpendingModal(false)}
        onSubmitted={() => void loadData()}
      />

      <InviteMemberModal
        isOpen={showInviteModal}
        spaceId={space.shared_savings_id}
        spaceName={space.name}
        onClose={() => setShowInviteModal(false)}
        onInvited={() => void loadData()}
      />

      <EditSharedSavingsModal
        isOpen={showEditModal}
        space={space}
        onClose={() => setShowEditModal(false)}
        onSaved={() => void loadData()}
      />

      <ManageApproversModal
        isOpen={showApproversModal}
        spaceId={space.shared_savings_id}
        spaceName={space.name}
        members={activeMembers}
        approvers={approvers}
        onClose={() => setShowApproversModal(false)}
        onUpdated={() => void loadData()}
      />

      <TransferOwnershipModal
        isOpen={showTransferModal}
        spaceId={space.shared_savings_id}
        spaceName={space.name}
        members={activeMembers}
        currentOwnerId={space.owner_user_id}
        onClose={() => setShowTransferModal(false)}
        onTransferred={() => void loadData()}
      />

      <SetAccountHolderModal
        isOpen={showAccountHolderModal}
        spaceId={space.shared_savings_id}
        spaceName={space.name}
        members={activeMembers}
        currentAccountHolderId={space.account_holder_user_id}
        onClose={() => setShowAccountHolderModal(false)}
        onUpdated={() => void loadData()}
      />

      {confirmation?.type === "leave" ? (
        <ConfirmationDialog
          confirmLabel={t("shared.leaveSpaceBtn")}
          description={t("shared.leaveSpaceDesc")}
          icon={LogOut}
          isLoading={leavingSpace}
          itemLabel={space.name}
          onCancel={() => {
            if (leavingSpace) return;
            setConfirmation(null);
          }}
          onConfirm={() => void confirmLeaveSpace()}
          title={t("shared.leaveSpaceTitle")}
          tone="danger"
        />
      ) : null}

      {confirmation?.type === "remove-member" ? (
        <ConfirmationDialog
          confirmLabel={t("common.delete")}
          description="Hapus anggota ini dari tabungan bersama? Pastikan porsi saldo mereka sudah Rp0."
          icon={UserMinus}
          itemLabel={confirmation.memberName}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void handleRemoveMember(confirmation.userId, confirmation.memberName)}
          title="Hapus anggota"
          tone="danger"
        />
      ) : null}

      {confirmation?.type === "cancel-request" ? (
        <ConfirmationDialog
          confirmLabel={t("shared.confirmCancel")}
          description="Batalkan pengajuan ini?"
          icon={XCircle}
          isLoading={processingRequestId === confirmation.requestId}
          onCancel={() => {
            if (processingRequestId) return;
            setConfirmation(null);
          }}
          onConfirm={() => void handleCancel(confirmation.requestId)}
          title="Batalkan pengajuan"
          tone="warning"
        />
      ) : null}

      {confirmation?.type === "blocked" ? (
        <ConfirmationDialog
          confirmLabel="OK"
          description={confirmation.description}
          icon={ShieldAlert}
          itemLabel={confirmation.itemLabel}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => setConfirmation(null)}
          showCancel={false}
          title={confirmation.title}
          tone="warning"
        />
      ) : null}

      {/* Reject Request Dialog */}
      {rejectingRequest && (
        <Modal
          isOpen
          onClose={() => setRejectingRequest(null)}
          maxWidth="sm"
          dismissible={!processingRequestId}
          title={t("shared.rejectRequestTitle")}
        >
          <div className="space-y-4 pt-1">
            <p className="text-xs text-slate-600">
              {t("shared.rejectRequestTitle")}:{" "}
              <span className="font-bold text-slate-900">
                {formatCurrency(toNumber(rejectingRequest.amount), currency)}
              </span>
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t("shared.rejectReasonLabel")}
              </label>
              <textarea
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-semibold focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
                rows={3}
                placeholder={t("shared.rejectReasonPlaceholder")}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRejectingRequest(null)}
                disabled={Boolean(processingRequestId)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={Boolean(processingRequestId)}
                onClick={() => void handleConfirmReject()}
                className="bg-kash-expense hover:bg-red-700"
              >
                {processingRequestId ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                {t("shared.confirmRejectBtn")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
