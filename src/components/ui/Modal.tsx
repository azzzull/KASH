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

  // Gesture state
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Synchronize open/mount lifecycle
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setIsClosing(false);
      setDragY(0);
      setIsDragging(false);

      // Double rAF to ensure starting translate-y-full state is painted first
      const frame1 = requestAnimationFrame(() => {
        const frame2 = requestAnimationFrame(() => {
          setEntered(true);
        });
        return () => cancelAnimationFrame(frame2);
      });
      return () => cancelAnimationFrame(frame1);
    } else {
      setEntered(false);
      setIsClosing(false);
      setMounted(false);
      setDragY(0);
      setIsDragging(false);
    }
  }, [isOpen]);

  // Animated Close Controller
  const handleRequestClose = () => {
    if (!dismissible || isClosing) return;
    setIsClosing(true);
    setEntered(false);
    // Trigger parent onClose after slide-down transition completes
    setTimeout(() => {
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

    if (deltaY > 0) {
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

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!mounted) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
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
    : "transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)";

  // Backdrop opacity calculation
  const backdropOpacity = isClosing || !entered
    ? "opacity-0"
    : isDragging
    ? `opacity-${Math.max(20, Math.round(100 - (dragY / 300) * 80))}`
    : "opacity-100";

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
          }}
          className={`pointer-events-auto w-full ${maxWidthClasses[maxWidth]} overflow-hidden rounded-t-2xl bg-white text-left shadow-2xl md:rounded-2xl pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-6 md:transform-none md:transition-all md:duration-200 ${
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
            <div className="flex items-start justify-between gap-4 px-5 pt-1 pb-3 md:px-6 md:pt-6">
              <div className="min-w-0 flex-1">
                {title ? (
                  <h2 className="text-lg font-extrabold text-slate-900 md:text-xl">
                    {title}
                  </h2>
                ) : null}
                {description ? (
                  <div className="mt-1 text-xs md:text-sm font-semibold text-slate-600">
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
            className={`px-5 py-2 md:px-6 max-h-[calc(85dvh-80px)] md:max-h-[75vh] overflow-y-auto overscroll-contain ${bodyClassName}`}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
