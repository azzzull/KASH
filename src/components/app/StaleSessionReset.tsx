import { useEffect } from "react";

const STALE_SESSION_INACTIVE_AT_KEY = "kash.inactiveAt";
const NOTIFICATION_NAVIGATION_ACTIVE_KEY = "kash.notificationNavigationActiveAt";
const NAVIGATION_INTENT_GRACE_MS = 10_000;

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

export function StaleSessionReset() {
  useEffect(() => {
    const persistInactiveTimestamp = () => {
      localStorage.setItem(STALE_SESSION_INACTIVE_AT_KEY, String(Date.now()));
    };

    const clearInactiveTimestampOnResume = () => {
      // Returning to the app must preserve any open bottom sheet and its input.
      // Authentication state is refreshed by Supabase independently when needed.
      if (!hasRecentExplicitNavigationIntent()) {
        localStorage.removeItem(STALE_SESSION_INACTIVE_AT_KEY);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        persistInactiveTimestamp();
      } else if (document.visibilityState === "visible") {
        clearInactiveTimestampOnResume();
      }
    };

    const handlePageShow = () => {
      localStorage.removeItem(STALE_SESSION_INACTIVE_AT_KEY);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", persistInactiveTimestamp);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", clearInactiveTimestampOnResume);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", persistInactiveTimestamp);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", clearInactiveTimestampOnResume);
    };
  }, []);

  return null;
}
