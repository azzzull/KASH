import { Plus, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { NotificationProvider } from "../context/NotificationContext";
import { StaleSessionReset } from "../components/app/StaleSessionReset";
import { PushNotificationOnboardingPrompt } from "../components/notifications/PushNotificationOnboardingPrompt";
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
import { SmartEntryModal } from "../components/smart-entry/SmartEntryModal";
import type { SmartEntryReimbursablePrefill } from "../lib/smartEntry";
import { useActiveSpace } from "../context/ActiveSpaceContext";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { canCreateTransaction } from "../lib/transactions";

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLElement | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { activeSpace, userRole, activeSpaceId, loading: spaceLoading, setActiveSpace, spaces } = useActiveSpace();
  const { user } = useAuth();
  const { t } = useI18n();
  const shellUserIdRef = useRef<string | null>(null);
  const canCreate = canCreateTransaction(activeSpace, userRole);
  const [transactionMode, setTransactionMode] =
    useState<Exclude<QuickAddMode, "smart_entry"> | null>(null);
  const [smartEntryOpen, setSmartEntryOpen] = useState(false);
  const [reimbursablePrefill, setReimbursablePrefill] = useState<SmartEntryReimbursablePrefill | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resumeEpoch, setResumeEpoch] = useState(0);
  const [mobileHeaderVisible, setMobileHeaderVisible] = useState(true);
  const [mobileKeyboardOpen, setMobileKeyboardOpen] = useState(false);
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);

  const resetTransientShellUi = useCallback(() => {
    setQuickAddOpen(false);
    setMoreOpen(false);
    setTransactionMode(null);
    setSmartEntryOpen(false);
    setReimbursablePrefill(null);
    setSuccessMessage(null);
  }, []);

  const advanceResumeEpoch = useCallback(() => {
    setResumeEpoch((current) => current + 1);
  }, []);

  useEffect(() => {
    if (shellUserIdRef.current === user?.id) return;

    shellUserIdRef.current = user?.id ?? null;
    resetTransientShellUi();
    advanceResumeEpoch();
  }, [advanceResumeEpoch, resetTransientShellUi, user?.id]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
    setMobileHeaderVisible(true);
  }, [location.pathname]);

  // Notification deep links carry a space identifier. Resolve it only against the
  // authenticated user's currently accessible spaces, then remove it from the URL.
  useEffect(() => {
    const targetSpaceId = new URLSearchParams(location.search).get("space_id");
    if (!targetSpaceId) return;
    if (spaceLoading) return;

    const targetSpace = spaces.find(
      (space) => space.id === targetSpaceId && !space.is_archived && !space.deleted_at,
    );
    if (targetSpace) {
      setActiveSpace(targetSpace);
    }

    const nextSearch = new URLSearchParams(location.search);
    nextSearch.delete("space_id");
    navigate(
      { pathname: location.pathname, search: nextSearch.toString() ? `?${nextSearch.toString()}` : "" },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate, setActiveSpace, spaceLoading, spaces]);

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

  // Mobile browsers do not consistently reduce the layout viewport for the
  // software keyboard. VisualViewport gives us the effective visible area so
  // fixed navigation never overlays the active field.
  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const updateKeyboardState = () => {
      const isMobile = window.matchMedia("(max-width: 1023px)").matches;
      const obscuredHeight = window.innerHeight - visualViewport.height - visualViewport.offsetTop;
      const isOpen = isMobile && obscuredHeight > 120;
      setMobileKeyboardOpen(isOpen);
      document.documentElement.toggleAttribute("data-kash-mobile-keyboard", isOpen);
    };

    const keepFocusedFieldVisible = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches("input, textarea, select, [contenteditable='true']")) return;
      if (target.closest("[role='dialog']")) return;
      window.requestAnimationFrame(() => {
        window.setTimeout(() => target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }), 80);
      });
    };

    updateKeyboardState();
    visualViewport.addEventListener("resize", updateKeyboardState);
    visualViewport.addEventListener("scroll", updateKeyboardState);
    window.addEventListener("resize", updateKeyboardState);
    document.addEventListener("focusin", keepFocusedFieldVisible);
    return () => {
      visualViewport.removeEventListener("resize", updateKeyboardState);
      visualViewport.removeEventListener("scroll", updateKeyboardState);
      window.removeEventListener("resize", updateKeyboardState);
      document.removeEventListener("focusin", keepFocusedFieldVisible);
      document.documentElement.removeAttribute("data-kash-mobile-keyboard");
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
    if (!canCreate) return;
    if (mode === "smart_entry") {
      setSmartEntryOpen(true);
      return;
    }
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

  return (
    <NotificationProvider>
      <ServiceWorkerNavigationBridge />
      <PushNotificationOnboardingPrompt />
      <StaleSessionReset
        onBeforeLongResume={resetTransientShellUi}
        onLongResume={advanceResumeEpoch}
      />
      <div className="kash-page-bg min-h-[100dvh] text-slate-900 lg:h-[100dvh] lg:overflow-hidden">
        <div className="flex min-h-[100dvh] lg:h-[100dvh] lg:min-h-0">
          <DesktopSidebar />
          <div className="flex min-w-0 flex-1 flex-col lg:h-[100dvh] lg:min-h-0">
            <AppHeader visible={mobileHeaderVisible} />
            <main ref={contentRef} className="flex-1 px-4 pt-20 pb-[calc(7rem+env(safe-area-inset-bottom))] md:px-6 md:pt-6 lg:min-h-0 lg:overflow-y-auto lg:pb-8 lg:pt-8">
              <Outlet key={`${activeSpaceId ?? "no-space"}-${resumeEpoch}`} />
            </main>
          </div>
        </div>

        <MobileBottomNav
          keyboardOpen={mobileKeyboardOpen}
          onMore={() => setMoreOpen(true)}
          onQuickAdd={() => {
            if (canCreate) setQuickAddOpen(true);
          }}
        />
        {canCreate ? (
          <button
            aria-label={t("quickAdd.title")}
            className="fixed bottom-8 right-8 z-40 hidden h-14 w-14 items-center justify-center rounded-full bg-kash-emerald text-white shadow-[0_12px_28px_rgba(5,150,105,0.32)] transition [@media(hover:hover)_and_(pointer:fine)]:hover:scale-105 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-emeraldDark active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/25 lg:inline-flex"
            onClick={() => setQuickAddOpen(true)}
            title={t("quickAdd.title")}
            type="button"
          >
            <Plus aria-hidden="true" size={25} strokeWidth={2.7} />
          </button>
        ) : null}
        <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
        <QuickAddMenu open={quickAddOpen} onClose={() => setQuickAddOpen(false)} onSelect={openTransaction} />
        <SmartEntryModal
          isOpen={smartEntryOpen}
          onClose={() => setSmartEntryOpen(false)}
          onOpenReimbursable={(prefill) => {
            setReimbursablePrefill(prefill);
            setTransactionMode("reimbursable_expense");
          }}
          onSaved={handleTransactionSaved}
        />
        {transactionMode === "reimbursable_expense" ? (
          <ReimbursableExpenseModal
            initialValues={reimbursablePrefill}
            isOpen={true}
            onClose={() => {
              setTransactionMode(null);
              setReimbursablePrefill(null);
            }}
            onSaved={() => {
              setReimbursablePrefill(null);
              handleTransactionSaved();
            }}
          />
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
