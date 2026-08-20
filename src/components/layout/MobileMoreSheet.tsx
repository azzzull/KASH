import { NavLink } from "react-router-dom";
import { mobileMoreItems } from "../../app/navigation";
import { Modal } from "../ui/Modal";
import { useI18n } from "../../i18n";

type MobileMoreSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function MobileMoreSheet({ open, onClose }: MobileMoreSheetProps) {
  const { t } = useI18n();

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
    <Modal
      isOpen={open}
      onClose={onClose}
      maxWidth="sm"
      title={t("nav.more")}
    >
      <div className="grid gap-1.5 pt-1 pb-3">
        {mobileMoreItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onClose}
            className="flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm font-bold text-slate-800 transition hover:bg-kash-selected/70 hover:text-kash-emeraldDark active:bg-kash-selected"
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
