import { Download, FileSpreadsheet, FileText, ReceiptText, WalletCards } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReportPeriodPicker } from "../components/reports/ReportPeriodPicker";
import { FinancialReportCharts } from "../components/reports/FinancialReportCharts";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { PageCard } from "../components/ui/PageCard";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { useActiveSpace } from "../context/ActiveSpaceContext";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { getFinancialReportData, getTransactionRecapData } from "../lib/reports";
import { exportFinancialReportPdf, exportTransactionCsv, exportTransactionRecapPdf, exportTransactionRecapXlsx } from "../lib/reportExports";
import { formatCurrency } from "../lib/money";
import type { ReportPeriod, ReportPeriodPreset, TransactionRecapData, TransactionRecapFilters } from "../types/reports";

type ReportKind = "recap" | "financial";
type ExportFormat = "pdf" | "xlsx" | "csv";
const formatIcons = { pdf: FileText, xlsx: FileSpreadsheet, csv: Download };
const defaultRecapFilters: TransactionRecapFilters = { type: "all", walletId: "all", categoryId: "all", status: "completed" };

export function ExportReportsPage() {
  const { activeSpace, loading: spaceLoading } = useActiveSpace();
  const { status } = useAuth();
  const { t } = useI18n();
  const now = new Date();
  const [reportKind, setReportKind] = useState<ReportKind>("recap");
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [preset, setPreset] = useState<ReportPeriodPreset>("this_month");
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [from, setFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
  const [until, setUntil] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`);
  const [period, setPeriod] = useState<ReportPeriod | null>(null);
  const [filters, setFilters] = useState<TransactionRecapFilters>(defaultRecapFilters);
  const [data, setData] = useState<TransactionRecapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState<"financial-pdf" | "recap-pdf" | "xlsx" | "csv" | null>(null);
  const [exportError, setExportError] = useState(false);
  const requestRef = useRef(0);
  const reportReady = status === "authenticated" && !spaceLoading && Boolean(activeSpace && period);
  const updatePeriod = useCallback((next: ReportPeriod) => setPeriod(next), []);
  const availableFormats: ExportFormat[] = reportKind === "financial" ? ["pdf"] : ["pdf", "xlsx", "csv"];
  const selectedReportLabel = reportKind === "financial" ? t("reports.financialReport") : t("reports.transactionRecap");
  const appliedFilters = reportKind === "financial" ? defaultRecapFilters : filters;

  useEffect(() => { if (!availableFormats.includes(format)) setFormat("pdf"); }, [availableFormats, format]);

  const runExport = useCallback(async () => {
    if (!data || exporting) return;
    const kind = reportKind === "financial" ? "financial-pdf" : format === "pdf" ? "recap-pdf" : format;
    setExporting(kind); setExportError(false);
    try {
      if (kind === "recap-pdf") await exportTransactionRecapPdf(data);
      else if (kind === "xlsx") await exportTransactionRecapXlsx(data);
      else if (kind === "csv") exportTransactionCsv(data);
      else if (activeSpace && period) await exportFinancialReportPdf(await getFinancialReportData({ space: activeSpace, period }));
    } catch (exportFailure) { console.error(kind === "financial-pdf" ? "[KASH Financial Report Export]" : "[KASH Transaction Recap Export]", exportFailure); setExportError(true); } finally { setExporting(null); }
  }, [activeSpace, data, exporting, format, period, reportKind]);

  useEffect(() => {
    if (!reportReady || !activeSpace || !period) { setData(null); setLoading(false); return; }
    const request = ++requestRef.current;
    setLoading(true); setError(false); setData(null);
    void getTransactionRecapData({ space: activeSpace, period, filters: appliedFilters }).then((result) => {
      if (request === requestRef.current && result.space.id === activeSpace.id) setData(result);
    }).catch(() => { if (request === requestRef.current) setError(true); }).finally(() => { if (request === requestRef.current) setLoading(false); });
    return () => { requestRef.current += 1; };
  }, [activeSpace, appliedFilters, period, reportReady]);

  const ExportIcon = formatIcons[format];
  const disabled = !data || loading || Boolean(exporting) || (reportKind === "recap" && data.transactions.length === 0);
  const downloadLabel = format === "pdf" ? t("reports.downloadPDF") : format === "xlsx" ? t("reports.downloadXLSX") : t("reports.downloadCSV");
  const isManaged = data?.space.space_type === "managed";
  const summaryMetrics = data ? [
    [isManaged ? t("reports.funding") : t("reports.income"), formatCurrency(data.summary.income)],
    [isManaged ? t("reports.spending") : t("reports.expense"), formatCurrency(data.summary.expensePrincipal)],
    [isManaged ? t("reports.netFlow") : t("reports.netCashFlow"), formatCurrency(data.summary.netCashFlow)],
    [t("reports.transactions"), String(data.summary.transactionCount)],
  ] : [];

  return <div className="w-full space-y-5 pb-8">
    <PageHeader icon={Download} eyebrow={t("reports.eyebrow")} title={t("reports.title")} description={t("reports.description")} />
    <PageCard className="overflow-hidden p-4 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-base font-extrabold text-slate-900">{t("reports.chooseReport")}</h2><p className="mt-1 text-sm text-slate-600">{t("reports.chooseReportHint")}</p></div><div className="rounded-xl bg-kash-selected px-3 py-2 text-right"><p className="text-[11px] font-bold uppercase tracking-wide text-kash-emeraldDark">{t("reports.space")}</p><p className="text-sm font-extrabold text-slate-800">{activeSpace?.name ?? "-"}</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{(["recap", "financial"] as const).map((kind) => { const active = reportKind === kind; const Icon = kind === "recap" ? ReceiptText : WalletCards; return <button key={kind} type="button" onClick={() => setReportKind(kind)} className={`rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20 ${active ? "border-kash-emerald bg-kash-selected shadow-sm" : "border-slate-200 bg-white hover:border-kash-emerald/40"}`}><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-kash-emerald text-white" : "bg-slate-100 text-slate-600"}`}><Icon size={19} /></div><p className="mt-3 font-extrabold text-slate-900">{kind === "recap" ? t("reports.transactionRecap") : t("reports.financialReport")}</p><p className="mt-1 text-xs leading-5 text-slate-600">{kind === "recap" ? t("reports.recapDescription") : t("reports.financialPdfHint")}</p></button>; })}</div></PageCard>
    <PageCard className="p-4 sm:p-6"><h2 className="text-base font-extrabold text-slate-900">{t("reports.period")}</h2><p className="mt-1 text-sm text-slate-600">{t("reports.periodHint")}</p><div className="mt-5"><ReportPeriodPicker preset={preset} month={month} year={year} from={from} until={until} onPeriodChange={updatePeriod} onChange={(next) => { if (next.preset !== undefined) setPreset(next.preset); if (next.month !== undefined) setMonth(next.month); if (next.year !== undefined) setYear(next.year); if (next.from !== undefined) setFrom(next.from); if (next.until !== undefined) setUntil(next.until); }} /></div>{reportKind === "recap" ? <div className="mt-5 border-t border-slate-100 pt-5"><p className="text-sm font-extrabold text-slate-800">{t("reports.refineRecap")}</p><p className="mt-1 text-xs text-slate-600">{t("reports.refineRecapHint")}</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><SelectField label={t("reports.type")} value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value as TransactionRecapFilters["type"] }))}><option value="all">{t("reports.all")}</option><option value="income">{activeSpace?.space_type === "managed" ? t("reports.funding") : t("reports.income")}</option><option value="expense">{activeSpace?.space_type === "managed" ? t("reports.spending") : t("reports.expensePrincipal")}</option><option value="transfer">{t("reports.transfer")}</option><option value="external_transfer">{t("reports.externalTransfer")}</option><option value="adjustment">{t("reports.adjustment")}</option></SelectField><SelectField label={t("reports.wallet")} value={filters.walletId} onChange={(event) => setFilters((current) => ({ ...current, walletId: event.target.value }))}><option value="all">{t("reports.all")}</option>{data?.wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</SelectField><SelectField label={t("reports.category")} value={filters.categoryId} onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value }))}><option value="all">{t("reports.all")}</option>{data?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectField><SelectField label={t("reports.status")} value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as TransactionRecapFilters["status"] }))}><option value="completed">{t("reports.completed")}</option><option value="void">{t("reports.void")}</option><option value="all">{t("reports.all")}</option></SelectField></div></div> : null}</PageCard>
    <PageCard className="p-4 sm:p-6"><h2 className="text-base font-extrabold text-slate-900">{t("reports.exportAs")}</h2><p className="mt-1 text-sm text-slate-600">{t("reports.exportDescription")}</p><div className="mt-4 flex flex-wrap gap-2">{availableFormats.map((item) => { const Icon = formatIcons[item]; const active = format === item; return <button key={item} type="button" onClick={() => setFormat(item)} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20 ${active ? "border-kash-emerald bg-kash-emerald text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-kash-emerald/40"}`}><Icon size={16} />{item.toUpperCase()}</button>; })}</div></PageCard>
    {loading || (status === "authenticated" && spaceLoading) ? <PageCard className="p-6 text-sm font-bold text-slate-600">{t("reports.loading")}</PageCard> : error ? <PageCard><EmptyState icon={FileText} tone="expense" title={t("reports.errorTitle")} description={t("reports.errorDescription")} /></PageCard> : data ? <PageCard className="p-4 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-extrabold text-slate-900">{t("reports.reportSummary")}</p><p className="mt-1 text-sm text-slate-600">{data.period.label} · {data.space.name}</p></div><span className="rounded-full bg-kash-selected px-3 py-1 text-xs font-extrabold text-kash-emeraldDark">{selectedReportLabel} · {format.toUpperCase()}</span></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{summaryMetrics.map(([label, value]) => <SummaryItem key={label} label={label} value={value} />)}</div>{reportKind === "financial" ? <FinancialReportCharts data={data} labels={{ cashFlow: t("reports.cashFlowTrend"), category: t("reports.categoryBreakdown"), wallet: t("reports.cashOutByWallet"), income: isManaged ? t("reports.funding") : t("reports.income"), expense: isManaged ? t("reports.spending") : t("reports.expense"), net: isManaged ? t("reports.netFlow") : t("reports.netCashFlow"), noData: t("reports.chartEmpty") }} /> : null}{data.transactions.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{t("reports.emptyExportHint")}</div> : null}<div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">{reportKind === "financial" ? t("reports.financialPdfHint") : t("reports.recapExportHint")}</p><Button className="w-full sm:w-auto" disabled={disabled} isLoading={Boolean(exporting)} onClick={() => void runExport()}><ExportIcon size={17} />{downloadLabel}</Button></div>{exportError ? <p className="mt-4 text-sm font-bold text-kash-expense">{t("reports.exportError")}</p> : null}</PageCard> : null}
  </div>;
}

function SummaryItem({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 truncate text-sm font-extrabold text-slate-800" title={value}>{value}</p></div>; }
