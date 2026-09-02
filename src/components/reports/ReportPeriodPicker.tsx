import { useEffect, useMemo } from "react";
import { DatePickerField } from "../ui/DatePickerField";
import { SelectField } from "../ui/SelectField";
import type { ReportPeriod, ReportPeriodPreset } from "../../types/reports";
import { useI18n } from "../../i18n";

type Props = { preset: ReportPeriodPreset; month: number; year: number; from: string; until: string; onChange: (next: { preset?: ReportPeriodPreset; month?: number; year?: number; from?: string; until?: string }) => void; onPeriodChange: (period: ReportPeriod) => void };

function localIso(year: number, month: number, day: number) { return new Date(year, month, day).toISOString(); }

export function ReportPeriodPicker({ preset, month, year, from, until, onChange, onPeriodChange }: Props) {
  const { formatMonthYear, t } = useI18n();
  const period = useMemo<ReportPeriod>(() => {
    const now = new Date();
    if (preset === "this_month") return { preset, start: localIso(now.getFullYear(), now.getMonth(), 1), end: localIso(now.getFullYear(), now.getMonth() + 1, 1), label: formatMonthYear(new Date(now.getFullYear(), now.getMonth(), 1)) };
    if (preset === "last_month") return { preset, start: localIso(now.getFullYear(), now.getMonth() - 1, 1), end: localIso(now.getFullYear(), now.getMonth(), 1), label: formatMonthYear(new Date(now.getFullYear(), now.getMonth() - 1, 1)) };
    if (preset === "this_year") return { preset, start: localIso(now.getFullYear(), 0, 1), end: localIso(now.getFullYear() + 1, 0, 1), label: String(now.getFullYear()), year: now.getFullYear() };
    if (preset === "custom_range") {
      const start = from ? new Date(`${from}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = until ? new Date(`${until}T00:00:00`) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { preset, start: start.toISOString(), end: new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1).toISOString(), label: `${from} – ${until}` };
    }
    return { preset, start: localIso(year, month, 1), end: localIso(year, month + 1, 1), label: formatMonthYear(new Date(year, month, 1)), month, year };
  }, [formatMonthYear, from, month, preset, until, year]);

  useEffect(() => { onPeriodChange(period); }, [onPeriodChange, period]);
  const months = Array.from({ length: 12 }, (_, index) => ({ value: index, label: formatMonthYear(new Date(2026, index, 1)).replace(/\s+2026$/, "") }));
  const years = Array.from({ length: 8 }, (_, index) => new Date().getFullYear() - 5 + index);
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <SelectField label={t("reports.period")} value={preset} onChange={(event) => onChange({ preset: event.target.value as ReportPeriodPreset })}>
      <option value="this_month">{t("reports.thisMonth")}</option><option value="last_month">{t("reports.lastMonth")}</option><option value="specific_month">{t("reports.specificMonth")}</option><option value="this_year">{t("reports.thisYear")}</option><option value="custom_range">{t("reports.customRange")}</option>
    </SelectField>
    {preset === "specific_month" ? <><SelectField label={t("reports.month")} value={String(month)} onChange={(event) => onChange({ month: Number(event.target.value) })}>{months.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectField><SelectField label={t("reports.year")} value={String(year)} onChange={(event) => onChange({ year: Number(event.target.value) })}>{years.map((value) => <option key={value} value={value}>{value}</option>)}</SelectField></> : null}
    {preset === "custom_range" ? <><DatePickerField label={t("reports.from")} value={from} onChange={(value) => onChange({ from: value.slice(0, 10) })} /><DatePickerField label={t("reports.until")} value={until} min={from} onChange={(value) => onChange({ until: value.slice(0, 10) })} /></> : null}
  </div>;
}
