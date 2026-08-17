import { Bell } from "lucide-react";
import { PagePlaceholder } from "../components/ui/PagePlaceholder";

export function NotificationsPage() {
  return (
    <PagePlaceholder
      title="Notifications"
      description="Foundation placeholder for future in-app notifications. Notification data is deferred."
      icon={Bell}
      sections={["Unread", "Recent", "Context Links"]}
    />
  );
}
