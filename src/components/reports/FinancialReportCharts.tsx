import type { TransactionRecapData } from "../../types/reports";
import type { ReactNode } from "react";
import { buildCashFlowTrend } from "../../lib/reportCharts";
import { formatCurrency } from "../../lib/money";

type Props = { data: TransactionRecapData; labels: { cashFlow: string; category: string; wallet: string; income: string; expense: string; net: string; noData: string } };
const COLORS = ["#059669", "#10b981", "#34d399", "#6ee7b7", "#a7f3d0"];

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
  const items = data.categoryBreakdown.slice(0, 5); if (!items.length) return <NoData text={noData} />;
  let offset = 0; const radius = 42; const circumference = 2 * Math.PI * radius;
  return <div className="flex min-h-36 flex-col gap-4 sm:flex-row sm:items-center"><svg className="mx-auto h-28 w-28 shrink-0" viewBox="0 0 112 112"><circle cx="56" cy="56" fill="none" r={radius} stroke="#ecfdf5" strokeWidth="16" />{items.map((item, index) => { const dash = circumference * item.percentage / 100; const circle = <circle key={item.categoryName} cx="56" cy="56" fill="none" r={radius} stroke={COLORS[index]} strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset} strokeLinecap="butt" strokeWidth="16" transform="rotate(-90 56 56)" />; offset += dash; return circle; })}<text fill="#0f172a" fontSize="13" fontWeight="700" textAnchor="middle" x="56" y="54">{items.length}</text><text fill="#64748b" fontSize="8" textAnchor="middle" x="56" y="66">categories</text></svg><div className="min-w-0 flex-1 space-y-2">{items.map((item, index) => <div key={item.categoryName} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 font-semibold text-slate-700"><i className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index] }} /><span className="truncate">{item.categoryName}</span></span><span className="shrink-0 font-bold text-slate-900">{item.percentage.toFixed(0)}%</span></div>)}</div></div>;
}

function WalletChart({ data, noData }: { data: TransactionRecapData; noData: string }) {
  const items = [...data.walletBreakdown].sort((a, b) => b.cashOut - a.cashOut).slice(0, 5); if (!items.length) return <NoData text={noData} />;
  const max = Math.max(1, ...items.map((item) => Math.max(item.cashIn, item.cashOut)));
  return <div className="space-y-3">{items.map((item) => <div key={item.wallet.id}><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="truncate font-bold text-slate-700">{item.wallet.name}</span><span className="shrink-0 font-semibold text-slate-500">{formatCurrency(item.cashOut)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-kash-emerald" style={{ width: `${Math.max(4, item.cashOut / max * 100)}%` }} /></div></div>)}</div>;
}

function Legend({ color, label }: { color: string; label: string }) { return <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{label}</span>; }
function NoData({ text }: { text: string }) { return <div className="flex h-36 items-center justify-center rounded-xl bg-slate-50 px-4 text-center text-sm text-slate-500">{text}</div>; }
