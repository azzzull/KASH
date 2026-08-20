import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import {
  FormEvent,
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Loader2,
  ReceiptText,
  X,
} from "lucide-react";

import { CounterpartyCombobox } from "./CounterpartyCombobox";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { SelectField } from "../ui/SelectField";

import {
  createMultipleDebts,
  findOrCreateCounterparty,
  getCounterparties,
} from "../../lib/debts";

import {
  getWallets,
  type WalletWithBalance,
} from "../../lib/wallets";

import {
  emitDebtSaved,
  emitTransactionSaved,
} from "../../lib/appEvents";

import {
  formatCurrency,
  formatMoneyDigits,
  parseMoneyInputDigits,
  toNumber,
} from "../../lib/money";

import type { Counterparty } from "../../types/domain";

type ReimbursableExpenseModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

function getTodayLocalDate() {
  const now = new Date();
  const local = new Date(
    now.getTime() - now.getTimezoneOffset() * 60_000,
  );

  return local.toISOString().slice(0, 10);
}

export function ReimbursableExpenseModal({
  isOpen,
  onClose,
}: ReimbursableExpenseModalProps) {
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [title, setTitle] = useState("");
  const [transactionDate, setTransactionDate] = useState(
    getTodayLocalDate(),
  );

  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);

  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeWallets = useMemo(
    () => wallets.filter((wallet) => !wallet.is_archived),
    [wallets],
  );

  const selectedWallet = useMemo(
    () => activeWallets.find((wallet) => wallet.id === walletId),
    [activeWallets, walletId],
  );

  const parsedAmount = useMemo(
    () => toNumber(parseMoneyInputDigits(amount) || "0"),
    [amount],
  );

  /*
   * Load data only when the modal is opened.
   *
   * We intentionally use the same services as DebtsPage instead of
   * depending on a separate DataContext.
   */
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const loadData = async () => {
      setLoadingData(true);
      setError(null);

      try {
        const [walletResult, counterpartyResult] = await Promise.all([
          getWallets(),
          getCounterparties({
            type: "all",
            status: "all",
            query: "",
          }),
        ]);

        if (cancelled) return;

        if (walletResult.error) {
          throw walletResult.error;
        }

        const loadedWallets = walletResult.data ?? [];

        setWallets(loadedWallets);
        setCounterparties(counterpartyResult.allCounterparties ?? []);

        const firstActiveWallet = loadedWallets.find(
          (wallet) => !wallet.is_archived,
        );

        if (firstActiveWallet) {
          setWalletId((current) => current || firstActiveWallet.id);
        }
      } catch (err) {
        console.error(
          "Failed to load reimbursable expense data:",
          err,
        );

        if (!cancelled) {
          setError(
            "Failed to load wallets or counterparties. Please try again.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const resetForm = () => {
    setAmount("");
    setWalletId("");
    setCounterpartyName("");
    setTitle("");
    setTransactionDate(getTodayLocalDate());
    setError(null);
  };

  const close = () => {
    if (saving) return;

    resetForm();
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (saving) return;

    if (!walletId) {
      setError("Please select the wallet this expense was paid from.");
      return;
    }

    if (!counterpartyName.trim()) {
      setError("Please specify who will reimburse this expense.");
      return;
    }

    if (!title.trim()) {
      setError(
        "Please provide a description, for example Team Lunch or Office Purchase.",
      );
      return;
    }

    const rawAmount = parseMoneyInputDigits(amount);

    if (!rawAmount || toNumber(rawAmount) <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      /*
       * Resolve existing counterparty or create a new one.
       *
       * This is the exact same pattern used by
       * CreateObligationModal in DebtsPage.
       */
      const {
        data: counterparty,
        error: counterpartyError,
      } = await findOrCreateCounterparty(
        counterpartyName.trim(),
      );

      if (counterpartyError || !counterparty) {
        throw (
          counterpartyError ??
          new Error("Failed to resolve counterparty.")
        );
      }

      /*
       * Reimbursable expense = Receivable + Wallet Outflow
       *
       * Example:
       *
       * Office lunch Rp300k paid using BCA
       *
       * BCA:
       *   -Rp300k
       *
       * Receivable from Office:
       *   +Rp300k outstanding
       *
       * Later, when Office reimburses the user through
       * SettlementModal, the money comes back into the
       * selected wallet and the receivable is reduced.
       */
      const { error: batchError } = await createMultipleDebts(
        [
          {
            counterpartyId: counterparty.id,
            type: "receivable",
            title: title.trim(),
            originalAmount: rawAmount,
            dueDate: null,
            note: transactionDate
              ? `Reimbursable expense • ${transactionDate}`
              : "Reimbursable expense",
          },
        ],
        {
          walletId,
          counterpartyName: counterparty.name,
        },
      );

      if (batchError) {
        throw batchError;
      }

      /*
       * createMultipleDebts with walletId affects BOTH:
       * - debt/receivable
       * - transaction/wallet
       *
       * Therefore both application events must fire.
       */
      emitDebtSaved();
      emitTransactionSaved();

      resetForm();
      onClose();
    } catch (err: any) {
      console.error(
        "Failed to create reimbursable expense:",
        err,
      );

      setError(
        err?.message ??
        "An error occurred while saving. Please try again.",
      );

      setSaving(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        onClose={close}
      >
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-900/60" />
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
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <DialogTitle
                      as="h3"
                      className="flex items-center gap-2 text-lg font-bold text-slate-900"
                    >
                      <ReceiptText
                        className="text-kash-emerald"
                        size={24}
                        strokeWidth={2.5}
                      />

                      Reimbursable Expense
                    </DialogTitle>

                    <p className="mt-1 text-xs font-semibold text-slate-600">
                      Record an expense you paid first and expect
                      someone else to reimburse.
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-label="Close"
                    className="shrink-0 rounded-full p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none"
                    onClick={close}
                  >
                    <X size={20} strokeWidth={2.5} />
                  </button>
                </div>

                {loadingData ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-slate-600">
                    <Loader2
                      className="animate-spin"
                      size={18}
                    />
                    Loading...
                  </div>
                ) : (
                  <form
                    className="space-y-4"
                    onSubmit={submit}
                  >
                    <FormField
                      id="reimbursable-amount"
                      inputMode="numeric"
                      label="Amount *"
                      onChange={(event) =>
                        setAmount(
                          formatMoneyDigits(event.target.value),
                        )
                      }
                      placeholder="300.000"
                      required
                      value={amount}
                    />

                    <SelectField
                      id="reimbursable-wallet"
                      label="Paid From Wallet *"
                      onChange={(event) =>
                        setWalletId(event.target.value)
                      }
                      required
                      value={walletId}
                    >
                      <option disabled value="">
                        Select a wallet...
                      </option>

                      {activeWallets.map((wallet) => (
                        <option
                          key={wallet.id}
                          value={wallet.id}
                        >
                          {wallet.name} (
                          {formatCurrency(
                            wallet.balance?.current_balance ??
                            wallet.initial_balance,
                            wallet.currency,
                          )}
                          )
                        </option>
                      ))}
                    </SelectField>

                    <CounterpartyCombobox
                      id="reimbursable-counterparty"
                      counterparties={counterparties}
                      onChange={(name) =>
                        setCounterpartyName(name)
                      }
                      value={counterpartyName}
                      label="Reimbursed By *"
                      placeholder="e.g. Office, Company, John Doe..."
                      required
                    />

                    <FormField
                      id="reimbursable-title"
                      label="Description *"
                      onChange={(event) =>
                        setTitle(event.target.value)
                      }
                      placeholder="e.g. Team Lunch, Client Meeting..."
                      required
                      value={title}
                    />

                    <DatePickerField
                      id="reimbursable-date"
                      label="Expense Date"
                      onChange={setTransactionDate}
                      value={transactionDate}
                    />

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                        Transaction Preview
                      </p>

                      <div className="mt-2 space-y-1.5 text-xs">
                        <div className="flex justify-between gap-4">
                          <span className="font-semibold text-slate-600">
                            Wallet
                          </span>

                          <span className="font-black text-kash-expense">
                            -{formatCurrency(parsedAmount, "IDR")}
                          </span>
                        </div>

                        <div className="flex justify-between gap-4">
                          <span className="font-semibold text-slate-600">
                            Receivable
                          </span>

                          <span className="font-black text-kash-emeraldDark">
                            +{formatCurrency(parsedAmount, "IDR")}
                          </span>
                        </div>

                        <div className="flex justify-between gap-4 border-t border-slate-200 pt-1.5">
                          <span className="font-semibold text-slate-600">
                            Reimbursed By
                          </span>

                          <span className="max-w-[180px] truncate font-black text-slate-900">
                            {counterpartyName.trim() || "—"}
                          </span>
                        </div>

                        {selectedWallet ? (
                          <div className="flex justify-between gap-4">
                            <span className="font-semibold text-slate-600">
                              Paid From
                            </span>

                            <span className="font-black text-slate-900">
                              {selectedWallet.name}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {error ? (
                      <div className="rounded-lg border border-kash-expense/30 bg-kash-expense/10 p-3 text-sm font-semibold text-kash-expense">
                        {error}
                      </div>
                    ) : null}

                    <div className="mt-8 flex justify-end gap-3">
                      <button
                        className="rounded-lg px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none"
                        onClick={close}
                        type="button"
                      >
                        Batal
                      </button>

                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-kash-emerald px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-kash-emeraldDark focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={saving}
                        type="submit"
                      >
                        {saving ? (
                          <>
                            <Loader2
                              className="animate-spin"
                              size={16}
                            />
                            Menyimpan...
                          </>
                        ) : (
                          "Simpan"
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}