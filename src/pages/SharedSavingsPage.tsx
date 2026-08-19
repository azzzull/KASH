import {
  ArrowDownRight,
  ArrowUpLeft,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Crown,
  HandCoins,
  Inbox,
  Landmark,
  Loader2,
  Mail,
  Plus,
  Receipt,
  ShieldCheck,
  Target,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { CreateSharedSavingsModal } from "../components/sharedSavings/CreateSharedSavingsModal";
import {
  getPendingSharedSavingsInvites,
  getSharedSavingsSpaces,
  respondToSharedSavingsInvite,
} from "../lib/sharedSavings";
import { formatCurrency, toNumber } from "../lib/money";
import type { SharedSavingsInvite, SharedSavingsSpaceSummary } from "../types/domain";
import { useAuth } from "../context/AuthContext";

export function SharedSavingsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [spaces, setSpaces] = useState<SharedSavingsSpaceSummary[]>([]);
  const [invites, setInvites] = useState<SharedSavingsInvite[]>([]);
  const [activeTab, setActiveTab] = useState<"spaces" | "invites">("spaces");
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [spacesData, invitesData] = await Promise.all([
        getSharedSavingsSpaces(),
        getPendingSharedSavingsInvites(),
      ]);
      setSpaces(spacesData);
      setInvites(invitesData);
    } catch (err: any) {
      setError(err.message || "Gagal memuat data Tabungan Bersama.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleInviteAction = async (inviteId: string, action: "accept" | "reject") => {
    setRespondingInviteId(inviteId);
    try {
      await respondToSharedSavingsInvite(inviteId, action);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Gagal merespon undangan.");
    } finally {
      setRespondingInviteId(null);
    }
  };

  const currency = profile?.default_currency ?? "IDR";

  const totals = useMemo(() => {
    let totalPool = 0;
    let totalMyShare = 0;
    let totalPendingRequests = 0;

    spaces.forEach((s) => {
      totalPool += toNumber(s.space.current_balance);
      totalMyShare += toNumber(s.myShare);
      totalPendingRequests += s.pendingRequestsCount;
    });

    return { totalPool, totalMyShare, totalPendingRequests };
  }, [spaces]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-4 md:px-6 md:py-6 pb-28 md:pb-8">
      <PageHeader
        eyebrow="Finance"
        icon={UsersRound}
        title="Tabungan Bersama"
        description="Kelola dana tabungan bersama anggota keluarga atau teman secara transparan & aman."
      />

      {error && (
        <section className="rounded-xl border border-kash-expense/30 bg-white p-5 shadow-sm">
          <h3 className="text-base font-extrabold text-slate-900">Terjadi Kesalahan</h3>
          <p className="mt-2 text-sm font-semibold text-slate-700">{error}</p>
          <Button className="mt-4" onClick={() => void loadData()}>
            Coba Lagi
          </Button>
        </section>
      )}

      {/* Header Toolbar: Left Tabs & Right Create Button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("spaces")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
              activeTab === "spaces"
                ? "bg-kash-emerald text-white shadow-xs"
                : "border border-slate-200 bg-white text-slate-600 hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-slate-900"
            }`}
          >
            <Users size={15} />
            Tabungan Bersama ({spaces.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("invites")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
              activeTab === "invites"
                ? "bg-kash-emerald text-white shadow-xs"
                : "border border-slate-200 bg-white text-slate-600 hover:border-kash-emerald/40 hover:bg-kash-selected/40 hover:text-slate-900"
            }`}
          >
            <Mail size={15} />
            Undangan Masuk
            {invites.length > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                  activeTab === "invites"
                    ? "bg-white text-kash-emeraldDark"
                    : "bg-kash-emerald text-white"
                }`}
              >
                {invites.length}
              </span>
            )}
          </button>
        </div>

        <Button onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto">
          <Plus aria-hidden="true" size={18} />
          Buat Tabungan Bersama
        </Button>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" />
          ))}
        </div>
      )}

      {/* Tab 1: Spaces List */}
      {!loading && activeTab === "spaces" && (
        <>
          {spaces.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-xs">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-kash-selected text-kash-emeraldDark">
                <UsersRound size={28} />
              </div>
              <h3 className="mt-4 text-base font-extrabold text-slate-900">Belum Ada Tabungan Bersama</h3>
              <p className="mx-auto mt-1 max-w-md text-xs font-semibold text-slate-600">
                Buat ruang tabungan bersama pertama Anda untuk mulai menabung bersama pasangan, keluarga, atau rekan
                secara transparan.
              </p>
              <Button onClick={() => setShowCreateModal(true)} className="mt-5">
                <Plus size={16} />
                Buat Tabungan Baru
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {spaces.map((s) => {
                const space = s.space;
                const target = space.target_amount ? toNumber(space.target_amount) : null;
                const balance = toNumber(space.current_balance);
                const myShare = toNumber(s.myShare);
                const progressPct = target && target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : null;

                return (
                  <Link
                    key={space.shared_savings_id}
                    to={`/shared-savings/${space.shared_savings_id}`}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                  >
                    <div>
                      {/* Top Badges & Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-xs"
                            style={{ backgroundColor: space.color || "#10B981" }}
                          >
                            <Users size={20} strokeWidth={2.2} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-base font-extrabold text-slate-900 group-hover:text-kash-emeraldDark truncate">
                              {space.name}
                            </h3>
                            <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mt-0.5">
                              <Landmark size={13} className="text-slate-400" />
                              Holder: <span className="font-bold text-slate-700">{s.accountHolderName}</span>
                            </p>
                          </div>
                        </div>

                        {/* Role Badge */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {s.isOwner ? (
                            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-black text-amber-800">
                              <Crown size={11} /> Owner
                            </span>
                          ) : s.isApprover ? (
                            <span className="flex items-center gap-1 rounded-full bg-kash-selected px-2.5 py-0.5 text-[11px] font-black text-kash-emeraldDark">
                              <ShieldCheck size={11} /> Approver
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                              Member
                            </span>
                          )}

                          {s.pendingRequestsCount > 0 && (
                            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white">
                              {s.pendingRequestsCount} pending
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Balances Breakdown */}
                      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Porsi Saya</p>
                          <p className="text-sm font-black text-kash-emeraldDark">
                            {formatCurrency(myShare, currency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Saldo</p>
                          <p className="text-sm font-black text-slate-900">
                            {formatCurrency(balance, currency)}
                          </p>
                        </div>
                      </div>

                      {/* Optional Target Progress */}
                      {target !== null && (
                        <div className="mt-3.5 space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                            <span className="flex items-center gap-1 text-[11px]">
                              <Target size={13} className="text-slate-400" />
                              Target: {formatCurrency(target, currency)}
                            </span>
                            <span className="font-extrabold text-slate-900">{progressPct}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
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
                    </div>

                    {/* Bottom Metadata & Arrow */}
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Users size={13} className="text-slate-400" />
                        {space.active_members_count} Anggota
                      </span>

                      {space.deadline && (
                        <span className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                          <Calendar size={13} />
                          {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(space.deadline))}
                        </span>
                      )}

                      <span className="flex items-center text-xs font-bold text-kash-emerald group-hover:translate-x-1 transition">
                        Detail <ChevronRight size={15} />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Tab 2: Pending Invitations */}
      {!loading && activeTab === "invites" && (
        <>
          {invites.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-xs">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Inbox size={28} />
              </div>
              <h3 className="mt-4 text-base font-extrabold text-slate-900">Tidak Ada Undangan Tertunda</h3>
              <p className="mx-auto mt-1 max-w-md text-xs font-semibold text-slate-600">
                Saat seseorang mengundang Anda ke tabungan bersama melalui email akun KASH Anda, undangan akan muncul di
                sini.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {invites.map((inv) => {
                const isResponding = respondingInviteId === inv.id;
                const target = inv.shared_savings?.target_amount ? toNumber(inv.shared_savings.target_amount) : null;

                return (
                  <div
                    key={inv.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <span
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-xs"
                        style={{ backgroundColor: inv.shared_savings?.color || "#10B981" }}
                      >
                        <Users size={22} strokeWidth={2.2} />
                      </span>
                      <div className="min-w-0 space-y-1">
                        <h4 className="text-base font-extrabold text-slate-900 truncate">
                          {inv.shared_savings?.name || "Tabungan Bersama"}
                        </h4>

                        <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-600">
                          <p>
                            Pemilik (Owner):{" "}
                            <span className="font-extrabold text-slate-900">{inv.owner_name}</span>
                          </p>
                          {inv.inviter_name !== inv.owner_name && (
                            <p>
                              Diundang oleh:{" "}
                              <span className="font-bold text-slate-800">{inv.inviter_name}</span>
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-[11px] text-slate-500">
                          {target !== null && (
                            <span className="font-semibold text-kash-emeraldDark">
                              Target: {formatCurrency(target, currency)}
                            </span>
                          )}
                          {inv.shared_savings?.deadline && (
                            <span>
                              Deadline:{" "}
                              {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(
                                new Date(inv.shared_savings.deadline)
                              )}
                            </span>
                          )}
                          <span>
                            Undangan berlaku s/d:{" "}
                            {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(
                              new Date(inv.expires_at)
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isResponding}
                        onClick={() => void handleInviteAction(inv.id, "reject")}
                        className="min-h-9 px-3.5 text-xs text-slate-600 hover:text-kash-expense hover:bg-red-50"
                      >
                        <X size={14} />
                        Tolak
                      </Button>
                      <Button
                        type="button"
                        disabled={isResponding}
                        onClick={() => void handleInviteAction(inv.id, "accept")}
                        className="min-h-9 px-4 text-xs"
                      >
                        {isResponding ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                        Gabung Tabungan
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Create Space Modal */}
      <CreateSharedSavingsModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={(spaceId) => {
          void loadData();
          navigate(`/shared-savings/${spaceId}`);
        }}
      />
    </div>
  );
}
