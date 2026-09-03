import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  HandCoins,
  History,
  Repeat,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { Notification, NotificationType } from "../types/domain";
import type { TranslationKey } from "../i18n";

type NotificationTranslator = (key: TranslationKey, params?: Record<string, string | number>) => string;

export type NotificationVisualMeta = {
  icon: LucideIcon;
  toneClass: string;
  badgeBgClass: string;
  categoryLabel: string;
};

export function getNotificationVisualMeta(type: NotificationType | string): NotificationVisualMeta {
  switch (type) {
    case "debt_due_soon":
    case "debt_due_today":
      return {
        icon: ArrowUpRight,
        toneClass: "text-[#F28C45]",
        badgeBgClass: "bg-[#F28C45]/15 text-[#F28C45]",
        categoryLabel: "Debt Reminder",
      };
    case "debt_overdue":
      return {
        icon: AlertCircle,
        toneClass: "text-kash-expense",
        badgeBgClass: "bg-kash-expense/15 text-kash-expense",
        categoryLabel: "Debt Overdue",
      };

    case "receivable_due_soon":
    case "receivable_due_today":
      return {
        icon: ArrowDownLeft,
        toneClass: "text-kash-receivable",
        badgeBgClass: "bg-kash-receivable/15 text-kash-receivable",
        categoryLabel: "Receivable",
      };
    case "receivable_overdue":
      return {
        icon: Clock,
        toneClass: "text-[#F28C45]",
        badgeBgClass: "bg-[#F28C45]/15 text-[#F28C45]",
        categoryLabel: "Receivable Overdue",
      };

    case "goal_completed":
      return {
        icon: Trophy,
        toneClass: "text-kash-emerald",
        badgeBgClass: "bg-kash-emerald100 text-kash-emeraldDark",
        categoryLabel: "Goal Completed",
      };
    case "goal_milestone":
      return {
        icon: Trophy,
        toneClass: "text-[#F5B82E]",
        badgeBgClass: "bg-[#F5B82E]/15 text-[#F5B82E]",
        categoryLabel: "Goal Milestone",
      };

    case "subscription_due_soon":
    case "subscription_due_today":
      return {
        icon: Repeat,
        toneClass: "text-kash-emerald",
        badgeBgClass: "bg-kash-emerald100 text-kash-emeraldDark",
        categoryLabel: "Subscription",
      };
    case "subscription_overdue":
      return {
        icon: AlertCircle,
        toneClass: "text-kash-expense",
        badgeBgClass: "bg-kash-expense/15 text-kash-expense",
        categoryLabel: "Subscription Overdue",
      };

    case "installment_due_soon":
    case "installment_due_today":
      return {
        icon: Calendar,
        toneClass: "text-[#F28C45]",
        badgeBgClass: "bg-[#F28C45]/15 text-[#F28C45]",
        categoryLabel: "Installment",
      };
    case "installment_overdue":
      return {
        icon: AlertCircle,
        toneClass: "text-kash-expense",
        badgeBgClass: "bg-kash-expense/15 text-kash-expense",
        categoryLabel: "Installment Overdue",
      };

    case "shared_invitation":
      return {
        icon: Users,
        toneClass: "text-kash-transfer",
        badgeBgClass: "bg-kash-transfer/15 text-kash-transfer",
        categoryLabel: "Shared Savings",
      };
    case "managed_space_invitation":
      return {
        icon: ShieldCheck,
        toneClass: "text-kash-emerald",
        badgeBgClass: "bg-kash-emerald/10 text-kash-emeraldDark",
        categoryLabel: "Managed Space",
      };
    case "managed_reimbursement_created":
    case "managed_reimbursement_partially_paid":
    case "managed_reimbursement_paid":
      return {
        icon: HandCoins,
        toneClass: "text-kash-emerald",
        badgeBgClass: "bg-kash-emerald100 text-kash-emeraldDark",
        categoryLabel: "Managed Space",
      };
    case "shared_contribution_pending":
      return {
        icon: History,
        toneClass: "text-[#F5B82E]",
        badgeBgClass: "bg-[#F5B82E]/15 text-[#F5B82E]",
        categoryLabel: "Contribution Pending",
      };
    case "shared_contribution_verified":
      return {
        icon: CheckCircle2,
        toneClass: "text-kash-emerald",
        badgeBgClass: "bg-kash-emerald100 text-kash-emeraldDark",
        categoryLabel: "Contribution Verified",
      };
    case "shared_contribution_rejected":
      return {
        icon: XCircle,
        toneClass: "text-kash-expense",
        badgeBgClass: "bg-kash-expense/15 text-kash-expense",
        categoryLabel: "Contribution Rejected",
      };

    case "budget_near_limit":
      return {
        icon: AlertCircle,
        toneClass: "text-amber-600",
        badgeBgClass: "bg-amber-100 text-amber-800",
        categoryLabel: "Budget Near Limit",
      };
    case "budget_exceeded":
      return {
        icon: AlertCircle,
        toneClass: "text-kash-expense",
        badgeBgClass: "bg-kash-expense/15 text-kash-expense",
        categoryLabel: "Budget Exceeded",
      };

    default:
      return {
        icon: Bell,
        toneClass: "text-kash-emerald",
        badgeBgClass: "bg-kash-selected text-kash-emeraldDark",
        categoryLabel: "Notification",
      };
  }
}

function notificationMetadataString(notification: Notification, key: string, fallback: string) {
  const value = notification.metadata?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function notificationMetadataNumber(notification: Notification, key: string) {
  const value = notification.metadata?.[key];
  return typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
}

export function getNotificationContent(
  notification: Notification,
  t: NotificationTranslator,
  formatCurrency: (amount: number | string, currency?: string) => string,
) {
  const space = notificationMetadataString(notification, "space_name", "Managed Space");

  switch (notification.type) {
    case "managed_reimbursement_created": {
      const amount = notificationMetadataNumber(notification, "amount");
      return {
        title: t("notifications.managedReimbursementCreatedTitle"),
        message: t("notifications.managedReimbursementCreatedMessage", {
          requester: notificationMetadataString(notification, "requester_name", "Pengguna"),
          amount: Number.isFinite(amount) ? formatCurrency(amount, "IDR") : "-",
          space,
        }),
      };
    }
    case "managed_reimbursement_partially_paid": {
      const amount = notificationMetadataNumber(notification, "amount");
      const remaining = notificationMetadataNumber(notification, "remaining_amount");
      return {
        title: t("notifications.managedReimbursementPartiallyPaidTitle"),
        message: t("notifications.managedReimbursementPartiallyPaidMessage", {
          actor: notificationMetadataString(notification, "settled_by_name", "Pengguna"),
          amount: Number.isFinite(amount) ? formatCurrency(amount, "IDR") : "-",
          remaining: Number.isFinite(remaining) ? formatCurrency(remaining, "IDR") : "-",
          space,
        }),
      };
    }
    case "managed_reimbursement_paid": {
      const amount = notificationMetadataNumber(notification, "amount");
      return {
        title: t("notifications.managedReimbursementPaidTitle"),
        message: t("notifications.managedReimbursementPaidMessage", {
          actor: notificationMetadataString(notification, "settled_by_name", "Pengguna"),
          amount: Number.isFinite(amount) ? formatCurrency(amount, "IDR") : "-",
          space,
        }),
      };
    }
    default:
      return { title: notification.title, message: notification.message };
  }
}

export function getNotificationTargetPath(notification: Notification): string | null {
  if (!notification.entity_type || !notification.entity_id) return null;

  switch (notification.entity_type) {
    case "budget":
      return `/budgets/${notification.entity_id}`;
    case "recurring_obligation":
      return `/subscriptions/${notification.entity_id}`;
    case "counterparty":
      return `/debts/${notification.entity_id}`;
    case "debt":
    case "receivable":
      // If metadata contains counterparty_id, navigate directly to counterparty detail
      if (typeof notification.metadata?.counterparty_id === "string" && notification.metadata.counterparty_id) {
        return `/debts/${notification.metadata.counterparty_id}`;
      }
      return "/debts";
    case "goal":
      return `/goals/${notification.entity_id}`;
    case "wallet":
      return `/wallets/${notification.entity_id}`;
    case "transaction":
      return "/transactions";
    case "shared_savings":
    case "shared_saving":
      return `/shared-savings/${notification.entity_id}`;
    case "shared_savings_invite":
    case "shared_contribution":
      return "/shared-savings";
    case "managed_space_invitation":
      return `/managed-invitations/${notification.entity_id}`;
    default:
      if (typeof notification.metadata?.target_path === "string" && notification.metadata.target_path) {
        return notification.metadata.target_path;
      }
      return null;
  }
}

export function formatRelativeNotificationTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));

  if (diffSeconds < 60) {
    return "Just now";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
