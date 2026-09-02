import type { FinancialReportData, TransactionRecapData } from "../types/reports";
import type { jsPDF } from "jspdf";
import { formatCurrency, toNumber } from "./money";
import { isExternalTransfer } from "./transactions";

type ExportKind = "financial" | "recap" | "transactions";

function slug(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "") || "Space";
}

function periodFilePart(data: TransactionRecapData) {
  if (data.period.month !== undefined && data.period.year !== undefined) {
    return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(data.period.year, data.period.month, 1)).replace(" ", "-");
  }
  return `${data.period.start.slice(0, 10)}-to-${new Date(new Date(data.period.end).getTime() - 1).toISOString().slice(0, 10)}`;
}

export function reportFilename(kind: ExportKind, data: TransactionRecapData, extension: "pdf" | "xlsx" | "csv") {
  const prefix = kind === "financial" ? "KASH-Financial-Report" : kind === "recap" ? "KASH-Transaction-Recap" : "KASH-Transactions";
  return `${prefix}-${slug(data.space.name)}-${periodFilePart(data)}.${extension}`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function displayTitle(transaction: TransactionRecapData["transactions"][number]) {
  if (transaction.title) return transaction.title;
  if (isExternalTransfer(transaction)) return "Transfer Keluar";
  return transaction.category?.name ?? transaction.type;
}

function transactionTotal(transaction: TransactionRecapData["transactions"][number]) {
  const amount = toNumber(transaction.amount);
  return transaction.type === "expense" || transaction.type === "transfer" ? amount + toNumber(transaction.transfer_fee) : amount;
}

function labels(data: TransactionRecapData) {
  const managed = data.space.space_type === "managed";
  return { balance: managed ? "Managed Balance" : "Net Worth", income: managed ? "Funding" : "Income", expense: managed ? "Spending Principal" : "Expense Principal", total: managed ? "Total Spending" : "Total Expense", net: managed ? "Net Flow" : "Net Cash Flow", category: managed ? "Spending Breakdown" : "Expense Breakdown" };
}

function pdfHeader(doc: jsPDF, title: string, data: TransactionRecapData) {
  doc.setFillColor(5, 150, 105); doc.rect(0, 0, 210, 8, "F"); doc.setTextColor(5, 150, 105); doc.setFontSize(17); doc.text("KASH", 16, 22); doc.setTextColor(15, 23, 42); doc.setFontSize(20); doc.text(title, 16, 34); doc.setFontSize(10); doc.setTextColor(71, 85, 105); doc.text(`${data.period.label} · ${data.space.name}`, 16, 41); doc.text(`Generated ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date())}`, 16, 47);
}

export async function exportTransactionRecapPdf(data: TransactionRecapData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });
  const l = labels(data); const s = data.summary; let y = 60;
  pdfHeader(doc, "Transaction Recap", data);
  const metrics = [[l.income, s.income], [l.expense, s.expensePrincipal], ["Admin Fee", s.adminFees], [l.net, s.netCashFlow], ["Transactions", s.transactionCount]];
  metrics.forEach(([name, value], index) => { const x = 16 + (index % 2) * 92; const row = Math.floor(index / 2); const top = y + row * 18; doc.setFillColor(248, 250, 252); doc.rect(x, top, 84, 14, "F"); doc.setTextColor(71, 85, 105); doc.setFontSize(8); doc.text(String(name), x + 4, top + 5); doc.setTextColor(15, 23, 42); doc.setFontSize(10); doc.text(name === "Transactions" ? String(value) : formatCurrency(Number(value)), x + 4, top + 11); });
  y += 60; const cols = [16, 38, 81, 112, 140, 160, 181]; const header = ["Date", "Transaction", "Category", "Wallet", "Principal", "Fee", "Total"];
  const addHeader = () => { doc.setFillColor(5, 150, 105); doc.rect(16, y, 178, 7, "F"); doc.setTextColor(255, 255, 255); doc.setFontSize(7); header.forEach((text, i) => doc.text(text, cols[i] + 2, y + 4.7)); y += 7; };
  const pageFooter = (page: number) => { doc.setTextColor(100, 116, 139); doc.setFontSize(8); doc.text(`KASH · ${data.period.label} · Page ${page}`, 16, 289); };
  addHeader(); let page = 1;
  data.transactions.forEach((transaction) => { if (y > 273) { pageFooter(page); doc.addPage(); page += 1; y = 16; addHeader(); } const fee = toNumber(transaction.transfer_fee); doc.setTextColor(15, 23, 42); doc.setFontSize(7); const row = [new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(transaction.transaction_date)), displayTitle(transaction), transaction.category?.name ?? "-", transaction.wallet?.name ?? "-", formatCurrency(transaction.amount), fee ? formatCurrency(fee) : "-", formatCurrency(transactionTotal(transaction))]; row.forEach((text, index) => doc.text(text.slice(0, index === 1 ? 28 : 18), cols[index] + 2, y + 5)); doc.setDrawColor(226, 232, 240); doc.line(16, y + 7, 194, y + 7); y += 7; }); pageFooter(page);
  download(doc.output("blob"), reportFilename("recap", data, "pdf"));
}

export async function exportFinancialReportPdf(data: FinancialReportData) {
  const { jsPDF } = await import("jspdf"); const doc = new jsPDF({ format: "a4", orientation: "portrait", unit: "mm" }); const recap = data.transactionRecap; const l = labels(recap); const s = recap.summary; let y = 60;
  pdfHeader(doc, "Financial Report", recap); const metrics = [[l.balance, data.currentBalance], [l.income, s.income], [l.total, s.totalExpense], ["Admin Fee", s.adminFees], [l.net, s.netCashFlow]];
  doc.setFontSize(12); doc.setTextColor(15, 23, 42); doc.text("Financial Summary", 16, y); y += 6; metrics.forEach(([name, value]) => { doc.setFillColor(248, 250, 252); doc.rect(16, y, 178, 11, "F"); doc.setTextColor(71, 85, 105); doc.setFontSize(8); doc.text(String(name), 20, y + 4); doc.setTextColor(15, 23, 42); doc.setFontSize(10); doc.text(formatCurrency(Number(value)), 20, y + 9); y += 13; });
  if (recap.categoryBreakdown.length) { y += 5; doc.setFontSize(12); doc.text(l.category, 16, y); y += 6; recap.categoryBreakdown.slice(0, 10).forEach((item) => { doc.setFillColor(5, 150, 105); doc.rect(16, y, Math.max(2, 160 * item.percentage / 100), 4, "F"); doc.setTextColor(15, 23, 42); doc.setFontSize(8); doc.text(item.categoryName, 16, y + 9); doc.text(formatCurrency(item.amount), 194, y + 9, { align: "right" }); y += 14; }); }
  if (recap.walletBreakdown.length && y < 245) { y += 3; doc.setFontSize(12); doc.text("Wallet Activity", 16, y); y += 7; recap.walletBreakdown.slice(0, 8).forEach((item) => { doc.setFontSize(8); doc.setTextColor(15, 23, 42); doc.text(item.wallet.name, 16, y); doc.setTextColor(71, 85, 105); doc.text(`In ${formatCurrency(item.cashIn)} · Out ${formatCurrency(item.cashOut)} · Net ${formatCurrency(item.netMovement)}`, 16, y + 5); y += 11; }); }
  doc.setTextColor(100, 116, 139); doc.setFontSize(8); doc.text("KASH · Financial Report", 16, 289); download(doc.output("blob"), reportFilename("financial", recap, "pdf"));
}

export async function exportTransactionRecapXlsx(data: TransactionRecapData) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const l = labels(data); const s = data.summary; const emerald = "#059669";
  const header = (value: string) => ({ value, fontWeight: "bold" as const, textColor: "#FFFFFF", backgroundColor: emerald, align: "left" as const });
  const money = (value: number) => ({ value, type: Number, format: "#,##0", align: "right" as const });
  const summary = [[{ value: "KASH Transaction Recap", fontWeight: "bold" as const, fontSize: 16, textColor: emerald, columnSpan: 2 }, null], ["Report", "Transaction Recap"], ["Period", data.period.label], ["Space", data.space.name], ["Generated At", new Date()], [], [l.income, money(s.income)], [l.expense, money(s.expensePrincipal)], ["Admin Fee", money(s.adminFees)], [l.total, money(s.totalExpense)], [l.net, money(s.netCashFlow)], ["Transaction Count", s.transactionCount]];
  const transactions = [["Date", "Type", "Subtype", "Title", "Category", "Wallet", "Destination Wallet", "Principal Amount", "Admin Fee", "Total Cash Movement", "Envelope", "Status", "Note"].map(header), ...data.transactions.map((tx) => [{ value: new Date(tx.transaction_date), type: Date, format: "yyyy-mm-dd" }, tx.type, tx.transaction_subtype ?? "", displayTitle(tx), tx.category?.name ?? "", tx.wallet?.name ?? "", tx.destinationWallet?.name ?? "", money(toNumber(tx.amount)), money(toNumber(tx.transfer_fee)), money(tx.type === "income" || tx.type === "adjustment" ? toNumber(tx.amount) : -transactionTotal(tx)), tx.envelope?.name ?? "", tx.status, tx.note ?? ""])];
  const categories = [["Category", "Amount", "Transaction Count", "Percentage"].map(header), ...data.categoryBreakdown.map((item) => [item.categoryName, money(item.amount), item.transactionCount, { value: item.percentage / 100, type: Number, format: "0.0%" }])];
  const wallets = [["Wallet", "Cash In", "Cash Out", "Net Movement", "Transaction Count"].map(header), ...data.walletBreakdown.map((item) => [item.wallet.name, money(item.cashIn), money(item.cashOut), money(item.netMovement), item.transactionCount])];
  const blob = await writeXlsxFile([{ data: summary, sheet: "Summary", columns: [{ width: 27 }, { width: 24 }], showGridLines: false }, { data: transactions, sheet: "Transactions", columns: Array.from({ length: 13 }, (_, index) => ({ width: index === 3 || index === 12 ? 28 : 18 })), stickyRowsCount: 1 }, { data: categories, sheet: "Category Breakdown", columns: Array.from({ length: 4 }, () => ({ width: 22 })), stickyRowsCount: 1 }, { data: wallets, sheet: "Wallet Breakdown", columns: Array.from({ length: 5 }, () => ({ width: 20 })), stickyRowsCount: 1 }], { fontFamily: "Mulish", fontSize: 11 }).toBlob();
  download(blob, reportFilename("transactions", data, "xlsx"));
}

function csvCell(value: string | number | null | undefined) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

export function buildTransactionCsv(data: TransactionRecapData) {
  const headers = ["date", "type", "transaction_subtype", "title", "category", "wallet", "destination_wallet", "amount", "transfer_fee", "total_cash_movement", "envelope", "status", "note", "space"];
  const rows = data.transactions.map((tx) => [tx.transaction_date.slice(0, 10), tx.type, tx.transaction_subtype ?? "", displayTitle(tx), tx.category?.name ?? "", tx.wallet?.name ?? "", tx.destinationWallet?.name ?? "", toNumber(tx.amount), toNumber(tx.transfer_fee), tx.type === "income" ? toNumber(tx.amount) : tx.type === "adjustment" ? toNumber(tx.amount) : -transactionTotal(tx), tx.envelope?.name ?? "", tx.status, tx.note ?? "", data.space.name]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function exportTransactionCsv(data: TransactionRecapData) { download(new Blob([buildTransactionCsv(data)], { type: "text/csv;charset=utf-8" }), reportFilename("transactions", data, "csv")); }
