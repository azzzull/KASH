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
  emerald: "bg-kash-selected text-kash-emeraldDark ring-kash-emerald/30",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-kash-expense/10 text-kash-expense ring-kash-expense/20",
  info: "bg-blue-50 text-blue-700 ring-blue-200",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  purple: "bg-purple-50 text-purple-700 ring-purple-200",
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
      className={`inline-flex items-center justify-center font-black rounded-full ring-1 select-none ${
        toneStyles[tone]
      } ${
        isSm ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      } ${className}`}
    >
      {label}
    </span>
  );
}
