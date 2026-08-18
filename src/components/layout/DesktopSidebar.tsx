import { Bell, LogOut, Settings, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { navGroups } from "../../app/navigation";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import { KashLogo } from "../brand/KashLogo";
import { IconButton } from "../ui/IconButton";
import { NotificationsPopover } from "./NotificationsPopover";

export function DesktopSidebar() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const displayName = profile?.full_name || profile?.email || "Account";
  const subtitle = profile?.email ?? "View Profile";
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
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-kash-emerald/15 bg-white text-slate-700 transition hover:border-kash-emeraldDark hover:bg-kash-selected hover:text-kash-emeraldDark focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
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
              <h2 className="px-3 text-xs font-bold uppercase tracking-normal text-kash-emeraldDark">{group.label}</h2>
              <div className="mt-2 flex flex-col gap-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `group/nav flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                        isActive
                          ? "bg-kash-selected/70 text-kash-emeraldDark"
                          : "text-slate-700 hover:bg-kash-selected/70 hover:text-kash-emeraldDark"
                      }`
                    }
                  >
                    <item.icon aria-hidden="true" className="shrink-0" size={19} strokeWidth={2} />
                    <span>{item.label}</span>
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
          className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-kash-selected/70 focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
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
          <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-40 rounded-lg border border-kash-emerald/15 bg-white p-2 shadow-soft">
            <button
              type="button"
              onClick={() => {
                setProfileMenuOpen(false);
                navigate("/settings");
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:bg-kash-selected hover:text-kash-emeraldDark focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
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
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold text-kash-expense transition hover:bg-kash-expense/10 focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
            >
              <LogOut aria-hidden="true" size={17} />
              Sign out
            </button>
          </div>
        ) : null}
      </div>

      {logoutOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-extrabold text-slate-900">Sign out?</p>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-600">You will return to the login screen.</p>
              </div>
              <IconButton icon={X} label="Close logout dialog" onClick={() => setLogoutOpen(false)} />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setLogoutOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="inline-flex items-center gap-2 rounded-lg bg-kash-emerald px-4 py-2 text-sm font-bold text-white transition hover:bg-kash-emeraldDark active:bg-kash-emeraldPressed focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
              >
                <LogOut aria-hidden="true" size={17} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
