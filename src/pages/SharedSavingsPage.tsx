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
import { FilterTabs } from "../components/ui/FilterTabs";
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
import { useI18n } from "../i18n";

export function SharedSavingsPage() {
  const { profile } = useAuth();
  const { t, formatDate, formatCurrency: formatMoney } = useI18n();
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

  const tabOptions = useMemo(() => [
    { label: t("shared.poolBalance"), value: "spaces", count: spaces.length },
    { label: t("shared.invitations"), value: "invites", count: invites.length },
  ], [spaces.length, invites.length, t]);

  return (
    <div className="w-full min-w-0 space-y-5">
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
        <FilterTabs
          options={tabOptions}
          value={activeTab}
          onChange={(val) => setActiveTab(val as "spaces" | "invites")}
        />

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
          {/* Summary Cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Total Saldo Gabungan
              </span>
              <p className="mt-1.5 text-xl font-extrabold text-slate-900">
                {formatMoney(totals.totalPool, currency)}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                Dari {spaces.length} ruang tabungan bersama
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Hak Milik Saya (Net Share)
              </span>
              <p className="mt-1.5 text-xl font-extrabold text-kash-emeraldDark">
                {formatMoney(totals.totalMyShare, currency)}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                Akumulasi bagian dana milik Anda
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Menunggu Persetujuan
              </span>
              <p className="mt-1.5 text-xl font-extrabold text-slate-900">
                {totals.totalPendingRequests} Permintaan
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                Setoran atau penarikan yang butuh respon
              </p>
            </div>
          </div>

          {/* Spaces Grid */}
          {spaces.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-kash-emeraldDark">
                <UsersRound size={32} />
              </div>
              <h3 className="mt-4 text-lg font-extrabold text-slate-900">
                {t("shared.emptyTitle")}
              </h3>
              <p className="mx-auto mt-1.5 max-w-sm text-xs font-semibold text-slate-600">
                {t("shared.emptyDesc")}
              </p>
              <Button onClick={() => setShowCreateModal(true)} className="mt-5">
                <Plus aria-hidden="true" size={16} />
                Buat Tabungan Pertama
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {spaces.map((item) => {
                const { space, myShare, isOwner, isAccountHolder, isApprover, pendingRequestsCount, accountHolderName } = item;
                const target = space.target_amount ? toNumber(space.target_amount) : null;
                const current = toNumber(space.current_balance);
                const progressPct = target && target > 0 ? Math.min(100, Math.round((current / target) * 100)) : null;

                return (
                  <Link
                    key={space.shared_savings_id}
                    to={`/shared-savings/${space.shared_savings_id}`}
                    className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-kash-emerald/40 hover:shadow-md"
                  >
                    <div className="space-y-4">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <span
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-xs"
                            style={{ backgroundColor: space.color || "#10B981" }}
                          >
                            <Users size={22} strokeWidth={2.2} />
                          </span>
                          <div className="min-w-0">
                            <h4 className="text-base font-extrabold text-slate-900 group-hover:text-kash-emeraldDark transition truncate">
                              {space.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                              <span>{space.active_members_count} Anggota</span>
                              <span>•</span>
                              <span>Holder: {accountHolderName}</span>
                            </div>
                          </div>
                        </div>

                        {/* Badges */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {isOwner && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                              <Crown size={11} /> Owner
                            </span>
                          )}
                          {!isOwner && isAccountHolder && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                              <Landmark size={11} /> Pemegang Rekening
                            </span>
                          )}
                          {!isOwner && !isAccountHolder && isApprover && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-kash-emeraldDark">
                              <ShieldCheck size={11} /> Approver
                            </span>
                          )}
                          {pendingRequestsCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-kash-expense animate-pulse">
                              <Clock size={11} /> {pendingRequestsCount} Butuh Respon
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Balances */}
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                        <div>
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Total Saldo
                          </span>
                          <p className="text-base font-extrabold text-slate-900">
                            {formatMoney(current, currency)}
                          </p>
                        </div>
                        <div>
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Porsi Hak Anda
                          </span>
                          <p className="text-base font-extrabold text-kash-emeraldDark">
                            {formatMoney(myShare, currency)}
                          </p>
                        </div>
                      </div>

                      {/* Progress Bar (if target exists) */}
                      {target !== null && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-slate-600">
                              Target: {formatMoney(target, currency)}
                            </span>
                            <span className="text-kash-emeraldDark">{progressPct}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${progressPct}%`,
                                backgroundColor: space.color || "#10B981",
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-end text-xs font-bold text-kash-emerald group-hover:translate-x-0.5 transition">
                      Detail Tabungan <ChevronRight size={15} />
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
              <h3 className="mt-4 text-base font-extrabold text-slate-900">{t("shared.noPendingInvites")}</h3>
              <p className="mx-auto mt-1 max-w-md text-xs font-semibold text-slate-600">
                {t("shared.noPendingInvitesDesc")}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {invites.map((inv) => {
                const isResponding = respondingInviteId === inv.id;
                const target = inv.shared_savings?.target_amount ? toNumber(inv.shared_savings.target_amount) : null;
                const inviterDisplayName = inv.inviter_name || "User";

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
                            <span className="font-bold text-slate-700">
                              {t("shared.invitedBy", { name: inviterDisplayName })}
                            </span>
                          </p>
                          {inv.owner_name && inv.inviter_name !== inv.owner_name && (
                            <p className="text-slate-500">
                              ({t("shared.owner")}: <span className="font-semibold text-slate-700">{inv.owner_name}</span>)
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-[11px] text-slate-500">
                          {target !== null && (
                            <span className="font-semibold text-kash-emeraldDark">
                              Target: {formatMoney(target, currency)}
                            </span>
                          )}
                          {inv.shared_savings?.deadline && (
                            <span>
                              Deadline: {formatDate(inv.shared_savings.deadline)}
                            </span>
                          )}
                          <span>
                            {t("shared.validUntil")}: {formatDate(inv.expires_at)}
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
                        {t("shared.rejectInvite")}
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
                        {t("shared.acceptInvite")}
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
