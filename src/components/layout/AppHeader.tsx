import { Bell, LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import { useI18n } from "../../i18n";
import { IconButton } from "../ui/IconButton";
import { NotificationsPopover } from "./NotificationsPopover";
import kashLogo from "../../../logo/SVG/KASHLogo.svg";

type AppHeaderProps = {
    visible: boolean;
};

export function AppHeader({ visible }: AppHeaderProps) {
    const { t } = useI18n();
    const navigate = useNavigate();
    const { profile, signOut } = useAuth();
    const { unreadCount } = useNotifications();
    const notificationsRef = useRef<HTMLDivElement>(null);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const initial =
        profile?.full_name?.charAt(0) ?? profile?.email.charAt(0) ?? "A";

    const handleSignOut = async () => {
        await signOut();
        navigate("/login", { replace: true });
    };

    useEffect(() => {
        if (!notificationsOpen) return;

        const closeOnOutsideClick = (event: PointerEvent) => {
            if (notificationsRef.current?.contains(event.target as Node))
                return;
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
        <header
            className={`fixed top-0 inset-x-0 z-40 border-b border-kash-emerald/15 bg-white/95 backdrop-blur transition-all duration-300 ease-out lg:hidden ${
                visible
                    ? "translate-y-0 opacity-100 pointer-events-auto"
                    : "-translate-y-full opacity-0 pointer-events-none"
            }`}
        >
            <div className="flex min-h-16 items-center justify-between gap-4 px-4 pt-[env(safe-area-inset-top,0px)]">
                <Link
                    to="/dashboard"
                    aria-label="KASH Dashboard"
                    className="inline-flex min-w-0 items-center"
                >
                    <img src={kashLogo} alt="KASH" className="h-7 w-auto" />
                </Link>

                <div className="flex items-center gap-3">
                    <div ref={notificationsRef} className="relative">
                        <IconButton
                            icon={Bell}
                            label={t("nav.notifications")}
                            onClick={() =>
                                setNotificationsOpen((current) => !current)
                            }
                        />
                        {unreadCount > 0 ? (
                            <span className="pointer-events-none absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-kash-expense px-1 text-[10px] font-extrabold leading-none text-white">
                                {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                        ) : null}
                        {notificationsOpen ? (
                            <NotificationsPopover
                                className="!fixed !left-4 !right-4 top-[4.25rem] max-h-[75vh] !w-auto !max-w-none"
                                onClose={() => setNotificationsOpen(false)}
                            />
                        ) : null}
                    </div>
                    <div ref={profileMenuRef} className="relative">
                        <button
                            type="button"
                            aria-label={t("nav.account")}
                            aria-expanded={profileMenuOpen}
                            onClick={() =>
                                setProfileMenuOpen((current) => !current)
                            }
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-kash-emerald text-sm font-extrabold text-white transition hover:bg-kash-emeraldDark focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
                        >
                            {initial.toUpperCase()}
                        </button>
                        {profileMenuOpen ? (
                            <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-56 rounded-lg border border-kash-emerald/15 bg-white p-2 shadow-soft">
                                <div className="border-b border-slate-100 px-3 py-2">
                                    <p className="truncate text-sm font-extrabold text-slate-900">
                                        {profile?.full_name || t("nav.account")}
                                    </p>
                                    <p className="truncate text-xs font-semibold text-slate-600">
                                        {profile?.email}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setProfileMenuOpen(false);
                                        navigate("/settings");
                                    }}
                                    className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:bg-kash-selected hover:text-kash-emeraldDark focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
                                >
                                    <Settings aria-hidden="true" size={17} />
                                    {t("nav.settings")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleSignOut()}
                                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold text-kash-expense transition hover:bg-kash-expense/10 focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
                                >
                                    <LogOut aria-hidden="true" size={17} />
                                    {t("nav.signOut")}
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </header>
    );
}
