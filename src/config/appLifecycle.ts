/**
 * A background interval at or above this value is treated as a fresh app
 * resume. Keep this in one place so lifecycle behaviour stays consistent.
 */
export const APP_STALE_AFTER_MS = 30 * 60 * 1000;

export const APP_LIFECYCLE_HIDDEN_AT_KEY_PREFIX = "kash:lifecycle:hidden-at:";
