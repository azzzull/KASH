export const appEvents = {
  goalSaved: "kash:goal-saved",
  transactionSaved: "kash:transaction-saved",
} as const;

export type AppEventName = (typeof appEvents)[keyof typeof appEvents];

export function emitAppEvent(eventName: AppEventName) {
  window.dispatchEvent(new CustomEvent(eventName));
}

export function emitGoalSaved() {
  emitAppEvent(appEvents.goalSaved);
}

export function emitTransactionSaved() {
  emitAppEvent(appEvents.transactionSaved);
}
