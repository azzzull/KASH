import { X } from "lucide-react";
import React, {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconButton } from "./IconButton";

export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  dismissible?: boolean;
  showCloseButton?: boolean;
  className?: string;
  bodyClassName?: string;
};

const maxWidthClasses = {
  sm: "md:max-w-sm",
  md: "md:max-w-md",
  lg: "md:max-w-lg",
  xl: "md:max-w-xl",
  "2xl": "md:max-w-2xl",
  full: "md:max-w-4xl",
};

// Module-level manager for scroll locking across single, nested, or sequential modals
let openModalsCount = 0;
let previousBodyStyles = {
  overflow: "",
  position: "",
  top: "",
  width: "",
  touchAction: "",
};
let savedScrollY = 0;

const MEDIUM_DETENT_DVH = 62;
const LARGE_DETENT_DVH = 90;
const LARGE_TOP_GAP_PX = 28;

type SheetDetent = "medium" | "large";

function lockBodyScroll() {
  if (typeof document === "undefined") return;

  if (openModalsCount === 0) {
    savedScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;

    previousBodyStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      touchAction: document.body.style.touchAction,
    };

    // On iOS Safari / mobile browsers, position: fixed with negative top is the standard reliable scroll lock.
    // Setting width: 100% and overflow: hidden prevents layout shifts.
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
  }

  openModalsCount += 1;
}

function unlockBodyScroll() {
  if (typeof document === "undefined") return;

  openModalsCount = Math.max(0, openModalsCount - 1);

  if (openModalsCount === 0) {
    // Restore previous inline styles or cleanly remove property if it was empty
    if (previousBodyStyles.position) {
      document.body.style.position = previousBodyStyles.position;
    } else {
      document.body.style.removeProperty("position");
    }

    if (previousBodyStyles.top) {
      document.body.style.top = previousBodyStyles.top;
    } else {
      document.body.style.removeProperty("top");
    }

    if (previousBodyStyles.width) {
      document.body.style.width = previousBodyStyles.width;
    } else {
      document.body.style.removeProperty("width");
    }

    if (previousBodyStyles.overflow) {
      document.body.style.overflow = previousBodyStyles.overflow;
    } else {
      document.body.style.removeProperty("overflow");
    }

    if (previousBodyStyles.touchAction) {
      document.body.style.touchAction = previousBodyStyles.touchAction;
    } else {
      document.body.style.removeProperty("touch-action");
    }

    // Restore scroll position
    window.scrollTo(0, savedScrollY);
  }
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "md",
  dismissible = true,
  showCloseButton = true,
  className = "",
  bodyClassName = "",
}: ModalProps) {
  // Mounting & animation lifecycle
  const [mounted, setMounted] = useState(isOpen);
  const [entered, setEntered] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [sheetDetent, setSheetDetent] = useState<SheetDetent>("medium");
  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(null);

  // Gesture state
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isBodyDragging, setIsBodyDragging] = useState(false);
  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  // Clean up pending close timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // Synchronize open/mount lifecycle
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setIsClosing(false);
      setDragY(0);
      setIsDragging(false);
      setIsBodyDragging(false);
      setSheetDetent("medium");

      let frame2: number;
      const frame1 = requestAnimationFrame(() => {
        frame2 = requestAnimationFrame(() => {
          setEntered(true);
        });
      });
      return () => {
        cancelAnimationFrame(frame1);
        if (frame2) cancelAnimationFrame(frame2);
      };
    } else {
      setEntered(false);
      setIsClosing(false);
      setMounted(false);
      setDragY(0);
      setIsDragging(false);
      setIsBodyDragging(false);
      setSheetDetent("medium");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;

    const updateVisualViewportHeight = () => {
      setVisualViewportHeight(window.visualViewport?.height ?? window.innerHeight);
    };

    updateVisualViewportHeight();
    window.visualViewport?.addEventListener("resize", updateVisualViewportHeight);
    window.addEventListener("resize", updateVisualViewportHeight);

    return () => {
      window.visualViewport?.removeEventListener("resize", updateVisualViewportHeight);
      window.removeEventListener("resize", updateVisualViewportHeight);
    };
  }, [mounted]);

  // Animated Close Controller
  const handleRequestClose = () => {
    if (!dismissible || isClosing) return;
    setIsClosing(true);
    setEntered(false);
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }
    // Trigger parent onClose after slide-down transition completes
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
      setIsClosing(false);
      setMounted(false);
    }, 240);
  };

  // Keyboard Escape Support
  useEffect(() => {
    if (!mounted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        handleRequestClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mounted, dismissible, isClosing]);

  // Touch Gesture Handlers (iOS Safari & Standalone PWA)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!dismissible || isClosing) return;
    const touch = e.touches[0];
    startYRef.current = touch.clientY;
    currentYRef.current = touch.clientY;
    startTimeRef.current = Date.now();
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging || !dismissible || isClosing) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - startYRef.current;

    if (deltaY < -32 && sheetDetent === "medium") {
      setSheetDetent("large");
      setDragY(0);
      startYRef.current = touch.clientY;
      currentYRef.current = touch.clientY;
    } else if (deltaY > 0) {
      // Downward drag follows finger
      setDragY(deltaY);
      currentYRef.current = touch.clientY;
    } else {
      // Resistance upward
      setDragY(deltaY * 0.15);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging || isClosing) return;
    setIsDragging(false);

    const deltaY = currentYRef.current - startYRef.current;
    const elapsed = Math.max(1, Date.now() - startTimeRef.current);
    const velocity = deltaY / elapsed; // px per ms

    if (deltaY > 100 || (deltaY > 30 && velocity > 0.4)) {
      // Threshold passed -> Dismiss with animated exit
      setDragY(400);
      handleRequestClose();
    } else {
      // Snap back smoothly
      setDragY(0);
    }
  };

  const handleBodyTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isClosing) return;
    const touch = e.touches[0];
    startYRef.current = touch.clientY;
    currentYRef.current = touch.clientY;
    startTimeRef.current = Date.now();
    setIsBodyDragging(true);
  };

  const handleBodyTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isBodyDragging || isClosing) return;

    const scrollBody = scrollBodyRef.current;
    if (!scrollBody) return;

    const touch = e.touches[0];
    const deltaY = touch.clientY - startYRef.current;
    const hasOverflow = scrollBody.scrollHeight > scrollBody.clientHeight + 2;
    const isAtTop = scrollBody.scrollTop <= 0;

    if (sheetDetent === "medium" && hasOverflow && deltaY < -28) {
      if (e.cancelable) e.preventDefault();
      setSheetDetent("large");
      setIsBodyDragging(false);
      return;
    }

    if (sheetDetent === "large" && isAtTop && deltaY > 36 && dismissible) {
      if (e.cancelable) e.preventDefault();
      setSheetDetent("medium");
      setIsBodyDragging(false);
    }
  };

  const handleBodyTouchEnd = () => {
    setIsBodyDragging(false);
  };

  // Non-passive TouchMove prevention on drag handle for iOS Safari
  useEffect(() => {
    const handleEl = dragHandleRef.current;
    if (!handleEl) return;

    const preventScroll = (e: TouchEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    handleEl.addEventListener("touchmove", preventScroll, { passive: false });
    return () => {
      handleEl.removeEventListener("touchmove", preventScroll);
    };
  }, [mounted]);

  useEffect(() => {
    const panelEl = panelRef.current;
    if (!panelEl) return;

    const expandSheet = () => {
      setSheetDetent("large");
    };

    panelEl.addEventListener("kash:bottom-sheet-expand", expandSheet);
    return () => {
      panelEl.removeEventListener("kash:bottom-sheet-expand", expandSheet);
    };
  }, [mounted]);

  // Lock body scroll reliably when modal is open, and release when all modals are closed
  useEffect(() => {
    if (!mounted) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [mounted]);

  if (!mounted) return null;

  // Compute inline transform and transition for mobile bottom sheet
  const isMobileOpen = entered && !isClosing;
  const mobileTransform = isDragging
    ? `translate3d(0, ${dragY}px, 0)`
    : isClosing || !isMobileOpen
    ? "translate3d(0, 100%, 0)"
    : "translate3d(0, 0, 0)";

  const mobileTransition = isDragging
    ? "none"
    : "transform 0.26s cubic-bezier(0.32, 0.72, 0, 1), max-height 0.38s cubic-bezier(0.22, 1, 0.36, 1)";

  // Backdrop opacity calculation
  const backdropOpacity = isClosing || !entered
    ? "opacity-0"
    : isDragging
    ? `opacity-${Math.max(20, Math.round(100 - (dragY / 300) * 80))}`
    : "opacity-100";

  const largeDetentPx = visualViewportHeight
    ? Math.max(320, Math.min(visualViewportHeight * (LARGE_DETENT_DVH / 100), visualViewportHeight - LARGE_TOP_GAP_PX))
    : undefined;

  const mobileMaxHeight = sheetDetent === "large"
    ? largeDetentPx
      ? `${largeDetentPx}px`
      : `min(${LARGE_DETENT_DVH}dvh, calc(100dvh - env(safe-area-inset-top) - ${LARGE_TOP_GAP_PX}px))`
    : `${MEDIUM_DETENT_DVH}dvh`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-hidden"
    >
      {/* Backdrop */}
      <div
        onClick={handleRequestClose}
        className={`fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-240 ${backdropOpacity}`}
      />

      {/* Sheet / Dialog Container */}
      <div className="fixed inset-0 z-50 flex min-h-full items-end justify-center p-0 md:items-center md:p-4 pointer-events-none">
        <div
          ref={panelRef}
          style={{
            transform: mobileTransform,
            transition: mobileTransition,
            "--mobile-sheet-max-height": mobileMaxHeight,
          } as React.CSSProperties}
          data-bottom-sheet-panel="true"
          data-bottom-sheet-detent={sheetDetent}
          className={`pointer-events-auto flex max-h-[var(--mobile-sheet-max-height)] w-full flex-col ${maxWidthClasses[maxWidth]} overflow-hidden rounded-t-2xl bg-white text-left shadow-2xl md:block md:max-h-[85vh] md:rounded-2xl md:pb-6 md:transform-none md:transition-all md:duration-200 ${
            entered && !isClosing
              ? "md:scale-100 md:opacity-100"
              : "md:scale-95 md:opacity-0"
          } ${className}`}
        >
          {/* Mobile Top Drag Handle Area (44px height for comfortable touch targeting) */}
          <div
            ref={dragHandleRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            className="flex h-11 w-full items-center justify-center touch-none select-none cursor-grab active:cursor-grabbing md:hidden"
            aria-label="Drag down to close"
          >
            <div className="h-1.5 w-12 rounded-full bg-slate-300 transition-colors hover:bg-slate-400 active:bg-kash-emerald" />
          </div>

          {/* Header Region */}
          {(title || showCloseButton) ? (
            <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-1 pb-1 md:px-6 md:pt-5 md:pb-2">
              <div className="min-w-0 flex-1">
                {title ? (
                  <h2 className="text-lg font-extrabold text-slate-900 md:text-xl">
                    {title}
                  </h2>
                ) : null}
                {description ? (
                  <div className="mt-0.5 text-xs md:text-sm font-semibold text-slate-600">
                    {description}
                  </div>
                ) : null}
              </div>

              {showCloseButton && dismissible ? (
                <IconButton
                  icon={X}
                  label="Close"
                  onClick={handleRequestClose}
                  className="shrink-0 text-slate-600 hover:text-slate-900"
                />
              ) : null}
            </div>
          ) : null}

          {/* Scrollable Content Body (Protected from gesture interception) */}
          <div
            ref={scrollBodyRef}
            data-modal-body="true"
            data-bottom-sheet-scroll-owner="true"
            onTouchStart={handleBodyTouchStart}
            onTouchMove={handleBodyTouchMove}
            onTouchEnd={handleBodyTouchEnd}
            onTouchCancel={handleBodyTouchEnd}
            className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))] md:max-h-[75vh] md:px-6 md:pt-1 md:pb-4 ${bodyClassName}`}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
