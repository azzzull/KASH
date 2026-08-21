import React, { type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type EmptyStateProps = {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  tone?: "emerald" | "neutral" | "expense";
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
  tone = "emerald",
}: EmptyStateProps) {
  const toneIconStyles =
    tone === "emerald"
      ? "bg-kash-emerald/10 text-kash-emeraldDark"
      : tone === "expense"
        ? "bg-kash-expense/10 text-kash-expense"
        : "bg-slate-100 text-slate-500";

  return (
    <div className={`flex flex-col items-center justify-center px-6 py-10 text-center ${className}`}>
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${toneIconStyles}`}>
        <Icon size={24} strokeWidth={1.8} />
      </div>
      <h3 className="mt-4 text-sm font-bold text-slate-800">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-xs text-xs font-medium leading-relaxed text-slate-500">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
