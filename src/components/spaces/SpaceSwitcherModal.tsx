import { Check, Plus, User, Briefcase, MoreVertical, Edit2, Archive } from "lucide-react";
import { useState } from "react";
import { useActiveSpace } from "../../context/ActiveSpaceContext";
import { useI18n } from "../../i18n";
import type { FinancialSpace } from "../../types/domain";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { Modal } from "../ui/Modal";
import { ConfirmationDialog } from "../ui/ConfirmationDialog";
import { CreateSpaceModal } from "./CreateSpaceModal";

type SpaceSwitcherModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function SpaceSwitcherModal({ isOpen, onClose }: SpaceSwitcherModalProps) {
  const { t } = useI18n();
  const {
    spaces,
    personalSpace,
    activeSpaceId,
    setActiveSpace,
    renameManagedSpace,
    archiveManagedSpace,
  } = useActiveSpace();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState<FinancialSpace | null>(null);
  const [editName, setEditName] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [archivingSpace, setArchivingSpace] = useState<FinancialSpace | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const managedSpaces = spaces.filter((s) => s.space_type === "managed" && !s.is_archived);

  const handleSelect = (space: FinancialSpace) => {
    setActiveSpace(space.id);
    onClose();
  };

  const handleStartRename = (e: React.MouseEvent, space: FinancialSpace) => {
    e.stopPropagation();
    setEditingSpace(space);
    setEditName(space.name);
    setEditError(null);
  };

  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSpace) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError(t("spaces.spaceName") + " " + t("common.required").toLowerCase());
      return;
    }

    setEditLoading(true);
    setEditError(null);
    try {
      await renameManagedSpace(editingSpace.id, trimmed);
      setEditingSpace(null);
    } catch (err: any) {
      setEditError(err?.message || t("common.error"));
    } finally {
      setEditLoading(false);
    }
  };

  const handleStartArchive = (e: React.MouseEvent, space: FinancialSpace) => {
    e.stopPropagation();
    setArchivingSpace(space);
  };

  const handleConfirmArchive = async () => {
    if (!archivingSpace) return;
    setArchiveLoading(true);
    try {
      await archiveManagedSpace(archivingSpace.id);
      setArchivingSpace(null);
    } catch (err) {
      console.error("Failed to archive space:", err);
    } finally {
      setArchiveLoading(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t("spaces.switchSpace")}
        maxWidth="sm"
      >
        <div className="flex flex-col gap-5 pt-1 pb-2">
          {/* Personal Section */}
          <div>
            <p className="px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
              {t("spaces.personal")}
            </p>
            <div className="mt-2 flex flex-col gap-1">
              {personalSpace ? (
                <button
                  type="button"
                  onClick={() => handleSelect(personalSpace)}
                  className={`flex w-full touch-manipulation items-center justify-between rounded-xl px-3.5 py-3 text-left transition active:scale-[0.99] ${
                    activeSpaceId === personalSpace.id
                      ? "bg-kash-selected/70 text-kash-emeraldDark"
                      : "text-slate-700 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-slate-50 active:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        activeSpaceId === personalSpace.id
                          ? "bg-kash-emerald text-white"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <User size={18} strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-slate-900">
                        {personalSpace.name || t("spaces.personal")}
                      </p>
                      <p className="truncate text-xs font-semibold text-slate-500">
                        {t("spaces.personalBadge")}
                      </p>
                    </div>
                  </div>
                  {activeSpaceId === personalSpace.id ? (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-kash-emerald text-white">
                      <Check size={14} strokeWidth={3} />
                    </span>
                  ) : null}
                </button>
              ) : null}
            </div>
          </div>

          {/* Managed Section */}
          <div>
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t("spaces.managed")}
              </p>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {managedSpaces.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-center text-xs font-semibold text-slate-400">
                  {t("spaces.noManagedSpaces")}
                </div>
              ) : (
                managedSpaces.map((space) => {
                  const isActive = activeSpaceId === space.id;
                  return (
                    <div
                      key={space.id}
                      onClick={() => handleSelect(space)}
                      className={`group/space flex w-full cursor-pointer touch-manipulation items-center justify-between rounded-xl px-3.5 py-3 text-left transition active:scale-[0.99] ${
                        isActive
                          ? "bg-kash-selected/70 text-kash-emeraldDark"
                          : "text-slate-700 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-slate-50 active:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                            isActive
                              ? "bg-kash-emerald text-white"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <Briefcase size={18} strokeWidth={2.2} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-extrabold text-slate-900">
                            {space.name}
                          </p>
                          <p className="truncate text-xs font-semibold text-slate-500">
                            {t("spaces.managedBadge")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleStartRename(e, space)}
                          aria-label={t("spaces.renameSpace")}
                          className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-700 active:bg-slate-200"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleStartArchive(e, space)}
                          aria-label={t("spaces.archiveSpace")}
                          className="rounded-lg p-1 text-slate-400 transition hover:bg-kash-expense/10 hover:text-kash-expense active:bg-kash-expense/20"
                        >
                          <Archive size={14} />
                        </button>
                        {isActive ? (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-kash-emerald text-white">
                            <Check size={14} strokeWidth={3} />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Add Space Action */}
          <div className="border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => {
                setCreateOpen(true);
              }}
              className="flex w-full touch-manipulation items-center gap-3 rounded-xl border border-dashed border-kash-emerald/40 px-3.5 py-3 text-sm font-bold text-kash-emeraldDark transition hover:border-kash-emerald hover:bg-kash-selected/40 active:scale-[0.99] active:bg-kash-selected"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-kash-emerald/10 text-kash-emeraldDark">
                <Plus size={18} strokeWidth={2.5} />
              </div>
              <span>{t("spaces.addSpace")}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Create Modal */}
      <CreateSpaceModal
        isOpen={createOpen}
        onClose={() => {
          setCreateOpen(false);
        }}
      />

      {/* Rename Modal */}
      {editingSpace ? (
        <Modal
          isOpen={true}
          onClose={() => setEditingSpace(null)}
          title={t("spaces.renameSpace")}
          maxWidth="sm"
        >
          <form onSubmit={handleSaveRename} className="flex flex-col gap-5 pt-2 pb-1">
            {editError ? (
              <div className="rounded-xl border border-kash-expense/20 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">
                {editError}
              </div>
            ) : null}
            <FormField
              id="edit-space-name-input"
              label={t("spaces.spaceName")}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t("spaces.spaceNamePlaceholder")}
              maxLength={50}
              disabled={editLoading}
              autoFocus
              required
              hasError={Boolean(editError)}
            />
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditingSpace(null)}
                disabled={editLoading}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={editLoading || !editName.trim()}
              >
                {editLoading ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* Archive Confirmation Dialog */}
      {archivingSpace ? (
        <ConfirmationDialog
          title={t("spaces.archiveSpace")}
          description={t("spaces.archiveConfirm")}
          confirmLabel={t("common.archive")}
          tone="danger"
          onConfirm={handleConfirmArchive}
          onCancel={() => setArchivingSpace(null)}
        />
      ) : null}
    </>
  );
}
