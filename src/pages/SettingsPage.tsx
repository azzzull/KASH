import {
  Bell,
  BellOff,
  Check,
  ChevronRight,
  Info,
  Loader2,
  Lock,
  Mail,
  Save,
  Settings,
  Smartphone,
  Tags,
  User as UserIcon,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { FormField } from "../components/ui/FormField";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { updateProfileFullName } from "../lib/auth";
import {
  getCurrentPushSubscription,
  getPushPermissionState,
  isIosStandalone,
  subscribeCurrentDevice,
  unsubscribeCurrentDevice,
  type PushPermissionState,
} from "../lib/pushNotifications";
import { supabase } from "../lib/supabase";

export function SettingsPage() {
  const { profile, refreshProfile, user } = useAuth();

  const [displayName, setDisplayName] = useState(profile?.full_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [permissionState, setPermissionState] = useState<PushPermissionState>("unsupported");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (profile?.full_name !== undefined) {
      setDisplayName(profile.full_name ?? "");
    }
  }, [profile?.full_name]);

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

  const handleSaveDisplayName = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setNameMessage({ type: "error", text: "Display name cannot be empty." });
      return;
    }

    setSavingName(true);
    setNameMessage(null);

    try {
      const { error: profileError } = await updateProfileFullName(user.id, trimmedName);
      if (profileError) {
        setNameMessage({ type: "error", text: profileError.message || "Failed to update profile." });
        setSavingName(false);
        return;
      }

      // Also update auth user metadata if possible
      void supabase.auth.updateUser({ data: { full_name: trimmedName } }).catch(() => {});

      await refreshProfile();
      setNameMessage({ type: "success", text: "Display name updated successfully!" });
    } catch {
      setNameMessage({ type: "error", text: "An unexpected error occurred while saving." });
    } finally {
      setSavingName(false);
    }
  };

  const handleSubscribe = async () => {
    setPushLoading(true);
    setPushMessage(null);
    const result = await subscribeCurrentDevice();
    setPushLoading(false);

    if (result.success) {
      setPushMessage({ type: "success", text: "Push notifications successfully enabled on this device!" });
      void checkPushStatus();
    } else {
      setPushMessage({ type: "error", text: result.error || "Failed to enable notifications." });
      setPermissionState(getPushPermissionState());
    }
  };

  const handleUnsubscribe = async () => {
    setPushLoading(true);
    setPushMessage(null);
    const result = await unsubscribeCurrentDevice();
    setPushLoading(false);

    if (result.success) {
      setPushMessage({ type: "success", text: "Push notifications disabled on this device." });
      void checkPushStatus();
    } else {
      setPushMessage({ type: "error", text: result.error || "Failed to disable notifications." });
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
        description="Manage your profile, preferences, and finance setup."
      />

      <section className="grid gap-4">
        {/* Profile & Account Information Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3.5 border-b border-slate-100 pb-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-kash-selected text-kash-emeraldDark font-black text-base shadow-sm">
              {profile?.full_name?.charAt(0)?.toUpperCase() ?? user?.email?.charAt(0)?.toUpperCase() ?? "U"}
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Profile & Account</h2>
              <p className="text-xs font-semibold text-slate-600">
                Update your display name and view account credentials
              </p>
            </div>
          </div>

          {/* Edit Display Name Form */}
          <form onSubmit={handleSaveDisplayName} className="mt-4 space-y-4">
            {nameMessage && (
              <div
                className={`rounded-lg p-3 text-xs font-bold ${
                  nameMessage.type === "success"
                    ? "border border-kash-emerald/30 bg-kash-selected text-kash-emeraldDark"
                    : "border border-kash-expense/30 bg-kash-expense/10 text-kash-expense"
                }`}
              >
                {nameMessage.text}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                id="settings-display-name"
                label="Display Name (Full Name)"
                required
                placeholder="e.g. John Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />

              <label className="block w-full max-w-full min-w-0">
                <span className="block text-sm font-bold text-slate-900">Email Address</span>
                <div className="relative mt-2">
                  <input
                    type="text"
                    disabled
                    value={user?.email ?? profile?.email ?? ""}
                    className="block h-12 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 pr-9 text-base font-semibold text-slate-600 cursor-not-allowed md:text-sm"
                  />
                  <Lock size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-600" />
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end pt-1">
              <Button type="submit" disabled={savingName || displayName.trim() === (profile?.full_name ?? "")}>
                {savingName ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {savingName ? "Saving..." : "Save Display Name"}
              </Button>
            </div>
          </form>

          {/* Readonly Preferences info */}
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 text-xs">
            <div className="rounded-lg bg-slate-50 p-3">
              <span className="font-bold text-slate-600">Default Currency</span>
              <p className="mt-0.5 font-extrabold text-slate-900">
                {profile?.default_currency ?? "IDR"} (Indonesian Rupiah)
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <span className="font-bold text-slate-600">Timezone</span>
              <p className="mt-0.5 font-extrabold text-slate-900">
                Asia/Jakarta (WIB)
              </p>
            </div>
          </div>
        </div>

        {/* Categories & Envelopes Link */}
        <Link
          className="grid grid-cols-[auto_1fr_auto] items-center gap-3.5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-kash-emerald hover:bg-kash-selected/40"
          to="/settings/categories"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-kash-selected text-kash-emerald">
            <Tags aria-hidden="true" size={19} />
          </span>
          <span>
            <span className="block text-sm font-extrabold text-slate-900">Kategori & Amplop</span>
            <span className="mt-0.5 block text-xs font-semibold text-slate-700">
              Kelola kategori pemasukan/pengeluaran dan amplop pengeluaran anggaran.
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="text-slate-600" size={18} />
        </Link>

        {/* Device Push Notifications Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
            <div className="shrink-0">
              {permissionState === "granted" && isSubscribed ? (
                <Button
                  variant="secondary"
                  onClick={() => void handleUnsubscribe()}
                  disabled={pushLoading}
                  className="gap-1.5 min-h-9 px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:text-kash-expense"
                >
                  {pushLoading ? <Loader2 size={14} className="animate-spin" /> : <BellOff size={14} />}
                  Disable on This Device
                </Button>
              ) : permissionState !== "unsupported" ? (
                <Button
                  onClick={() => void handleSubscribe()}
                  disabled={pushLoading || permissionState === "denied"}
                  className="gap-1.5 min-h-9 px-3 py-1.5 text-xs font-extrabold"
                >
                  {pushLoading ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                  Enable Notifications
                </Button>
              ) : null}
            </div>
          </div>

          {/* Feedback message */}
          {pushMessage && (
            <div
              className={`mt-4 rounded-lg p-3 text-xs font-bold ${
                pushMessage.type === "success"
                  ? "bg-kash-selected text-kash-emeraldDark"
                  : "bg-kash-expense/10 text-kash-expense"
              }`}
            >
              {pushMessage.text}
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
      </section>
    </div>
  );
}

