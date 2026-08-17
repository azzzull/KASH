const CACHE_NAME = "kash-shell-v2";
const PRECACHE_URLS = ["/", "/dashboard", "/manifest.webmanifest", "/icons/kash-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function shouldIgnoreRequest(request) {
  if (request.method !== "GET") return true;

  const requestUrl = new URL(request.url);
  if (!isSameOrigin(requestUrl)) return true;

  return (
    requestUrl.pathname.startsWith("/auth/") ||
    requestUrl.pathname.startsWith("/rest/") ||
    requestUrl.pathname.startsWith("/storage/") ||
    requestUrl.pathname.startsWith("/functions/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (shouldIgnoreRequest(request)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => caches.match(request).then((cachedResponse) => cachedResponse || caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") return response;

        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return response;
      });
    }),
  );
});

// ============================================================
// Web Push Events
// ============================================================

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: "KASH Reminder", body: event.data.text() };
    }
  }

  const title = data.title || "KASH Reminder";
  const options = {
    body: data.body || data.message || "You have an upcoming financial obligation.",
    icon: "/icons/kash-icon.svg",
    badge: "/icons/kash-icon.svg",
    tag: data.tag || (data.notification_id ? `kash-notif-${data.notification_id}` : "kash-push"),
    data: {
      url: data.target_path || data.url || "/dashboard",
      notification_id: data.notification_id || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If an existing window is open, focus and navigate it
      for (const client of clientList) {
        if ("focus" in client) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            if ("navigate" in client) {
              return client.navigate(targetUrl);
            }
            return client;
          }
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
