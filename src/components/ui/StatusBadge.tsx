import React, { type ReactNode } from "react";

export type StatusBadgeTone =
  | "emerald"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "purple";

export type StatusBadgeProps = {
  label: ReactNode;
  tone?: StatusBadgeTone;
  size?: "sm" | "md";
  className?: string;
};

const toneStyles: Record<StatusBadgeTone, string> = {
  emerald: "bg-kash-emerald/10 text-kash-emeraldDark",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-kash-expense/10 text-kash-expense",
  info: "bg-blue-50 text-blue-700",
  neutral: "bg-slate-100 text-slate-600",
  purple: "bg-purple-50 text-purple-700",
};

export function StatusBadge({
  label,
  tone = "neutral",
  size = "md",
  className = "",
}: StatusBadgeProps) {
  const isSm = size === "sm";

  return (
    <span
      className={`inline-flex items-center justify-center font-bold rounded-full select-none ${
        toneStyles[tone]
      } ${
        isSm ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]"
      } ${className}`}
    >
      {label}
    </span>
  );
}
