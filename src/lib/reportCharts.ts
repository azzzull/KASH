import type { TransactionRecapData } from "../types/reports";
import { toNumber } from "./money";

export type CashFlowPoint = { label: string; shortLabel: string; income: number; expense: number; net: number };

export function emeraldRingColor(index: number, total: number) {
  const contrastIndex = index % 2 === 0 ? index / 2 : total - 1 - Math.floor(index / 2);
  const ratio = total <= 1 ? 0.35 : contrastIndex / (total - 1);
  return `hsl(160 ${82 - ratio * 18}% ${25 + ratio * 48}%)`;
}

function isEconomicMovement(relatedEntityType: string | null) {
  return ["debt_creation", "receivable_creation", "debt_payment", "receivable_payment", "goal_contribution", "goal_refund"].includes(relatedEntityType ?? "");
}

export function buildCashFlowTrend(data: TransactionRecapData): CashFlowPoint[] {
  const start = new Date(data.period.start); const end = new Date(data.period.end);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  const groupByMonth = days > 62;
  const groups = new Map<string, CashFlowPoint>();
  const format = new Intl.DateTimeFormat("en-GB", groupByMonth ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
  data.transactions.filter((transaction) => transaction.status === "completed").forEach((transaction) => {
    const parsedDate = new Date(transaction.transaction_date); const date = Number.isFinite(parsedDate.getTime()) ? parsedDate : start; const key = groupByMonth ? `${date.getFullYear()}-${date.getMonth()}` : date.toISOString().slice(0, 10);
    const point = groups.get(key) ?? { label: format.format(date), shortLabel: groupByMonth ? format.format(date) : String(date.getDate()), income: 0, expense: 0, net: 0 };
    const amount = toNumber(transaction.amount); const fee = transaction.type === "expense" || transaction.type === "transfer" ? toNumber(transaction.transfer_fee) : 0;
    if (transaction.type === "income" && !isEconomicMovement(transaction.related_entity_type)) point.income += Number.isFinite(amount) ? amount : 0;
    if (transaction.type === "expense" && !isEconomicMovement(transaction.related_entity_type)) point.expense += Number.isFinite(amount) ? amount : 0;
    point.expense += Number.isFinite(fee) ? fee : 0;
    point.net = point.income - point.expense;
    groups.set(key, point);
  });
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, point]) => point);
}
