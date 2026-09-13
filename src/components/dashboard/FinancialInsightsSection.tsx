import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Info,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import type { FinancialInsight } from "../../lib/financialInsights";
import { useI18n } from "../../i18n";
import { formatInsightPresentation } from "../../lib/dashboardPresentation";

type FinancialInsightsSectionProps = {
  insights: FinancialInsight[];
  loading?: boolean;
};

export function FinancialInsightsSection({
  insights,
  loading = false,
}: FinancialInsightsSectionProps) {
  const { t } = useI18n();
  const [showSecondary, setShowSecondary] = useState(false);

  if (loading) {
    return (
      <section className="min-w-0 max-w-full rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card animate-pulse md:p-6">
        <div className="h-4 w-32 rounded bg-slate-200" />
        <div className="mt-3 h-14 rounded-xl bg-slate-100" />
      </section>
    );
  }

  // If no insights were detected, render nothing (no unnecessary card wall)
  if (!insights || insights.length === 0) return null;

  // Maximum 3 insights: 1 prominent primary insight, up to 2 secondary
  const primaryInsight = insights[0];
  const secondaryInsights = insights.slice(1, 3);

  const formattedPrimary = formatInsightPresentation(primaryInsight, t);

  const getSeverityBadge = (severity: FinancialInsight["severity"]) => {
    switch (severity) {
      case "positive":
        return {
          icon: <TrendingUp size={14} className="text-kash-emerald" aria-hidden="true" />,
          containerClass: "bg-emerald-50 text-kash-emeraldDark border-emerald-200/60",
        };
      case "critical":
      case "warning":
        return {
          icon: <AlertCircle size={14} className="text-amber-600" aria-hidden="true" />,
          containerClass: "bg-amber-50 text-amber-800 border-amber-200/60",
        };
      default:
        return {
          icon: <Info size={14} className="text-sky-600" aria-hidden="true" />,
          containerClass: "bg-sky-50 text-sky-800 border-sky-200/60",
        };
    }
  };

  const primaryBadge = getSeverityBadge(primaryInsight.severity);

  return (
    <section className="min-w-0 max-w-full rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card transition sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-kash-emeraldDark">
            <Sparkles size={15} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
            {t("insights.title")}
          </h2>
        </div>

        {secondaryInsights.length > 0 && !showSecondary ? (
          <button
            type="button"
            onClick={() => setShowSecondary(true)}
            className="text-xs font-bold text-slate-500 hover:text-kash-emeraldDark transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kash-emerald/30 rounded"
          >
            {t("insights.moreCount", { count: secondaryInsights.length })}
          </button>
        ) : null}
      </div>

      {/* Primary Prominent Insight */}
      <div className={`rounded-xl border p-4 transition ${primaryBadge.containerClass}`}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0">{primaryBadge.icon}</span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-extrabold text-slate-900 leading-snug">
              {formattedPrimary.headline}
            </h3>
            {formattedPrimary.explanation ? (
              <p className="mt-1 text-xs font-medium text-slate-600 leading-relaxed">
                {formattedPrimary.explanation}
              </p>
            ) : null}

            {formattedPrimary.ctaText && formattedPrimary.ctaPath ? (
              <div className="mt-3">
                <Link
                  to={formattedPrimary.ctaPath}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-xs border border-slate-200 hover:bg-slate-50 active:bg-slate-100 transition"
                >
                  <span>{formattedPrimary.ctaText}</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Secondary Insights (up to 2, compact) */}
      {showSecondary && secondaryInsights.length > 0 ? (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {secondaryInsights.map((secondary) => {
            const formatted = formatInsightPresentation(secondary, t);
            const badge = getSeverityBadge(secondary.severity);

            return (
              <div
                key={secondary.id}
                className="flex items-start justify-between gap-3 rounded-xl bg-slate-50/70 p-3 border border-slate-100 text-xs"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="mt-0.5 shrink-0">{badge.icon}</span>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 leading-snug truncate">
                      {formatted.headline}
                    </p>
                    {formatted.explanation ? (
                      <p className="text-[11px] font-medium text-slate-500 line-clamp-1 mt-0.5">
                        {formatted.explanation}
                      </p>
                    ) : null}
                  </div>
                </div>

                {formatted.ctaText && formatted.ctaPath ? (
                  <Link
                    to={formatted.ctaPath}
                    className="shrink-0 font-bold text-kash-emeraldDark hover:text-kash-emerald transition"
                  >
                    {formatted.ctaText} →
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
