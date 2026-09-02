import { NavLink } from "react-router-dom";
import { mobileMoreItems } from "../../app/navigation";
import { useActiveSpace } from "../../context/ActiveSpaceContext";
import { Modal } from "../ui/Modal";
import { useI18n } from "../../i18n";

type MobileMoreSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function MobileMoreSheet({ open, onClose }: MobileMoreSheetProps) {
  const { t } = useI18n();
  const { activeSpace } = useActiveSpace();

  const getLocalizedLabel = (path: string, defaultLabel: string) => {
    switch (path) {
      case "/dashboard": return t("nav.dashboard");
      case "/transactions": return t("nav.transactions");
      case "/budgets": return t("nav.budgets");
      case "/wallets": return t("nav.wallets");
      case "/calendar": return t("nav.calendar");
      case "/reports": return t("reports.title");
      case "/goals": return t("nav.goals");
      case "/shared-savings": return t("nav.sharedSavings");
      case "/debts": return t("nav.debts");
      case "/subscriptions": return t("nav.subscriptions");
      case "/settings": return t("nav.settings");
      default: return defaultLabel;
    }
  };

  return (
    <Modal
        isOpen={open}
        onClose={onClose}
        maxWidth="sm"
        title={t("nav.more")}
      >
        <div className="grid max-h-[min(68dvh,34rem)] gap-1.5 overflow-y-auto px-0.5 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
      </Modal>
  );
}
