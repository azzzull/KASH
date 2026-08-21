import { Menu, Plus } from "lucide-react";
import { NavLink } from "react-router-dom";
import { mobilePrimaryItems } from "../../app/navigation";
import { useI18n } from "../../i18n";

type MobileBottomNavProps = {
  onMore: () => void;
  onQuickAdd: () => void;
  visible?: boolean;
};

export function MobileBottomNav({ onMore, onQuickAdd, visible = true }: MobileBottomNavProps) {
  const { t } = useI18n();
  const [home, transactions, analytics] = mobilePrimaryItems;

  const getLocalizedNavLabel = (path: string, defaultLabel: string) => {
    switch (path) {
      case "/dashboard": return t("nav.dashboard");
      case "/transactions": return t("nav.transactions");
      case "/analytics": return t("nav.analytics");
      default: return defaultLabel;
    }
  };

  return (
    <nav
      aria-label="Mobile navigation"
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-kash-emerald/15 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-soft backdrop-blur transition-transform duration-250 ease-out lg:hidden ${
        visible
          ? "translate-y-0 pointer-events-auto"
          : "translate-y-[calc(100%+env(safe-area-inset-bottom,0px))] pointer-events-none"
      }`}
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-center gap-1">
        {[home, transactions].map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold transition ${
                isActive ? "bg-kash-selected/60 text-kash-emeraldDark" : "text-slate-600 hover:bg-kash-selected/60 hover:text-kash-emeraldDark"
              }`
            }
          >
            <item.icon aria-hidden="true" size={19} strokeWidth={2} />
            <span>{getLocalizedNavLabel(item.path, item.label)}</span>
          </NavLink>
        ))}

        <button
          aria-label="Add transaction"
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-kash-emerald text-white shadow-soft transition hover:bg-kash-emeraldDark active:bg-kash-emeraldPressed focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
          onClick={onQuickAdd}
          type="button"
        >
          <Plus aria-hidden="true" size={22} strokeWidth={2.4} />
        </button>

        <NavLink
          to={analytics.path}
          className={({ isActive }) =>
            `flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold transition ${
              isActive ? "bg-kash-selected/60 text-kash-emeraldDark" : "text-slate-600 hover:bg-kash-selected/60 hover:text-kash-emeraldDark"
            }`
          }
        >
          <analytics.icon aria-hidden="true" size={19} strokeWidth={2} />
          <span>{getLocalizedNavLabel(analytics.path, analytics.label)}</span>
        </NavLink>

        <button
          className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold text-slate-600 transition hover:bg-kash-selected/60 hover:text-kash-emeraldDark"
          onClick={onMore}
          type="button"
        >
          <Menu aria-hidden="true" size={19} strokeWidth={2} />
          <span>{t("nav.more")}</span>
        </button>
      </div>
    </nav>
  );
}
