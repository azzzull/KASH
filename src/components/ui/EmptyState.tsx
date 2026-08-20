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
      ? "bg-kash-selected text-kash-emeraldDark ring-1 ring-kash-emerald/20"
      : tone === "expense"
        ? "bg-kash-expense/10 text-kash-expense ring-1 ring-kash-expense/20"
        : "bg-slate-100 text-slate-600 ring-1 ring-slate-200";

  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-slate-200 bg-white/60 ${className}`}>
      <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${toneIconStyles}`}>
        <Icon size={28} strokeWidth={2.3} />
      </div>
      <h3 className="mt-4 text-base font-extrabold text-slate-900 md:text-lg">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-xs font-semibold leading-relaxed text-slate-600 md:text-sm">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
