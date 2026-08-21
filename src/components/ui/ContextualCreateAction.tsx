import type { LucideIcon } from "lucide-react";
import { Plus } from "lucide-react";
import React, { useEffect, useState } from "react";

export type ContextualCreateActionProps = {
  /** Ref to the header button / action container to observe */
  targetRef: React.RefObject<HTMLElement | null>;
  /** Callback when the floating button is clicked */
  onClick: () => void;
  /** Localized label for the action */
  label: string;
  /** Optional icon override (defaults to Plus) */
  icon?: LucideIcon;
  /** Optional additional class names */
  className?: string;
};

/**
 * Contextual floating create pill that appears when the page header action
 * scrolls out of the viewport. Appears at bottom-right, respecting mobile safe
 * areas and avoiding collisions with the global transaction button.
 */
export function ContextualCreateAction({
  targetRef,
  onClick,
  label,
  icon: Icon = Plus,
  className = "",
}: ContextualCreateActionProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // When header CTA is in view (intersecting), floating CTA is hidden
        // When header CTA leaves viewport, floating CTA appears
        setIsVisible(!entry.isIntersecting);
      },
      {
        threshold: 0.05,
      },
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [targetRef]);

  return (
    <div
      className={`fixed z-30 transition-all duration-200 ease-out right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:bottom-6 sm:right-6 lg:bottom-8 lg:right-8 ${
        isVisible
          ? "translate-y-0 opacity-100 pointer-events-auto scale-100"
          : "translate-y-4 opacity-0 pointer-events-none scale-95"
      } ${className}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-2 rounded-xl bg-kash-emerald px-4 py-2.5 text-sm font-extrabold text-white shadow-lg transition hover:bg-kash-emeraldDark active:bg-kash-emeraldPressed active:scale-95 focus:outline-none focus:ring-4 focus:ring-kash-emerald/20"
      >
        <Icon aria-hidden="true" size={18} strokeWidth={2.4} />
        <span>{label}</span>
      </button>
    </div>
  );
}
