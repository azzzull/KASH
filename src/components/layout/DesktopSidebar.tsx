import { Bell, Briefcase, ChevronRight, LogOut, Settings, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { navGroups } from "../../app/navigation";
import { useAuth } from "../../context/AuthContext";
import { useActiveSpace } from "../../context/ActiveSpaceContext";
import { useI18n } from "../../i18n";
import { useNotifications } from "../../context/NotificationContext";
import { ConfirmationDialog } from "../ui/ConfirmationDialog";
import { KashLogo } from "../brand/KashLogo";
import { IconButton } from "../ui/IconButton";
import { NotificationsPopover } from "./NotificationsPopover";
import { SpaceSwitcherModal } from "../spaces/SpaceSwitcherModal";

export function DesktopSidebar() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { activeSpace } = useActiveSpace();
  const { unreadCount } = useNotifications();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [spaceSwitcherOpen, setSpaceSwitcherOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const displayName = profile?.full_name || profile?.email || "Account";
  const subtitle = activeSpace?.name || (activeSpace?.space_type === "managed" ? "Managed Space" : "Personal Space");
  const initial = displayName.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    setLogoutOpen(false);
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    if (!notificationsOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (notificationsRef.current?.contains(event.target as Node)) return;
      setNotificationsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (!profileMenuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (profileMenuRef.current?.contains(event.target as Node)) return;
      setProfileMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileMenuOpen]);

  const { t } = useI18n();

  const getLocalizedNavLabel = (path: string, defaultLabel: string) => {
    switch (path) {
      case "/dashboard": return t("nav.dashboard");
      case "/transactions": return t("nav.transactions");
      case "/budgets": return t("nav.budgets");
      case "/calendar": return t("nav.calendar");
      case "/analytics": return t("nav.analytics");
      case "/wallets": return t("nav.wallets");
      case "/goals": return t("nav.goals");
      case "/shared-savings": return t("nav.sharedSavings");
      case "/debts": return t("nav.debts");
      case "/subscriptions": return t("nav.subscriptions");
      case "/settings": return t("nav.settings");
      default: return defaultLabel;
    }
  };

  const getLocalizedGroupLabel = (groupLabel: string) => {
    switch (groupLabel.toLowerCase()) {
      case "overview": return t("nav.overview");
      case "finance": return t("nav.finance");
      case "account": return t("nav.account");
      default: return groupLabel;
    }
  };

  return (
    <aside className="hidden h-[100dvh] w-64 shrink-0 border-r border-kash-emerald/15 bg-white/95 px-5 py-6 shadow-[8px_0_32px_rgba(16,185,129,0.06)] lg:flex lg:flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <NavLink to="/dashboard" aria-label="KASH Dashboard" className="min-w-0">
          <KashLogo className="h-auto w-36" />
        </NavLink>
        <div ref={notificationsRef} className="relative">
          <button
            type="button"
            onClick={() => setNotificationsOpen((current) => !current)}
            aria-label="Open notifications"
            className="inline-flex h-10 w-10 touch-manipulation shrink-0 items-center justify-center rounded-full border border-kash-emerald/15 bg-white text-slate-700 transition [@media(hover:hover)_and_(pointer:fine)]:hover:border-kash-emeraldDark [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-selected [@media(hover:hover)_and_(pointer:fine)]:hover:text-kash-emeraldDark active:scale-95 active:bg-kash-selected focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20"
            title="Notifications"
          >
            <Bell aria-hidden="true" size={18} strokeWidth={2} />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-kash-expense px-1 text-[10px] font-extrabold leading-none text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </button>
          {notificationsOpen ? (
            <NotificationsPopover
              className="left-[calc(100%+4px)] top-[calc(100%+4px)]"
              onClose={() => setNotificationsOpen(false)}
            />
          ) : null}
        </div>
      </div>

      <nav className="mt-8 min-h-0 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar" aria-label="Main navigation">
        <div className="flex flex-col gap-7">
          {navGroups.map((group) => (
            <section key={group.label}>
              <h2 className="px-3 text-xs font-bold uppercase tracking-normal text-kash-emeraldDark">{getLocalizedGroupLabel(group.label)}</h2>
              <div className="mt-2 flex flex-col gap-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `group/nav flex touch-manipulation items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition active:scale-[0.99] ${
                        isActive
                          ? "bg-kash-selected/70 text-kash-emeraldDark"
                          : "text-slate-700 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-selected/70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-kash-emeraldDark"
                      }`
                    }
                  >
                    <item.icon aria-hidden="true" className="shrink-0" size={19} strokeWidth={2} />
                    <span>{getLocalizedNavLabel(item.path, item.label)}</span>
                  </NavLink>
                ))}
              </div>
            </section>
          ))}
        </div>
      </nav>

      <div ref={profileMenuRef} className="relative shrink-0 border-t border-kash-emerald/15 pt-5">
        <button
          type="button"
          onClick={() => setProfileMenuOpen((current) => !current)}
          aria-expanded={profileMenuOpen}
          className="flex w-full touch-manipulation items-center gap-3 rounded-lg p-2 text-left transition [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-selected/70 active:bg-kash-selected/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kash-emerald text-sm font-extrabold text-white">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{displayName}</p>
            <p className="truncate text-xs text-slate-600">{subtitle}</p>
          </div>
        </button>
        {profileMenuOpen ? (
          <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-40 rounded-xl border border-kash-emerald/15 bg-white p-2 shadow-soft">
            <div className="border-b border-slate-100 px-3 py-2">
              <p className="truncate text-sm font-extrabold text-slate-900">{displayName}</p>
              <p className="truncate text-xs font-semibold text-slate-500">{profile?.email}</p>
            </div>

            <div className="my-1 border-b border-slate-100 pb-1">
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen(false);
                  setSpaceSwitcherOpen(true);
                }}
                className="flex w-full touch-manipulation items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-700 transition hover:bg-kash-selected/70 hover:text-kash-emeraldDark active:bg-kash-selected focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {activeSpace?.space_type === "managed" ? (
                    <Briefcase size={15} className="shrink-0 text-kash-emerald" />
                  ) : (
                    <User size={15} className="shrink-0 text-kash-emerald" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold text-slate-900">
                      {activeSpace?.name || t("spaces.personal")}
                    </p>
                    <p className="truncate text-[10px] font-semibold text-slate-400">
                      {t("spaces.switchSpace")}
                    </p>
                  </div>
                </div>
                <ChevronRight size={14} className="shrink-0 text-slate-400" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setProfileMenuOpen(false);
                navigate("/settings");
              }}
              className="flex w-full touch-manipulation items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold text-slate-700 transition [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-selected [@media(hover:hover)_and_(pointer:fine)]:hover:text-kash-emeraldDark active:bg-kash-selected focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20"
            >
              <Settings aria-hidden="true" size={17} />
              Profile settings
            </button>
            <button
              type="button"
              onClick={() => {
                setProfileMenuOpen(false);
                setLogoutOpen(true);
              }}
              className="flex w-full touch-manipulation items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold text-kash-expense transition [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-expense/10 active:bg-kash-expense/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20"
            >
              <LogOut aria-hidden="true" size={17} />
              Sign out
            </button>
          </div>
        ) : null}
      </div>

      <SpaceSwitcherModal
        isOpen={spaceSwitcherOpen}
        onClose={() => setSpaceSwitcherOpen(false)}
      />

      {logoutOpen ? (
        <ConfirmationDialog
          confirmLabel="Sign out"
          description="You will return to the login screen."
          onCancel={() => setLogoutOpen(false)}
          onConfirm={() => void handleSignOut()}
          title="Sign out?"
        />
      ) : null}
    </aside>
  );
}
