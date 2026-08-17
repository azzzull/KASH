const CACHE_NAME = "kash-shell-v3";
const PRECACHE_URLS = ["/", "/dashboard", "/manifest.webmanifest", "/icons/kash-icon.svg"];

// ============================================================
// Web Push Events
// ============================================================

self.addEventListener("push", (event) => {
  let data = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {
        title: "KASH Reminder",
        body: event.data.text(),
      };
    }
  }

  const title = data.title || "KASH Reminder";

  const targetPath =
    data.target_path ||
    data.url ||
    "/dashboard";

  const options = {
    body:
      data.body ||
      data.message ||
      "You have an upcoming financial obligation.",

    icon: "/icons/kash-icon.svg",
    badge: "/icons/kash-icon.svg",

    tag:
      data.tag ||
      (data.notification_id
        ? `kash-notif-${data.notification_id}`
        : "kash-push"),

    data: {
      target_path: targetPath,
      notification_id:
        data.notification_id || null,
    },
  };

  event.waitUntil(
    self.registration.showNotification(
      title,
      options,
    ),
  );
});

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    const targetPath =
      event.notification.data?.target_path ||
      "/dashboard";

    /*
     * Always build a full same-origin URL.
     *
     * This is more reliable than passing a relative path
     * directly to WindowClient.navigate(), especially in
     * installed PWAs / iOS WebKit.
     */
    const targetUrl = new URL(
      targetPath,
      self.location.origin,
    ).href;

    event.waitUntil(
      (async () => {
        const clientList =
          await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });

        /*
         * Prefer an existing KASH window.
         */
        for (const client of clientList) {
          try {
            const clientUrl = new URL(
              client.url,
            );

            if (
              clientUrl.origin ===
              self.location.origin
            ) {
              /*
               * Navigate FIRST, then focus.
               *
               * This tends to behave more reliably in PWAs
               * than focusing before navigation.
               */
              if ("navigate" in client) {
                try {
                  const navigatedClient =
                    await client.navigate(
                      targetUrl,
                    );

                  if (
                    navigatedClient &&
                    "focus" in navigatedClient
                  ) {
                    return await navigatedClient.focus();
                  }
                } catch (error) {
                  console.warn(
                    "Failed to navigate existing KASH client:",
                    error,
                  );
                }
              }

              if ("focus" in client) {
                await client.focus();

                /*
                 * Fallback message for cases where navigate()
                 * is unavailable or unreliable.
                 *
                 * The app may optionally listen for this
                 * message and route client-side.
                 */
                client.postMessage({
                  type: "KASH_NOTIFICATION_NAVIGATE",
                  target_path:
                    targetPath,
                });

                return client;
              }
            }
          } catch (error) {
            console.warn(
              "Failed to inspect client:",
              error,
            );
          }
        }

        /*
         * No KASH window is open.
         * Open the target URL directly.
         */
        if (self.clients.openWindow) {
          return await self.clients.openWindow(
            targetUrl,
          );
        }

        return undefined;
      })(),
    );
  },
);