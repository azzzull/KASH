import type { jsPDF } from "jspdf";
import kashLogoUrl from "../../logo/SVG/KASHLogo.svg";
import type { FinancialReportData, TransactionRecapData } from "../types/reports";
import { formatCompactCurrency, formatCurrency, toNumber } from "./money";
import { buildCashFlowScale, buildCashFlowTrend } from "./reportCharts";
import { isExternalTransfer } from "./transactions";

type ExportKind = "financial" | "recap" | "transactions";
type Metric = readonly [string, number, boolean?];
const PAGE = { width: 210, height: 297, left: 16, right: 194, footer: 289 };
const EMERALD = [5, 150, 105] as const;
let logoDataUrl: Promise<string | null> | null = null;

function safeNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function safeDate(value: unknown, fallback: string) { const date = new Date(typeof value === "string" ? value : ""); return Number.isFinite(date.getTime()) ? date.toISOString() : fallback; }
function stageError(stage: string, error: unknown) { return new Error(`[${stage}] ${error instanceof Error ? error.message : String(error)}`); }

function normalizeFinancialReport(data: FinancialReportData): FinancialReportData {
  const recap = data.transactionRecap; const fallbackDate = safeDate(recap.period?.start, new Date(0).toISOString());
  return {
    ...data,
    currentBalance: safeNumber(data.currentBalance),
    transactionRecap: {
      ...recap,
      space: { ...recap.space, name: recap.space?.name || "KASH Space" },
      period: { ...recap.period, label: recap.period?.label || "Selected period", start: typeof recap.period?.start === "string" ? recap.period.start : fallbackDate, end: typeof recap.period?.end === "string" ? recap.period.end : fallbackDate },
      summary: { income: safeNumber(recap.summary?.income), expensePrincipal: safeNumber(recap.summary?.expensePrincipal), adminFees: safeNumber(recap.summary?.adminFees), totalExpense: safeNumber(recap.summary?.totalExpense), netCashFlow: safeNumber(recap.summary?.netCashFlow), transactionCount: safeNumber(recap.summary?.transactionCount) },
      transactions: (recap.transactions ?? []).map((transaction) => ({ ...transaction, transaction_date: safeDate(transaction.transaction_date, fallbackDate), amount: safeNumber(transaction.amount), transfer_fee: safeNumber(transaction.transfer_fee), title: transaction.title ?? "" })),
      categoryBreakdown: (recap.categoryBreakdown ?? []).map((item) => ({ ...item, categoryName: item.categoryName || "Uncategorized", amount: safeNumber(item.amount), transactionCount: safeNumber(item.transactionCount), percentage: safeNumber(item.percentage) })),
      walletBreakdown: (recap.walletBreakdown ?? []).map((item) => ({ ...item, wallet: { ...item.wallet, name: item.wallet?.name || "Wallet" }, cashIn: safeNumber(item.cashIn), cashOut: safeNumber(item.cashOut), netMovement: safeNumber(item.netMovement), transactionCount: safeNumber(item.transactionCount) })),
    },
    financialHealth: data.financialHealth ? {
      ...data.financialHealth,
      position: data.financialHealth.position ? { ...data.financialHealth.position, beginningNetWorth: safeNumber(data.financialHealth.position.beginningNetWorth), endingNetWorth: safeNumber(data.financialHealth.position.endingNetWorth), change: safeNumber(data.financialHealth.position.change), changePercent: data.financialHealth.position.changePercent === null ? null : safeNumber(data.financialHealth.position.changePercent) } : undefined,
      budgets: data.financialHealth.budgets.map((item) => ({ ...item, budgeted: safeNumber(item.budgeted), spent: safeNumber(item.spent), remaining: safeNumber(item.remaining), utilizationPercent: safeNumber(item.utilizationPercent) })),
      goals: data.financialHealth.goals.map((item) => ({ ...item, target: safeNumber(item.target), progress: safeNumber(item.progress), remaining: safeNumber(item.remaining), progressPercent: safeNumber(item.progressPercent), contributedDuringPeriod: safeNumber(item.contributedDuringPeriod) })),
      receivables: { outstanding: safeNumber(data.financialHealth.receivables.outstanding), collectedDuringPeriod: safeNumber(data.financialHealth.receivables.collectedDuringPeriod) },
      debts: { outstanding: safeNumber(data.financialHealth.debts.outstanding), paidDuringPeriod: safeNumber(data.financialHealth.debts.paidDuringPeriod) },
    } : undefined,
  };
}

function slug(value: string) { return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "") || "Space"; }
function periodFilePart(data: TransactionRecapData) { return data.period.month !== undefined && data.period.year !== undefined ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(data.period.year, data.period.month, 1)).replace(" ", "-") : `${data.period.start}-to-${data.period.end}`; }
export function reportFilename(kind: ExportKind, data: TransactionRecapData, extension: "pdf" | "xlsx" | "csv") { const prefix = kind === "financial" ? "KASH-Financial-Report" : kind === "recap" ? "KASH-Transaction-Recap" : "KASH-Transactions"; return `${prefix}-${slug(data.space.name)}-${periodFilePart(data)}.${extension}`; }
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1_000); }
function displayTitle(transaction: TransactionRecapData["transactions"][number]) { if (transaction.title) return transaction.title; if (isExternalTransfer(transaction)) return "Transfer Keluar"; return transaction.category?.name ?? transaction.type; }
function transactionTotal(transaction: TransactionRecapData["transactions"][number]) { const amount = toNumber(transaction.amount); return transaction.type === "expense" || transaction.type === "transfer" ? amount + toNumber(transaction.transfer_fee) : amount; }
function labels(data: TransactionRecapData) { const managed = data.space.space_type === "managed"; return { balance: managed ? "Managed Balance" : "Net Worth", income: managed ? "Funding" : "Income", expense: managed ? "Spending Principal" : "Expense Principal", total: managed ? "Total Spending" : "Total Expense", net: managed ? "Net Flow" : "Net Cash Flow", category: managed ? "Spending Breakdown" : "Expense Breakdown" }; }
function clipped(doc: jsPDF, value: string, width: number) { return doc.splitTextToSize(value || "-", width)[0] as string; }

function loadLogoDataUrl() {
  if (logoDataUrl) return logoDataUrl;
  logoDataUrl = fetch(kashLogoUrl).then((response) => response.text()).then((svg) => new Promise<string>((resolve, reject) => {
    const image = new Image(); const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    image.onload = () => { const canvas = document.createElement("canvas"); canvas.width = 1194; canvas.height = 304; const context = canvas.getContext("2d"); if (!context) { URL.revokeObjectURL(blobUrl); reject(new Error("Unable to create logo canvas")); return; } context.drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(blobUrl); resolve(canvas.toDataURL("image/png")); };
    image.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error("Unable to load KASH logo")); };
    image.src = blobUrl;
  })).catch((error) => { console.warn("[KASH Financial Report Export][logo] Using text fallback", error); return null; });
  return logoDataUrl;
}

async function pdfHeader(doc: jsPDF, title: string, data: TransactionRecapData) {
  doc.setFillColor(...EMERALD); doc.rect(0, 0, PAGE.width, 5, "F");
  const logo = await loadLogoDataUrl();
  if (logo) doc.addImage(logo, "PNG", PAGE.left, 15, 58, 14.75);
  else { doc.setTextColor(...EMERALD); doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text("KASH", PAGE.left, 27); }
  const textX = 128;
  doc.setTextColor(15, 23, 42); doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.text(title, textX, 17);
  doc.setTextColor(71, 85, 105); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(`${data.period.label} · ${data.space.name}`, textX, 23);
  doc.setTextColor(100, 116, 139); doc.setFontSize(7.5); doc.text(`Generated ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date())}`, textX, 28.5);
  doc.setDrawColor(226, 232, 240); doc.line(PAGE.left, 38, PAGE.right, 38);
}

function footer(doc: jsPDF, data: TransactionRecapData, page: number) { doc.setDrawColor(226, 232, 240); doc.line(PAGE.left, 282, PAGE.right, 282); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.setFontSize(7.5); doc.text(`KASH · ${data.period.label} · Page ${page}`, PAGE.left, PAGE.footer); }
function sectionTitle(doc: jsPDF, value: string, y: number) { doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); doc.setFontSize(11); doc.text(value, PAGE.left, y); }

function metricCards(doc: jsPDF, metrics: Metric[], startY: number) {
  const columnWidth = 42.25; const cardHeight = 18; const gap = 3;
  metrics.forEach(([label, value, isCount], index) => {
    const x = PAGE.left + index * (columnWidth + gap); const y = startY;
    doc.setFillColor(244, 251, 247); doc.setDrawColor(209, 250, 229); doc.setLineWidth(0.2); doc.roundedRect(x, y, columnWidth, cardHeight, 2.5, 2.5, "FD");
    doc.setTextColor(71, 85, 105); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.text(clipped(doc, label, columnWidth - 8), x + 4, y + 5.5);
    doc.setTextColor(15, 23, 42); doc.setFont("helvetica", "bold"); doc.setFontSize(isCount ? 10 : 8.5); doc.text(clipped(doc, isCount ? String(value) : formatCurrency(value), columnWidth - 8), x + 4, y + 13);
  });
  return startY + cardHeight + gap;
}

function drawTableHeader(doc: jsPDF, y: number) {
  const columns = [16, 34, 70, 100, 128, 150, 171]; const labels = ["Date", "Transaction", "Category", "Wallet", "Principal", "Fee", "Total"];
  doc.setFillColor(...EMERALD); doc.roundedRect(PAGE.left, y, 178, 8, 1.5, 1.5, "F"); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255); doc.setFontSize(7);
  labels.forEach((label, index) => doc.text(label, columns[index] + 2, y + 5));
  return y + 8;
}

function chartPanel(doc: jsPDF, title: string, x: number, y: number, width: number, height: number) {
  doc.setFillColor(255, 255, 255); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2); doc.roundedRect(x, y, width, height, 2.5, 2.5, "FD");
  doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); doc.setFontSize(8.5); doc.text(title, x + 5, y + 7);
}

function drawCashFlowTrend(doc: jsPDF, data: TransactionRecapData, x: number, y: number, width: number, height: number) {
  const points = buildCashFlowTrend(data); chartPanel(doc, "Cash Flow Trend", x, y, width, height);
  if (!points.length) { doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.setFontSize(7); doc.text("No activity in this period", x + width / 2, y + height / 2, { align: "center" }); return; }
  const left = x + 22; const right = x + width - 7; const top = y + 15; const bottom = y + height - 10; const scale = buildCashFlowScale(points); const { min, max } = scale;
  const pointX = (index: number) => left + index * ((right - left) / Math.max(1, points.length - 1)); const pointY = (value: number) => top + (max - value) / (max - min) * (bottom - top);
  scale.ticks.forEach((tick) => { doc.setDrawColor(tick === 0 ? 148 : 226, tick === 0 ? 163 : 232, tick === 0 ? 184 : 240); doc.line(left, pointY(tick), right, pointY(tick)); doc.setTextColor(tick === 0 ? 71 : 100, tick === 0 ? 85 : 116, tick === 0 ? 105 : 139); doc.setFont("helvetica", tick === 0 ? "bold" : "normal"); doc.setFontSize(5.4); doc.text(formatCompactCurrency(tick), left - 2, pointY(tick) + 1.8, { align: "right" }); });
  const drawSeries = (values: number[], color: readonly [number, number, number], dash?: number[]) => { doc.setDrawColor(...color); doc.setLineWidth(0.8); doc.setLineDashPattern(dash ?? [], 0); values.forEach((value, index) => { if (index) doc.line(pointX(index - 1), pointY(values[index - 1]), pointX(index), pointY(value)); }); };
  drawSeries(points.map((point) => point.income), EMERALD); drawSeries(points.map((point) => point.expense), [239, 68, 68]); drawSeries(points.map((point) => point.net), [15, 118, 110], [1.5, 1.5]); doc.setLineDashPattern([], 0);
  doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.setFontSize(5.8); const step = Math.max(1, Math.ceil(points.length / 6)); points.forEach((point, index) => { if (index % step === 0 || index === points.length - 1) doc.text(point.shortLabel, pointX(index), bottom + 5, { align: "center" }); });
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.2); [[EMERALD, "Income"], [[239, 68, 68] as const, "Expense"], [[15, 118, 110] as const, "Net"]].forEach(([color, label], index) => { const swatchX = right - 54 + index * 18; doc.setFillColor(...(color as readonly [number, number, number])); doc.circle(swatchX, y + 7, 1, "F"); doc.setTextColor(71, 85, 105); doc.text(label as string, swatchX + 2, y + 8.5); });
}

function drawRankedChart(doc: jsPDF, title: string, items: { label: string; value: number; percentage?: number }[], x: number, y: number, width: number, height: number) {
  chartPanel(doc, title, x, y, width, height); const ranked = items.slice(0, 4); if (!ranked.length) { doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.setFontSize(7); doc.text("No activity in this period", x + width / 2, y + height / 2, { align: "center" }); return; }
  const max = Math.max(1, ...ranked.map((item) => item.value)); ranked.forEach((item, index) => { const rowY = y + 16 + index * 10; doc.setFont("helvetica", "bold"); doc.setTextColor(51, 65, 85); doc.setFontSize(6.5); doc.text(clipped(doc, item.label, width - 45), x + 5, rowY); doc.setFillColor(226, 232, 240); doc.roundedRect(x + 5, rowY + 2.5, width - 12, 2.5, 1.25, 1.25, "F"); doc.setFillColor(...EMERALD); doc.roundedRect(x + 5, rowY + 2.5, Math.max(2, (width - 12) * item.value / max), 2.5, 1.25, 1.25, "F"); doc.setFont("helvetica", "normal"); doc.setTextColor(71, 85, 105); doc.setFontSize(5.8); doc.text(item.percentage === undefined ? formatCurrency(item.value) : `${item.percentage.toFixed(0)}%`, x + width - 5, rowY, { align: "right" }); });
}

const HEALTH = { top: 20, bottom: 274, sectionGap: 8, cardGap: 4, pad: 6 };
function progressBar(doc: jsPDF, x: number, y: number, width: number, percent: number, color: readonly [number, number, number] = EMERALD) { doc.setFillColor(226, 232, 240); doc.roundedRect(x, y, width, 3, 1.5, 1.5, "F"); const fill = width * Math.min(100, Math.max(0, percent)) / 100; if (fill > 0) { doc.setFillColor(...color); doc.roundedRect(x, y, Math.max(1.5, fill), 3, 1.5, 1.5, "F"); } }
function healthCard(doc: jsPDF, title: string, x: number, y: number, width: number, height: number, tint = false) { doc.setFillColor(tint ? 244 : 255, tint ? 251 : 255, tint ? 247 : 255); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2); doc.roundedRect(x, y, width, height, 3, 3, "FD"); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); doc.setFontSize(7.5); doc.text(title.toUpperCase(), x + HEALTH.pad, y + 7); }
function healthPageHeader(doc: jsPDF, periodLabel: string, continued = false) { sectionTitle(doc, continued ? "Financial Health (continued)" : "Financial Health", HEALTH.top); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.setFontSize(7); doc.text(`Your financial position and progress during ${periodLabel}`, PAGE.left, HEALTH.top + 5); return HEALTH.top + 11; }
function healthSection(doc: jsPDF, title: string, y: number) { doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); doc.setFontSize(9.5); doc.text(title, PAGE.left, y); return y + 4; }
function signedCurrency(value: number) { return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatCurrency(Math.abs(value))}`; }
function drawFinancialHealth(doc: jsPDF, data: FinancialReportData) {
  const health = data.financialHealth; if (!health) return;
  doc.addPage(); let y = healthPageHeader(doc, data.period.label);
  const fit = (height: number) => { if (y + height <= HEALTH.bottom) return; doc.addPage(); y = healthPageHeader(doc, data.period.label, true); };
  if (health.position) { fit(48); y = healthSection(doc, "Financial Position", y); const cardY = y; const p = health.position; healthCard(doc, "Net Worth Movement", PAGE.left, cardY, 178, 39, true); const beginX = PAGE.left + 10; const endX = PAGE.right - 10; doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.setFontSize(6.5); doc.text("BEGINNING", beginX, cardY + 15); doc.text("ENDING", endX, cardY + 15, { align: "right" }); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); doc.setFontSize(10); doc.text(formatCurrency(p.beginningNetWorth), beginX, cardY + 21); doc.text(formatCurrency(p.endingNetWorth), endX, cardY + 21, { align: "right" }); doc.setDrawColor(110, 180, 150); doc.setLineWidth(0.7); doc.line(PAGE.left + 62, cardY + 19, PAGE.right - 62, cardY + 19); doc.setFillColor(...EMERALD); doc.triangle(PAGE.right - 63, cardY + 19, PAGE.right - 67, cardY + 17, PAGE.right - 67, cardY + 21, "F"); const changeColor: readonly [number, number, number] = p.change < 0 ? [185, 28, 28] : p.change === 0 ? [71, 85, 105] : EMERALD; doc.setFont("helvetica", "bold"); doc.setTextColor(...changeColor); doc.setFontSize(8.5); doc.text(signedCurrency(p.change), PAGE.width / 2, cardY + 29, { align: "center" }); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.setFontSize(6); doc.text(`Net Worth Change${p.changePercent === null ? " · —" : ` · ${p.changePercent > 0 ? "+" : ""}${p.changePercent.toFixed(1)}%`}`, PAGE.width / 2, cardY + 34, { align: "center" }); if (p.investmentValuationLimited) { doc.setFillColor(240, 249, 255); doc.circle(PAGE.left + 9, cardY + 45, 1.6, "F"); doc.setFont("helvetica", "bold"); doc.setTextColor(71, 85, 105); doc.setFontSize(5.2); doc.text("i", PAGE.left + 9, cardY + 45.8, { align: "center" }); doc.setFont("helvetica", "normal"); doc.setFontSize(5.4); doc.text("Historical investment market valuations are unavailable; position uses ledger-based values.", PAGE.left + 13, cardY + 46); y = cardY + 50; } else y = cardY + 43; y += HEALTH.sectionGap; }
  if (health.budgets.length) { const budgets = [...health.budgets].sort((a, b) => b.utilizationPercent - a.utilizationPercent); fit(10); y = healthSection(doc, "Budget Performance", y); for (const item of budgets) { fit(21); const cardY = y; healthCard(doc, item.name, PAGE.left, cardY, 178, 17); const color: readonly [number, number, number] = item.status === "over_budget" ? [190, 85, 50] : item.status === "near_limit" ? [180, 120, 35] : EMERALD; doc.setFont("helvetica", "bold"); doc.setTextColor(...color); doc.setFontSize(7); doc.text(`${item.utilizationPercent.toFixed(0)}%`, PAGE.right - HEALTH.pad, cardY + 7, { align: "right" }); doc.setFont("helvetica", "normal"); doc.setTextColor(71, 85, 105); doc.setFontSize(5.8); doc.text(`${formatCurrency(item.spent)} / ${formatCurrency(item.budgeted)}`, PAGE.left + HEALTH.pad, cardY + 11); progressBar(doc, PAGE.left + 70, cardY + 9, 66, item.utilizationPercent, color); doc.setFontSize(5.5); doc.text(item.status === "over_budget" ? `Over by ${formatCurrency(Math.abs(item.remaining))}` : `Remaining ${formatCurrency(item.remaining)}`, PAGE.right - HEALTH.pad, cardY + 14, { align: "right" }); doc.setFont("helvetica", "bold"); doc.setTextColor(...color); doc.text(item.status === "on_track" ? "On Track" : item.status === "near_limit" ? "Near Limit" : "Over Budget", PAGE.left + HEALTH.pad, cardY + 14); y += 17 + HEALTH.cardGap; } y += HEALTH.sectionGap - HEALTH.cardGap; }
  if (health.goals.length) { fit(10); y = healthSection(doc, "Goals Progress", y); for (const goal of health.goals) { fit(31); const cardY = y; healthCard(doc, goal.name, PAGE.left, cardY, 178, 27); doc.setFont("helvetica", "bold"); doc.setTextColor(...EMERALD); doc.setFontSize(8); doc.text(`${goal.progressPercent.toFixed(0)}%`, PAGE.right - HEALTH.pad, cardY + 7, { align: "right" }); doc.setFont("helvetica", "normal"); doc.setTextColor(71, 85, 105); doc.setFontSize(6); doc.text(formatCurrency(goal.progress), PAGE.left + HEALTH.pad, cardY + 12); doc.text(formatCurrency(goal.target), PAGE.right - HEALTH.pad, cardY + 12, { align: "right" }); progressBar(doc, PAGE.left + HEALTH.pad, cardY + 15, 166, goal.progressPercent); doc.setFontSize(5.4); doc.setTextColor(100, 116, 139); doc.text("CONTRIBUTED THIS PERIOD", PAGE.left + HEALTH.pad, cardY + 22); doc.text("REMAINING", PAGE.left + 93, cardY + 22); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); doc.setFontSize(6.5); doc.text(signedCurrency(goal.contributedDuringPeriod), PAGE.left + HEALTH.pad, cardY + 26); doc.text(formatCurrency(goal.remaining), PAGE.left + 93, cardY + 26); y += 27 + HEALTH.cardGap; } y += HEALTH.sectionGap - HEALTH.cardGap; }
  const hasDebtData = health.receivables.outstanding || health.receivables.collectedDuringPeriod || health.debts.outstanding || health.debts.paidDuringPeriod;
  if (hasDebtData) { fit(40); y = healthSection(doc, "Debt & Receivable", y); const cardY = y; [["Receivable", health.receivables.outstanding, "Collected this period", health.receivables.collectedDuringPeriod, true], ["Debt", health.debts.outstanding, "Paid this period", health.debts.paidDuringPeriod, false]].forEach(([title, outstanding, secondaryLabel, secondary, positive], index) => { const x = PAGE.left + index * 90.5; const secondaryColor: readonly [number, number, number] = Boolean(positive) ? EMERALD : [71, 85, 105]; healthCard(doc, title as string, x, cardY, 87.5, 30, Boolean(positive)); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); doc.setFontSize(10); doc.text(formatCurrency(outstanding as number), x + HEALTH.pad, cardY + 15); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.setFontSize(5.8); doc.text("Outstanding", x + HEALTH.pad, cardY + 19); doc.setDrawColor(226, 232, 240); doc.line(x + HEALTH.pad, cardY + 21, x + 81.5, cardY + 21); doc.setFontSize(5.4); doc.text(secondaryLabel as string, x + HEALTH.pad, cardY + 25); doc.setFont("helvetica", "bold"); doc.setTextColor(...secondaryColor); doc.setFontSize(6.8); doc.text(formatCurrency(secondary as number), x + HEALTH.pad, cardY + 29); }); y = cardY + 30 + HEALTH.sectionGap; }
  fit(26); y = healthSection(doc, "Financial Health Snapshot", y); const snapshotY = y; const metrics = [["Receivables Collected", health.receivables.collectedDuringPeriod], ["Debt Paid", health.debts.paidDuringPeriod], ["Goal Contributions", health.goals.reduce((sum, goal) => sum + goal.contributedDuringPeriod, 0)], ["Budgets", health.budgets.length ? `${health.budgets.filter((item) => item.status === "over_budget").length} over budget` : "No budget data"]] as const; metrics.forEach(([label, value], index) => { const x = PAGE.left + index * 45.25; healthCard(doc, label, x, snapshotY, 42.25, 18, index === 0); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); doc.setFontSize(typeof value === "number" ? 7 : 6.3); doc.text(typeof value === "number" ? formatCurrency(value) : value, x + HEALTH.pad, snapshotY + 14); });
}

function emeraldGradientColor(index: number, total: number) { const contrastIndex = index % 2 === 0 ? index / 2 : total - 1 - Math.floor(index / 2); const ratio = total <= 1 ? 0.35 : contrastIndex / (total - 1); return `hsl(160 ${82 - ratio * 18}% ${25 + ratio * 48}%)`; }
function escapeXml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] ?? character); }
function shortened(value: string, maxLength: number) { return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value; }

function rasterizeSvg(svg: string, width: number, height: number) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image(); const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    image.onload = () => {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const context = canvas.getContext("2d");
      if (!context) { URL.revokeObjectURL(blobUrl); reject(new Error("Unable to create chart canvas")); return; }
      context.drawImage(image, 0, 0, width, height); URL.revokeObjectURL(blobUrl); resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error("Unable to render chart image")); };
    image.src = blobUrl;
  });
}

async function drawCategoryRingChart(doc: jsPDF, title: string, items: { label: string; value: number; percentage?: number }[], x: number, y: number, width: number, height: number) {
  chartPanel(doc, title, x, y, width, height); const categories = items.filter((item) => item.value > 0);
  if (!categories.length) { doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.setFontSize(7); doc.text("No activity in this period", x + width / 2, y + height / 2, { align: "center" }); return; }
  const total = categories.reduce((sum, item) => sum + item.value, 0); const radius = 48; const circumference = 2 * Math.PI * radius; const gapDegrees = Math.min(3, 120 / categories.length); const availableDegrees = 360 - gapDegrees * categories.length; let offset = 0;
  const segments = categories.map((item, index) => { const dash = item.value / total * availableDegrees / 360 * circumference; const segmentOffset = offset; offset += dash + gapDegrees / 360 * circumference; return { ...item, color: emeraldGradientColor(index, categories.length), dash, offset: segmentOffset }; });
  const rowsPerColumn = 7; const columnCount = Math.max(1, Math.ceil(segments.length / rowsPerColumn)); const legendWidth = 660 / columnCount;
  const legend = segments.map((item, index) => { const column = Math.floor(index / rowsPerColumn); const row = index % rowsPerColumn; const legendX = 340 + column * legendWidth; const legendY = 48 + row * 36; const share = item.value / total * 100; const valueX = legendX + legendWidth - 8; return `<circle cx="${legendX}" cy="${legendY - 5}" r="6" fill="${item.color}"/><text x="${legendX + 14}" y="${legendY}" fill="#334155" font-family="Arial, sans-serif" font-size="15" font-weight="700">${escapeXml(shortened(item.label, Math.max(8, Math.floor(legendWidth / 17))))}</text><text x="${valueX}" y="${legendY}" text-anchor="end" fill="#0f172a" font-family="Arial, sans-serif" font-size="14" font-weight="700">${escapeXml(formatCurrency(item.value))} · ${share.toFixed(0)}%</text>`; }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 360"><g transform="rotate(-90 160 180)">${segments.map((item) => `<circle cx="160" cy="180" r="120" fill="none" stroke="${item.color}" stroke-width="40" stroke-linecap="round" stroke-dasharray="${item.dash / circumference * (2 * Math.PI * 120)} ${(circumference - item.dash) / circumference * (2 * Math.PI * 120)}" stroke-dashoffset="${-item.offset / circumference * (2 * Math.PI * 120)}"/>`).join("")}</g><text x="160" y="170" text-anchor="middle" fill="#64748b" font-family="Arial, sans-serif" font-size="20" font-weight="700">Total Expense</text><text x="160" y="202" text-anchor="middle" fill="#0f172a" font-family="Arial, sans-serif" font-size="24" font-weight="700">${formatCurrency(total)}</text>${legend}</svg>`;
  const imageRatio = 1000 / 360; const imageWidth = width - 6; const imageHeight = imageWidth / imageRatio; const chart = await rasterizeSvg(svg, 1600, 576); doc.addImage(chart, "PNG", x + 3, y + 9, imageWidth, imageHeight);
}

export async function exportTransactionRecapPdf(data: TransactionRecapData) {
  const { jsPDF } = await import("jspdf"); const doc = new jsPDF({ format: "a4", orientation: "portrait", unit: "mm" }); const l = labels(data); const s = data.summary;
  await pdfHeader(doc, "Transaction Recap", data); let y = metricCards(doc, [[l.income, s.income], [l.expense, s.expensePrincipal], [l.net, s.netCashFlow], ["Transactions", s.transactionCount, true]], 46) + 4;
  sectionTitle(doc, "Transactions", y); y = drawTableHeader(doc, y + 5); let page = 1;
  const positions = [16, 34, 70, 100, 128, 150, 171]; const widths = [16, 33, 27, 25, 20, 19, 21];
  data.transactions.forEach((transaction, index) => {
    if (y > 273) { footer(doc, data, page); doc.addPage(); page += 1; y = drawTableHeader(doc, 16); }
    const fee = toNumber(transaction.transfer_fee); const cells = [new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(transaction.transaction_date)), displayTitle(transaction), transaction.category?.name ?? "-", transaction.wallet?.name ?? "-", formatCurrency(transaction.amount), fee ? formatCurrency(fee) : "-", formatCurrency(transactionTotal(transaction))];
    if (index % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(PAGE.left, y, 178, 8, "F"); }
    doc.setTextColor(30, 41, 59); doc.setFont("helvetica", "normal"); doc.setFontSize(6.7); cells.forEach((cell, cellIndex) => { const align = cellIndex >= 4 ? "right" : "left"; doc.text(clipped(doc, cell, widths[cellIndex] - 2), align === "right" ? positions[cellIndex] + widths[cellIndex] - 1 : positions[cellIndex] + 2, y + 5, { align }); });
    doc.setDrawColor(226, 232, 240); doc.line(PAGE.left, y + 8, PAGE.right, y + 8); y += 8;
  });
  footer(doc, data, page); download(doc.output("blob"), reportFilename("recap", data, "pdf"));
}

export async function createFinancialReportPdfBlob(rawData: FinancialReportData): Promise<Blob> {
  const data = normalizeFinancialReport(rawData); const recap = data.transactionRecap; const l = labels(recap); const s = recap.summary;
  let jsPDFConstructor: typeof import("jspdf").jsPDF;
  try { ({ jsPDF: jsPDFConstructor } = await import("jspdf")); } catch (error) { throw stageError("pdf-library", error); }
  const doc = new jsPDFConstructor({ format: "a4", orientation: "portrait", unit: "mm" });
  try { await pdfHeader(doc, "Financial Report", recap); } catch (error) { throw stageError("pdf-header", error); }
  try { metricCards(doc, [[l.income, s.income], [l.expense, s.expensePrincipal], [l.net, s.netCashFlow], ["Transactions", s.transactionCount, true]], 46); } catch (error) { throw stageError("pdf-kpis", error); }
  try { drawCashFlowTrend(doc, recap, PAGE.left, 72, 178, 53); } catch (error) { console.error("[KASH Financial Report Export][chart-cash-flow]", error); chartPanel(doc, "Cash Flow Trend", PAGE.left, 72, 178, 53); }
  try { await drawCategoryRingChart(doc, l.category, recap.categoryBreakdown.map((item) => ({ label: item.categoryName, value: item.amount, percentage: item.percentage })), PAGE.left, 131, 178, 75); } catch (error) { console.error("[KASH Financial Report Export][chart-category]", error); drawRankedChart(doc, l.category, recap.categoryBreakdown.map((item) => ({ label: item.categoryName, value: item.amount, percentage: item.percentage })), PAGE.left, 131, 178, 75); }
  try { drawRankedChart(doc, "Cash Out by Wallet", recap.walletBreakdown.map((item) => ({ label: item.wallet.name, value: item.cashOut })), PAGE.left, 212, 178, 62); } catch (error) { console.error("[KASH Financial Report Export][chart-wallet]", error); chartPanel(doc, "Cash Out by Wallet", PAGE.left, 212, 178, 62); }
  try {
    drawFinancialHealth(doc, data);
    doc.addPage(); let y = 20; sectionTitle(doc, "Activity Details", y); y += 8;
    const totalMovement = recap.transactions.reduce((sum, transaction) => sum + Math.abs(transactionTotal(transaction)), 0); const largestTransaction = [...recap.transactions].sort((a, b) => Math.abs(transactionTotal(b)) - Math.abs(transactionTotal(a)))[0];
    const insights = [["Total movement", formatCurrency(totalMovement)], ["Average movement", formatCurrency(s.transactionCount ? totalMovement / s.transactionCount : 0)], ["Active wallets", String(recap.walletBreakdown.length)], ["Largest activity", largestTransaction ? clipped(doc, displayTitle(largestTransaction), 72) : "-"]];
    insights.forEach(([label, value], index) => { const column = index % 2; const row = Math.floor(index / 2); const x = PAGE.left + column * 90.5; const cardY = y + row * 20; doc.setFillColor(244, 251, 247); doc.setDrawColor(209, 250, 229); doc.roundedRect(x, cardY, 87.5, 16, 2, 2, "FD"); doc.setFont("helvetica", "normal"); doc.setTextColor(71, 85, 105); doc.setFontSize(6.6); doc.text(label, x + 4, cardY + 5.5); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); doc.setFontSize(8); doc.text(clipped(doc, value, 78), x + 4, cardY + 11.5); });
    y += 45; sectionTitle(doc, "Largest Expenses", y); y += 5;
    const drawTransactionHeader = (headerY: number) => { doc.setFillColor(...EMERALD); doc.roundedRect(PAGE.left, headerY, 178, 8, 1.5, 1.5, "F"); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255); doc.setFontSize(6.8); [["Date", 18], ["Transaction", 45], ["Wallet", 112], ["Total", 190]].forEach(([label, x]) => doc.text(label as string, x as number, headerY + 5)); return headerY + 8; };
    const topTransactions = recap.transactions.filter((transaction) => transaction.status === "completed" && transaction.type === "expense" && !["debt_creation", "receivable_creation", "debt_payment", "receivable_payment", "goal_contribution", "goal_refund"].includes(transaction.related_entity_type ?? "")).sort((a, b) => toNumber(b.amount) - toNumber(a.amount)).slice(0, 8); y = drawTransactionHeader(y);
    if (!topTransactions.length) { doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.setFontSize(7); doc.text("No transactions in this period", PAGE.left + 4, y + 7); y += 13; }
    topTransactions.forEach((transaction, index) => { if (y > 260) { doc.addPage(); y = 20; sectionTitle(doc, "Largest Expenses", y); y = drawTransactionHeader(y + 5); } if (index % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(PAGE.left, y, 178, 8, "F"); } doc.setFont("helvetica", "normal"); doc.setTextColor(30, 41, 59); doc.setFontSize(6.7); doc.text(new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(transaction.transaction_date)), 18, y + 5); doc.text(clipped(doc, displayTitle(transaction), 62), 45, y + 5); doc.text(clipped(doc, transaction.wallet?.name ?? "-", 45), 112, y + 5); doc.setFont("helvetica", "bold"); doc.text(formatCurrency(transactionTotal(transaction)), 190, y + 5, { align: "right" }); doc.setDrawColor(226, 232, 240); doc.line(PAGE.left, y + 8, PAGE.right, y + 8); y += 8; });
    y += 8; if (y > 248) { doc.addPage(); y = 20; } sectionTitle(doc, "Wallet Movement Details", y); y += 5;
    const drawWalletHeader = (headerY: number) => { doc.setFillColor(...EMERALD); doc.roundedRect(PAGE.left, headerY, 178, 8, 1.5, 1.5, "F"); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255); doc.setFontSize(6.7); [["Wallet", 18], ["In", 100], ["Out", 128], ["Net", 158], ["Tx", 190]].forEach(([label, x]) => doc.text(label as string, x as number, headerY + 5, { align: (x as number) === 18 ? "left" : "right" })); return headerY + 8; };
    y = drawWalletHeader(y); recap.walletBreakdown.forEach((item, index) => { if (y > 270) { doc.addPage(); y = 20; sectionTitle(doc, "Wallet Movement Details", y); y = drawWalletHeader(y + 5); } if (index % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(PAGE.left, y, 178, 8, "F"); } doc.setFont("helvetica", "normal"); doc.setTextColor(30, 41, 59); doc.setFontSize(6.7); doc.text(clipped(doc, item.wallet.name, 77), 18, y + 5); doc.text(formatCurrency(item.cashIn), 100, y + 5, { align: "right" }); doc.text(formatCurrency(item.cashOut), 128, y + 5, { align: "right" }); doc.text(formatCurrency(item.netMovement), 158, y + 5, { align: "right" }); doc.text(String(item.transactionCount), 190, y + 5, { align: "right" }); doc.setDrawColor(226, 232, 240); doc.line(PAGE.left, y + 8, PAGE.right, y + 8); y += 8; });
    const pages = doc.getNumberOfPages(); for (let page = 1; page <= pages; page += 1) { doc.setPage(page); footer(doc, recap, page); }
  } catch (error) { throw stageError("pdf-details", error); }
  try { return doc.output("blob"); } catch (error) { throw stageError("pdf-blob", error); }
}

export async function exportFinancialReportPdf(data: FinancialReportData) {
  const blob = await createFinancialReportPdfBlob(data);
  try { download(blob, reportFilename("financial", data.transactionRecap, "pdf")); } catch (error) { throw stageError("pdf-save", error); }
}

export async function exportTransactionRecapXlsx(data: TransactionRecapData) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser"); const l = labels(data); const s = data.summary; const emerald = "#059669";
  const header = (value: string) => ({ value, fontWeight: "bold" as const, textColor: "#FFFFFF", backgroundColor: emerald, align: "left" as const }); const money = (value: number) => ({ value, type: Number, format: "#,##0", align: "right" as const });
  const summary = [[{ value: "KASH Transaction Recap", fontWeight: "bold" as const, fontSize: 16, textColor: emerald, columnSpan: 2 }, null], ["Report", "Transaction Recap"], ["Period", data.period.label], ["Space", data.space.name], ["Generated At", new Date()], [], [l.income, money(s.income)], [l.expense, money(s.expensePrincipal)], ["Admin Fee", money(s.adminFees)], [l.total, money(s.totalExpense)], [l.net, money(s.netCashFlow)], ["Transaction Count", s.transactionCount]];
  const transactions = [["Date", "Type", "Subtype", "Title", "Category", "Wallet", "Destination Wallet", "Principal Amount", "Admin Fee", "Total Cash Movement", "Envelope", "Status", "Note"].map(header), ...data.transactions.map((tx) => [{ value: new Date(tx.transaction_date), type: Date, format: "yyyy-mm-dd" }, tx.type, tx.transaction_subtype ?? "", displayTitle(tx), tx.category?.name ?? "", tx.wallet?.name ?? "", tx.destinationWallet?.name ?? "", money(toNumber(tx.amount)), money(toNumber(tx.transfer_fee)), money(tx.type === "income" || tx.type === "adjustment" ? toNumber(tx.amount) : -transactionTotal(tx)), tx.envelope?.name ?? "", tx.status, tx.note ?? ""])];
  const categories = [["Category", "Amount", "Transaction Count", "Percentage"].map(header), ...data.categoryBreakdown.map((item) => [item.categoryName, money(item.amount), item.transactionCount, { value: item.percentage / 100, type: Number, format: "0.0%" }])]; const wallets = [["Wallet", "Cash In", "Cash Out", "Net Movement", "Transaction Count"].map(header), ...data.walletBreakdown.map((item) => [item.wallet.name, money(item.cashIn), money(item.cashOut), money(item.netMovement), item.transactionCount])];
  const blob = await writeXlsxFile([{ data: summary, sheet: "Summary", columns: [{ width: 27 }, { width: 24 }], showGridLines: false }, { data: transactions, sheet: "Transactions", columns: Array.from({ length: 13 }, (_, index) => ({ width: index === 3 || index === 12 ? 28 : 18 })), stickyRowsCount: 1 }, { data: categories, sheet: "Category Breakdown", columns: Array.from({ length: 4 }, () => ({ width: 22 })), stickyRowsCount: 1 }, { data: wallets, sheet: "Wallet Breakdown", columns: Array.from({ length: 5 }, () => ({ width: 20 })), stickyRowsCount: 1 }], { fontFamily: "Mulish", fontSize: 11 }).toBlob(); download(blob, reportFilename("transactions", data, "xlsx"));
}

function csvCell(value: string | number | null | undefined) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
export function buildTransactionCsv(data: TransactionRecapData) { const headers = ["date", "type", "transaction_subtype", "title", "category", "wallet", "destination_wallet", "amount", "transfer_fee", "total_cash_movement", "envelope", "status", "note", "space"]; const rows = data.transactions.map((tx) => [tx.transaction_date.slice(0, 10), tx.type, tx.transaction_subtype ?? "", displayTitle(tx), tx.category?.name ?? "", tx.wallet?.name ?? "", tx.destinationWallet?.name ?? "", toNumber(tx.amount), toNumber(tx.transfer_fee), tx.type === "income" ? toNumber(tx.amount) : tx.type === "adjustment" ? toNumber(tx.amount) : -transactionTotal(tx), tx.envelope?.name ?? "", tx.status, tx.note ?? "", data.space.name]); return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`; }
export function exportTransactionCsv(data: TransactionRecapData) { download(new Blob([buildTransactionCsv(data)], { type: "text/csv;charset=utf-8" }), reportFilename("transactions", data, "csv")); }
