// ============================================================
// KASH PWA Service Worker
// Cache Management + Web Push + Persistent IndexedDB Navigation
// ============================================================

const CACHE_NAME = "kash-shell-v5";
const PRECACHE_URLS = ["/", "/dashboard", "/manifest.webmanifest", "/icons/kash-icon.svg"];

const PWA_DB_NAME = "kash-pwa";
const PWA_DB_VERSION = 1;
const PWA_NAV_STORE = "navigation";
const PWA_NAV_KEY = "pending_notification_navigation";

// 1. IndexedDB Helper for Persistent Navigation across iOS Cold-Start/Resume
function openNavigationDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = indexedDB.open(PWA_DB_NAME, PWA_DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(PWA_NAV_STORE)) {
        db.createObjectStore(PWA_NAV_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePendingNavigation(targetPath, notificationId) {
  try {
    const db = await openNavigationDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PWA_NAV_STORE], "readwrite");
      const store = transaction.objectStore(PWA_NAV_STORE);
      const record = {
        target_path: targetPath,
        notification_id: notificationId || null,
        created_at: Date.now(),
      };
      const putReq = store.put(record, PWA_NAV_KEY);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });
  } catch (err) {
    console.warn("SW failed saving pending navigation to IndexedDB:", err);
  }
}

// 2. Lifecycle: Install & Precaching
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }),
  );
});

// 3. Lifecycle: Activate & Old Cache Cleanup
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

// 4. Lifecycle: Message Handling (PWA Update / Skip Waiting)
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// 5. Fetch Strategy Helpers
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

// 6. Fetch Event Handler
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
// 7. Web Push Event Handler
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

  let targetPath = data.target_path || data.url || "/dashboard";
  if (
    typeof targetPath !== "string" ||
    !targetPath.startsWith("/") ||
    targetPath.startsWith("//") ||
    targetPath.includes("://")
  ) {
    targetPath = "/dashboard";
  }

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
      notification_id: data.notification_id || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ============================================================
// 8. Notification Click Handler with IndexedDB Persistence Bridge
// ============================================================
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  let targetPath = event.notification.data?.target_path || "/dashboard";
  if (
    typeof targetPath !== "string" ||
    !targetPath.startsWith("/") ||
    targetPath.startsWith("//") ||
    targetPath.includes("://")
  ) {
    targetPath = "/dashboard";
  }

  const notificationId = event.notification.data?.notification_id || null;
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    (async () => {
      // 1. CRITICAL: Persist pending navigation to IndexedDB BEFORE opening/focusing app
      // This is the authoritative fallback when iOS Home Screen PWA resets to root on openWindow
      await savePendingNavigation(targetPath, notificationId);

      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // 2. Check for an existing same-origin KASH window
      for (const client of clientList) {
        try {
          const clientUrl = new URL(client.url);

          if (clientUrl.origin === self.location.origin) {
            // Focus the window first
            if ("focus" in client) {
              await client.focus();
            }

            // Fast-path: postMessage to trigger immediate React Router navigation
            client.postMessage({
              type: "KASH_NOTIFICATION_NAVIGATE",
              target_path: targetPath,
            });

            return client;
          }
        } catch (err) {
          console.warn("Failed inspecting client window:", err);
        }
      }

      // 3. Closed App Case: Open KASH window
      // iOS PWA will launch and React will immediately consume the pending IndexedDB target
      if (self.clients.openWindow) {
        return await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});