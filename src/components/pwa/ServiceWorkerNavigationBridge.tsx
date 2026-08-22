import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { markNotificationNavigationActive } from "../app/StaleSessionReset";
import {
  clearPendingNavigation,
  getPendingNavigation,
  isValidInternalPath,
} from "../../lib/pwaNavigation";

type ServiceWorkerNavigationMessage = {
  type: "KASH_NOTIFICATION_NAVIGATE";
  target_path: string;
};

export function ServiceWorkerNavigationBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const isConsumingRef = useRef(false);

  useEffect(() => {
    // 1. Consume pending navigation persisted in IndexedDB
    const checkAndConsumePendingNavigation = async () => {
      if (isConsumingRef.current) return;
      isConsumingRef.current = true;

      try {
        const pending = await getPendingNavigation();

        if (pending && isValidInternalPath(pending.target_path)) {
          markNotificationNavigationActive();

          // Immediately clear to guarantee exact-once consumption
          await clearPendingNavigation();

          // Only navigate if we are not already at the target route
          if (location.pathname !== pending.target_path) {
            navigate(pending.target_path);
          }
        }
      } catch (err) {
        console.warn("Failed checking pending navigation:", err);
      } finally {
        isConsumingRef.current = false;
      }
    };

    // Check immediately on mount (Cold Start / PWA initial launch)
    void checkAndConsumePendingNavigation();

    // 2. Fast Path: Listen for direct Service Worker postMessage
    const handleServiceWorkerMessage = async (event: MessageEvent) => {
      const data = event.data as Partial<ServiceWorkerNavigationMessage> | undefined;

      if (!data || data.type !== "KASH_NOTIFICATION_NAVIGATE") {
        return;
      }

      const targetPath = data.target_path;

      // Clear any pending record so it doesn't execute twice
      await clearPendingNavigation();

      if (isValidInternalPath(targetPath)) {
        markNotificationNavigationActive();

        if (location.pathname !== targetPath) {
          navigate(targetPath);
        }
      } else {
        navigate("/dashboard");
      }
    };

    // 3. Lifecycle Listeners: Handle App Resume, Tab Visibility, and Window Focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkAndConsumePendingNavigation();
      }
    };

    const handleFocus = () => {
      void checkAndConsumePendingNavigation();
    };

    const handlePageShow = () => {
      void checkAndConsumePendingNavigation();
    };

    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      if (typeof window !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [navigate, location.pathname]);

  return null;
}
