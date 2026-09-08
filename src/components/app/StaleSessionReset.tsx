import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  APP_LIFECYCLE_HIDDEN_AT_KEY_PREFIX,
  APP_STALE_AFTER_MS,
} from "../../config/appLifecycle";
import { useActiveSpace } from "../../context/ActiveSpaceContext";
import { useAuth } from "../../context/AuthContext";
import { useI18n } from "../../i18n";
import { emitAppResumed } from "../../lib/appEvents";
import { useAppLaunchSplash } from "./AppLaunchSplash";

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

type StaleSessionResetProps = {
  onBeforeLongResume: () => void;
  onLongResume: () => void;
};

export function StaleSessionReset({ onBeforeLongResume, onLongResume }: StaleSessionResetProps) {
  const { user, refreshSession } = useAuth();
  const { activeSpaceId, refreshSpaces } = useActiveSpace();
  const { showStaleResetSplash } = useAppLaunchSplash();
  const { t } = useI18n();
  const navigate = useNavigate();
  const hiddenAtRef = useRef<number | null>(null);
  const isResumingRef = useRef(false);
  const userIdRef = useRef<string | null>(user?.id ?? null);
  const [isResuming, setIsResuming] = useState(false);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
    hiddenAtRef.current = null;
  }, [user?.id]);

  const getStorageKey = useCallback(
    () => (user?.id ? `${APP_LIFECYCLE_HIDDEN_AT_KEY_PREFIX}${user.id}` : null),
    [user?.id],
  );

  useEffect(() => {
    const storageKey = getStorageKey();
    if (!storageKey || !user?.id) return;

    const persistInactiveTimestamp = () => {
      const hiddenAt = Date.now();
      hiddenAtRef.current = hiddenAt;
      try {
        // sessionStorage keeps lifecycle metadata isolated to this tab and user.
        sessionStorage.setItem(storageKey, String(hiddenAt));
      } catch {
        // The in-memory value still covers the active browser session.
      }
    };

    const performLongResume = async () => {
      if (isResumingRef.current || userIdRef.current !== user.id) return;

      isResumingRef.current = true;
      setIsResuming(true);
      showStaleResetSplash();
      onBeforeLongResume();

      try {
        const sessionIsCurrent = await refreshSession();
        if (!sessionIsCurrent || userIdRef.current !== user.id) return;

        // Retains the current space when still accessible, otherwise the existing
        // ActiveSpace fallback resolves the user's personal space.
        await refreshSpaces(activeSpaceId ?? undefined);
        if (userIdRef.current !== user.id) return;

        onLongResume();
        emitAppResumed();

        // A notification navigation is an explicit destination and wins over the
        // normal long-resume Dashboard destination.
        if (!hasRecentExplicitNavigationIntent()) {
          navigate("/dashboard", { replace: true });
        }
      } finally {
        if (userIdRef.current === user.id) {
          setIsResuming(false);
        }
        isResumingRef.current = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        persistInactiveTimestamp();
      } else if (document.visibilityState === "visible") {
        const persistedAt = Number(sessionStorage.getItem(storageKey));
        const hiddenAt = hiddenAtRef.current ?? persistedAt;
        hiddenAtRef.current = null;
        sessionStorage.removeItem(storageKey);

        if (Number.isFinite(hiddenAt) && Date.now() - hiddenAt >= APP_STALE_AFTER_MS) {
          void performLongResume();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", persistInactiveTimestamp);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", persistInactiveTimestamp);
    };
  }, [activeSpaceId, getStorageKey, navigate, onBeforeLongResume, onLongResume, refreshSession, refreshSpaces, showStaleResetSplash, user?.id]);

  return isResuming ? (
    <div className="fixed inset-0 z-[71] flex items-center justify-center bg-white/88 px-6 backdrop-blur-sm">
      <p className="rounded-lg border border-kash-emerald/10 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-soft">
        {t("common.refreshingData")}
      </p>
    </div>
  ) : null;
}
