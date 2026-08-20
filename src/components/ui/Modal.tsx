import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { X } from "lucide-react";
import React, { Fragment, useRef, useState, useEffect, type ReactNode } from "react";
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
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dismissible) return;
    // Only allow drag starting from the header / grabber handle region
    startYRef.current = e.clientY;
    currentYRef.current = e.clientY;
    startTimeRef.current = Date.now();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dismissible) return;
    const deltaY = e.clientY - startYRef.current;
    if (deltaY > 0) {
      // Dragging downward
      setDragY(deltaY);
      currentYRef.current = e.clientY;
    } else {
      // Resistance upward
      setDragY(deltaY * 0.15);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const totalDelta = currentYRef.current - startYRef.current;
    const elapsedTime = Math.max(1, Date.now() - startTimeRef.current);
    const velocity = totalDelta / elapsedTime; // px per ms

    if (totalDelta > 110 || velocity > 0.45) {
      // Dismiss
      setDragY(300);
      onClose();
    } else {
      // Snap back
      setDragY(0);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setDragY(0);
      setIsDragging(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (dismissible) {
      onClose();
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        {/* Backdrop */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" />
        </TransitionChild>

        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-0 text-center md:items-center md:p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-250 transform"
              enterFrom="opacity-0 translate-y-full md:translate-y-0 md:scale-95"
              enterTo="opacity-100 translate-y-0 md:scale-100"
              leave="ease-in duration-180 transform"
              leaveFrom="opacity-100 translate-y-0 md:scale-100"
              leaveTo="opacity-0 translate-y-full md:translate-y-0 md:scale-95"
            >
              <DialogPanel
                style={{
                  transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
                  transition: isDragging ? "none" : undefined,
                }}
                className={`w-full ${maxWidthClasses[maxWidth]} transform overflow-hidden rounded-t-2xl bg-white text-left align-middle shadow-2xl transition-all md:rounded-2xl pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-6 ${className}`}
              >
                {/* Drag Handle for Mobile */}
                <div
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="touch-none select-none cursor-grab active:cursor-grabbing pt-3 pb-1 md:hidden"
                >
                  <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-300/90" />
                </div>

                {/* Header Region */}
                {(title || showCloseButton) ? (
                  <div
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="flex items-start justify-between gap-4 px-5 pt-2 pb-3 md:px-6 md:pt-6 touch-none"
                  >
                    <div className="min-w-0 flex-1">
                      {title ? (
                        <DialogTitle as="h2" className="text-lg font-extrabold text-slate-900 md:text-xl">
                          {title}
                        </DialogTitle>
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
                        onClick={onClose}
                        className="shrink-0 text-slate-600 hover:text-slate-900"
                      />
                    ) : null}
                  </div>
                ) : null}

                {/* Scrollable Content Body */}
                <div className={`px-5 py-2 md:px-6 max-h-[80vh] md:max-h-[75vh] overflow-y-auto overscroll-contain ${bodyClassName}`}>
                  {children}
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
