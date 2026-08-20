import { Plus, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { NotificationProvider } from "../context/NotificationContext";
import { ServiceWorkerNavigationBridge } from "../components/pwa/ServiceWorkerNavigationBridge";
import { AppHeader } from "../components/layout/AppHeader";
import { DesktopSidebar } from "../components/layout/DesktopSidebar";
import { MobileBottomNav } from "../components/layout/MobileBottomNav";
import { MobileMoreSheet } from "../components/layout/MobileMoreSheet";
import { QuickAddMenu } from "../components/layout/QuickAddMenu";
import { TransactionModal, type QuickTransactionMode } from "../components/transactions/TransactionModal";
import { ReimbursableExpenseModal } from "../components/debts/ReimbursableExpenseModal";

export function AppShell() {
  const location = useLocation();
  const contentRef = useRef<HTMLElement | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [transactionMode, setTransactionMode] = useState<QuickTransactionMode | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [mobileHeaderVisible, setMobileHeaderVisible] = useState(true);
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
    setMobileHeaderVisible(true);
  }, [location.pathname]);

  useEffect(() => {
    let previousScrollY = Math.max(0, window.scrollY);
    let accumulatedDelta = 0;
    let ticking = false;

    const updateHeaderVisibility = () => {
      const currentScrollY = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const innerHeight = window.innerHeight;
      const maxScrollableDistance = scrollHeight - innerHeight;

      // 1. Short page protection: If page cannot meaningfully scroll, keep header visible
      if (maxScrollableDistance < 120) {
        setMobileHeaderVisible(true);
        previousScrollY = Math.max(0, currentScrollY);
        accumulatedDelta = 0;
        ticking = false;
        return;
      }

      // 2. Top boundary / overscroll protection
      if (currentScrollY <= 16) {
        setMobileHeaderVisible(true);
        previousScrollY = Math.max(0, currentScrollY);
        accumulatedDelta = 0;
        ticking = false;
        return;
      }

      // 3. Bottom boundary / rubber-band bounce protection
      if (currentScrollY >= maxScrollableDistance - 16) {
        previousScrollY = currentScrollY;
        ticking = false;
        return;
      }

      const delta = currentScrollY - previousScrollY;

      // Direction changed: reset accumulated delta
      if ((delta > 0 && accumulatedDelta < 0) || (delta < 0 && accumulatedDelta > 0)) {
        accumulatedDelta = 0;
      }

      accumulatedDelta += delta;

      // Downward intentional scroll: hide header
      if (accumulatedDelta >= 35) {
        setMobileHeaderVisible(false);
        accumulatedDelta = 0;
      } else if (accumulatedDelta <= -25) {
        // Upward intentional scroll: show header
        setMobileHeaderVisible(true);
        accumulatedDelta = 0;
      }

      previousScrollY = currentScrollY;
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateHeaderVisibility);
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleUpdateReady = (event: WindowEventMap["kash:pwa-update-ready"]) => {
      setUpdateRegistration(event.detail.registration);
    };

    window.addEventListener("kash:pwa-update-ready", handleUpdateReady);
    return () => window.removeEventListener("kash:pwa-update-ready", handleUpdateReady);
  }, []);

  const openTransaction = (mode: QuickTransactionMode) => {
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

  return (
    <NotificationProvider>
      <ServiceWorkerNavigationBridge />
      <div className="kash-page-bg min-h-screen text-slate-900 lg:h-[100dvh] lg:overflow-hidden">
        <div className="flex min-h-screen lg:h-[100dvh] lg:min-h-0">
          <DesktopSidebar />
          <div className="flex min-w-0 flex-1 flex-col lg:h-[100dvh] lg:min-h-0">
            <AppHeader visible={mobileHeaderVisible} />
            <main ref={contentRef} className="flex-1 px-4 py-5 pb-28 md:px-6 lg:min-h-0 lg:overflow-y-auto lg:pb-8">
              <Outlet />
            </main>
          </div>
        </div>

        <button
          aria-label="Add transaction"
          className="fixed bottom-8 right-8 z-30 hidden h-14 w-14 items-center justify-center rounded-full bg-kash-emerald text-white shadow-soft transition hover:bg-kash-emeraldDark active:bg-kash-emeraldPressed focus:outline-none focus:ring-4 focus:ring-kash-emerald/20 lg:flex"
          onClick={() => setQuickAddOpen(true)}
          type="button"
        >
          <Plus aria-hidden="true" size={24} strokeWidth={2.4} />
        </button>

        <MobileBottomNav onMore={() => setMoreOpen(true)} onQuickAdd={() => setQuickAddOpen(true)} />
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
                    className="rounded-lg bg-kash-emerald px-3 py-2 text-xs font-extrabold text-white transition hover:bg-kash-emeraldDark focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpdateRegistration(null)}
                    className="rounded-lg px-3 py-2 text-xs font-extrabold text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
                  >
                    Later
                  </button>
                </div>
              </div>
              <button
                type="button"
                aria-label="Dismiss update notice"
                onClick={() => setUpdateRegistration(null)}
                className="rounded-full p-1 text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
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
