import {
  Bell,
  BellOff,
  ChevronRight,
  Info,
  Loader2,
  Settings,
  Smartphone,
  Tags,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import {
  getCurrentPushSubscription,
  getPushPermissionState,
  isIosStandalone,
  isPushSupported,
  subscribeCurrentDevice,
  unsubscribeCurrentDevice,
  type PushPermissionState,
} from "../lib/pushNotifications";

export function SettingsPage() {
  const [permissionState, setPermissionState] = useState<PushPermissionState>("unsupported");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const checkPushStatus = async () => {
    const state = getPushPermissionState();
    setPermissionState(state);

    if (state === "granted") {
      const sub = await getCurrentPushSubscription();
      setIsSubscribed(Boolean(sub));
    } else {
      setIsSubscribed(false);
    }
  };

  useEffect(() => {
    void checkPushStatus();
  }, []);

  const handleSubscribe = async () => {
    setLoading(true);
    setMessage(null);
    const result = await subscribeCurrentDevice();
    setLoading(false);

    if (result.success) {
      setMessage({ type: "success", text: "Push notifications successfully enabled on this device!" });
      void checkPushStatus();
    } else {
      setMessage({ type: "error", text: result.error || "Failed to enable notifications." });
      setPermissionState(getPushPermissionState());
    }
  };

  const handleUnsubscribe = async () => {
    setLoading(true);
    setMessage(null);
    const result = await unsubscribeCurrentDevice();
    setLoading(false);

    if (result.success) {
      setMessage({ type: "success", text: "Push notifications disabled on this device." });
      void checkPushStatus();
    } else {
      setMessage({ type: "error", text: result.error || "Failed to disable notifications." });
    }
  };

  const isIos =
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  const isIosApp = isIosStandalone();

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 p-4 md:p-6">
      <PageHeader
        eyebrow="Account"
        icon={Settings}
        title="Settings"
        description="Manage preferences and finance setup."
      />

      <section className="grid gap-3">
        {/* Categories Link */}
        <Link
          className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-kash-emerald hover:bg-kash-selected/40"
          to="/settings/categories"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-kash-selected text-kash-emerald">
            <Tags aria-hidden="true" size={19} />
          </span>
          <span>
            <span className="block text-sm font-extrabold text-slate-900">Categories</span>
            <span className="mt-1 block text-xs font-semibold text-slate-700">
              Manage custom income and expense categories.
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="text-slate-600" size={18} />
        </Link>

        {/* Device Push Notifications Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-kash-selected text-kash-emeraldDark">
                <Bell size={20} />
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Device Push Notifications</h3>
                <p className="mt-0.5 text-xs font-semibold text-slate-600">
                  Receive due reminders for subscriptions, installments, debts, and bills even when the app is closed.
                </p>

                <div className="mt-3 flex items-center gap-2 text-xs font-bold">
                  <span className="text-slate-600">Status:</span>
                  {permissionState === "granted" && isSubscribed ? (
                    <span className="rounded-full bg-kash-selected px-2.5 py-0.5 text-kash-emeraldDark">
                      Active on this device
                    </span>
                  ) : permissionState === "denied" ? (
                    <span className="rounded-full bg-kash-expense/15 px-2.5 py-0.5 text-kash-expense">
                      Permission Blocked / Denied
                    </span>
                  ) : permissionState === "unsupported" ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">
                      Unsupported on this browser
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700">
                      Not Enabled
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div>
              {permissionState === "granted" && isSubscribed ? (
                <Button
                  variant="secondary"
                  onClick={() => void handleUnsubscribe()}
                  disabled={loading}
                  className="gap-1.5 min-h-9 px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:text-kash-expense"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <BellOff size={14} />}
                  Disable on This Device
                </Button>
              ) : permissionState !== "unsupported" ? (
                <Button
                  onClick={() => void handleSubscribe()}
                  disabled={loading || permissionState === "denied"}
                  className="gap-1.5 min-h-9 px-3 py-1.5 text-xs font-extrabold"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                  Enable Notifications
                </Button>
              ) : null}
            </div>
          </div>

          {/* Feedback message */}
          {message && (
            <div
              className={`mt-4 rounded-lg p-3 text-xs font-bold ${
                message.type === "success"
                  ? "bg-kash-selected text-kash-emeraldDark"
                  : "bg-kash-expense/10 text-kash-expense"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* iOS / Denied Guidance */}
          {isIos && !isIosApp && (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-slate-50 p-3 text-xs font-semibold text-slate-700">
              <Smartphone size={16} className="mt-0.5 shrink-0 text-slate-600" />
              <span>
                On iPhone/iPad, add KASH to your <strong>Home Screen</strong> (Share &rarr; Add to Home Screen) to enable Web Push notifications.
              </span>
            </div>
          )}

          {permissionState === "denied" && (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-kash-expense/5 p-3 text-xs font-semibold text-slate-700">
              <Info size={16} className="mt-0.5 shrink-0 text-kash-expense" />
              <span>
                Notification permissions are blocked by your browser. To re-enable, tap the lock/settings icon in your browser address bar and allow Notifications.
              </span>
            </div>
          )}
        </div>

        {/* Profile & Preferences */}
        <article className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 opacity-75 shadow-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <Settings aria-hidden="true" size={19} />
          </span>
          <span>
            <span className="block text-sm font-extrabold text-slate-900">Profile and Preferences</span>
            <span className="mt-1 block text-xs font-semibold text-slate-700">
              Timezone: Asia/Jakarta (WIB)
            </span>
          </span>
        </article>
      </section>
    </div>
  );
}

