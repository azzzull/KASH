import React from "react";

export type ProgressBarProps = {
  percentage: number; // 0 to 100
  tone?: "emerald" | "warning" | "danger" | "neutral" | "auto";
  height?: "xs" | "sm" | "md" | "lg";
  className?: string;
  showLabel?: boolean;
};

const heightClasses = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2",
  lg: "h-3",
};

export function ProgressBar({
  percentage,
  tone = "auto",
  height = "sm",
  className = "",
  showLabel = false,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, isNaN(percentage) ? 0 : percentage));

  let fillTone = "bg-kash-emerald";
  if (tone === "auto") {
    if (clamped >= 100) fillTone = "bg-kash-emeraldDark";
    else if (clamped >= 80) fillTone = "bg-amber-500";
    else fillTone = "bg-kash-emerald";
  } else if (tone === "warning") {
    fillTone = "bg-amber-500";
  } else if (tone === "danger") {
    fillTone = "bg-kash-expense";
  } else if (tone === "neutral") {
    fillTone = "bg-slate-400";
  } else if (tone === "emerald") {
    fillTone = "bg-kash-emerald";
  }

  return (
    <div className={`w-full ${className}`}>
      <div className={`w-full overflow-hidden rounded-full bg-slate-100 ${heightClasses[height]}`}>
        <div
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{ width: `${clamped}%` }}
          className={`h-full rounded-full transition-all duration-500 ease-out ${fillTone}`}
        />
      </div>
      {showLabel ? (
        <span className="mt-1 block text-right text-[11px] font-bold text-slate-600">
          {clamped.toFixed(1)}%
        </span>
      ) : null}
    </div>
  );
}
