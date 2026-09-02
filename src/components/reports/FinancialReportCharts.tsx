import type { TransactionRecapData } from "../../types/reports";
import type { ReactNode } from "react";
import { buildCashFlowTrend, emeraldRingColor } from "../../lib/reportCharts";
import { formatCurrency } from "../../lib/money";

type Props = { data: TransactionRecapData; labels: { cashFlow: string; category: string; wallet: string; income: string; expense: string; net: string; noData: string } };
export function FinancialReportCharts({ data, labels }: Props) {
  return <div className="mt-5 grid gap-4 lg:grid-cols-2"><ChartCard title={labels.cashFlow} className="lg:col-span-2"><CashFlowChart points={buildCashFlowTrend(data)} labels={labels} /></ChartCard><ChartCard title={labels.category}><CategoryChart data={data} noData={labels.noData} /></ChartCard><ChartCard title={labels.wallet}><WalletChart data={data} noData={labels.noData} /></ChartCard></div>;
}

function ChartCard({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) { return <section className={`rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm ${className}`}><h3 className="text-sm font-extrabold text-slate-900">{title}</h3><div className="mt-4">{children}</div></section>; }

function CashFlowChart({ points, labels }: { points: ReturnType<typeof buildCashFlowTrend>; labels: Props["labels"] }) {
  if (!points.length) return <NoData text={labels.noData} />;
  const width = 680; const height = 190; const pad = { top: 16, right: 16, bottom: 30, left: 18 }; const min = Math.min(0, ...points.map((point) => point.net)); const max = Math.max(1, ...points.flatMap((point) => [point.income, point.expense, point.net]));
  const x = (index: number) => pad.left + index * ((width - pad.left - pad.right) / Math.max(1, points.length - 1)); const y = (value: number) => pad.top + (height - pad.top - pad.bottom) * ((max - value) / (max - min));
  const path = (key: "income" | "expense" | "net") => points.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point[key])}`).join(" ");
  return <><div className="mb-3 flex flex-wrap gap-3 text-xs font-bold text-slate-600"><Legend color="#059669" label={labels.income} /><Legend color="#ef4444" label={labels.expense} /><Legend color="#0f766e" label={labels.net} /></div><svg aria-label={labels.cashFlow} className="h-44 w-full overflow-visible" role="img" viewBox={`0 0 ${width} ${height}`}><line stroke="#e2e8f0" x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} /><path d={path("income")} fill="none" stroke="#059669" strokeLinecap="round" strokeWidth="3" /><path d={path("expense")} fill="none" stroke="#ef4444" strokeLinecap="round" strokeWidth="3" /><path d={path("net")} fill="none" stroke="#0f766e" strokeDasharray="5 4" strokeLinecap="round" strokeWidth="2" />{points.map((point, index) => <text key={`${point.label}-${index}`} fill="#64748b" fontSize="10" textAnchor="middle" x={x(index)} y={height - 10}>{(points.length > 8 && index % Math.ceil(points.length / 7) !== 0) ? "" : point.shortLabel}</text>)}</svg></>;
}

function CategoryChart({ data, noData }: { data: TransactionRecapData; noData: string }) {
  const items = data.categoryBreakdown.filter((item) => item.amount > 0); if (!items.length) return <NoData text={noData} />;
  const total = items.reduce((sum, item) => sum + item.amount, 0); const radius = 48; const circumference = 2 * Math.PI * radius; const gapDegrees = Math.min(3, 120 / items.length); const availableDegrees = 360 - gapDegrees * items.length;
  let offset = 0;
  const segments = items.map((item, index) => { const segmentDegrees = item.amount / total * availableDegrees; const dash = segmentDegrees / 360 * circumference; const segmentOffset = offset; offset += dash + gapDegrees / 360 * circumference; return { item, color: emeraldRingColor(index, items.length), dasharray: `${dash} ${circumference - dash}`, dashoffset: -segmentOffset }; });
  return <div className="flex flex-col items-center justify-center gap-6 py-2 md:flex-row md:items-center"><div className="relative flex h-48 w-48 shrink-0 items-center justify-center"><svg aria-label="Expense breakdown" className="h-full w-full -rotate-90" role="img" viewBox="0 0 120 120">{segments.map(({ item, color, dasharray, dashoffset }) => <circle key={item.categoryName} cx="60" cy="60" data-segment fill="none" r={radius} stroke={color} strokeDasharray={dasharray} strokeDashoffset={dashoffset} strokeLinecap="round" strokeWidth="20" />)}</svg><div className="absolute inset-0 flex items-center justify-center p-2 text-center"><div className="min-w-0 max-w-full"><p className="text-[11px] font-bold text-slate-500">Total Expense</p><p className="mt-0.5 max-w-28 truncate text-sm font-extrabold leading-tight text-slate-900">{formatCurrency(total)}</p></div></div></div><div className="w-full min-w-0 space-y-2.5 md:flex-1">{segments.map(({ item, color }) => <div key={item.categoryName} className="min-w-0 text-xs"><div className="flex items-center justify-between gap-2.5"><div className="flex min-w-0 items-center gap-2"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} /><span className="truncate font-semibold text-slate-700">{item.categoryName}</span></div><div className="shrink-0 text-right"><span className="font-bold text-slate-900">{formatCurrency(item.amount)}</span><span className="ml-1.5 font-semibold text-slate-500">{Math.round(item.amount / total * 100)}%</span></div></div></div>)}</div></div>;
}

function WalletChart({ data, noData }: { data: TransactionRecapData; noData: string }) {
  const items = [...data.walletBreakdown].sort((a, b) => b.cashOut - a.cashOut).slice(0, 5); if (!items.length) return <NoData text={noData} />;
  const max = Math.max(1, ...items.map((item) => Math.max(item.cashIn, item.cashOut)));
  return <div className="space-y-3">{items.map((item) => <div key={item.wallet.id}><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="truncate font-bold text-slate-700">{item.wallet.name}</span><span className="shrink-0 font-semibold text-slate-500">{formatCurrency(item.cashOut)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-kash-emerald" style={{ width: `${Math.max(4, item.cashOut / max * 100)}%` }} /></div></div>)}</div>;
}

function Legend({ color, label }: { color: string; label: string }) { return <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{label}</span>; }
function NoData({ text }: { text: string }) { return <div className="flex h-36 items-center justify-center rounded-xl bg-slate-50 px-4 text-center text-sm text-slate-500">{text}</div>; }
