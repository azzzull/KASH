import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { emitNotificationsUpdated } from "../lib/appEvents";
import {
  clearReadNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from "../lib/notifications";
import type { Notification } from "../types/domain";
import { useAuth } from "./AuthContext";

type NotificationContextValue = {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  clearRead: () => Promise<void>;
  refresh: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getNotifications({ limit: 30 });
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Couldn't load notifications.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Initial load on user auth state change
  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Single Realtime subscription lifecycle per authenticated user
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToNotifications(user.id, (newNotification) => {
      setNotifications((prev) => {
        // Prevent duplicate insertion
        if (prev.some((item) => item.id === newNotification.id)) return prev;
        return [newNotification, ...prev];
      });
      setUnreadCount((prev) => prev + 1);
      emitNotificationsUpdated();
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  const handleMarkRead = useCallback(async (notificationId: string) => {
    try {
      await markNotificationRead(notificationId);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notificationId
            ? { ...item, is_read: true, read_at: new Date().toISOString() }
            : item,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      emitNotificationsUpdated();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Couldn't update notification.",
      );
      throw caughtError;
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((item) => ({ ...item, is_read: true, read_at: item.read_at ?? now })),
      );
      setUnreadCount(0);
      emitNotificationsUpdated();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Couldn't update all notifications.",
      );
      throw caughtError;
    }
  }, []);

  const handleClearRead = useCallback(async () => {
    try {
      await clearReadNotifications();
      setNotifications((prev) => prev.filter((item) => !item.is_read));
      emitNotificationsUpdated();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Couldn't clear read notifications.",
      );
      throw caughtError;
    }
  }, []);

  const value = useMemo(
    () => ({
      clearRead: handleClearRead,
      error,
      isLoading,
      markAllRead: handleMarkAllRead,
      markRead: handleMarkRead,
      notifications,
      refresh: loadData,
      unreadCount,
    }),
    [
      handleClearRead,
      error,
      isLoading,
      handleMarkAllRead,
      handleMarkRead,
      notifications,
      loadData,
      unreadCount,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider.");
  }
  return context;
}
