import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Loader2,
  ReceiptText,
} from "lucide-react";

import { CounterpartyCombobox } from "./CounterpartyCombobox";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { SelectField } from "../ui/SelectField";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

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
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [title, setTitle] = useState("");
  const [transactionDate, setTransactionDate] = useState(getTodayLocalDate());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active wallets list
  const activeWallets = useMemo(() => {
    return wallets.filter((w) => !w.is_archived);
  }, [wallets]);

  // Selected wallet object
  const selectedWallet = useMemo(() => {
    return activeWallets.find((w) => w.id === walletId) ?? null;
  }, [activeWallets, walletId]);

  // Numeric parsed amount
  const parsedAmount = useMemo(() => {
    const raw = parseMoneyInputDigits(amount);
    return toNumber(raw);
  }, [amount]);

  // Reset form to defaults
  const resetForm = () => {
    setAmount("");
    setWalletId("");
    setCounterpartyName("");
    setTitle("");
    setTransactionDate(getTodayLocalDate());
    setError(null);
    setSaving(false);
  };

  // Load prerequisites when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    async function loadPrerequisites() {
      setLoadingData(true);
      setError(null);

      try {
        const [walletsRes, cpRes] = await Promise.all([
          getWallets(),
          getCounterparties(),
        ]);

        if (!isMounted) return;

        if (walletsRes.data) {
          setWallets(walletsRes.data);
        }

        if (cpRes && cpRes.allCounterparties) {
          setCounterparties(cpRes.allCounterparties);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(
          err?.message ?? "Failed to load wallets or counterparties.",
        );
      } finally {
        if (isMounted) {
          setLoadingData(false);
        }
      }
    }

    void loadPrerequisites();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const close = () => {
    if (saving) return;
    resetForm();
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const rawDigits = parseMoneyInputDigits(amount);
    const numAmount = toNumber(rawDigits);

    if (!rawDigits || numAmount <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }

    if (!walletId) {
      setError("Please select the wallet used to pay.");
      return;
    }

    const trimmedCounterparty = counterpartyName.trim();
    if (!trimmedCounterparty) {
      setError("Please specify who will reimburse you.");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Please specify a description / title for the expense.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Resolve or create counterparty
      const cpResult = await findOrCreateCounterparty(
        trimmedCounterparty,
      );

      if (cpResult.error || !cpResult.data) {
        throw new Error(
          cpResult.error?.message ??
            "Failed to resolve counterparty.",
        );
      }

      const cpId = cpResult.data.id;

      // 2. Construct single-item reimbursable obligation
      const result = await createMultipleDebts(
        [
          {
            counterpartyId: cpId,
            type: "receivable",
            title: trimmedTitle,
            originalAmount: rawDigits,
            dueDate: null,
            note: "Recorded via Reimbursable Expense Quick Entry",
          },
        ],
        {
          walletId,
          counterpartyName: trimmedCounterparty,
        },
      );

      if (result.error) {
        throw new Error(result.error.message);
      }

      // 3. Notify app of state updates
      emitDebtSaved();
      emitTransactionSaved();

      close();
    } catch (err: any) {
      setError(
        err?.message ??
          "An error occurred while saving. Please try again.",
      );
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      maxWidth="md"
      dismissible={!saving}
      title={
        <div className="flex items-center gap-2">
          <ReceiptText
            className="text-kash-emerald"
            size={24}
            strokeWidth={2.5}
          />
          <span>Reimbursable Expense</span>
        </div>
      }
      description="Record an expense you paid first and expect someone else to reimburse."
    >
      {loadingData ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-slate-600">
          <Loader2 className="animate-spin" size={18} />
          Loading...
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <FormField
            id="reimbursable-amount"
            inputMode="numeric"
            label="Amount *"
            onChange={(event) =>
              setAmount(formatMoneyDigits(event.target.value))
            }
            placeholder="300.000"
            required
            value={amount}
          />

          <SelectField
            id="reimbursable-wallet"
            label="Paid From Wallet *"
            onChange={(event) => setWalletId(event.target.value)}
            required
            value={walletId}
          >
            <option value="">
              Select a wallet...
            </option>

            {activeWallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name} (
                {formatCurrency(
                  wallet.balance?.current_balance ?? wallet.initial_balance,
                  wallet.currency,
                )}
                )
              </option>
            ))}
          </SelectField>

          <CounterpartyCombobox
            id="reimbursable-counterparty"
            counterparties={counterparties}
            onChange={(name) => setCounterpartyName(name)}
            value={counterpartyName}
            label="Reimbursed By *"
            placeholder="e.g. Office, Company, John Doe..."
            required
          />

          <FormField
            id="reimbursable-title"
            label="Description *"
            onChange={(event) => setTitle(event.target.value)}
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
                <span className="font-semibold text-slate-600">Wallet</span>
                <span className="font-black text-kash-expense">
                  -{formatCurrency(parsedAmount, "IDR")}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="font-semibold text-slate-600">Receivable</span>
                <span className="font-black text-kash-emeraldDark">
                  +{formatCurrency(parsedAmount, "IDR")}
                </span>
              </div>

              <div className="flex justify-between gap-4 border-t border-slate-200 pt-1.5">
                <span className="font-semibold text-slate-600">Reimbursed By</span>
                <span className="max-w-[180px] truncate font-black text-slate-900">
                  {counterpartyName.trim() || "—"}
                </span>
              </div>

              {selectedWallet ? (
                <div className="flex justify-between gap-4">
                  <span className="font-semibold text-slate-600">Paid From</span>
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

          <div className="mt-6 flex justify-end gap-3 pt-2">
            <Button
              disabled={saving}
              onClick={close}
              type="button"
              variant="secondary"
            >
              Batal
            </Button>

            <Button disabled={saving} type="submit">
              {saving ? <Loader2 className="animate-spin" size={16} /> : null}
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}