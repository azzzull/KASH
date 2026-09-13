import type {
  MoneyFlowReconciliation,
  SpendableCashBreakdown,
} from "./financialMetrics";
import type { FinancialInsight } from "./financialInsights";
import type { TranslationKey } from "../i18n";

export type Translator = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export type SpendableCashStatus = {
  tone: "healthy" | "neutral" | "deficit";
  badgeLabel?: string;
  supportingText: string;
};

export function getSpendableCashStatus(
  spendableCash: SpendableCashBreakdown,
  t: Translator,
): SpendableCashStatus {
  if (spendableCash.spendableCash > 0) {
    return {
      tone: "healthy",
      supportingText: t("dashboard.afterScheduledObligations"),
    };
  }

  if (spendableCash.spendableCash === 0) {
    return {
      tone: "neutral",
      supportingText: t("dashboard.afterScheduledObligations"),
    };
  }

  return {
    tone: "deficit",
    badgeLabel: t("dashboard.temporaryDeficit"),
    supportingText: t("dashboard.temporaryDeficitDesc"),
  };
}

/**
 * Priority rule for Available to Spend contextual reminder:
 * overdue > due soon > remaining unpaid obligation > unpaid count
 */
export function getSpendableCashReminderMessage(
  spendableCash: SpendableCashBreakdown,
  t: Translator,
  formatCurrencyFn: (amount: number, currency: string) => string,
  currency: string,
): string | null {
  const { reminder, totalRemainingObligations } = spendableCash;

  // 1. Overdue: highest priority
  if (reminder.overdueCount > 0) {
    return t("dashboard.reminderOverdue", {
      count: reminder.overdueCount,
    });
  }

  // 2. Due soon: nearest due date within active scope
  if (
    reminder.nearestDueDate &&
    reminder.nearestDueAmount != null &&
    reminder.nearestDueAmount > 0
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(reminder.nearestDueDate);
    dueDate.setHours(0, 0, 0, 0);
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const formattedAmount = formatCurrencyFn(reminder.nearestDueAmount, currency);

    if (diffDays <= 0) {
      return t("dashboard.reminderDueToday", { amount: formattedAmount });
    }
    if (diffDays <= 7) {
      return t("dashboard.reminderDueSoon", {
        days: diffDays,
        amount: formattedAmount,
      });
    }
    return t("dashboard.reminderDueLater", {
      date: reminder.nearestDueDate,
      amount: formattedAmount,
    });
  }

  // 3. Remaining unpaid obligation amount
  if (totalRemainingObligations > 0) {
    return t("dashboard.reminderRemainingObligations", {
      amount: formatCurrencyFn(totalRemainingObligations, currency),
    });
  }

  // 4. Unpaid count
  if (reminder.unpaidObligationCount > 0) {
    return t("dashboard.reminderUnpaidCount", {
      count: reminder.unpaidObligationCount,
    });
  }

  return null;
}

export type MoneyFlowPresentationItem = {
  key: string;
  label: string;
  amount: number;
  kind: "inflow" | "spending" | "savings" | "goal" | "debt" | "receivable" | "investment" | "fee" | "adjustment";
};

export type MoneyFlowPresentation = {
  genuineIncome: number;
  ordinarySpending: number;
  totalAllocations: number;
  totalUsage: number;
  spendingItems: MoneyFlowPresentationItem[];
  allocationItems: MoneyFlowPresentationItem[];
  usageItems: MoneyFlowPresentationItem[];
  otherMovementItems: MoneyFlowPresentationItem[];
  hasOtherMovements: boolean;
  resultingLiquidityChange: number;
  internalTransfers: number;
  isFullyReconciled: boolean;
  unreconciledAmount: number;
};

export function formatMoneyFlowPresentation(
  flow: MoneyFlowReconciliation,
  t: Translator,
): MoneyFlowPresentation {
  const spendingItems: MoneyFlowPresentationItem[] = [];
  const allocationItems: MoneyFlowPresentationItem[] = [];
  const otherMovementItems: MoneyFlowPresentationItem[] = [];

  // Consumption spending + transfer fees
  const consumptionTotal = flow.ordinarySpending + flow.transferFees;
  if (consumptionTotal > 0) {
    spendingItems.push({
      key: "consumption",
      label: t("dashboard.consumptionSpending"),
      amount: consumptionTotal,
      kind: "spending",
    });
  }

  // Savings allocation
  if (flow.savingsAllocation > 0) {
    allocationItems.push({
      key: "savings",
      label: t("dashboard.savingsAllocated"),
      amount: flow.savingsAllocation,
      kind: "savings",
    });
  }

  // Goal contribution
  if (flow.goalContributions > 0) {
    allocationItems.push({
      key: "goals",
      label: t("dashboard.goalContributions"),
      amount: flow.goalContributions,
      kind: "goal",
    });
  }

  // Debt principal payment
  if (flow.debtPrincipalPayments > 0) {
    allocationItems.push({
      key: "debt_payment",
      label: t("dashboard.debtPayments"),
      amount: flow.debtPrincipalPayments,
      kind: "debt",
    });
  }

  // Receivable advance (covering for others)
  if (flow.receivableOutflow > 0) {
    allocationItems.push({
      key: "receivable_outflow",
      label: t("dashboard.receivableOutflow"),
      amount: flow.receivableOutflow,
      kind: "receivable",
    });
  }

  // Investment contribution
  if (flow.investmentContribution > 0) {
    allocationItems.push({
      key: "investment_contribution",
      label: t("dashboard.investmentAllocated"),
      amount: flow.investmentContribution,
      kind: "investment",
    });
  }

  // Other cash movements (distinct from income and consumption spending)
  if (flow.debtPrincipalInflow > 0) {
    otherMovementItems.push({
      key: "debt_inflow",
      label: t("dashboard.debtPrincipalInflow"),
      amount: flow.debtPrincipalInflow,
      kind: "debt",
    });
  }

  if (flow.receivableCollection > 0) {
    otherMovementItems.push({
      key: "receivable_collection",
      label: t("dashboard.receivableCollected"),
      amount: flow.receivableCollection,
      kind: "receivable",
    });
  }

  if (flow.investmentWithdrawal > 0) {
    otherMovementItems.push({
      key: "investment_withdrawal",
      label: t("dashboard.investmentWithdrawn"),
      amount: flow.investmentWithdrawal,
      kind: "investment",
    });
  }

  if (flow.balanceAdjustments !== 0) {
    otherMovementItems.push({
      key: "balance_adjustment",
      label: t("dashboard.balanceAdjustments"),
      amount: flow.balanceAdjustments,
      kind: "adjustment",
    });
  }

  const ordinarySpending = spendingItems.reduce((sum, item) => sum + item.amount, 0);
  const totalAllocations = allocationItems.reduce((sum, item) => sum + item.amount, 0);
  const usageItems = [...spendingItems, ...allocationItems];
  const totalUsage = usageItems.reduce((sum, item) => sum + item.amount, 0);

  return {
    genuineIncome: flow.genuineIncome,
    ordinarySpending,
    totalAllocations,
    totalUsage,
    spendingItems,
    allocationItems,
    usageItems,
    otherMovementItems,
    hasOtherMovements: otherMovementItems.length > 0,
    resultingLiquidityChange: flow.resultingLiquidityChange,
    internalTransfers: flow.internalWalletMovement,
    isFullyReconciled: Math.abs(flow.unreconciledAmount) < 1,
    unreconciledAmount: flow.unreconciledAmount,
  };
}

export type FormattedRecommendation = {
  id: string;
  type: FinancialInsight["type"];
  severity: FinancialInsight["severity"];
  title: string;
  observation: string;
  whyItMatters: string;
  suggestedAction: string;
  ctaText: string;
  ctaPath: string;
};

export type FormattedInsight = {
  id: string;
  type: FinancialInsight["type"];
  severity: FinancialInsight["severity"];
  headline: string;
  explanation: string;
  ctaText?: string;
  ctaPath?: string;
};

export function formatRecommendation(
  insight: FinancialInsight,
  t: Translator,
): FormattedRecommendation {
  const viewDetailsLabel = t("common.viewDetails") || "Lihat detail";
  const viewAnalysisLabel = t("dashboard.viewAnalysis") || "Lihat analisis";

  switch (insight.type) {
    case "POSITIVE_CASH_FLOW":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: t("insights.positiveCashFlowHeadline"),
        observation: t("insights.positiveCashFlowObservation"),
        whyItMatters: t("insights.positiveCashFlowWhy"),
        suggestedAction: t("insights.positiveCashFlowAction"),
        ctaText: viewAnalysisLabel,
        ctaPath: "/analytics",
      };

    case "SURPLUS_MOVED_ELSEWHERE":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: t("insights.surplusMovedHeadline"),
        observation: t("insights.surplusMovedObservation"),
        whyItMatters: t("insights.surplusMovedWhy"),
        suggestedAction: t("insights.surplusMovedAction"),
        ctaText: viewAnalysisLabel,
        ctaPath: "/analytics",
      };

    case "PRIMARY_WALLET_LOW":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: t("insights.primaryWalletLowHeadline"),
        observation: t("insights.primaryWalletLowObservation"),
        whyItMatters: t("insights.primaryWalletLowWhy"),
        suggestedAction: t("insights.primaryWalletLowAction"),
        ctaText: viewDetailsLabel,
        ctaPath: "/wallets",
      };

    case "LOW_SPENDABLE_CASH":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: t("insights.lowSpendableCashHeadline"),
        observation: t("insights.lowSpendableCashObservation"),
        whyItMatters: t("insights.lowSpendableCashWhy"),
        suggestedAction: t("insights.lowSpendableCashAction"),
        ctaText: viewDetailsLabel,
        ctaPath: "/calendar",
      };

    case "HIGH_INTERNAL_TRANSFER_ACTIVITY":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: t("insights.highTransfersHeadline"),
        observation: t("insights.highTransfersObservation"),
        whyItMatters: t("insights.highTransfersWhy"),
        suggestedAction: t("insights.highTransfersAction"),
        ctaText: viewDetailsLabel,
        ctaPath: "/transactions",
      };

    case "HIGH_UNBUDGETED_SPENDING":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: t("insights.unbudgetedSpendingHeadline"),
        observation: t("insights.unbudgetedSpendingObservation"),
        whyItMatters: t("insights.unbudgetedSpendingWhy"),
        suggestedAction: t("insights.unbudgetedSpendingAction"),
        ctaText: viewDetailsLabel,
        ctaPath: "/budgets",
      };

    case "BUDGET_CATEGORY_OVERSPEND":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: t("insights.budgetOverspendHeadline"),
        observation: t("insights.budgetOverspendObservation"),
        whyItMatters: t("insights.budgetOverspendWhy"),
        suggestedAction: t("insights.budgetOverspendAction"),
        ctaText: viewDetailsLabel,
        ctaPath: "/budgets",
      };

    case "SAVINGS_AHEAD_OF_TARGET":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: t("insights.savingsAheadHeadline"),
        observation: t("insights.savingsAheadObservation"),
        whyItMatters: t("insights.savingsAheadWhy"),
        suggestedAction: t("insights.savingsAheadAction"),
        ctaText: viewDetailsLabel,
        ctaPath: "/goals",
      };

    case "SAVINGS_BEHIND_TARGET":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: t("insights.savingsBehindHeadline"),
        observation: t("insights.savingsBehindObservation"),
        whyItMatters: t("insights.savingsBehindWhy"),
        suggestedAction: t("insights.savingsBehindAction"),
        ctaText: viewDetailsLabel,
        ctaPath: "/goals",
      };

    case "GOAL_AHEAD_OF_TARGET":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: t("insights.goalAheadHeadline"),
        observation: t("insights.goalAheadObservation"),
        whyItMatters: t("insights.goalAheadWhy"),
        suggestedAction: t("insights.goalAheadAction"),
        ctaText: viewDetailsLabel,
        ctaPath: "/goals",
      };

    case "GOAL_BEHIND_TARGET":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: t("insights.goalBehindHeadline"),
        observation: t("insights.goalBehindObservation"),
        whyItMatters: t("insights.goalBehindWhy"),
        suggestedAction: t("insights.goalBehindAction"),
        ctaText: viewDetailsLabel,
        ctaPath: "/goals",
      };

    case "DEBT_PAYMENT_AHEAD":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: t("insights.debtAheadHeadline"),
        observation: t("insights.debtAheadObservation"),
        whyItMatters: t("insights.debtAheadWhy"),
        suggestedAction: t("insights.debtAheadAction"),
        ctaText: viewDetailsLabel,
        ctaPath: "/debts",
      };

    case "RECEIVABLE_LOCKING_CASH":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: t("insights.receivableLockingHeadline"),
        observation: t("insights.receivableLockingObservation"),
        whyItMatters: t("insights.receivableLockingWhy"),
        suggestedAction: t("insights.receivableLockingAction"),
        ctaText: viewDetailsLabel,
        ctaPath: "/debts?tab=receivables",
      };

    case "SPENDING_SPIKE":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: t("insights.spendingSpikeHeadline"),
        observation: t("insights.spendingSpikeObservation"),
        whyItMatters: t("insights.spendingSpikeWhy"),
        suggestedAction: t("insights.spendingSpikeAction"),
        ctaText: viewDetailsLabel,
        ctaPath: "/transactions",
      };

    default:
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: t("insights.title"),
        observation: "",
        whyItMatters: "",
        suggestedAction: "",
        ctaText: viewAnalysisLabel,
        ctaPath: "/analytics",
      };
  }
}

export function formatInsightPresentation(
  insight: FinancialInsight,
  t: Translator,
): FormattedInsight {
  const rec = formatRecommendation(insight, t);
  return {
    id: rec.id,
    type: rec.type,
    severity: rec.severity,
    headline: rec.title,
    explanation: rec.observation || rec.suggestedAction,
    ctaText: rec.ctaText,
    ctaPath: rec.ctaPath,
  };
}
