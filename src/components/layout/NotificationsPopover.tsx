import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteReadNotifications,
  getNotificationTargetPath,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "../../lib/notifications";

type NotificationsPopoverProps = {
  className?: string;
  onClose: () => void;
  onUnreadChange: (count: number) => void;
};

function formatUnreadCount(count: number) {
  if (count > 99) return "99+";
  return String(count);
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function NotificationSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex gap-3">
          <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-200" />
          <div className="min-w-0 flex-1">
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-3 h-3 w-full animate-pulse rounded-full bg-slate-100" />
            <div className="mt-2 h-3 w-1/3 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NotificationsPopover({ className = "", onClose, onUnreadChange }: NotificationsPopoverProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;
  const hasReadNotifications = notifications.some((notification) => notification.is_read);

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getNotifications();
      setIsSupported(result.isSupported);
      setNotifications(result.notifications);
      onUnreadChange(result.unreadCount);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Couldn't load notifications.");
    } finally {
      setIsLoading(false);
    }
  }, [onUnreadChange]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || !isSupported) return;

    try {
      await markAllNotificationsRead();
      setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })));
      onUnreadChange(0);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Couldn't update notifications.");
    }
  };

  const handleClearRead = async () => {
    if (!hasReadNotifications || !isSupported) return;

    try {
      await deleteReadNotifications();
      setNotifications((current) => current.filter((notification) => !notification.is_read));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Couldn't clear read notifications.");
    }
  };

  const handleNotificationClick = async (notification: AppNotification) => {
    if (!notification.is_read && isSupported) {
      try {
        await markNotificationRead(notification.id);
        setNotifications((current) =>
          current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item)),
        );
        onUnreadChange(Math.max(0, unreadCount - 1));
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Couldn't update notification.");
        return;
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
      aria-label="Notifications"
    >
      <div className="grid grid-cols-[1fr_auto_auto] items-start gap-3 border-b border-slate-100 p-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">Notifications</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">{unreadCount > 0 ? `${formatUnreadCount(unreadCount)} unread` : "No unread notifications"}</p>
        </div>
        <button
          type="button"
          aria-label="Mark all notifications as read"
          disabled={unreadCount === 0 || !isSupported}
          onClick={() => void handleMarkAllRead()}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-extrabold text-kash-emerald transition hover:bg-kash-selected disabled:text-slate-600 disabled:hover:bg-transparent"
        >
          <CheckCheck aria-hidden="true" size={16} />
          Mark all
        </button>
        {isSupported ? (
          <button
            type="button"
            aria-label="Clear read notifications"
            disabled={!hasReadNotifications}
            onClick={() => void handleClearRead()}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-extrabold text-kash-expense transition hover:bg-kash-expense/10 disabled:text-slate-600 disabled:hover:bg-transparent"
          >
            <Trash2 aria-hidden="true" size={16} />
            Clear
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70">
        {isLoading ? <NotificationSkeleton /> : null}

        {!isLoading && error ? (
          <div className="p-4">
            <div className="rounded-lg border border-kash-expense/30 bg-white p-4 text-sm">
              <p className="font-extrabold text-slate-900">Couldn't load notifications.</p>
              <p className="mt-1 font-semibold text-slate-600">{error}</p>
              <button type="button" onClick={() => void loadNotifications()} className="mt-3 text-sm font-extrabold text-kash-emerald">
                Try again
              </button>
            </div>
          </div>
        ) : null}

        {!isLoading && !error && notifications.length === 0 ? (
          <div className="p-4">
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-600">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-kash-selected text-kash-emerald">
                <Bell aria-hidden="true" size={16} strokeWidth={2.2} />
              </span>
              <div>
                <p className="font-extrabold text-slate-900">No notifications yet.</p>
                <p className="mt-1 leading-6">You're all caught up.</p>
              </div>
            </div>
          </div>
        ) : null}

        {!isLoading && !error && notifications.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => void handleNotificationClick(notification)}
                className={`grid w-full grid-cols-[14px_1fr] gap-3 p-4 text-left transition hover:bg-white ${
                  notification.is_read ? "bg-white" : "bg-kash-selected/40"
                }`}
              >
                <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${notification.is_read ? "bg-transparent" : "bg-kash-emerald"}`} />
                <span className="min-w-0">
                  <span className={`block text-sm text-slate-900 ${notification.is_read ? "font-semibold" : "font-extrabold"}`}>{notification.title}</span>
                  <span className="mt-1 block text-sm font-medium leading-6 text-slate-700">{notification.message}</span>
                  <span className="mt-2 block text-xs font-bold text-slate-600">{formatNotificationDate(notification.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
