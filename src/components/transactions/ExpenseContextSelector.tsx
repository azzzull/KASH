import type { ExpenseContext } from "../../types/domain";
import { useI18n, type TranslationKey } from "../../i18n";

const contexts: ExpenseContext[] = ["personal", "work", "reimbursable"];
const contextLabels: Record<ExpenseContext, TranslationKey> = {
  personal: "expenseContext.personal",
  work: "expenseContext.work",
  reimbursable: "expenseContext.reimbursable",
};

export function ExpenseContextSelector({
  disabled = false,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (value: ExpenseContext) => void;
  value: ExpenseContext;
}) {
  const { t } = useI18n();

  return (
    <fieldset disabled={disabled}>
      <legend className="block text-sm font-bold text-slate-900">{t("expenseContext.label")}</legend>
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
        {contexts.map((context) => {
          const selected = value === context;
          return (
            <button
              aria-pressed={selected}
              className={`min-h-10 rounded-md px-2 py-2 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20 ${
                selected
                  ? "bg-white text-kash-emeraldDark shadow-sm"
                  : "text-slate-600 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-white/70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-slate-900"
              }`}
              key={context}
              onClick={() => onChange(context)}
              type="button"
            >
              {t(contextLabels[context])}
            </button>
          );
        })}
      </div>
      {value === "work" ? <p className="mt-1.5 text-xs font-semibold text-slate-600">{t("expenseContext.workHint")}</p> : null}
      {value === "reimbursable" ? <p className="mt-1.5 text-xs font-semibold text-slate-600">{t("expenseContext.reimbursableHint")}</p> : null}
    </fieldset>
  );
}
