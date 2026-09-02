import { Download, FileSpreadsheet, FileText, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReportPeriodPicker } from "../components/reports/ReportPeriodPicker";
import { TransactionRecapPreview } from "../components/reports/TransactionRecapPreview";
import { Button } from "../components/ui/Button";
import { PageCard } from "../components/ui/PageCard";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { useActiveSpace } from "../context/ActiveSpaceContext";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { getTransactionRecapData } from "../lib/reports";
import type { ReportPeriod, ReportPeriodPreset, TransactionRecapData, TransactionRecapFilters } from "../types/reports";

export function ExportReportsPage() {
  const { activeSpace, loading: spaceLoading } = useActiveSpace();
  const { status } = useAuth();
  const { t } = useI18n();
  const now = new Date();
  const [preset, setPreset] = useState<ReportPeriodPreset>("this_month");
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [from, setFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
  const [until, setUntil] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`);
  const [period, setPeriod] = useState<ReportPeriod | null>(null);
  const [filters, setFilters] = useState<TransactionRecapFilters>({ type: "all", walletId: "all", categoryId: "all", status: "completed" });
  const [data, setData] = useState<TransactionRecapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestRef = useRef(0);
  const reportReady = status === "authenticated" && !spaceLoading && Boolean(activeSpace && period);
  const updatePeriod = useCallback((next: ReportPeriod) => setPeriod(next), []);

  useEffect(() => {
    if (!reportReady || !activeSpace || !period) { setData(null); setLoading(false); return; }
    const request = ++requestRef.current;
    setLoading(true); setError(false); setData(null);
    void getTransactionRecapData({ space: activeSpace, period, filters }).then((result) => {
      if (request === requestRef.current && result.space.id === activeSpace.id) setData(result);
    }).catch(() => { if (request === requestRef.current) setError(true); }).finally(() => { if (request === requestRef.current) setLoading(false); });
    return () => { requestRef.current += 1; };
  }, [activeSpace, filters, period, reportReady]);

  return <div className="mx-auto w-full space-y-5 pb-8"><PageHeader icon={Download} eyebrow={t("reports.eyebrow")} title={t("reports.title")} description={t("reports.description")} />
    <div className="grid gap-4 lg:grid-cols-2"><PageCard className="p-4 sm:p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-kash-emerald/10 text-kash-emerald"><ReceiptText size={20} /></div><div><h2 className="font-extrabold text-slate-900">{t("reports.transactionRecap")}</h2><p className="text-xs text-slate-600">{t("reports.recapDescription")}</p></div></div></PageCard><PageCard className="p-4 sm:p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><FileText size={20} /></div><div><h2 className="font-extrabold text-slate-900">{t("reports.financialReport")}</h2><p className="text-xs text-slate-600">{t("reports.financialReportDeferred")}</p></div></div></PageCard></div>
    <PageCard className="p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-extrabold text-slate-900">{t("reports.transactionRecap")}</h2><p className="text-xs text-slate-600">{t("reports.recapDescription")}</p></div><div className="text-right"><p className="text-xs font-bold text-slate-500">{t("reports.space")}</p><p className="text-sm font-extrabold text-slate-800">{activeSpace?.name ?? "—"}</p></div></div><div className="mt-5"><ReportPeriodPicker preset={preset} month={month} year={year} from={from} until={until} onPeriodChange={updatePeriod} onChange={(next) => { if (next.preset !== undefined) setPreset(next.preset); if (next.month !== undefined) setMonth(next.month); if (next.year !== undefined) setYear(next.year); if (next.from !== undefined) setFrom(next.from); if (next.until !== undefined) setUntil(next.until); }} /></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><SelectField label={t("reports.type")} value={filters.type} onChange={(e) => setFilters((current) => ({ ...current, type: e.target.value as TransactionRecapFilters["type"] }))}><option value="all">{t("reports.all")}</option><option value="income">{activeSpace?.space_type === "managed" ? t("reports.funding") : t("reports.income")}</option><option value="expense">{activeSpace?.space_type === "managed" ? t("reports.spending") : t("reports.expensePrincipal")}</option><option value="transfer">{t("reports.transfer")}</option><option value="external_transfer">{t("reports.externalTransfer")}</option><option value="adjustment">{t("reports.adjustment")}</option></SelectField><SelectField label={t("reports.wallet")} value={filters.walletId} onChange={(e) => setFilters((current) => ({ ...current, walletId: e.target.value }))}><option value="all">{t("reports.all")}</option>{data?.wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</SelectField><SelectField label={t("reports.category")} value={filters.categoryId} onChange={(e) => setFilters((current) => ({ ...current, categoryId: e.target.value }))}><option value="all">{t("reports.all")}</option>{data?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectField><SelectField label={t("reports.status")} value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value as TransactionRecapFilters["status"] }))}><option value="completed">{t("reports.completed")}</option><option value="void">{t("reports.void")}</option><option value="all">{t("reports.all")}</option></SelectField></div>
    </PageCard><TransactionRecapPreview data={data} loading={loading || (status === "authenticated" && spaceLoading)} error={error} />
    <PageCard className="p-4 sm:p-5"><h2 className="font-extrabold text-slate-900">{t("reports.exportAs")}</h2><p className="mt-1 text-sm text-slate-600">{t("reports.exportDeferred")}</p><div className="mt-4 flex flex-wrap gap-2"><Button disabled variant="secondary"><FileText size={16} />PDF</Button><Button disabled variant="secondary"><FileSpreadsheet size={16} />Excel</Button><Button disabled variant="secondary"><Download size={16} />CSV</Button></div></PageCard>
  </div>;
}
