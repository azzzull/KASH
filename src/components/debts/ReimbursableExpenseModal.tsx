import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { FormEvent, Fragment, useMemo, useState } from "react";
import { ReceiptText, X } from "lucide-react";
import { useData } from "../../context/DataContext";
import { createMultipleDebts } from "../../lib/debts";
import { createCounterparty } from "../../lib/counterparties";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../../lib/money";
import { getLocalDateString } from "../../lib/utils";
import { CounterpartyCombobox } from "./CounterpartyCombobox";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { SelectField } from "../ui/SelectField";
import type { Counterparty } from "../../types/domain";

type ReimbursableExpenseModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function ReimbursableExpenseModal({ isOpen, onClose }: ReimbursableExpenseModalProps) {
  const { categories, counterparties, forceRefresh, wallets } = useData();

  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [transactionDate, setTransactionDate] = useState(getLocalDateString());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const expenseCategories = useMemo(() => categories.filter((c) => c.type === "expense"), [categories]);
  const activeWallets = useMemo(() => wallets.filter((w) => !w.is_archived), [wallets]);

  const close = () => {
    if (saving) return;
    setAmount("");
    setWalletId("");
    setCounterpartyName("");
    setCategoryId("");
    setTitle("");
    setTransactionDate(getLocalDateString());
    setError(null);
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!walletId) {
      setError("Please select the wallet this was paid from.");
      return;
    }
    if (!counterpartyName.trim()) {
      setError("Please specify who will reimburse this expense.");
      return;
    }
    if (!title.trim()) {
      setError("Please provide a description (e.g. 'Team Lunch').");
      return;
    }

    const digits = parseMoneyInputDigits(amount);
    if (!digits || toNumber(digits) <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let finalCounterpartyId: string;
      const existing = counterparties.find(
        (cp) => cp.name.toLowerCase() === counterpartyName.trim().toLowerCase()
      );

      if (existing) {
        finalCounterpartyId = existing.id;
      } else {
        const result = await createCounterparty(counterpartyName.trim());
        if (result.error || !result.data) {
          throw new Error("Failed to create counterparty");
        }
        finalCounterpartyId = result.data.id;
      }

      const res = await createMultipleDebts(
        [
          {
            counterpartyId: finalCounterpartyId,
            originalAmount: amount,
            title: title.trim(),
            type: "receivable",
            dueDate: null,
            note: null,
            categoryId: categoryId || null,
          }
        ],
        {
          walletId: walletId,
          counterpartyName: counterpartyName.trim()
        }
      );

      if (res.error) throw res.error;

      forceRefresh();
      close();
    } catch (err: any) {
      console.error("Failed to create reimbursable expense:", err);
      setError("An error occurred while saving. Please try again.");
      setSaving(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={close}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="mb-6 flex items-center justify-between">
                  <DialogTitle as="h3" className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <ReceiptText className="text-teal-600" size={24} strokeWidth={2.5} />
                    Reimbursable Expense
                  </DialogTitle>
                  <button
                    className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none"
                    onClick={close}
                  >
                    <X size={20} strokeWidth={2.5} />
                  </button>
                </div>

                <form className="space-y-4" onSubmit={submit}>
                  <FormField
                    id="reimbursable-amount"
                    inputMode="numeric"
                    label="Amount *"
                    onChange={(event) => setAmount(formatMoneyDigits(event.target.value))}
                    placeholder="300.000"
                    required
                    value={amount}
                  />

                  <SelectField
                    id="reimbursable-wallet"
                    label="Paid From Wallet *"
                    onChange={(e) => setWalletId(e.target.value)}
                    required
                    value={walletId}
                  >
                    <option disabled value="">Select a wallet...</option>
                    {activeWallets.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </SelectField>

                  <CounterpartyCombobox
                    counterparties={counterparties}
                    onChange={(name) => setCounterpartyName(name)}
                    value={counterpartyName}
                    label="Reimbursed By *"
                    placeholder="e.g. Office, John Doe..."
                  />

                  <FormField
                    id="reimbursable-title"
                    label="Description *"
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Team Lunch, Client Meeting..."
                    required
                    value={title}
                  />

                  <SelectField
                    id="reimbursable-category"
                    label="Category (Informational only)"
                    onChange={(e) => setCategoryId(e.target.value)}
                    value={categoryId}
                  >
                    <option value="">No category (Optional)</option>
                    {expenseCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </SelectField>

                  <DatePickerField
                    id="reimbursable-date"
                    label="Date"
                    onChange={setTransactionDate}
                    value={transactionDate}
                  />

                  {error ? <div className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</div> : null}

                  <div className="mt-8 flex justify-end gap-3">
                    <button
                      className="rounded-lg px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100 focus:outline-none"
                      onClick={close}
                      type="button"
                    >
                      Batal
                    </button>
                    <button
                      className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700 focus:outline-none disabled:opacity-50"
                      disabled={saving}
                      type="submit"
                    >
                      {saving ? "Menyimpan..." : "Simpan"}
                    </button>
                  </div>
                </form>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
