import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useI18n } from "../../i18n";
import {
  getPushPermissionState,
  isIosStandalone,
  isPushSupported,
  subscribeCurrentDevice,
} from "../../lib/pushNotifications";
import { ConfirmationDialog } from "../ui/ConfirmationDialog";

const DISMISS_KEY_PREFIX = "kash_push_prompt_dismissed_";

export function PushNotificationOnboardingPrompt() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;

    // 1. Web Push compatibility checks
    if (!isPushSupported()) return;

    const isIos =
      typeof navigator !== "undefined" &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

    // On iOS, Web Push is only functional if running in standalone mode (Home Screen PWA)
    if (isIos && !isIosStandalone()) return;

    // 2. Permission check: Only prompt when permission is 'default' (not yet requested/granted/denied)
    const permission = getPushPermissionState();
    if (permission !== "default") return;

    // 3. User dismissal check: do not prompt if user already dismissed on this device
    const dismissKey = `${DISMISS_KEY_PREFIX}${user.id}`;
    if (localStorage.getItem(dismissKey) === "true") return;

    setIsOpen(true);
  }, [user]);

  const handleDismiss = () => {
    if (user) {
      localStorage.setItem(`${DISMISS_KEY_PREFIX}${user.id}`, "true");
    }
    setIsOpen(false);
  };

  const handleEnable = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      await subscribeCurrentDevice();
    } catch {
      // Ignored: subscribeCurrentDevice captures error internally
    } finally {
      localStorage.setItem(`${DISMISS_KEY_PREFIX}${user.id}`, "true");
      setIsLoading(false);
      setIsOpen(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ConfirmationDialog
      title={t("notifications.onboardingTitle") || "Aktifkan Notifikasi"}
      description={
        t("notifications.onboardingDesc") ||
        "Dapatkan pengingat tagihan, reimbursement, dan update penting dari KASH."
      }
      confirmLabel={t("notifications.onboardingEnable") || "Aktifkan Notifikasi"}
      cancelLabel={t("notifications.onboardingLater") || "Nanti Saja"}
      icon={Bell}
      tone="warning"
      isLoading={isLoading}
      onConfirm={handleEnable}
      onCancel={handleDismiss}
    />
  );
}
