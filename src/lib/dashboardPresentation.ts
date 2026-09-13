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

export type MoneyFlowPresentationItem = {
  key: string;
  label: string;
  amount: number;
  kind: "inflow" | "spending" | "savings" | "goal" | "debt" | "receivable" | "investment" | "fee" | "adjustment";
};

export type MoneyFlowPresentation = {
  genuineIncome: number;
  totalUsage: number;
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
  const usageItems: MoneyFlowPresentationItem[] = [];
  const otherMovementItems: MoneyFlowPresentationItem[] = [];

  // Consumption spending + transfer fees
  const consumptionTotal = flow.ordinarySpending + flow.transferFees;
  if (consumptionTotal > 0) {
    usageItems.push({
      key: "consumption",
      label: t("dashboard.consumptionSpending"),
      amount: consumptionTotal,
      kind: "spending",
    });
  }

  // Savings allocation
  if (flow.savingsAllocation > 0) {
    usageItems.push({
      key: "savings",
      label: t("dashboard.savingsAllocated"),
      amount: flow.savingsAllocation,
      kind: "savings",
    });
  }

  // Goal contribution
  if (flow.goalContributions > 0) {
    usageItems.push({
      key: "goals",
      label: t("dashboard.goalContributions"),
      amount: flow.goalContributions,
      kind: "goal",
    });
  }

  // Debt principal payment
  if (flow.debtPrincipalPayments > 0) {
    usageItems.push({
      key: "debt_payment",
      label: t("dashboard.debtPayments"),
      amount: flow.debtPrincipalPayments,
      kind: "debt",
    });
  }

  // Receivable advance (covering for others)
  if (flow.receivableOutflow > 0) {
    usageItems.push({
      key: "receivable_outflow",
      label: t("dashboard.receivableOutflow"),
      amount: flow.receivableOutflow,
      kind: "receivable",
    });
  }

  // Investment contribution
  if (flow.investmentContribution > 0) {
    usageItems.push({
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

  const totalUsage = usageItems.reduce((sum, item) => sum + item.amount, 0);

  return {
    genuineIncome: flow.genuineIncome,
    totalUsage,
    usageItems,
    otherMovementItems,
    hasOtherMovements: otherMovementItems.length > 0,
    resultingLiquidityChange: flow.resultingLiquidityChange,
    internalTransfers: flow.internalWalletMovement,
    isFullyReconciled: Math.abs(flow.unreconciledAmount) < 1,
    unreconciledAmount: flow.unreconciledAmount,
  };
}

export type FormattedInsight = {
  id: string;
  type: FinancialInsight["type"];
  severity: FinancialInsight["severity"];
  headline: string;
  explanation: string;
  ctaText?: string;
  ctaPath?: string;
};

export function formatInsightPresentation(
  insight: FinancialInsight,
  t: Translator,
): FormattedInsight {
  switch (insight.type) {
    case "POSITIVE_CASH_FLOW":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        headline: t("insights.positiveCashFlowHeadline"),
        explanation: t("insights.positiveCashFlowExplanation"),
        ctaText: t("insights.positiveCashFlowCta"),
        ctaPath: "/analytics",
      };

    case "SURPLUS_MOVED_ELSEWHERE":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        headline: t("insights.surplusMovedHeadline"),
        explanation: t("insights.surplusMovedExplanation"),
        ctaText: t("insights.surplusMovedCta"),
        ctaPath: "/analytics",
      };

    case "PRIMARY_WALLET_LOW":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        headline: t("insights.primaryWalletLowHeadline"),
        explanation: t("insights.primaryWalletLowExplanation"),
        ctaText: t("insights.primaryWalletLowCta"),
        ctaPath: "/wallets",
      };

    case "LOW_SPENDABLE_CASH":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        headline: t("insights.lowSpendableCashHeadline"),
        explanation: t("insights.lowSpendableCashExplanation"),
        ctaText: t("insights.lowSpendableCashCta"),
        ctaPath: "/calendar",
      };

    case "HIGH_INTERNAL_TRANSFER_ACTIVITY":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        headline: t("insights.highTransfersHeadline"),
        explanation: t("insights.highTransfersExplanation"),
        ctaText: t("insights.highTransfersCta"),
        ctaPath: "/transactions",
      };

    case "HIGH_UNBUDGETED_SPENDING":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        headline: t("insights.unbudgetedSpendingHeadline"),
        explanation: t("insights.unbudgetedSpendingExplanation"),
        ctaText: t("insights.unbudgetedSpendingCta"),
        ctaPath: "/budgets",
      };

    case "BUDGET_CATEGORY_OVERSPEND":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        headline: t("insights.budgetOverspendHeadline"),
        explanation: t("insights.budgetOverspendExplanation"),
        ctaText: t("insights.budgetOverspendCta"),
        ctaPath: "/budgets",
      };

    case "SAVINGS_AHEAD_OF_TARGET":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        headline: t("insights.savingsAheadHeadline"),
        explanation: t("insights.savingsAheadExplanation"),
        ctaText: t("insights.savingsAheadCta"),
        ctaPath: "/goals",
      };

    case "SAVINGS_BEHIND_TARGET":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        headline: t("insights.savingsBehindHeadline"),
        explanation: t("insights.savingsBehindExplanation"),
        ctaText: t("insights.savingsBehindCta"),
        ctaPath: "/goals",
      };

    case "GOAL_AHEAD_OF_TARGET":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        headline: t("insights.goalAheadHeadline"),
        explanation: t("insights.goalAheadExplanation"),
        ctaText: t("insights.goalAheadCta"),
        ctaPath: "/goals",
      };

    case "GOAL_BEHIND_TARGET":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        headline: t("insights.goalBehindHeadline"),
        explanation: t("insights.goalBehindExplanation"),
        ctaText: t("insights.goalBehindCta"),
        ctaPath: "/goals",
      };

    case "DEBT_PAYMENT_AHEAD":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        headline: t("insights.debtAheadHeadline"),
        explanation: t("insights.debtAheadExplanation"),
        ctaText: t("insights.debtAheadCta"),
        ctaPath: "/debts",
      };

    case "RECEIVABLE_LOCKING_CASH":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        headline: t("insights.receivableLockingHeadline"),
        explanation: t("insights.receivableLockingExplanation"),
        ctaText: t("insights.receivableLockingCta"),
        ctaPath: "/debts?tab=receivables",
      };

    case "SPENDING_SPIKE":
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        headline: t("insights.spendingSpikeHeadline"),
        explanation: t("insights.spendingSpikeExplanation"),
        ctaText: t("insights.spendingSpikeCta"),
        ctaPath: "/transactions?type=expense",
      };

    default:
      return {
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        headline: t("insights.title"),
        explanation: "",
      };
  }
}
