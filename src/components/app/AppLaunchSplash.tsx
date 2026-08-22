import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import kashVerticalLogo from "../../../SVG/Kash Logo vertical.svg";
import { useAuth } from "../../context/AuthContext";

const LAUNCH_MIN_VISIBLE_MS = 900;
const STALE_RESET_VISIBLE_MS = 1000;
const SPLASH_EXIT_MS = 280;

type AppLaunchSplashContextValue = {
  showStaleResetSplash: () => void;
};

const AppLaunchSplashContext = createContext<AppLaunchSplashContextValue | undefined>(undefined);

type AppLaunchSplashProviderProps = {
  children: ReactNode;
};

export function AppLaunchSplashProvider({ children }: AppLaunchSplashProviderProps) {
  const { status, profile, profileLoading } = useAuth();
  const launchStartedAtRef = useRef<number>(performance.now());
  const exitTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [hasLaunchCompleted, setHasLaunchCompleted] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  const isAppInitializing = status === "loading" || (profileLoading && !profile);

  const clearSplashTimers = useCallback(() => {
    if (exitTimerRef.current) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }

    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const exitSplash = useCallback(() => {
    setIsExiting(true);

    hideTimerRef.current = window.setTimeout(() => {
      setIsVisible(false);
      setIsExiting(false);
      setHasLaunchCompleted(true);
      hideTimerRef.current = null;
    }, SPLASH_EXIT_MS);
  }, []);

  useEffect(() => {
    if (hasLaunchCompleted || isAppInitializing) return;

    const elapsed = performance.now() - launchStartedAtRef.current;
    const remaining = Math.max(LAUNCH_MIN_VISIBLE_MS - elapsed, 0);

    exitTimerRef.current = window.setTimeout(exitSplash, remaining);

    return clearSplashTimers;
  }, [clearSplashTimers, exitSplash, hasLaunchCompleted, isAppInitializing]);

  const showStaleResetSplash = useCallback(() => {
    if (!hasLaunchCompleted) return;

    clearSplashTimers();
    setIsVisible(true);
    setIsExiting(false);

    exitTimerRef.current = window.setTimeout(() => {
      exitSplash();
    }, Math.max(STALE_RESET_VISIBLE_MS - SPLASH_EXIT_MS, 0));
  }, [clearSplashTimers, exitSplash, hasLaunchCompleted]);

  useEffect(() => clearSplashTimers, [clearSplashTimers]);

  const value = useMemo<AppLaunchSplashContextValue>(
    () => ({ showStaleResetSplash }),
    [showStaleResetSplash],
  );

  return (
    <AppLaunchSplashContext.Provider value={value}>
      {children}
      {isVisible ? <AppLaunchSplash isExiting={isExiting} /> : null}
    </AppLaunchSplashContext.Provider>
  );
}

export function useAppLaunchSplash() {
  const value = useContext(AppLaunchSplashContext);

  if (!value) {
    throw new Error("useAppLaunchSplash must be used inside AppLaunchSplashProvider");
  }

  return value;
}

function AppLaunchSplash({ isExiting }: { isExiting: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[70] flex h-dvh min-h-[100dvh] w-screen touch-none select-none items-center justify-center overflow-hidden bg-white px-8 ${
        isExiting ? "kash-launch-splash--exit" : "kash-launch-splash--enter"
      }`}
    >
      <img
        alt=""
        className="kash-launch-splash__logo h-auto w-[clamp(140px,42vw,190px)] max-w-[70vw] md:w-[clamp(170px,18vw,230px)]"
        draggable={false}
        src={kashVerticalLogo}
      />
    </div>
  );
}
