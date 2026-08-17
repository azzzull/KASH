import { supabase } from "./supabase";

export type PushPermissionState = "granted" | "denied" | "default" | "unsupported";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isIosStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as unknown as { standalone?: boolean }).standalone);
  return isIos && isStandalone;
}

export function getPushPermissionState(): PushPermissionState {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission as PushPermissionState;
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Register current device's Web Push subscription with VAPID key and store in Supabase.
 */
export async function subscribeCurrentDevice(
  vapidPublicKey?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) {
    return { success: false, error: "Web Push is not supported on this browser/device." };
  }

  try {
    // 1. Request permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { success: false, error: "Notification permission was not granted." };
    }

    // 2. Obtain service worker registration
    const registration = await navigator.serviceWorker.ready;

    // 3. Resolve public VAPID key
    const publicKey =
      vapidPublicKey ||
      (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined);

    if (!publicKey) {
      return {
        success: false,
        error:
          "VAPID public key is not configured. Set VITE_VAPID_PUBLIC_KEY in environment variables.",
      };
    }

    const applicationServerKey = urlBase64ToUint8Array(publicKey) as unknown as BufferSource;

    // 4. Subscribe with PushManager
    const subscription = await registration.pushManager.subscribe({
      applicationServerKey,
      userVisibleOnly: true,
    });

    const subJson = subscription.toJSON();
    const endpoint = subscription.endpoint;
    const p256dh = subJson.keys?.p256dh;
    const auth = subJson.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return { success: false, error: "Failed to obtain push subscription keys." };
    }

    // 5. Upsert into Supabase push_subscriptions table
    const { error: dbError } = await supabase.rpc("upsert_push_subscription", {
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
      p_user_agent: navigator.userAgent,
      p_device_label: `${navigator.platform || "Device"} (${navigator.userAgent.includes("Mobile") ? "Mobile" : "Desktop"})`,
    });

    if (dbError) throw dbError;

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to subscribe to Web Push.",
    };
  }
}

/**
 * Unsubscribe current device from Web Push and deactivate in Supabase.
 */
export async function unsubscribeCurrentDevice(): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!isPushSupported()) return { success: true };

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      // Deactivate in Supabase
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase
          .from("push_subscriptions")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("endpoint", endpoint)
          .eq("user_id", user.id);
      }
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to unsubscribe.",
    };
  }
}
