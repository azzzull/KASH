import { Plus, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { NotificationProvider } from "../context/NotificationContext";
import { useAppLaunchSplash } from "../components/app/AppLaunchSplash";
import { StaleSessionReset } from "../components/app/StaleSessionReset";
import { ServiceWorkerNavigationBridge } from "../components/pwa/ServiceWorkerNavigationBridge";
import { AppHeader } from "../components/layout/AppHeader";
import { DesktopSidebar } from "../components/layout/DesktopSidebar";
import { MobileBottomNav } from "../components/layout/MobileBottomNav";
import { MobileMoreSheet } from "../components/layout/MobileMoreSheet";
import {
  QuickAddMenu,
  type QuickAddMode,
} from "../components/layout/QuickAddMenu";
import { TransactionModal } from "../components/transactions/TransactionModal";
import { ReimbursableExpenseModal } from "../components/debts/ReimbursableExpenseModal";

export function AppShell() {
  const location = useLocation();
  const { showStaleResetSplash } = useAppLaunchSplash();
  const contentRef = useRef<HTMLElement | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [transactionMode, setTransactionMode] =
    useState<QuickAddMode | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [mobileHeaderVisible, setMobileHeaderVisible] = useState(true);
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
    setMobileHeaderVisible(true);
  }, [location.pathname]);

  useEffect(() => {
    const getScrollTop = () => {
      const winScroll = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      const mainScroll = contentRef.current?.scrollTop || 0;
      return Math.max(winScroll, mainScroll);
    };

    let previousScrollY = getScrollTop();
    let accumulatedDelta = 0;
    let ticking = false;

    const updateHeaderVisibility = () => {
      const currentScrollY = getScrollTop();
      const winMaxScroll = (document.documentElement.scrollHeight || document.body.scrollHeight || 0) - window.innerHeight;
      const mainMaxScroll = contentRef.current ? contentRef.current.scrollHeight - contentRef.current.clientHeight : 0;
      const maxScrollableDistance = Math.max(winMaxScroll, mainMaxScroll);

      // 1. Top boundary: Always force visible near top of page (scrollTop <= 16)
      if (currentScrollY <= 16) {
        setMobileHeaderVisible(true);
        previousScrollY = currentScrollY;
        accumulatedDelta = 0;
        ticking = false;
        return;
      }

      // 2. iOS Safari overscroll / bounce protection
      if (maxScrollableDistance > 0 && currentScrollY >= maxScrollableDistance - 10) {
        previousScrollY = currentScrollY;
        ticking = false;
        return;
      }

      const delta = currentScrollY - previousScrollY;

      // Reset directional accumulation if scroll direction reverses
      if ((delta > 0 && accumulatedDelta < 0) || (delta < 0 && accumulatedDelta > 0)) {
        accumulatedDelta = 0;
      }

      accumulatedDelta += delta;

      // 3. Scroll UP: Small intentional upward scroll (-4px or negative delta) immediately reveals AppHeader
      if (accumulatedDelta <= -4 || delta < -2) {
        setMobileHeaderVisible(true);
        accumulatedDelta = 0;
      } else if (accumulatedDelta >= 18 && currentScrollY > 40) {
        // 4. Scroll DOWN: Intentional downward scroll (+18px) hides AppHeader
        setMobileHeaderVisible(false);
        accumulatedDelta = 0;
      }

      previousScrollY = currentScrollY;
      ticking = false;
    };

    const handleScroll = (event: Event) => {
      // Filter out scroll events originating from inner scroll containers (modals, bottom sheets, charts, filter tabs)
      const target = event.target as HTMLElement | Document | Window;
      const isMainWindow = target === window || target === document || target === document.documentElement || target === document.body;
      const isMainContent = target === contentRef.current;

      if (!isMainWindow && !isMainContent) {
        return;
      }

      if (!ticking) {
        window.requestAnimationFrame(updateHeaderVisibility);
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    const mainEl = contentRef.current;
    if (mainEl) {
      mainEl.addEventListener("scroll", handleScroll, { passive: true });
    }

    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true } as EventListenerOptions);
      if (mainEl) {
        mainEl.removeEventListener("scroll", handleScroll);
      }
    };
  }, []);

  useEffect(() => {
    const handleUpdateReady = (event: WindowEventMap["kash:pwa-update-ready"]) => {
      setUpdateRegistration(event.detail.registration);
    };

    window.addEventListener("kash:pwa-update-ready", handleUpdateReady);
    return () => window.removeEventListener("kash:pwa-update-ready", handleUpdateReady);
  }, []);

  const openTransaction = (mode: QuickAddMode) => {
    setQuickAddOpen(false);
    setTransactionMode(mode);
  };

  const handleTransactionSaved = () => {
    setSuccessMessage("Transaction saved.");
    window.setTimeout(() => setSuccessMessage(null), 3000);
  };

  const refreshApp = () => {
    updateRegistration?.waiting?.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  };

  const resetTransientUi = useCallback(() => {
    setQuickAddOpen(false);
    setMoreOpen(false);
    setTransactionMode(null);
    setSuccessMessage(null);
    setUpdateRegistration(null);
  }, []);

  return (
    <NotificationProvider>
      <ServiceWorkerNavigationBridge />
      <StaleSessionReset onResetTransientUi={resetTransientUi} onStaleResetStart={showStaleResetSplash} />
      <div className="kash-page-bg min-h-screen text-slate-900 lg:h-[100dvh] lg:overflow-hidden">
        <div className="flex min-h-screen lg:h-[100dvh] lg:min-h-0">
          <DesktopSidebar />
          <div className="flex min-w-0 flex-1 flex-col lg:h-[100dvh] lg:min-h-0">
            <AppHeader visible={mobileHeaderVisible} />
            <main ref={contentRef} className="flex-1 px-4 pt-20 pb-28 md:px-6 md:pt-6 lg:min-h-0 lg:overflow-y-auto lg:pb-8 lg:pt-8">
              <Outlet />
            </main>
          </div>
        </div>

        <MobileBottomNav
          onMore={() => setMoreOpen(true)}
          onQuickAdd={() => setQuickAddOpen(true)}
        />
        <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
        <QuickAddMenu open={quickAddOpen} onClose={() => setQuickAddOpen(false)} onSelect={openTransaction} />
        {transactionMode === "reimbursable_expense" ? (
          <ReimbursableExpenseModal isOpen={true} onClose={() => setTransactionMode(null)} />
        ) : transactionMode ? (
          <TransactionModal mode={transactionMode} onClose={() => setTransactionMode(null)} onSaved={handleTransactionSaved} />
        ) : null}
        {successMessage ? (
          <div className="fixed bottom-24 left-4 right-4 z-50 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 shadow-soft md:left-auto md:right-8 md:w-80">
            {successMessage}
          </div>
        ) : null}
        {updateRegistration ? (
          <div className="fixed bottom-24 left-4 right-4 z-50 rounded-lg border border-kash-emerald/20 bg-white p-3 text-sm shadow-soft md:left-auto md:right-8 md:w-80 lg:bottom-8">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-kash-selected text-kash-emerald">
                <RefreshCw aria-hidden="true" size={16} strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-slate-900">Update ready</p>
                <p className="mt-1 font-semibold leading-5 text-slate-600">Refresh to use the latest KASH version.</p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={refreshApp}
                    className="touch-manipulation rounded-lg bg-kash-emerald px-3 py-2 text-xs font-extrabold text-white transition [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-emeraldDark active:scale-[0.98] active:bg-kash-emeraldPressed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpdateRegistration(null)}
                    className="touch-manipulation rounded-lg px-3 py-2 text-xs font-extrabold text-slate-600 transition [@media(hover:hover)_and_(pointer:fine)]:hover:bg-slate-100 active:scale-[0.98] active:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20"
                  >
                    Later
                  </button>
                </div>
              </div>
              <button
                type="button"
                aria-label="Dismiss update notice"
                onClick={() => setUpdateRegistration(null)}
                className="touch-manipulation rounded-full p-1 text-slate-600 transition [@media(hover:hover)_and_(pointer:fine)]:hover:bg-slate-100 active:scale-95 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </NotificationProvider>
  );
}
