// ============================================================
// PWA Persistent Navigation Bridge (IndexedDB)
// Handles reliable deep-linking on iOS Home Screen PWAs
// ============================================================

export const PWA_DB_NAME = "kash-pwa";
export const PWA_DB_VERSION = 1;
export const PWA_NAV_STORE = "navigation";
export const PWA_NAV_KEY = "pending_notification_navigation";
export const PWA_NAV_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface PendingNavigationRecord {
  target_path: string;
  notification_id?: string | null;
  created_at: number;
}

/**
 * Validates that a path is a safe internal relative path (e.g. "/subscriptions", "/subscriptions/:id").
 * Strictly rejects external URLs, protocol-relative paths ("//"), or arbitrary schemes.
 */
export function isValidInternalPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed.includes("://")) return false;
  return true;
}

function openNavigationDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not supported in this environment."));
      return;
    }

    const request = indexedDB.open(PWA_DB_NAME, PWA_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PWA_NAV_STORE)) {
        db.createObjectStore(PWA_NAV_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persist pending notification navigation target into IndexedDB.
 */
export async function savePendingNavigation(
  targetPath: string,
  notificationId?: string | null,
): Promise<void> {
  try {
    const validPath = isValidInternalPath(targetPath) ? targetPath : "/dashboard";
    const db = await openNavigationDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PWA_NAV_STORE], "readwrite");
      const store = transaction.objectStore(PWA_NAV_STORE);

      const record: PendingNavigationRecord = {
        target_path: validPath,
        notification_id: notificationId ?? null,
        created_at: Date.now(),
      };

      const putReq = store.put(record, PWA_NAV_KEY);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });
  } catch (err) {
    console.warn("Failed to persist pending navigation:", err);
  }
}

/**
 * Retrieve and validate pending navigation record. Returns null if missing or expired (> 5 min).
 */
export async function getPendingNavigation(): Promise<PendingNavigationRecord | null> {
  try {
    const db = await openNavigationDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PWA_NAV_STORE], "readonly");
      const store = transaction.objectStore(PWA_NAV_STORE);
      const getReq = store.get(PWA_NAV_KEY);

      getReq.onsuccess = () => {
        const record = getReq.result as PendingNavigationRecord | undefined;
        if (!record || typeof record.created_at !== "number") {
          resolve(null);
          return;
        }

        // Stale target protection: Discard if older than TTL
        if (Date.now() - record.created_at > PWA_NAV_TTL_MS) {
          resolve(null);
          return;
        }

        if (!isValidInternalPath(record.target_path)) {
          resolve(null);
          return;
        }

        resolve(record);
      };

      getReq.onerror = () => reject(getReq.error);
    });
  } catch {
    return null;
  }
}

/**
 * Clear pending notification navigation from IndexedDB after consumption.
 */
export async function clearPendingNavigation(): Promise<void> {
  try {
    const db = await openNavigationDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PWA_NAV_STORE], "readwrite");
      const store = transaction.objectStore(PWA_NAV_STORE);
      const delReq = store.delete(PWA_NAV_KEY);

      delReq.onsuccess = () => resolve();
      delReq.onerror = () => reject(delReq.error);
    });
  } catch (err) {
    console.warn("Failed to clear pending navigation:", err);
  }
}
