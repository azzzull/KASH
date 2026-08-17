import { supabase } from "./supabase";

export type NotificationEntityType = "wallet" | "transaction" | "shared_saving" | "shared_contribution" | "goal" | "debt" | string;

export type AppNotification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  entity_type: NotificationEntityType | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
};

export type NotificationListResult = {
  isSupported: boolean;
  notifications: AppNotification[];
  unreadCount: number;
};

function isMissingNotificationsTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.message?.toLowerCase().includes("notifications");
}

async function getAuthenticatedUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("You need to be signed in to view notifications.");

  return user.id;
}

export async function getNotifications(): Promise<NotificationListResult> {
  const userId = await getAuthenticatedUserId();
  const { data, error } = await supabase
    .from("notifications")
    .select("id,user_id,type,title,message,entity_type,entity_id,is_read,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (isMissingNotificationsTable(error)) {
    return { isSupported: false, notifications: [], unreadCount: 0 };
  }

  if (error) throw error;

  const notifications = (data ?? []) as AppNotification[];

  return {
    isSupported: true,
    notifications,
    unreadCount: notifications.filter((notification) => !notification.is_read).length,
  };
}

export async function getUnreadNotificationCount() {
  const userId = await getAuthenticatedUserId();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (isMissingNotificationsTable(error)) return { isSupported: false, unreadCount: 0 };
  if (error) throw error;

  return { isSupported: true, unreadCount: count ?? 0 };
}

export async function markNotificationRead(notificationId: string) {
  const userId = await getAuthenticatedUserId();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const userId = await getAuthenticatedUserId();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (isMissingNotificationsTable(error)) return { isSupported: false };
  if (error) throw error;

  return { isSupported: true };
}

export async function deleteReadNotifications() {
  const userId = await getAuthenticatedUserId();
  const { error } = await supabase.from("notifications").delete().eq("user_id", userId).eq("is_read", true);

  if (isMissingNotificationsTable(error)) return { isSupported: false };
  if (error) throw error;

  return { isSupported: true };
}

export function getNotificationTargetPath(notification: AppNotification) {
  if (!notification.entity_type || !notification.entity_id) return null;

  if (notification.entity_type === "wallet") return `/wallets/${notification.entity_id}`;
  if (notification.entity_type === "transaction") return "/transactions";
  if (notification.entity_type === "shared_saving" || notification.entity_type === "shared_contribution") return "/shared";
  if (notification.entity_type === "goal") return "/goals";
  if (notification.entity_type === "debt") return "/debts";

  return null;
}
