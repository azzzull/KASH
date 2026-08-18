export const appEvents = {
  budgetSaved: "kash:budget-saved",
  debtSaved: "kash:debt-saved",
  goalSaved: "kash:goal-saved",
  notificationsUpdated: "kash:notifications-updated",
  transactionSaved: "kash:transaction-saved",
} as const;

export type AppEventName = (typeof appEvents)[keyof typeof appEvents];

export function emitAppEvent(eventName: AppEventName) {
  window.dispatchEvent(new CustomEvent(eventName));
}

export function emitBudgetSaved() {
  emitAppEvent(appEvents.budgetSaved);
}

export function emitDebtSaved() {
  emitAppEvent(appEvents.debtSaved);
}

export function emitGoalSaved() {
  emitAppEvent(appEvents.goalSaved);
}

export function emitNotificationsUpdated() {
  emitAppEvent(appEvents.notificationsUpdated);
}

export function emitTransactionSaved() {
  emitAppEvent(appEvents.transactionSaved);
}
