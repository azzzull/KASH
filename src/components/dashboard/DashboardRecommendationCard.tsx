import { ArrowRight, Sparkles } from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";
import type { FinancialInsight } from "../../lib/financialInsights";
import { useI18n } from "../../i18n";
import { formatRecommendation } from "../../lib/dashboardPresentation";

type DashboardRecommendationCardProps = {
  insights: FinancialInsight[];
  loading?: boolean;
};

export function DashboardRecommendationCard({
  insights,
  loading = false,
}: DashboardRecommendationCardProps) {
  const { t } = useI18n();

  if (loading) {
    return (
      <section className="min-w-0 max-w-full rounded-2xl border border-slate-200/60 bg-white p-4 sm:p-5 shadow-card animate-pulse">
        <div className="h-3 w-32 rounded bg-slate-200" />
        <div className="mt-2.5 h-4 w-3/4 rounded bg-slate-200" />
        <div className="mt-1.5 h-3 w-1/2 rounded bg-slate-100" />
      </section>
    );
  }

  if (!insights || insights.length === 0) return null;

  // Exactly ONE primary recommendation
  const primaryInsight = insights[0];
  const rec = formatRecommendation(primaryInsight, t);
  const remainingCount = insights.length - 1;
  const hasMoreInsights = remainingCount > 0;

  return (
    <section className="min-w-0 max-w-full rounded-2xl border border-slate-200/60 bg-white p-4 sm:p-5 shadow-card transition">
      {/* Header: Title + optional "Lihat N insight lainnya" if more insights exist */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <Sparkles size={15} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
            {t("dashboard.recommendationHeading") || "Yang Perlu Diperhatikan"}
          </h2>
        </div>

        {hasMoreInsights ? (
          <Link
            to="/analytics#insights"
            className="text-xs font-bold text-slate-400 hover:text-kash-emeraldDark transition"
          >
            {t("dashboard.viewMoreInsights", { count: remainingCount }) ||
              `Lihat ${remainingCount} insight lainnya`}
          </Link>
        ) : null}
      </div>

      {/* Body: Observation + Suggested Action */}
      <div className="mt-2.5 space-y-1">
        <p className="text-sm font-extrabold text-slate-900 leading-snug">
          {rec.observation}
        </p>
        {rec.suggestedAction ? (
          <p className="text-xs font-medium text-slate-600 leading-relaxed">
            {rec.suggestedAction}
          </p>
        ) : null}
      </div>

      {/* Action Affordance */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
        <Link
          to={rec.ctaPath || "/analytics"}
          className="inline-flex items-center gap-1 text-xs font-bold text-kash-emeraldDark hover:text-kash-emerald transition"
        >
          <span>{rec.ctaText || t("common.viewDetails")}</span>
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
