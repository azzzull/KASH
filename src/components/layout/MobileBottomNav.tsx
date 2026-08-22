import { Menu, Plus } from "lucide-react";
import { NavLink } from "react-router-dom";
import { mobilePrimaryItems } from "../../app/navigation";
import { useI18n } from "../../i18n";

type MobileBottomNavProps = {
  onMore: () => void;
  onNavigateIntent?: (path: string) => void;
  onQuickAdd: () => void;
  pendingPath?: string | null;
};

export function MobileBottomNav({ onMore, onNavigateIntent, onQuickAdd, pendingPath }: MobileBottomNavProps) {
  const { t } = useI18n();
  const [home, transactions, analytics] = mobilePrimaryItems;
  const pendingBasePath = pendingPath?.split("?")[0] ?? null;

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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-kash-emerald/15 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-soft backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-center gap-1">
        {[home, transactions].map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onPointerDown={() => onNavigateIntent?.(item.path)}
            onClick={(event) => {
              if (pendingBasePath === item.path) event.preventDefault();
              onNavigateIntent?.(item.path);
            }}
            className={({ isActive }) =>
              `flex h-14 touch-manipulation flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold transition active:scale-[0.98] active:bg-kash-selected/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20 ${
                isActive || pendingBasePath === item.path ? "bg-kash-selected/60 text-kash-emeraldDark" : "text-slate-600 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-selected/60 [@media(hover:hover)_and_(pointer:fine)]:hover:text-kash-emeraldDark"
              }`
            }
          >
            <item.icon aria-hidden="true" size={19} strokeWidth={2} />
            <span>{getLocalizedNavLabel(item.path, item.label)}</span>
          </NavLink>
        ))}

        <button
          aria-label="Add transaction"
          className="mx-auto flex h-12 w-12 touch-manipulation items-center justify-center rounded-full bg-kash-emerald text-white shadow-soft transition [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-emeraldDark active:scale-95 active:bg-kash-emeraldPressed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20"
          onClick={onQuickAdd}
          type="button"
        >
          <Plus aria-hidden="true" size={22} strokeWidth={2.4} />
        </button>

        <NavLink
          to={analytics.path}
          onPointerDown={() => onNavigateIntent?.(analytics.path)}
          onClick={(event) => {
            if (pendingBasePath === analytics.path) event.preventDefault();
            onNavigateIntent?.(analytics.path);
          }}
          className={({ isActive }) =>
            `flex h-14 touch-manipulation flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold transition active:scale-[0.98] active:bg-kash-selected/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20 ${
              isActive || pendingBasePath === analytics.path ? "bg-kash-selected/60 text-kash-emeraldDark" : "text-slate-600 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-selected/60 [@media(hover:hover)_and_(pointer:fine)]:hover:text-kash-emeraldDark"
            }`
          }
        >
          <analytics.icon aria-hidden="true" size={19} strokeWidth={2} />
          <span>{getLocalizedNavLabel(analytics.path, analytics.label)}</span>
        </NavLink>

        <button
          className="flex h-14 touch-manipulation flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold text-slate-600 transition [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-selected/60 [@media(hover:hover)_and_(pointer:fine)]:hover:text-kash-emeraldDark active:scale-[0.98] active:bg-kash-selected/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20"
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
