import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const STALE_SESSION_INACTIVE_AT_KEY = "kash.inactiveAt";
const NOTIFICATION_NAVIGATION_ACTIVE_KEY = "kash.notificationNavigationActiveAt";
const STALE_SESSION_THRESHOLD_MS = 30 * 60 * 1000;
const NAVIGATION_INTENT_GRACE_MS = 10_000;

const EXCLUDED_PATH_PREFIXES = [
  "/login",
  "/onboarding",
  "/auth",
  "/callback",
];

function isExcludedPath(pathname: string) {
  return EXCLUDED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function hasRecentExplicitNavigationIntent() {
  const rawValue = sessionStorage.getItem(NOTIFICATION_NAVIGATION_ACTIVE_KEY);
  if (!rawValue) return false;

  const timestamp = Number(rawValue);
  if (!Number.isFinite(timestamp)) return false;

  return Date.now() - timestamp < NAVIGATION_INTENT_GRACE_MS;
}

export function markNotificationNavigationActive() {
  sessionStorage.setItem(NOTIFICATION_NAVIGATION_ACTIVE_KEY, String(Date.now()));
}

export function StaleSessionReset({
  onResetTransientUi,
  onStaleResetStart,
}: {
  onResetTransientUi: () => void;
  onStaleResetStart?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    const persistInactiveTimestamp = () => {
      localStorage.setItem(STALE_SESSION_INACTIVE_AT_KEY, String(Date.now()));
    };

    const evaluateResume = () => {
      const currentLocation = locationRef.current;

      if (isExcludedPath(currentLocation.pathname) || hasRecentExplicitNavigationIntent()) {
        return;
      }

      const rawInactiveAt = localStorage.getItem(STALE_SESSION_INACTIVE_AT_KEY);
      if (!rawInactiveAt) return;

      const inactiveAt = Number(rawInactiveAt);
      if (!Number.isFinite(inactiveAt)) return;

      const elapsed = Date.now() - inactiveAt;
      if (elapsed <= STALE_SESSION_THRESHOLD_MS) return;

      localStorage.removeItem(STALE_SESSION_INACTIVE_AT_KEY);
      onStaleResetStart?.();
      onResetTransientUi();

      if (currentLocation.pathname !== "/dashboard" || currentLocation.search || currentLocation.hash) {
        navigate("/dashboard", { replace: true });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        persistInactiveTimestamp();
      } else if (document.visibilityState === "visible") {
        evaluateResume();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", persistInactiveTimestamp);
    window.addEventListener("pageshow", evaluateResume);
    window.addEventListener("focus", evaluateResume);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", persistInactiveTimestamp);
      window.removeEventListener("pageshow", evaluateResume);
      window.removeEventListener("focus", evaluateResume);
    };
  }, [navigate, onResetTransientUi, onStaleResetStart]);

  return null;
}
