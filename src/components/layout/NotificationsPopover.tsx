import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../context/NotificationContext";
import { useI18n } from "../../i18n";
import {
  formatRelativeNotificationTime,
  getNotificationTargetPath,
  getNotificationVisualMeta,
} from "../../lib/notificationMeta";
import type { Notification } from "../../types/domain";

type NotificationsPopoverProps = {
  className?: string;
  onClose: () => void;
};

function formatUnreadCount(count: number) {
  if (count > 99) return "99+";
  return String(count);
}

function NotificationSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex gap-3">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-slate-100" />
          <div className="min-w-0 flex-1">
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-2.5 h-3 w-full animate-pulse rounded-full bg-slate-100" />
            <div className="mt-2 h-2.5 w-1/4 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NotificationsPopover({
  className = "",
  onClose,
}: NotificationsPopoverProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const {
    clearRead,
    error,
    isLoading,
    markAllRead,
    markRead,
    notifications,
    refresh,
    unreadCount,
  } = useNotifications();

  const hasReadNotifications = notifications.some((notification) => notification.is_read);

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    try {
      await markAllRead();
    } catch {
      // Error handled in context
    }
  };

  const handleClearRead = async () => {
    if (!hasReadNotifications) return;
    try {
      await clearRead();
    } catch {
      // Error handled in context
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      try {
        await markRead(notification.id);
      } catch {
        // Continue navigation even if marking read fails
      }
    }

    const targetPath = getNotificationTargetPath(notification);
    if (targetPath) {
      onClose();
      navigate(targetPath);
    }
  };

  return (
    <div
      className={`absolute z-40 flex max-h-[620px] w-[440px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft ${className}`}
      role="dialog"
      aria-label={t("nav.notifications")}
    >
      <div className="grid grid-cols-[1fr_auto_auto] items-start gap-3 border-b border-slate-100 p-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">{t("nav.notifications")}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            {unreadCount > 0
              ? `${formatUnreadCount(unreadCount)} ${t("common.unpaid").toLowerCase()}`
              : t("notifications.emptyTitle")}
          </p>
        </div>
        <button
          type="button"
          aria-label={t("notifications.markAllRead")}
          disabled={unreadCount === 0}
          onClick={() => void handleMarkAllRead()}
          className="inline-flex touch-manipulation items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-extrabold text-kash-emerald transition [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-selected active:bg-kash-selected disabled:text-slate-600 disabled:active:bg-transparent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20"
        >
          <CheckCheck aria-hidden="true" size={15} />
          {t("notifications.markAllRead")}
        </button>
        <button
          type="button"
          aria-label={t("notifications.clearRead")}
          disabled={!hasReadNotifications}
          onClick={() => void handleClearRead()}
          className="inline-flex touch-manipulation items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-extrabold text-kash-expense transition [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-expense/10 active:bg-kash-expense/10 disabled:text-slate-600 disabled:active:bg-transparent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20"
        >
          <Trash2 aria-hidden="true" size={15} />
          {t("notifications.clearRead")}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-white">
        {isLoading ? <NotificationSkeleton /> : null}

        {!isLoading && error ? (
          <div className="p-4">
            <div className="rounded-lg border border-kash-expense/30 bg-white p-4 text-sm shadow-sm">
              <p className="font-extrabold text-slate-900">{t("common.error")}</p>
              <p className="mt-1 font-semibold text-slate-600">{error}</p>
              <button
                type="button"
                onClick={() => void refresh()}
                className="mt-3 touch-manipulation text-sm font-extrabold text-kash-emerald [@media(hover:hover)_and_(pointer:fine)]:hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20"
              >
                {t("common.retry")}
              </button>
            </div>
          </div>
        ) : null}

        {!isLoading && !error && notifications.length === 0 ? (
          <div className="p-4">
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm font-semibold text-slate-600">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-kash-selected text-kash-emerald">
                <Bell aria-hidden="true" size={18} strokeWidth={2.2} />
              </span>
              <div>
                <p className="font-extrabold text-slate-900">{t("notifications.emptyTitle")}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{t("notifications.emptySubtitle")}</p>
              </div>
            </div>
          </div>
        ) : null}

        {!isLoading && !error && notifications.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => {
              const meta = getNotificationVisualMeta(notification.type);
              const IconComponent = meta.icon;
              const isUnread = !notification.is_read;

              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void handleNotificationClick(notification)}
                  className={`grid w-full touch-manipulation grid-cols-[auto_1fr] items-start gap-3.5 p-4 text-left transition [@media(hover:hover)_and_(pointer:fine)]:hover:bg-slate-50 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-kash-emerald/20 ${
                    isUnread ? "bg-kash-selected/30" : "bg-white"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.badgeBgClass}`}
                  >
                    <IconComponent aria-hidden="true" size={18} strokeWidth={2.3} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`truncate text-sm text-slate-900 ${
                          isUnread ? "font-extrabold" : "font-semibold text-slate-800"
                        }`}
                      >
                        {notification.title}
                      </p>
                      {isUnread && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-kash-emerald" />
                      )}
                    </div>
                    <p className="mt-1 text-xs font-medium leading-5 text-slate-700">
                      {notification.message}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-600">
                      <span>{meta.categoryLabel}</span>
                      <span>{formatRelativeNotificationTime(notification.created_at)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
