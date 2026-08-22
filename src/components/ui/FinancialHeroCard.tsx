import type { ReactNode } from "react";

export interface FinancialHeroCardProps {
  /** Optional top eyebrow title, e.g. "RENCANA KEUANGAN TERPADU", "UTANG", "TABUNGAN BERSAMA" */
  eyebrow?: ReactNode;
  /** Optional top-right badge, e.g. Month badge, status badge */
  badge?: ReactNode;
  /** Left icon element before title/eyebrow */
  icon?: ReactNode;
  /** Main title, e.g. Space name or counterparty name */
  title?: ReactNode;
  /** Sub-eyebrow or label above primary metric */
  primaryMetricLabel?: ReactNode;
  /** Main primary metric display, e.g. "Rp1.250.000 / Rp2.000.000" or "Rp500.000" */
  primaryMetricValue: ReactNode;
  /** Optional subtext right after primary metric */
  primaryMetricSubtext?: ReactNode;
  /** Optional status badges placed next to or under primary metric */
  statusBadges?: ReactNode;
  /** Optional supporting metrics (rendered inside translucent grid/chips section) */
  supportingMetrics?: ReactNode;
  /** Optional progress bar configuration */
  progress?: {
    percent: number;
    labelLeft?: ReactNode;
    labelRight?: ReactNode;
    barColorClass?: string;
  };
  /** Optional footer content or actions */
  footer?: ReactNode;
  /** Extra container CSS classes */
  className?: string;
}

export function FinancialHeroCard({
  eyebrow,
  badge,
  icon,
  title,
  primaryMetricLabel,
  primaryMetricValue,
  primaryMetricSubtext,
  statusBadges,
  supportingMetrics,
  progress,
  footer,
  className = "",
}: FinancialHeroCardProps) {
  const hasTopRow = eyebrow || badge || icon || title;

  return (
    <section className={`kash-hero-card p-5 sm:p-6 min-w-0 max-w-full ${className}`}>
      {/* Top Header Row */}
      {hasTopRow && (
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white font-extrabold text-sm shadow-xs">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {eyebrow && (
                <span className="text-xs font-bold uppercase tracking-wider text-white/70 block truncate">
                  {eyebrow}
                </span>
              )}
              {title && (
                <h1 className="text-lg sm:text-xl font-extrabold text-white break-words mt-0.5 leading-snug">
                  {title}
                </h1>
              )}
              {statusBadges && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {statusBadges}
                </div>
              )}
            </div>
          </div>

          {badge && (
            <div className="shrink-0 self-center">
              {badge}
            </div>
          )}
        </div>
      )}

      {/* Primary Metric Section */}
      <div className={`${hasTopRow ? "mt-3.5" : ""} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="min-w-0">
          {primaryMetricLabel && (
            <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wide">
              {primaryMetricLabel}
            </p>
          )}
          <div className="mt-0.5 break-words text-2xl font-extrabold text-white sm:text-3xl">
            {primaryMetricValue}
            {primaryMetricSubtext && (
              <span className="text-lg font-semibold text-white/70 ml-1.5">
                {primaryMetricSubtext}
              </span>
            )}
          </div>
        </div>

      </div>

      {/* Supporting Metrics Slot */}
      {supportingMetrics && (
        <div className="mt-3.5 pt-3 border-t border-white/15">
          {supportingMetrics}
        </div>
      )}

      {/* Progress Bar Section */}
      {progress && (
        <div className="mt-4">
          <div className="h-2.5 sm:h-3 w-full overflow-hidden rounded-full bg-black/20">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                progress.barColorClass || "bg-white"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
            />
          </div>
          {(progress.labelLeft || progress.labelRight) && (
            <div className="mt-2 flex items-center justify-between text-xs font-bold text-white/80">
              <span>{progress.labelLeft}</span>
              <span>{progress.labelRight}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer Section */}
      {footer && <div className="mt-3.5 pt-3 border-t border-white/15">{footer}</div>}
    </section>
  );
}
