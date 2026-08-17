import type { Notification } from "../types/domain";
import { supabase } from "./supabase";

export type { Notification as AppNotification } from "../types/domain";

export type NotificationListResult = {
  notifications: Notification[];
  unreadCount: number;
};

async function getAuthenticatedUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("You need to be signed in to view notifications.");

  return user.id;
}

/**
 * Fetch latest notifications for the authenticated user and authoritative total unread count.
 */
export async function getNotifications(options?: {
  limit?: number;
}): Promise<NotificationListResult> {
  const userId = await getAuthenticatedUserId();
  const limit = options?.limit ?? 30;

  const [listResult, countResult] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false),
  ]);

  if (listResult.error) throw listResult.error;
  if (countResult.error) throw countResult.error;

  const notifications = (listResult.data ?? []).map((row) => ({
    ...row,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  })) as Notification[];

  return {
    notifications,
    unreadCount: countResult.count ?? 0,
  };
}

/**
 * Authoritative count of ALL unread notifications for the user.
 */
export async function getUnreadNotificationCount(): Promise<{ unreadCount: number }> {
  const userId = await getAuthenticatedUserId();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) throw error;

  return { unreadCount: count ?? 0 };
}

/**
 * Mark single notification as read via secure RPC.
 */
export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });

  if (error) throw error;
}

/**
 * Mark all unread notifications for current user as read via secure RPC.
 */
export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc("mark_all_notifications_read");

  if (error) throw error;
}

/**
 * Delete all read notifications for current user via secure RPC.
 */
export async function clearReadNotifications(): Promise<{ deletedCount: number }> {
  const { data, error } = await supabase.rpc("clear_read_notifications");

  if (error) throw error;

  return { deletedCount: data ?? 0 };
}

/**
 * Subscribe to realtime INSERT events for the authenticated user only.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeToNotifications(
  userId: string,
  onNotificationInserted: (notification: Notification) => void,
): () => void {
  const channel = supabase
    .channel(`user-notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        filter: `user_id=eq.${userId}`,
        schema: "public",
        table: "notifications",
      },
      (payload) => {
        if (payload.new && (payload.new as Notification).user_id === userId) {
          const inserted = {
            ...(payload.new as Notification),
            metadata: ((payload.new as any).metadata as Record<string, unknown>) ?? {},
          };
          onNotificationInserted(inserted);
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
