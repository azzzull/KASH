import { ArrowDown, ArrowRightLeft, ArrowUp, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { SelectField } from "../ui/SelectField";
import { getActiveCategories } from "../../lib/categories";
import { formatCurrency, formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../../lib/money";
import { createExpense, createIncome, createTransfer, filterCategoriesByType } from "../../lib/transactions";
import { getWallets, type WalletWithBalance } from "../../lib/wallets";
import type { Category } from "../../types/domain";

export type QuickTransactionMode = "expense" | "income" | "transfer";

type TransactionModalProps = {
  mode: QuickTransactionMode;
  onClose: () => void;
  onSaved?: () => void;
};

const modeCopy: Record<
  QuickTransactionMode,
  {
    accent: string;
    icon: typeof ArrowDown;
    title: string;
    submitLabel: string;
  }
> = {
  expense: { accent: "text-kash-expense", icon: ArrowDown, submitLabel: "Save Expense", title: "New Expense" },
  income: { accent: "text-kash-income", icon: ArrowUp, submitLabel: "Save Income", title: "New Income" },
  transfer: { accent: "text-kash-transfer", icon: ArrowRightLeft, submitLabel: "Transfer", title: "Transfer" },
};

function currentLocalDateTimeValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function firstValue<T extends { id: string }>(items: T[]) {
  return items[0]?.id ?? "";
}

export function TransactionModal({ mode, onClose, onSaved }: TransactionModalProps) {
  const copy = modeCopy[mode];
  const Icon = copy.icon;
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [walletId, setWalletId] = useState("");
  const [destinationWalletId, setDestinationWalletId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [transferFee, setTransferFee] = useState("0");
  const [transactionDate, setTransactionDate] = useState(currentLocalDateTimeValue());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    const [walletResult, categoryResult] = await Promise.all([getWallets(), getActiveCategories()]);

    if (walletResult.error || categoryResult.error || !walletResult.data || !categoryResult.data) {
      setError("Couldn't load wallets and categories. Please try again.");
      setLoading(false);
      return;
    }

    setWallets(walletResult.data);
    setCategories(categoryResult.data);
    setWalletId((current) => current || firstValue(walletResult.data));
    setDestinationWalletId((current) => current || walletResult.data.find((wallet) => wallet.id !== walletResult.data?.[0]?.id)?.id || "");

    const nextCategories = filterCategoriesByType(categoryResult.data, mode === "income" ? "income" : "expense");
    setCategoryId((current) => current || firstValue(nextCategories));
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const nextCategories = filterCategoriesByType(categories, mode === "income" ? "income" : "expense");
    setCategoryId(firstValue(nextCategories));
  }, [categories, mode]);

  const selectedWallet = wallets.find((wallet) => wallet.id === walletId) ?? null;
  const destinationWallet = wallets.find((wallet) => wallet.id === destinationWalletId) ?? null;
  const filteredCategories = useMemo(
    () => filterCategoriesByType(categories, mode === "income" ? "income" : "expense"),
    [categories, mode],
  );
  const amountDigits = parseMoneyInputDigits(amount);
  const feeDigits = parseMoneyInputDigits(transferFee);
  const amountNumber = toNumber(amountDigits);
  const feeNumber = toNumber(feeDigits);
  const totalDeducted = amountNumber + feeNumber;

  const validate = () => {
    if (!walletId) return "Choose a wallet.";
    if (!amountDigits || amountNumber <= 0) return "Amount must be greater than zero.";
    if (!transactionDate) return "Choose a transaction date.";

    if (mode === "transfer") {
      if (!destinationWalletId) return "Choose a destination wallet.";
      if (walletId === destinationWalletId) return "Source and destination wallets must be different.";
      if (feeNumber < 0) return "Transfer fee cannot be negative.";
      return null;
    }

    if (!categoryId) return `Choose an ${mode} category.`;
    return null;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    const noteValue = note.trim() || null;
    const categoryName = filteredCategories.find((category) => category.id === categoryId)?.name ?? null;

    try {
      const result =
        mode === "income"
          ? await createIncome({
              amount: amountDigits,
              categoryId,
              note: noteValue,
              title: noteValue ?? categoryName,
              transactionDate,
              walletId,
            })
          : mode === "expense"
            ? await createExpense({
                amount: amountDigits,
                categoryId,
                note: noteValue,
                title: noteValue ?? categoryName,
                transactionDate,
                walletId,
              })
            : await createTransfer({
                amount: amountDigits,
                destinationWalletId,
                note: noteValue,
                transactionDate,
                transferFee: feeDigits || "0",
                walletId,
              });

      if (result.error) {
        console.error("Failed to create transaction", result.error);
        setError("Couldn't save this transaction. Please check the details and try again.");
        setSaving(false);
        return;
      }

      window.dispatchEvent(new CustomEvent("kash:transaction-saved"));
      onSaved?.();
      onClose();
    } catch (transactionError) {
      console.error("Failed to create transaction", transactionError);
      setError("Couldn't save this transaction. Please sign in and try again.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/35" role="dialog" aria-modal="true">
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close transaction form" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-soft md:left-1/2 md:top-1/2 md:bottom-auto md:max-h-[86vh] md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100">
              <Icon aria-hidden="true" className={copy.accent} size={21} />
            </span>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">{copy.title}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                {mode === "transfer" ? "Move money between your own wallets." : "Record one completed transaction."}
              </p>
            </div>
          </div>
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-5 grid gap-3">
            <div className="h-12 rounded-lg bg-slate-100" />
            <div className="h-12 rounded-lg bg-slate-100" />
            <div className="h-12 rounded-lg bg-slate-100" />
          </div>
        ) : (
          <form className="mt-5 grid gap-4" onSubmit={submit}>
            <FormField
              id={`${mode}-amount`}
              inputMode="numeric"
              label="Amount"
              onChange={(event) => setAmount(formatMoneyDigits(event.target.value))}
              placeholder="125.000"
              value={amount}
            />

            {mode !== "transfer" ? (
              <SelectField id={`${mode}-category`} label="Category" onChange={(event) => setCategoryId(event.target.value)} value={categoryId}>
                {filteredCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </SelectField>
            ) : null}

            <SelectField id={`${mode}-wallet`} label={mode === "transfer" ? "From" : "Wallet"} onChange={(event) => setWalletId(event.target.value)} value={walletId}>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name} / {formatCurrency(wallet.balance?.current_balance ?? wallet.initial_balance, wallet.currency)}
                </option>
              ))}
            </SelectField>

            {mode === "transfer" ? (
              <>
                <SelectField id="transfer-destination" label="To" onChange={(event) => setDestinationWalletId(event.target.value)} value={destinationWalletId}>
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name} / {formatCurrency(wallet.balance?.current_balance ?? wallet.initial_balance, wallet.currency)}
                    </option>
                  ))}
                </SelectField>
                <FormField
                  id="transfer-fee"
                  inputMode="numeric"
                  label="Transfer Fee"
                  onChange={(event) => setTransferFee(formatMoneyDigits(event.target.value))}
                  placeholder="0"
                  value={transferFee}
                />
              </>
            ) : null}

            <FormField
              id={`${mode}-date`}
              label="Date"
              onChange={(event) => setTransactionDate(event.target.value)}
              type="datetime-local"
              value={transactionDate}
            />
            <FormField id={`${mode}-note`} label="Note" onChange={(event) => setNote(event.target.value)} placeholder="Optional note" value={note} />

            {mode === "transfer" ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-extrabold text-slate-900">Transfer Summary</p>
                <dl className="mt-3 grid gap-2 text-sm font-semibold text-slate-700">
                  <div className="flex justify-between gap-4">
                    <dt>From {selectedWallet?.name ?? "-"}</dt>
                    <dd>{formatCurrency(amountNumber, selectedWallet?.currency ?? "IDR")}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Fee</dt>
                    <dd>{formatCurrency(feeNumber, selectedWallet?.currency ?? "IDR")}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-slate-900">
                    <dt>Total deducted</dt>
                    <dd>{formatCurrency(totalDeducted, selectedWallet?.currency ?? "IDR")}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>{destinationWallet?.name ?? "Destination"} receives</dt>
                    <dd>{formatCurrency(amountNumber, destinationWallet?.currency ?? "IDR")}</dd>
                  </div>
                </dl>
              </div>
            ) : null}

            {mode === "transfer" && wallets.length < 2 ? (
              <p className="rounded-lg border border-kash-gold/40 bg-kash-gold/10 px-4 py-3 text-sm font-bold text-slate-900">
                Add another active wallet before creating a transfer.
              </p>
            ) : null}

            <Button disabled={saving || (mode === "transfer" && wallets.length < 2)} type="submit">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
              {copy.submitLabel}
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
