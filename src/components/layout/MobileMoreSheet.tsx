import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Briefcase, ChevronRight, User } from "lucide-react";
import { mobileMoreItems } from "../../app/navigation";
import { useActiveSpace } from "../../context/ActiveSpaceContext";
import { Modal } from "../ui/Modal";
import { SpaceSwitcherModal } from "../spaces/SpaceSwitcherModal";
import { useI18n } from "../../i18n";

type MobileMoreSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function MobileMoreSheet({ open, onClose }: MobileMoreSheetProps) {
  const { t } = useI18n();
  const { activeSpace } = useActiveSpace();
  const [spaceSwitcherOpen, setSpaceSwitcherOpen] = useState(false);

  const getLocalizedLabel = (path: string, defaultLabel: string) => {
    switch (path) {
      case "/dashboard": return t("nav.dashboard");
      case "/transactions": return t("nav.transactions");
      case "/budgets": return t("nav.budgets");
      case "/wallets": return t("nav.wallets");
      case "/calendar": return t("nav.calendar");
      case "/goals": return t("nav.goals");
      case "/shared-savings": return t("nav.sharedSavings");
      case "/debts": return t("nav.debts");
      case "/subscriptions": return t("nav.subscriptions");
      case "/settings": return t("nav.settings");
      default: return defaultLabel;
    }
  };

  return (
    <>
      <Modal
        isOpen={open}
        onClose={onClose}
        maxWidth="sm"
        title={t("nav.more")}
      >
        <div className="flex flex-col gap-3 pt-1 pb-3">
          {/* Active Space Banner / Switcher */}
          <button
            type="button"
            onClick={() => {
              onClose();
              setSpaceSwitcherOpen(true);
            }}
            className="flex touch-manipulation items-center justify-between gap-3 rounded-xl border border-kash-emerald/20 bg-kash-selected/40 px-3.5 py-3 text-left transition hover:bg-kash-selected/70 active:scale-[0.99] active:bg-kash-selected"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-kash-emerald text-white">
                {activeSpace?.space_type === "managed" ? (
                  <Briefcase size={18} strokeWidth={2.2} />
                ) : (
                  <User size={18} strokeWidth={2.2} />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-slate-900">
                  {activeSpace?.name || t("spaces.personal")}
                </p>
                <p className="truncate text-xs font-semibold text-kash-emeraldDark">
                  {activeSpace?.space_type === "managed"
                    ? t("spaces.managedBadge")
                    : t("spaces.personalBadge")} • {t("spaces.switchSpace")}
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="shrink-0 text-slate-400" />
          </button>

          <div className="grid gap-1.5 border-t border-slate-100 pt-2">
            {mobileMoreItems
              .filter((item) => activeSpace?.space_type !== "managed" || item.path !== "/shared-savings")
              .map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => {
                    onClose();
                  }}
                  className={({ isActive }) =>
                    `flex touch-manipulation items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm font-bold transition active:scale-[0.99] active:bg-kash-selected focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20 ${
                      isActive
                        ? "bg-kash-selected/70 text-kash-emeraldDark"
                        : "text-slate-800 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-selected/70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-kash-emeraldDark"
                    }`
                  }
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-kash-selected text-kash-emeraldDark">
                    <item.icon aria-hidden="true" size={19} strokeWidth={2.2} />
                  </span>
                  <span>{getLocalizedLabel(item.path, item.label)}</span>
                </NavLink>
              ))}
          </div>
        </div>
      </Modal>

      <SpaceSwitcherModal
        isOpen={spaceSwitcherOpen}
        onClose={() => setSpaceSwitcherOpen(false)}
      />
    </>
  );
}
