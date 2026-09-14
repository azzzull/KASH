import {
  ArrowRight,
  CircleAlert,
  Lightbulb,
  RefreshCw,
  Scale,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { FinancialInsight } from "../../lib/financialInsights";
import { useI18n } from "../../i18n";
import { formatRecommendation } from "../../lib/dashboardPresentation";

type DashboardRecommendationCardProps = {
  insights: FinancialInsight[];
  loading?: boolean;
};

const SWIPE_THRESHOLD = 72;
const EXIT_DURATION_MS = 180;

function InsightRecommendationIcon({ type }: Pick<FinancialInsight, "type">) {
  switch (type) {
    case "BUDGET_CATEGORY_OVERSPEND":
    case "SPENDING_SPIKE":
      return <CircleAlert size={13} aria-hidden="true" />;
    case "BUDGET_REALLOCATION_OPPORTUNITY":
      return <RefreshCw size={13} aria-hidden="true" />;
    case "RECEIVABLE_LOCKING_CASH":
      return <Scale size={13} aria-hidden="true" />;
    case "SURPLUS_MOVED_ELSEWHERE":
      return <TrendingUp size={13} aria-hidden="true" />;
    default:
      return <WalletCards size={13} aria-hidden="true" />;
  }
}

/** Presentation-only looping deck of the canonical ranked insight list. */
export function DashboardRecommendationCard({
  insights,
  loading = false,
}: DashboardRecommendationCardProps) {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [exitDirection, setExitDirection] = useState<-1 | 1 | null>(null);
  const pointerStartX = useRef<number | null>(null);
  const exitTimer = useRef<number | null>(null);
  const resetFrame = useRef<number | null>(null);

  useEffect(() => {
    setActiveIndex((current) => (insights.length > 0 ? current % insights.length : 0));
  }, [insights.length]);

  useEffect(() => () => {
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    if (resetFrame.current !== null) window.cancelAnimationFrame(resetFrame.current);
  }, []);

  if (loading) {
    return (
      <section className="min-w-0 max-w-full animate-pulse rounded-2xl border border-slate-200/60 bg-white p-4 shadow-card sm:p-5">
        <div className="h-3 w-32 rounded bg-slate-200" />
        <div className="mt-2.5 h-4 w-3/4 rounded bg-slate-200" />
        <div className="mt-1.5 h-3 w-1/2 rounded bg-slate-100" />
      </section>
    );
  }

  if (insights.length === 0) return null;

  const currentInsight = insights[activeIndex];
  const recommendation = formatRecommendation(currentInsight, t);
  const nextInsight = insights[(activeIndex + 1) % insights.length];
  const followingInsight = insights[(activeIndex + 2) % insights.length];
  const thirdInsight = insights[(activeIndex + 3) % insights.length];
  const canCycle = insights.length > 1;

  const moveTo = (direction: -1 | 1) => {
    if (!canCycle || exitDirection !== null) return;
    setActiveIndex((current) => (current + direction + insights.length) % insights.length);
  };

  const finishSwipe = (direction: -1 | 1) => {
    if (!canCycle || exitDirection !== null) {
      setDragX(0);
      return;
    }

    setIsDragging(false);
    setExitDirection(direction);
    exitTimer.current = window.setTimeout(() => {
      // The next card is already visible in the stack. Reset the front card
      // without a second slide-in so it feels like lifting the top card away.
      setIsResetting(true);
      setActiveIndex((current) => (current + 1) % insights.length);
      setDragX(0);
      setExitDirection(null);
      exitTimer.current = null;
      resetFrame.current = window.requestAnimationFrame(() => {
        resetFrame.current = window.requestAnimationFrame(() => {
          setIsResetting(false);
          resetFrame.current = null;
        });
      });
    }, EXIT_DURATION_MS);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canCycle || exitDirection !== null) return;
    if (event.target instanceof Element && event.target.closest("a, button")) return;
    pointerStartX.current = event.clientX;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || pointerStartX.current === null) return;
    setDragX(event.clientX - pointerStartX.current);
  };

  const handlePointerEnd = () => {
    if (!isDragging) return;
    pointerStartX.current = null;
    if (Math.abs(dragX) >= SWIPE_THRESHOLD) {
      finishSwipe(dragX < 0 ? -1 : 1);
    } else {
      setIsDragging(false);
      setDragX(0);
    }
  };

  const rotation = exitDirection !== null ? exitDirection * 7 : dragX / 28;
  const translateX = exitDirection !== null ? exitDirection * 115 : dragX / 3;
  const dragProgress = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1);
  const revealProgress = Math.min(dragProgress / 0.7, 1);

  return (
    <section aria-label={t("analytics.insightsRecommendations")} className="min-w-0 max-w-full">
      <div className="relative z-20 mb-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <Lightbulb size={15} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
            {t("analytics.insightsRecommendations")}
          </h2>
        </div>
      </div>

      <div className="relative z-10 isolate pb-12 pt-0" style={{ touchAction: "pan-y" }}>
        {canCycle ? (
          <>
            <DeckLayer
              isDragging={isDragging}
              lift={-16 * revealProgress}
              insight={thirdInsight}
              blur={0}
              opacity={0.72 + revealProgress * 0.2}
              rotation={0}
              scale={1}
              className="z-0 top-12 left-8 right-8"
            />
            <DeckLayer
              isDragging={isDragging}
              lift={-16 * revealProgress}
              insight={followingInsight}
              blur={0}
              opacity={0.82 + revealProgress * 0.16}
              rotation={0}
              scale={1}
              className="z-[1] top-8 left-5 right-5"
            />
            <DeckLayer
              isDragging={isDragging}
              lift={-16 * revealProgress}
              insight={nextInsight}
              blur={0}
              opacity={0.92 + revealProgress * 0.08}
              rotation={0}
              scale={1}
              className="z-[2] inset-x-0 top-4"
            />
          </>
        ) : null}
        <div
          aria-roledescription="carousel"
          aria-label={t("insights.deckPosition", { current: activeIndex + 1, total: insights.length })}
          className="relative z-10 cursor-grab select-none active:cursor-grabbing"
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              moveTo(-1);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              moveTo(1);
            }
          }}
          role="group"
          tabIndex={canCycle ? 0 : -1}
          style={{
            transform: `translateX(${translateX}%) rotate(${rotation}deg)`,
            transition: isDragging || isResetting ? "none" : "transform 180ms ease-out",
          }}
        >
          <InsightCard recommendation={recommendation} type={currentInsight.type} />
        </div>
      </div>

    </section>
  );
}

type Recommendation = ReturnType<typeof formatRecommendation>;

function DeckLayer({
  insight,
  className,
  lift,
  rotation,
  scale,
  blur,
  opacity,
  isDragging,
}: {
  insight: FinancialInsight;
  className: string;
  lift: number;
  rotation: number;
  scale: number;
  blur: number;
  opacity: number;
  isDragging: boolean;
}) {
  const { t } = useI18n();
  const recommendation = formatRecommendation(insight, t);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute ${isDragging ? "" : "transition-[translate,rotate,scale,filter,opacity] duration-200 ease-out"} ${className}`}
      style={{
        filter: `blur(${blur}px)`,
        opacity,
        rotate: `${rotation}deg`,
        scale: String(scale),
        translate: `0 ${lift}px`,
      }}
    >
      <InsightCard interactive={false} recommendation={recommendation} type={insight.type} />
    </div>
  );
}

function InsightCard({
  recommendation,
  type,
  interactive = true,
}: {
  recommendation: Recommendation;
  type: FinancialInsight["type"];
  interactive?: boolean;
}) {
  const { t } = useI18n();

  return (
    <article className="flex min-h-[16.25rem] flex-col justify-between rounded-xl border border-slate-200/70 bg-white p-4 shadow-xs">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-200/50 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
            <InsightRecommendationIcon type={type} />
            {recommendation.title || t("dashboard.recommendationHeading")}
          </span>
        </div>
        <p className="text-sm font-bold leading-snug text-slate-900">{recommendation.observation}</p>
        <p className="text-xs leading-relaxed text-slate-600">{recommendation.whyItMatters}</p>
        {recommendation.suggestedAction ? (
          <p className="flex gap-1.5 pt-1 text-xs font-semibold text-kash-emeraldDark">
            <ArrowRight className="mt-0.5 shrink-0" size={13} aria-hidden="true" />
            <span>{recommendation.suggestedAction}</span>
          </p>
        ) : null}
      </div>

      <div className="mt-3 border-t border-slate-100 pt-2.5">
        {interactive ? (
          <Link to={recommendation.ctaPath || "/analytics"} className="inline-flex items-center gap-1 text-xs font-bold text-kash-emeraldDark transition hover:text-kash-emerald">
            <span>{recommendation.ctaText || t("common.viewDetails")}</span>
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-kash-emeraldDark">
            <span>{recommendation.ctaText || t("common.viewDetails")}</span>
            <ArrowRight size={13} aria-hidden="true" />
          </span>
        )}
      </div>
    </article>
  );
}
