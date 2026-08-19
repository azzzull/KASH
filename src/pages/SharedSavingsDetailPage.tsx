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
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { PageHeader } from "../components/ui/PageHeader";
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
import { formatCurrency, toNumber } from "../lib/money";
import type {
  SharedSavingsBalance,
  SharedSavingsInvite,
  SharedSavingsLedger,
  SharedSavingsMemberShare,
  SharedSavingsRequest,
} from "../types/domain";
import { useAuth } from "../context/AuthContext";

export function SharedSavingsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
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

  const loadData = async () => {
    if (!id) return;
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
      setError(err.message || "Gagal memuat detail tabungan bersama.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [id]);

  const currency = profile?.default_currency ?? "IDR";
  const currentUserId = profile?.id ?? "";

  const activeMembersCount = useMemo(
    () => members.filter((m) => m.member_status === "active").length,
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
    if (!confirm("Batalkan pengajuan ini?")) return;
    setProcessingRequestId(requestId);
    try {
      await cancelSharedRequest(requestId);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Gagal membatalkan pengajuan.");
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRemoveMember = async (userId: string, memberName: string) => {
    if (!confirm(`Hapus ${memberName} dari tabungan bersama? Pastikan porsi saldo mereka sudah Rp0.`)) return;
    try {
      if (!id) return;
      await removeSharedSavingsMember(id, userId);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Gagal menghapus anggota.");
    }
  };

  const handleLeaveSpace = async () => {
    if (!id) return;
    if (myShare > 0) {
      alert(`Anda masih memiliki porsi saldo sebesar ${formatCurrency(myShare, currency)}. Silakan tarik seluruh porsi Anda terlebih dahulu sebelum keluar.`);
      return;
    }
    if (isOwner) {
      alert("Anda adalah Owner tabungan ini. Silakan alihkan kepemilikan (Owner) ke anggota lain terlebih dahulu sebelum keluar.");
      return;
    }
    if (isAccountHolder) {
      alert("Anda adalah Account Holder tabungan ini. Silakan tunjuk anggota lain sebagai Account Holder terlebih dahulu sebelum keluar.");
      return;
    }
    if (!confirm("Apakah Anda yakin ingin keluar dari tabungan bersama ini?")) return;

    try {
      await removeSharedSavingsMember(id, currentUserId);
      navigate("/shared-savings");
    } catch (err: any) {
      alert(err.message || "Gagal keluar dari tabungan.");
    }
  };

  if (loading) {
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
          <ArrowLeft size={14} /> Kembali ke Tabungan Bersama
        </Link>
        <section className="rounded-2xl border border-kash-expense/30 bg-white p-6 shadow-sm">
          <h3 className="text-base font-extrabold text-slate-900">Ruang Tabungan Tidak Ditemukan</h3>
          <p className="mt-2 text-xs font-semibold text-slate-600">{error || "Data ruang tidak tersedia atau Anda tidak memiliki akses."}</p>
          <Button className="mt-4" onClick={() => navigate("/shared-savings")}>
            Kembali
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-4 md:px-6 md:py-6 pb-28 md:pb-8">
      {/* Back Navigation */}
      <div>
        <Link
          to="/shared-savings"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-kash-emeraldDark transition"
        >
          <ArrowLeft size={14} /> Kembali ke Tabungan Bersama
        </Link>
      </div>

      {/* Main Space Header Card */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-xs"
              style={{ backgroundColor: space.color || "#10B981" }}
            >
              <Users size={24} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold text-slate-900">{space.name}</h1>
                {isOwner && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-black text-amber-800">
                    <Crown size={11} /> Anda Owner
                  </span>
                )}
                {isAccountHolder && (
                  <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-black text-blue-800">
                    <Landmark size={11} /> Account Holder
                  </span>
                )}
                {isApprover && !isOwner && (
                  <span className="flex items-center gap-1 rounded-full bg-kash-selected px-2.5 py-0.5 text-[11px] font-black text-kash-emeraldDark">
                    <ShieldCheck size={11} /> Approver
                  </span>
                )}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-y-1 gap-x-4 text-xs font-semibold text-slate-500">
                <span className="flex items-center gap-1">
                  <Users size={13} className="text-slate-400" />
                  {activeMembersCount} Anggota Aktif
                </span>
                {space.deadline && (
                  <span className="flex items-center gap-1 text-slate-600">
                    <Calendar size={13} className="text-slate-400" />
                    Deadline: {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(space.deadline))}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Primary Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => setShowContributeModal(true)}
              className="min-h-9 px-3.5 text-xs"
            >
              <ArrowDownRight size={15} />
              Setor
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowWithdrawModal(true)}
              disabled={myShare <= 0}
              className="min-h-9 px-3.5 text-xs text-slate-700 hover:text-kash-emeraldDark"
            >
              <ArrowUpLeft size={15} />
              Tarik Porsi
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowSpendingModal(true)}
              className="min-h-9 px-3.5 text-xs text-slate-700 hover:text-kash-emeraldDark"
            >
              <Receipt size={15} />
              Pengeluaran
            </Button>
          </div>
        </div>

        {/* Financial Highlights */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl bg-slate-50 p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Porsi Milik Saya</p>
            <p className="mt-0.5 text-lg font-black text-kash-emeraldDark">{formatCurrency(myShare, currency)}</p>
            <p className="text-[10px] text-slate-500 font-semibold">Tercatat di Net Worth Anda</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Saldo Pool</p>
            <p className="mt-0.5 text-lg font-black text-slate-900">{formatCurrency(balance, currency)}</p>
            <p className="text-[10px] text-slate-500 font-semibold">Total dana bersama</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Pengeluaran</p>
            <p className="mt-0.5 text-lg font-black text-slate-900">
              {formatCurrency(toNumber(space.total_spending), currency)}
            </p>
            <p className="text-[10px] text-slate-500 font-semibold">Telah dibagi rata</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Setoran Masuk</p>
            <p className="mt-0.5 text-lg font-black text-slate-900">
              {formatCurrency(toNumber(space.total_contributions), currency)}
            </p>
            <p className="text-[10px] text-slate-500 font-semibold">Historis akumulasi</p>
          </div>
        </div>

        {/* Optional Target Progress */}
        {target !== null && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5 font-extrabold text-slate-900">
                <Target size={15} className="text-kash-emerald" />
                Target Tabungan: {formatCurrency(target, currency)}
              </span>
              <span className="text-sm font-black text-slate-900">{progressPct}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${progressPct}%`,
                  backgroundColor: space.color || "#10B981",
                }}
              />
            </div>
          </div>
        )}
      </section>

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
          Porsi Anggota ({activeMembersCount})
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
          Permintaan & Persetujuan
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
          Buku Kas & Riwayat ({ledger.length})
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
          Kelola & Pengaturan
        </button>
      </div>

      {/* Tab 1: Members Breakdown */}
      {activeTab === "members" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900">Rincian Kepemilikan Anggota</h3>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowInviteModal(true)}
              className="min-h-8 px-3 text-xs"
            >
              <UserPlus size={14} /> Undang Anggota
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {members.map((m) => {
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
                            Anda
                          </span>
                        )}
                        {m.is_owner && (
                          <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.2 text-[10px] font-black text-amber-800">
                            <Crown size={10} /> Owner
                          </span>
                        )}
                        {m.is_account_holder && (
                          <span className="flex items-center gap-0.5 rounded-full bg-blue-100 px-2 py-0.2 text-[10px] font-black text-blue-800">
                            <Landmark size={10} /> Account Holder
                          </span>
                        )}
                        {m.is_approver && !m.is_owner && (
                          <span className="flex items-center gap-0.5 rounded-full bg-kash-selected px-2 py-0.2 text-[10px] font-black text-kash-emeraldDark">
                            <ShieldCheck size={10} /> Approver
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{m.member_email}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-base font-black text-kash-emeraldDark">
                        {formatCurrency(currentShare, currency)}
                      </p>
                      <p className="text-[11px] font-extrabold text-slate-500">{sharePct}% dari total</p>
                    </div>
                  </div>

                  {/* Member Stats */}
                  <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2.5 text-center text-xs">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500">Disetor</p>
                      <p className="font-extrabold text-slate-800">
                        {formatCurrency(toNumber(m.total_contributed), currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500">Ditarik</p>
                      <p className="font-extrabold text-slate-800">
                        {formatCurrency(toNumber(m.total_withdrawn), currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500">Beban Pengeluaran</p>
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
                        onClick={() => void handleRemoveMember(m.user_id, m.member_name || m.member_email)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-kash-expense hover:underline"
                      >
                        <UserMinus size={12} /> Hapus Anggota (Porsi 0)
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
                Undangan Terkirim ({invites.length})
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
                          Berlaku hingga:{" "}
                          {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(
                            new Date(inv.expires_at)
                          )}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-black text-amber-800 shrink-0">
                      Menunggu Konfirmasi
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
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
            <span className="font-extrabold text-slate-900">Permintaan Transaksi:</span> Tab ini memproses transaksi
            keuangan (<span className="font-bold text-kash-emeraldDark">Setoran</span>,{" "}
            <span className="font-bold text-blue-700">Penarikan Porsi</span>, atau{" "}
            <span className="font-bold text-amber-700">Pengeluaran Bersama</span>) yang diajukan oleh anggota.
          </div>

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
                  ? `Pending (${pendingRequestsCount})`
                  : filter === "approved"
                  ? "Disetujui"
                  : filter === "rejected"
                  ? "Ditolak / Batal"
                  : "Semua"}
              </button>
            ))}
          </div>

          {filteredRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-xs">
              <p className="text-xs font-semibold text-slate-600">Tidak ada data permintaan pada filter ini.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredRequests.map((r) => {
                const isRequester = r.requested_by_user_id === currentUserId;
                const isProcessing = processingRequestId === r.id;
                const amount = toNumber(r.amount);

                // Self-approval logic:
                // If requester == current user AND other approvers exist, hide Approve/Reject
                // If requester != current user OR requester is sole approver, allow Approve/Reject
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
                              ? "Setoran Tabungan"
                              : r.request_type === "withdrawal"
                              ? "Penarikan Porsi"
                              : r.title || "Pengeluaran Bersama"}
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
                          Diajukan oleh: <span className="font-bold text-slate-800">{r.requester_name || r.requester_email}</span>
                          {isRequester && " (Anda)"}
                        </p>

                        {r.note && (
                          <p className="mt-1 text-xs italic text-slate-500 bg-slate-50 px-2 py-1 rounded-md">
                            "{r.note}"
                          </p>
                        )}

                        <p className="mt-1 text-[11px] text-slate-500">
                          {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(
                            new Date(r.created_at)
                          )}
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
                              Menunggu persetujuan Approver lain
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
                                Tolak
                              </Button>
                              <Button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => void handleApprove(r)}
                                className="min-h-8 px-3 text-xs"
                              >
                                {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                Setujui
                              </Button>
                            </>
                          )}

                          {isRequester && (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={isProcessing}
                              onClick={() => void handleCancel(r.id)}
                              className="min-h-8 px-2.5 text-xs text-slate-600 hover:text-kash-expense"
                            >
                              Batalkan
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
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs font-semibold text-slate-700">
            <span className="font-extrabold text-slate-900">Buku Kas (Shared Ledger):</span> Mencatat setiap mutasi
            keuangan yang telah diverifikasi dan disetujui. Total saldo pool selalu sama dengan jumlah seluruh porsi
            anggota.
          </div>

          {ledger.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-xs">
              <p className="text-xs font-semibold text-slate-600">Belum ada mutasi keuangan yang diverifikasi.</p>
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
                            ? "Setoran"
                            : l.event_type === "personal_withdrawal"
                            ? "Penarikan Porsi"
                            : (l.title || "Pengeluaran Bersama")}
                        </p>
                        <p className="text-[11px] font-bold text-slate-700 truncate">
                          {l.event_type === "shared_spending"
                            ? `Diajukan oleh: ${l.requester_name || "Anggota"}`
                            : (l.requester_name || "Anggota")}
                        </p>
                        {l.note && <p className="text-[11px] text-slate-500 truncate">{l.note}</p>}
                        <p className="text-[10px] text-slate-400">
                          {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(
                            new Date(l.created_at)
                          )}
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
                      <span className="rounded-full bg-slate-100 px-2 py-0.2 text-[9px] font-bold uppercase tracking-wider text-slate-600">
                        {l.event_type === "contribution"
                          ? "Setoran"
                          : l.event_type === "personal_withdrawal"
                          ? "Penarikan"
                          : "Pengeluaran"}
                      </span>
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
            <h3 className="text-sm font-extrabold text-slate-900">Kontrol Ruang Tabungan</h3>

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
                    Edit Info Tabungan
                  </p>
                  <p className="text-[11px] text-slate-500">Nama, Target Nominal, Deadline, Warna</p>
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
                    Kelola Hak Approver
                  </p>
                  <p className="text-[11px] text-slate-500">Atur siapa saja yang dapat memverifikasi permintaan</p>
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
                    Tunjuk Account Holder
                  </p>
                  <p className="text-[11px] text-slate-500">Pilih pemegang rekening fisik dana bersama</p>
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
                    Alihkan Kepemilikan (Owner)
                  </p>
                  <p className="text-[11px] text-slate-500">Serahkan kontrol kepemilikan ruang ke anggota lain</p>
                </div>
              </button>
            </div>
          </div>

          {/* Leave Space Card */}
          <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5 space-y-3">
            <h4 className="text-xs font-extrabold text-red-900">Keluar dari Tabungan Bersama</h4>
            <p className="text-xs text-red-700">
              Sebelum keluar, porsi kepemilikan Anda harus bernilai Rp0 (sudah ditarik) dan tidak ada pengajuan tertunda.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleLeaveSpace()}
              className="min-h-9 px-3.5 text-xs text-kash-expense hover:bg-red-100"
            >
              <LogOut size={14} /> Keluar dari Ruang Ini
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
        members={members}
        approvers={approvers}
        onClose={() => setShowApproversModal(false)}
        onUpdated={() => void loadData()}
      />

      <TransferOwnershipModal
        isOpen={showTransferModal}
        spaceId={space.shared_savings_id}
        spaceName={space.name}
        members={members}
        currentOwnerId={space.owner_user_id}
        onClose={() => setShowTransferModal(false)}
        onTransferred={() => void loadData()}
      />

      <SetAccountHolderModal
        isOpen={showAccountHolderModal}
        spaceId={space.shared_savings_id}
        spaceName={space.name}
        members={members}
        currentAccountHolderId={space.account_holder_user_id}
        onClose={() => setShowAccountHolderModal(false)}
        onUpdated={() => void loadData()}
      />

      {/* Reject Request Dialog */}
      {rejectingRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setRejectingRequest(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">Tolak Permintaan</h3>
              <IconButton icon={X} label="Tutup" onClick={() => setRejectingRequest(null)} />
            </div>

            <p className="text-xs text-slate-600">
              Anda akan menolak pengajuan{" "}
              <span className="font-bold text-slate-900">
                {rejectingRequest.request_type === "contribution"
                  ? "Setoran"
                  : rejectingRequest.request_type === "withdrawal"
                  ? "Penarikan"
                  : "Pengeluaran"}
              </span>{" "}
              sebesar{" "}
              <span className="font-bold text-slate-900">
                {formatCurrency(toNumber(rejectingRequest.amount), currency)}
              </span>
              .
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Alasan Penolakan (Opsional)
              </label>
              <textarea
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-semibold focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
                rows={3}
                placeholder="e.g. Bukti transfer belum masuk, nominal tidak sesuai"
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
                Batal
              </Button>
              <Button
                type="button"
                disabled={Boolean(processingRequestId)}
                onClick={() => void handleConfirmReject()}
                className="bg-kash-expense hover:bg-red-700"
              >
                {processingRequestId ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                Konfirmasi Tolak
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
