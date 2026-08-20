import { ArrowDown, ArrowRightLeft, ArrowUp, ReceiptText, X } from "lucide-react";
import type { QuickTransactionMode } from "../transactions/TransactionModal";
import { IconButton } from "../ui/IconButton";

type QuickAddMenuProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: QuickTransactionMode) => void;
};

const actions = [
  { label: "Expense", helper: "Catat pengeluaran", icon: ArrowDown, mode: "expense", tone: "text-kash-expense" },
  { label: "Income", helper: "Catat pemasukan", icon: ArrowUp, mode: "income", tone: "text-kash-income" },
  { label: "Transfer", helper: "Pindahkan uang antar wallet", icon: ArrowRightLeft, mode: "transfer", tone: "text-kash-transfer" },
  { label: "Reimbursable Expense", helper: "Catat pengeluaran yang akan diganti (talangan)", icon: ReceiptText, mode: "reimbursable_expense", tone: "text-teal-600" },
] satisfies Array<{
  helper: string;
  icon: typeof ArrowDown | typeof ReceiptText;
  label: string;
  mode: QuickTransactionMode;
  tone: string;
}>;

export function QuickAddMenu({ open, onClose, onSelect }: QuickAddMenuProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/25" role="dialog" aria-modal="true">
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close quick add" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-soft md:inset-x-auto md:bottom-24 md:right-8 md:w-96 md:rounded-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 md:hidden" />
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h2 className="text-base font-bold text-slate-900">Add Transaction</h2>
          <IconButton icon={X} label="Close quick add" onClick={onClose} />
        </div>
        <div className="mt-3 grid gap-1">
          {actions.map((action) => (
            <button
              key={action.label}
              className="flex items-center justify-between rounded-lg px-3 py-3 text-left transition hover:bg-kash-selected"
              onClick={() => onSelect(action.mode)}
              type="button"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-kash-selected">
                  <action.icon aria-hidden="true" className={action.tone} size={20} strokeWidth={2} />
                </span>
                <span>
                  <span className="block text-sm font-bold text-slate-900">{action.label}</span>
                  <span className="block text-xs font-medium text-slate-600">{action.helper}</span>
                </span>
              </span>
              <span className="text-slate-300">&gt;</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
