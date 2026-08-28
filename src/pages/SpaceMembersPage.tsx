import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Users, UserPlus, Edit3, Trash2, ArrowLeft, Shield, Crown, Eye, UserCheck } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { StatusBadge } from "../components/ui/StatusBadge";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { AddMemberModal } from "../components/spaces/AddMemberModal";
import { EditMemberRoleModal } from "../components/spaces/EditMemberRoleModal";
import { useActiveSpace } from "../context/ActiveSpaceContext";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { getManagedSpaceMembers, removeManagedSpaceMember } from "../lib/spaces";
import type { ManagedSpaceMemberItem, ManagedSpaceRole } from "../types/domain";

export function SpaceMembersPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeSpace } = useActiveSpace();
  const navigate = useNavigate();

  const [members, setMembers] = useState<ManagedSpaceMemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<ManagedSpaceMemberItem | null>(null);
  const [removingMember, setRemovingMember] = useState<ManagedSpaceMemberItem | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const isManaged = activeSpace?.space_type === "managed";
  const spaceId = activeSpace?.id;

  const loadMembers = useCallback(async () => {
    if (!spaceId || !isManaged) {
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await getManagedSpaceMembers(spaceId);
      if (fetchError) {
        setError(fetchError.message || t("common.error"));
      } else {
        setMembers(data || []);
      }
    } catch (err: any) {
      setError(err?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [spaceId, isManaged, t]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // Determine current user's membership role
  const currentMember = members.find((m) => m.user_id === user?.id);
  const isSpaceOwner = activeSpace?.owner_user_id === user?.id;
  const callerRole: ManagedSpaceRole = isSpaceOwner
    ? "owner"
    : (currentMember?.role ?? "viewer");

  const canManageMembers = callerRole === "owner" || callerRole === "admin";

  const handleConfirmRemove = async () => {
    if (!removingMember || !spaceId) return;

    setRemoveLoading(true);
    try {
      const { error: removeError } = await removeManagedSpaceMember(spaceId, removingMember.user_id);
      if (removeError) {
        alert(removeError.message || t("common.error"));
      } else {
        await loadMembers();
        setRemovingMember(null);
      }
    } catch (err: any) {
      alert(err?.message || t("common.error"));
    } finally {
      setRemoveLoading(false);
    }
  };

  // Helper to check if caller can edit role of a specific member
  const canEditMemberRole = (target: ManagedSpaceMemberItem) => {
    if (target.role === "owner") return false; // Owner can never be edited
    if (callerRole === "owner") return true; // Owner can edit anyone else
    if (callerRole === "admin") {
      // Admin can only change member <-> viewer (not other admins or owner)
      return target.role === "member" || target.role === "viewer";
    }
    return false;
  };

  // Helper to check if caller can remove a specific member
  const canRemoveMember = (target: ManagedSpaceMemberItem) => {
    if (target.role === "owner") return false; // Owner cannot be removed
    if (callerRole === "owner") return true; // Owner can remove admin, member, viewer
    if (callerRole === "admin") {
      // Admin can only remove member or viewer
      return target.role === "member" || target.role === "viewer";
    }
    return false;
  };

  const getRoleBadge = (role: ManagedSpaceRole) => {
    switch (role) {
      case "owner":
        return <StatusBadge tone="emerald" label={t("spaces.roleOwner") || "Owner"} size="sm" />;
      case "admin":
        return <StatusBadge tone="purple" label={t("spaces.roleAdmin") || "Admin"} size="sm" />;
      case "member":
        return <StatusBadge tone="info" label={t("spaces.roleMember") || "Member"} size="sm" />;
      case "viewer":
        return <StatusBadge tone="neutral" label={t("spaces.roleViewer") || "Viewer"} size="sm" />;
      default:
        return <StatusBadge tone="neutral" label={role} size="sm" />;
    }
  };

  const getRoleIcon = (role: ManagedSpaceRole) => {
    switch (role) {
      case "owner":
        return <Crown size={15} className="text-kash-emerald" />;
      case "admin":
        return <Shield size={15} className="text-purple-600" />;
      case "member":
        return <UserCheck size={15} className="text-blue-600" />;
      case "viewer":
        return <Eye size={15} className="text-slate-500" />;
      default:
        return <Users size={15} className="text-slate-400" />;
    }
  };

  if (!isManaged) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <PageHeader
          eyebrow="Settings"
          icon={Users}
          title={t("spaces.members") || "Anggota Space"}
          description={t("spaces.membersDesc") || "Kelola anggota dan hak akses untuk Financial Space ini."}
        />
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <Users size={24} />
          </div>
          <h3 className="mt-4 text-base font-extrabold text-slate-900">
            {t("spaces.onlyManagedSpacesHaveMembers") || "Pengelolaan anggota hanya tersedia untuk Financial Space kelolaan."}
          </h3>
          <p className="mt-1 text-xs font-semibold text-slate-500 max-w-md mx-auto">
            Personal Space bersifat pribadi untuk pemilik akun. Beralihlah ke Managed Space untuk melihat atau mengelola anggota.
          </p>
          <div className="mt-6 flex justify-center">
            <Button variant="secondary" onClick={() => navigate("/settings")}>
              <ArrowLeft size={16} />
              {t("common.back") || "Kembali ke Pengaturan"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4">
      <PageHeader
        eyebrow={activeSpace?.name || "Managed Space"}
        icon={Users}
        title={t("spaces.members") || "Anggota Space"}
        description={t("spaces.membersDesc") || "Kelola anggota dan hak akses untuk Financial Space ini."}
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              <ArrowLeft size={15} />
              <span className="hidden sm:inline">{t("common.back") || "Pengaturan"}</span>
            </Link>
            {canManageMembers ? (
              <Button onClick={() => setAddModalOpen(true)}>
                <UserPlus size={16} />
                <span>{t("spaces.addMember") || "Tambah Anggota"}</span>
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? (
        <div className="rounded-xl border border-kash-expense/20 bg-kash-expense/10 p-4 text-xs font-bold text-kash-expense">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-slate-900">
              {t("spaces.members") || "Daftar Anggota"}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-extrabold text-slate-600">
              {members.length}
            </span>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            Peran Anda: <strong className="text-slate-800 capitalize">{callerRole}</strong>
          </span>
        </div>

        {loading ? (
          <div className="p-6 flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-xs font-semibold text-slate-400">
              {t("spaces.noMembers") || "Belum ada anggota di space ini."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {members.map((member) => {
              const isCurrentUser = member.user_id === user?.id;
              const displayName = member.full_name || "Pengguna KASH";
              const initial = displayName.charAt(0).toUpperCase();
              const canEdit = canEditMemberRole(member);
              const canRemove = canRemoveMember(member);

              return (
                <div
                  key={member.user_id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-slate-50/50 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={displayName}
                        className="h-10 w-10 shrink-0 rounded-full object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kash-emerald text-sm font-black text-white shadow-xs">
                        {initial}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-extrabold text-slate-900">
                          {displayName}
                        </p>
                        {isCurrentUser ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-600">
                            {t("spaces.you") || "Anda"}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                          {getRoleIcon(member.role)}
                          {getRoleBadge(member.role)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    {canEdit ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingMember(member)}
                        className="h-8 px-2.5 text-xs font-bold"
                      >
                        <Edit3 size={13} />
                        <span>{t("spaces.changeRole") || "Ubah Peran"}</span>
                      </Button>
                    ) : null}

                    {canRemove ? (
                      <button
                        type="button"
                        onClick={() => setRemovingMember(member)}
                        aria-label={`${t("spaces.removeMember")} ${displayName}`}
                        title={t("spaces.removeMember") || "Hapus Anggota"}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-kash-expense/30 hover:bg-kash-expense/10 hover:text-kash-expense transition"
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {spaceId ? (
        <AddMemberModal
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          spaceId={spaceId}
          callerRole={callerRole}
          onMemberAdded={loadMembers}
        />
      ) : null}

      {/* Edit Role Modal */}
      {editingMember && spaceId ? (
        <EditMemberRoleModal
          isOpen={Boolean(editingMember)}
          onClose={() => setEditingMember(null)}
          spaceId={spaceId}
          member={editingMember}
          callerRole={callerRole}
          onRoleUpdated={loadMembers}
        />
      ) : null}

      {/* Remove Member Confirmation Dialog */}
      {removingMember ? (
        <ConfirmationDialog
          title={t("spaces.removeMember") || "Hapus Anggota"}
          description={
            (t("spaces.removeMemberConfirm") || "Apakah Anda yakin ingin menghapus anggota ini?") +
            ` (${removingMember.full_name || "Pengguna KASH"})`
          }
          confirmLabel={t("common.delete") || "Hapus"}
          tone="danger"
          onConfirm={handleConfirmRemove}
          onCancel={() => setRemovingMember(null)}
          isLoading={removeLoading}
        />
      ) : null}
    </div>
  );
}

export default SpaceMembersPage;
