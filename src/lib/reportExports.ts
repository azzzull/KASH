import type { jsPDF } from "jspdf";
import kashLogoUrl from "../../logo/SVG/KASHLogo.svg";
import type { FinancialReportData, TransactionRecapData } from "../types/reports";
import { formatCurrency, toNumber } from "./money";
import { isExternalTransfer } from "./transactions";

type ExportKind = "financial" | "recap" | "transactions";
type Metric = readonly [string, number, boolean?];
const PAGE = { width: 210, height: 297, left: 16, right: 194, footer: 289 };
const EMERALD = [5, 150, 105] as const;
let logoDataUrl: Promise<string | null> | null = null;

function slug(value: string) { return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "") || "Space"; }
function periodFilePart(data: TransactionRecapData) { return data.period.month !== undefined && data.period.year !== undefined ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(data.period.year, data.period.month, 1)).replace(" ", "-") : `${data.period.start.slice(0, 10)}-to-${new Date(new Date(data.period.end).getTime() - 1).toISOString().slice(0, 10)}`; }
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
  })).catch(() => null);
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

export async function exportFinancialReportPdf(data: FinancialReportData) {
  const { jsPDF } = await import("jspdf"); const doc = new jsPDF({ format: "a4", orientation: "portrait", unit: "mm" }); const recap = data.transactionRecap; const l = labels(recap); const s = recap.summary;
  await pdfHeader(doc, "Financial Report", recap); let y = metricCards(doc, [[l.balance, data.currentBalance], [l.income, s.income], [l.total, s.totalExpense], [l.net, s.netCashFlow]], 46) + 4;
  if (recap.categoryBreakdown.length) { sectionTitle(doc, l.category, y); y += 7; recap.categoryBreakdown.slice(0, 10).forEach((item) => { if (y > 267) { doc.addPage(); y = 18; } doc.setTextColor(30, 41, 59); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text(clipped(doc, item.categoryName, 95), PAGE.left, y); doc.setFont("helvetica", "normal"); doc.setTextColor(71, 85, 105); doc.text(`${item.percentage.toFixed(1)}%`, 145, y, { align: "right" }); doc.setTextColor(15, 23, 42); doc.text(formatCurrency(item.amount), PAGE.right, y, { align: "right" }); doc.setFillColor(226, 232, 240); doc.roundedRect(PAGE.left, y + 3, 128, 3.5, 1.75, 1.75, "F"); doc.setFillColor(...EMERALD); doc.roundedRect(PAGE.left, y + 3, Math.max(2, 128 * item.percentage / 100), 3.5, 1.75, 1.75, "F"); y += 13; }); }
  if (recap.walletBreakdown.length) { y += 2; if (y > 255) { doc.addPage(); y = 18; } sectionTitle(doc, "Wallet Activity", y); y += 7; recap.walletBreakdown.slice(0, 8).forEach((item) => { if (y > 270) { doc.addPage(); y = 18; } doc.setFillColor(248, 250, 252); doc.roundedRect(PAGE.left, y, 178, 13, 2, 2, "F"); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59); doc.setFontSize(8); doc.text(clipped(doc, item.wallet.name, 75), 20, y + 5); doc.setFont("helvetica", "normal"); doc.setTextColor(71, 85, 105); doc.setFontSize(7); doc.text(`In ${formatCurrency(item.cashIn)} · Out ${formatCurrency(item.cashOut)} · Net ${formatCurrency(item.netMovement)}`, 20, y + 10); y += 16; }); }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) { doc.setPage(page); footer(doc, recap, page); }
  download(doc.output("blob"), reportFilename("financial", recap, "pdf"));
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
