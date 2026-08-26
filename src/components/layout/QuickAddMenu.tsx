import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  ReceiptText,
} from "lucide-react";
import type { QuickTransactionMode } from "../transactions/TransactionModal";
import { Modal } from "../ui/Modal";
import { useI18n } from "../../i18n";
import { useSpaceTerminology } from "../../hooks/useSpaceTerminology";

export type QuickAddMode =
  | QuickTransactionMode
  | "reimbursable_expense";

type QuickAddMenuProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: QuickAddMode) => void;
};

export function QuickAddMenu({
  open,
  onClose,
  onSelect,
}: QuickAddMenuProps) {
  const { t } = useI18n();
  const terms = useSpaceTerminology();

  const actions: Array<{
    helper: string;
    icon: typeof ArrowDown | typeof ReceiptText;
    label: string;
    mode: QuickAddMode;
    tone: string;
  }> = [
    {
      label: terms.isManaged ? terms.addExpenseLabel : t("quickAdd.expense"),
      helper: terms.isManaged
        ? t("quickAdd.managedExpenseHelper")
        : t("quickAdd.expenseHelper"),
      icon: ArrowDown,
      mode: "expense",
      tone: "text-kash-expense",
    },
    {
      label: terms.isManaged ? terms.addIncomeLabel : t("quickAdd.income"),
      helper: terms.isManaged
        ? t("quickAdd.managedIncomeHelper")
        : t("quickAdd.incomeHelper"),
      icon: ArrowUp,
      mode: "income",
      tone: "text-kash-income",
    },
    {
      label: t("quickAdd.transfer"),
      helper: terms.isManaged
        ? t("quickAdd.managedTransferHelper")
        : t("quickAdd.transferHelper"),
      icon: ArrowRightLeft,
      mode: "transfer",
      tone: "text-kash-transfer",
    },
    {
      label: t("quickAdd.reimbursable"),
      helper: t("quickAdd.reimbursableHelper"),
      icon: ReceiptText,
      mode: "reimbursable_expense",
      tone: "text-teal-600",
    },
  ];

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      maxWidth="sm"
      title={t("quickAdd.title")}
    >
      <div className="grid gap-1.5 pt-1 pb-2">
        {actions.map((action) => (
          <button
            key={action.mode}
            className="flex touch-manipulation items-center justify-between rounded-xl p-3 text-left transition [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-selected/70 active:scale-[0.99] active:bg-kash-selected focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20"
            onClick={() => {
              onClose();
              onSelect(action.mode);
            }}
            type="button"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-kash-selected">
                <action.icon
                  aria-hidden="true"
                  className={action.tone}
                  size={21}
                  strokeWidth={2.2}
                />
              </span>

              <span>
                <span className="block text-sm font-extrabold text-slate-900">
                  {action.label}
                </span>

                <span className="block text-xs font-medium text-slate-600">
                  {action.helper}
                </span>
              </span>
            </span>

            <span className="text-slate-400 font-bold text-base">&rsaquo;</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
