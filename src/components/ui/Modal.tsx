import { X } from "lucide-react";
import React, {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
const KEYBOARD_FIELD_GAP_PX = 18;
const KEYBOARD_FOCUS_SAFE_GAP_PX = 65;
const KEYBOARD_TRACKING_FRAME_LIMIT = 36;
const MODAL_LAYER_BASE = 1000;
const MODAL_LAYER_STEP = 20;

type SheetDetent = "medium" | "large";
type ModalStackEntry = {
    id: number;
    opener: HTMLElement | null;
};

let nextModalId = 1;
let modalStack: ModalStackEntry[] = [];
const modalStackListeners = new Set<() => void>();

function notifyModalStack() {
    modalStackListeners.forEach((listener) => listener());
}

function subscribeModalStack(listener: () => void) {
    modalStackListeners.add(listener);
    return () => {
        modalStackListeners.delete(listener);
    };
}

function registerModalStackEntry(id: number, opener: HTMLElement | null) {
    modalStack = modalStack.filter((entry) => entry.id !== id);
    modalStack.push({ id, opener });
    notifyModalStack();
}

function unregisterModalStackEntry(id: number) {
    const closingEntry = modalStack.find((entry) => entry.id === id);
    modalStack = modalStack.filter((entry) => entry.id !== id);
    notifyModalStack();

    if (!closingEntry?.opener || !document.contains(closingEntry.opener))
        return;
    if (isEditableElement(closingEntry.opener)) return;

    requestAnimationFrame(() => {
        closingEntry.opener?.focus({ preventScroll: true });
    });
}

function getModalStackSnapshot(id: number) {
    const index = modalStack.findIndex((entry) => entry.id === id);
    const topEntry = modalStack[modalStack.length - 1];

    return {
        index,
        isTop: topEntry?.id === id,
        hasChild: index >= 0 && index < modalStack.length - 1,
    };
}

function isEditableElement(element: Element | null) {
    if (!(element instanceof HTMLElement)) return false;
    const tagName = element.tagName.toLowerCase();
    return (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        element.isContentEditable
    );
}

function isKeyboardEditableElement(element: Element | null) {
    if (!(element instanceof HTMLElement)) return false;
    if (element instanceof HTMLTextAreaElement)
        return !element.disabled && !element.readOnly;
    if (element.isContentEditable) return true;
    if (!(element instanceof HTMLInputElement)) return false;
    if (element.disabled || element.readOnly) return false;

    const nonTextInputTypes = new Set([
        "button",
        "checkbox",
        "color",
        "file",
        "hidden",
        "image",
        "radio",
        "range",
        "reset",
        "submit",
    ]);

    return !nonTextInputTypes.has(element.type);
}

function isMobileViewport() {
    return (
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 767px)").matches
    );
}

function lockBodyScroll() {
    if (typeof document === "undefined") return;

    if (openModalsCount === 0) {
        savedScrollY =
            window.scrollY ||
            window.pageYOffset ||
            document.documentElement.scrollTop ||
            0;

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
    const modalIdRef = useRef(nextModalId++);
    // Mounting & animation lifecycle
    const [mounted, setMounted] = useState(isOpen);
    const [entered, setEntered] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [sheetDetent, setSheetDetent] = useState<SheetDetent>("medium");
    const [baseViewportHeight, setBaseViewportHeight] = useState<
        number | null
    >(null);
    const [, setStackVersion] = useState(0);

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
    const focusedEditableRef = useRef<HTMLElement | null>(null);
    const keyboardFrameRef = useRef<number | null>(null);
    const keyboardTrackingFrameRef = useRef<number | null>(null);
    const keyboardFallbackTimeoutRef = useRef<number | null>(null);
    const keyboardDetentExpansionPendingRef = useRef(false);
    const viewportHeightBeforeFocusRef = useRef<number | null>(null);
    const baseViewportWidthRef = useRef<number | null>(null);
    const sheetDetentRef = useRef<SheetDetent>("medium");
    const isTopModalRef = useRef(false);
    const modalId = modalIdRef.current;
    const stackSnapshot = getModalStackSnapshot(modalId);
    const stackIndex =
        stackSnapshot.index < 0 ? modalStack.length : stackSnapshot.index;
    const isTopModal = stackSnapshot.isTop || stackSnapshot.index < 0;
    const hasChildModal = stackSnapshot.hasChild;

    sheetDetentRef.current = sheetDetent;
    isTopModalRef.current = isTopModal;

    useEffect(
        () =>
            subscribeModalStack(() =>
                setStackVersion((version) => version + 1),
            ),
        [],
    );

    // Clean up pending close timeout on unmount
    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current !== null) {
                window.clearTimeout(closeTimeoutRef.current);
            }
            if (keyboardFrameRef.current !== null) {
                window.cancelAnimationFrame(keyboardFrameRef.current);
            }
            if (keyboardTrackingFrameRef.current !== null) {
                window.cancelAnimationFrame(keyboardTrackingFrameRef.current);
            }
            if (keyboardFallbackTimeoutRef.current !== null) {
                window.clearTimeout(keyboardFallbackTimeoutRef.current);
            }
            keyboardDetentExpansionPendingRef.current = false;
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
        if (!mounted) return;

        const opener =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        registerModalStackEntry(modalId, opener);

        return () => {
            unregisterModalStackEntry(modalId);
        };
    }, [mounted, modalId]);

    useLayoutEffect(() => {
        if (!mounted || !isMobileViewport()) return;

        const activeElement = document.activeElement;
        if (
            panelRef.current?.contains(activeElement) &&
            isEditableElement(activeElement)
        ) {
            (activeElement as HTMLElement).blur();
        }
        panelRef.current?.focus({ preventScroll: true });
    }, [mounted]);

    useEffect(() => {
        if (!mounted || typeof window === "undefined") return;

        const updateBaseViewportHeight = () => {
            const viewport = window.visualViewport;
            const viewportHeight = viewport?.height ?? window.innerHeight;
            const viewportWidth = viewport?.width ?? window.innerWidth;
            const candidateHeight = Math.max(viewportHeight, window.innerHeight);

            setBaseViewportHeight((currentHeight) => {
                const previousWidth = baseViewportWidthRef.current;
                const widthChanged =
                    previousWidth !== null &&
                    Math.abs(viewportWidth - previousWidth) > 24;

                baseViewportWidthRef.current = viewportWidth;

                if (currentHeight === null || widthChanged) {
                    return candidateHeight;
                }

                const isKeyboardDrivenShrink =
                    focusedEditableRef.current !== null &&
                    candidateHeight < currentHeight - 80;

                if (isKeyboardDrivenShrink) {
                    return currentHeight;
                }

                return candidateHeight;
            });
        };

        updateBaseViewportHeight();
        window.visualViewport?.addEventListener(
            "resize",
            updateBaseViewportHeight,
        );
        window.addEventListener("resize", updateBaseViewportHeight);

        return () => {
            window.visualViewport?.removeEventListener(
                "resize",
                updateBaseViewportHeight,
            );
            window.removeEventListener("resize", updateBaseViewportHeight);
        };
    }, [mounted]);

    useEffect(() => {
        if (!mounted || typeof window === "undefined" || !isMobileViewport())
            return;

        const getStickyFooterInset = (
            scrollBody: HTMLElement,
            focusedElement: HTMLElement,
        ) => {
            const scrollRect = scrollBody.getBoundingClientRect();
            let footerInset = 0;

            scrollBody.querySelectorAll<HTMLElement>("*").forEach((element) => {
                if (
                    element === focusedElement ||
                    element.contains(focusedElement)
                )
                    return;

                const style = window.getComputedStyle(element);
                if (style.position !== "sticky" && style.position !== "fixed")
                    return;
                if (style.bottom === "auto") return;

                const rect = element.getBoundingClientRect();
                const isBottomOverlay =
                    rect.bottom >= scrollRect.bottom - 96 &&
                    rect.top < scrollRect.bottom;
                if (!isBottomOverlay) return;

                footerInset = Math.max(
                    footerInset,
                    Math.min(rect.height, scrollRect.height * 0.45),
                );
            });

            return footerInset;
        };

        const adjustFocusedField = (behavior: ScrollBehavior = "smooth") => {
            const focusedElement = focusedEditableRef.current;
            const panel = panelRef.current;
            const scrollBody = scrollBodyRef.current;

            if (
                !focusedElement ||
                !panel ||
                !scrollBody ||
                !isTopModalRef.current
            )
                return;
            if (
                !document.contains(focusedElement) ||
                !panel.contains(focusedElement)
            )
                return;
            if (!isKeyboardEditableElement(focusedElement)) return;

            const viewport = window.visualViewport;
            const viewportBottom = viewport
                ? viewport.height + Math.max(0, viewport.offsetTop)
                : window.innerHeight;
            const panelRect = panel.getBoundingClientRect();
            const scrollRect = scrollBody.getBoundingClientRect();
            const fieldRect = focusedElement.getBoundingClientRect();
            const stickyFooterInset = getStickyFooterInset(
                scrollBody,
                focusedElement,
            );
            const visibleTop =
                Math.max(scrollRect.top, panelRect.top) + KEYBOARD_FIELD_GAP_PX;
            const visibleBottom =
                Math.min(scrollRect.bottom, viewportBottom) -
                stickyFooterInset -
                KEYBOARD_FOCUS_SAFE_GAP_PX;
            const fieldCannotFit =
                fieldRect.height +
                    KEYBOARD_FIELD_GAP_PX +
                    KEYBOARD_FOCUS_SAFE_GAP_PX >
                Math.max(80, visibleBottom - visibleTop);
            const isHiddenBelow = fieldRect.bottom > visibleBottom;
            const isHiddenAbove = fieldRect.top < visibleTop;

            if (
                (isHiddenBelow || fieldCannotFit) &&
                sheetDetentRef.current === "medium" &&
                !keyboardDetentExpansionPendingRef.current
            ) {
                keyboardDetentExpansionPendingRef.current = true;
                setSheetDetent("large");

                const handleTransitionEnd = (event: TransitionEvent) => {
                    if (
                        event.target !== panel ||
                        event.propertyName !== "max-height"
                    )
                        return;
                    panel.removeEventListener(
                        "transitionend",
                        handleTransitionEnd,
                    );
                    if (keyboardFallbackTimeoutRef.current !== null) {
                        window.clearTimeout(keyboardFallbackTimeoutRef.current);
                        keyboardFallbackTimeoutRef.current = null;
                    }
                    keyboardDetentExpansionPendingRef.current = false;
                    scheduleFocusedFieldAdjustment("smooth");
                };

                panel.addEventListener("transitionend", handleTransitionEnd);
                keyboardFallbackTimeoutRef.current = window.setTimeout(() => {
                    panel.removeEventListener(
                        "transitionend",
                        handleTransitionEnd,
                    );
                    keyboardFallbackTimeoutRef.current = null;
                    keyboardDetentExpansionPendingRef.current = false;
                    scheduleFocusedFieldAdjustment("smooth");
                }, 460);
                return;
            }

            let nextScrollTop = scrollBody.scrollTop;

            if (fieldRect.bottom > visibleBottom) {
                nextScrollTop += fieldRect.bottom - visibleBottom;
            } else if (fieldRect.top < visibleTop) {
                nextScrollTop -= visibleTop - fieldRect.top;
            } else {
                return;
            }

            const maxScrollTop =
                scrollBody.scrollHeight - scrollBody.clientHeight;
            const clampedScrollTop = Math.max(
                0,
                Math.min(maxScrollTop, nextScrollTop),
            );
            if (Math.abs(clampedScrollTop - scrollBody.scrollTop) < 2) return;

            scrollBody.scrollTo({
                top: clampedScrollTop,
                behavior,
            });
        };

        const scheduleFocusedFieldAdjustment = (
            behavior: ScrollBehavior = "smooth",
        ) => {
            if (keyboardFrameRef.current !== null) {
                window.cancelAnimationFrame(keyboardFrameRef.current);
            }

            keyboardFrameRef.current = window.requestAnimationFrame(() => {
                keyboardFrameRef.current = window.requestAnimationFrame(() => {
                    keyboardFrameRef.current = null;
                    adjustFocusedField(behavior);
                });
            });
        };

        const stopKeyboardTracking = () => {
            if (keyboardTrackingFrameRef.current !== null) {
                window.cancelAnimationFrame(keyboardTrackingFrameRef.current);
                keyboardTrackingFrameRef.current = null;
            }
        };

        const startKeyboardTracking = () => {
            stopKeyboardTracking();

            let frameCount = 0;
            let lastViewportHeight =
                window.visualViewport?.height ?? window.innerHeight;
            let stableFrames = 0;

            const trackKeyboardFrame = () => {
                const focusedElement = focusedEditableRef.current;
                if (!focusedElement || !isTopModalRef.current) {
                    keyboardTrackingFrameRef.current = null;
                    return;
                }

                const nextViewportHeight =
                    window.visualViewport?.height ?? window.innerHeight;
                const viewportChanged =
                    Math.abs(nextViewportHeight - lastViewportHeight) > 1;
                stableFrames = viewportChanged ? 0 : stableFrames + 1;
                lastViewportHeight = nextViewportHeight;

                adjustFocusedField(viewportChanged ? "auto" : "smooth");

                frameCount += 1;
                if (
                    frameCount >= KEYBOARD_TRACKING_FRAME_LIMIT ||
                    stableFrames >= 8
                ) {
                    keyboardTrackingFrameRef.current = null;
                    return;
                }

                keyboardTrackingFrameRef.current =
                    window.requestAnimationFrame(trackKeyboardFrame);
            };

            keyboardTrackingFrameRef.current =
                window.requestAnimationFrame(trackKeyboardFrame);
        };

        const handleFocusIn = (event: FocusEvent) => {
            const target =
                event.target instanceof HTMLElement ? event.target : null;
            if (!isKeyboardEditableElement(target)) return;
            if (!panelRef.current?.contains(target)) return;

            focusedEditableRef.current = target;
            viewportHeightBeforeFocusRef.current =
                window.visualViewport?.height ?? window.innerHeight;
            scheduleFocusedFieldAdjustment("smooth");
            startKeyboardTracking();
        };

        const handleFocusOut = (event: FocusEvent) => {
            if (event.target === focusedEditableRef.current) {
                focusedEditableRef.current = null;
                viewportHeightBeforeFocusRef.current = null;
                stopKeyboardTracking();
            }
        };

        const handleViewportChange = () => {
            if (!focusedEditableRef.current) return;
            scheduleFocusedFieldAdjustment("smooth");
            startKeyboardTracking();
        };

        const panel = panelRef.current;
        const viewport = window.visualViewport;

        panel?.addEventListener("focusin", handleFocusIn);
        panel?.addEventListener("focusout", handleFocusOut);
        viewport?.addEventListener("resize", handleViewportChange);
        viewport?.addEventListener("scroll", handleViewportChange);

        return () => {
            panel?.removeEventListener("focusin", handleFocusIn);
            panel?.removeEventListener("focusout", handleFocusOut);
            viewport?.removeEventListener("resize", handleViewportChange);
            viewport?.removeEventListener("scroll", handleViewportChange);
            if (keyboardFrameRef.current !== null) {
                window.cancelAnimationFrame(keyboardFrameRef.current);
                keyboardFrameRef.current = null;
            }
            stopKeyboardTracking();
            if (keyboardFallbackTimeoutRef.current !== null) {
                window.clearTimeout(keyboardFallbackTimeoutRef.current);
                keyboardFallbackTimeoutRef.current = null;
            }
            keyboardDetentExpansionPendingRef.current = false;
        };
    }, [mounted]);

    // Animated Close Controller
    const handleRequestClose = () => {
        if (!dismissible || isClosing || !isTopModal) return;
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
            if (e.key === "Escape" && dismissible && isTopModal) {
                handleRequestClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [mounted, dismissible, isClosing, isTopModal]);

    // Touch Gesture Handlers (iOS Safari & Standalone PWA)
    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!dismissible || isClosing || !isTopModal) return;
        const touch = e.touches[0];
        startYRef.current = touch.clientY;
        currentYRef.current = touch.clientY;
        startTimeRef.current = Date.now();
        setIsDragging(true);
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!isDragging || !dismissible || isClosing || !isTopModal) return;
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
        if (isClosing || !isTopModal) return;
        const touch = e.touches[0];
        startYRef.current = touch.clientY;
        currentYRef.current = touch.clientY;
        startTimeRef.current = Date.now();
        setIsBodyDragging(true);
    };

    const handleBodyTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!isBodyDragging || isClosing || !isTopModal) return;

        const scrollBody = scrollBodyRef.current;
        if (!scrollBody) return;

        const touch = e.touches[0];
        const deltaY = touch.clientY - startYRef.current;
        const hasOverflow =
            scrollBody.scrollHeight > scrollBody.clientHeight + 2;
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

        handleEl.addEventListener("touchmove", preventScroll, {
            passive: false,
        });
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
            panelEl.removeEventListener(
                "kash:bottom-sheet-expand",
                expandSheet,
            );
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
        : hasChildModal
          ? "translate3d(0, -10px, 0) scale(0.94)"
          : isClosing || !isMobileOpen
            ? "translate3d(0, 100%, 0)"
            : "translate3d(0, 0, 0)";

    const mobileTransition = isDragging
        ? "none"
        : "transform 0.26s cubic-bezier(0.32, 0.72, 0, 1), max-height 0.40s cubic-bezier(0.22, 1, 0.36, 1)";

    // Backdrop opacity calculation
    const backdropOpacity =
        isClosing || !entered
            ? "opacity-0"
            : isDragging
              ? `opacity-${Math.max(20, Math.round(100 - (dragY / 300) * 80))}`
              : "opacity-100";

    const largeDetentPx = baseViewportHeight
        ? Math.max(
              320,
              Math.min(
                  baseViewportHeight * (LARGE_DETENT_DVH / 100),
                  baseViewportHeight - LARGE_TOP_GAP_PX,
              ),
          )
        : undefined;

    const mobileMaxHeight = hasChildModal
        ? "46dvh"
        : sheetDetent === "large"
          ? largeDetentPx
              ? `${largeDetentPx}px`
              : `min(${LARGE_DETENT_DVH}dvh, calc(100dvh - env(safe-area-inset-top) - ${LARGE_TOP_GAP_PX}px))`
          : `${MEDIUM_DETENT_DVH}dvh`;

    const isBaseModal = stackIndex === 0;
    const backdropClassName = isBaseModal
        ? `fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-240 ${modalStack.length > 0 ? "opacity-100" : backdropOpacity}`
        : isTopModal
          ? "fixed inset-0 bg-transparent opacity-0"
          : "fixed inset-0 bg-transparent opacity-0 pointer-events-none";

    const modalElement = (
        <div
            role="dialog"
            aria-modal={isTopModal ? "true" : undefined}
            aria-hidden={isTopModal ? undefined : "true"}
            className={`fixed inset-0 overflow-hidden ${isTopModal ? "" : "pointer-events-none"}`}
            data-modal-portal-root="true"
            data-modal-stack-index={stackIndex}
            style={{ zIndex: MODAL_LAYER_BASE + stackIndex * MODAL_LAYER_STEP }}
        >
            {/* Backdrop */}
            <div onClick={handleRequestClose} className={backdropClassName} />

            {/* Sheet / Dialog Container */}
            <div className="fixed inset-0 z-50 flex min-h-full items-end justify-center p-0 md:items-center md:p-4 pointer-events-none">
                <div
                    ref={panelRef}
                    style={
                        {
                            transform: mobileTransform,
                            transition: mobileTransition,
                            "--mobile-sheet-max-height": mobileMaxHeight,
                        } as React.CSSProperties
                    }
                    tabIndex={-1}
                    data-bottom-sheet-panel="true"
                    data-bottom-sheet-detent={sheetDetent}
                    className={`${isTopModal ? "pointer-events-auto" : "pointer-events-none"} flex max-h-[var(--mobile-sheet-max-height)] w-full flex-col ${maxWidthClasses[maxWidth]} overflow-hidden rounded-t-2xl bg-white text-left shadow-2xl md:block md:max-h-[85vh] md:rounded-2xl md:pb-6 md:!transform-none md:transition-all md:duration-200 ${
                        entered && !isClosing
                            ? "md:scale-100 md:opacity-100"
                            : "md:scale-95 md:opacity-0"
                    } ${
                        hasChildModal ? "brightness-95 md:brightness-100" : ""
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
                        <div className="h-1.5 w-12 rounded-full bg-slate-300 transition-colors [@media(hover:hover)_and_(pointer:fine)]:hover:bg-slate-400 active:bg-kash-emerald" />
                    </div>

                    {/* Header Region */}
                    {title || showCloseButton ? (
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
                                    className="shrink-0 text-slate-600 [@media(hover:hover)_and_(pointer:fine)]:hover:text-slate-900"
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

    return createPortal(modalElement, document.body);
}
