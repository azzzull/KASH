import {
  ArrowDown,
  ArrowDownLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Filter,
  Loader2,
  ReceiptText,
  Search,
  SlidersHorizontal,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TransactionDetailPanel } from "../components/transactions/TransactionDetailPanel";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { DatePickerField } from "../components/ui/DatePickerField";
import { FormField } from "../components/ui/FormField";
import { IconButton } from "../components/ui/IconButton";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { createExpense, createIncome, createTransfer, filterCategoriesByType } from "../lib/transactions";
import {
  createAdjustment,
  getTransactions,
  type TransactionFilters,
  type TransactionPeriodFilter,
  type TransactionSort,
  type TransactionTypeFilter,
  type TransactionWithMeta,
  updateTransaction,
  voidTransaction,
} from "../lib/transactions";
import { formatCurrency, formatDatabaseMoneyDigits, formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../lib/money";
import { appEvents, emitTransactionSaved } from "../lib/appEvents";
import { useAppEvent } from "../hooks/useAppEvent";
import type { Category, TransactionStatus, TransactionType, Wallet } from "../types/domain";

type EditMode = "duplicate" | "edit";

const PAGE_SIZE = 30;

const typeOptions: Array<{ label: string; value: TransactionTypeFilter }> = [
  { label: "All", value: "all" },
  { label: "Income", value: "income" },
  { label: "Expense", value: "expense" },
  { label: "Transfer", value: "transfer" },
  { label: "Adjustment", value: "adjustment" },
];

const periodOptions: Array<{ label: string; value: TransactionPeriodFilter }> = [
  { label: "All Time", value: "all" },
  { label: "This Month", value: "this_month" },
  { label: "Last Month", value: "last_month" },
  { label: "This Year", value: "this_year" },
];

const statusOptions: Array<{ label: string; value: "all" | TransactionStatus }> = [
  { label: "All Status", value: "all" },
  { label: "Completed", value: "completed" },
  { label: "Voided", value: "void" },
];

const sortOptions: Array<{ label: string; value: TransactionSort }> = [
  { label: "Latest", value: "latest" },
  { label: "Oldest", value: "oldest" },
  { label: "Amount High", value: "amount_high" },
  { label: "Amount Low", value: "amount_low" },
];

const transactionTone: Record<TransactionType, string> = {
  adjustment: "text-slate-700",
  expense: "text-[#E50914]",
  income: "text-kash-emerald",
  transfer: "text-kash-transfer",
};

function currentLocalDateTimeValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toLocalDateTimeValue(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function parseSignedMoneyDigits(value: string) {
  const isNegative = value.trim().startsWith("-");
  const digits = parseMoneyInputDigits(value);
  if (!digits) return "";
  return `${isNegative ? "-" : ""}${digits}`;
}

function formatSignedMoneyInput(value: string) {
  const isNegative = value.trim().startsWith("-");
  const digits = parseMoneyInputDigits(value);
  if (!digits) return isNegative ? "-" : "";
  return `${isNegative ? "-" : ""}${formatMoneyDigits(digits)}`;
}

function transactionIcon(type: TransactionType) {
  if (type === "income") return ArrowDownLeft;
  if (type === "expense") return ArrowUpRight;
  if (type === "transfer") return ArrowRightLeft;
  return WalletCards;
}

function transactionTitle(transaction: TransactionWithMeta) {
  if (transaction.title) return transaction.title;
  if (transaction.type === "transfer") return `Transfer to ${transaction.destinationWallet?.name ?? "Wallet"}`;
  if (transaction.type === "adjustment") return "Balance Adjustment";
  return transaction.category?.name ?? (transaction.type === "income" ? "Income" : "Expense");
}

function transactionCategoryLabel(transaction: TransactionWithMeta) {
  if (transaction.type === "transfer") return "Transfer";
  if (transaction.type === "adjustment") return "Adjustment";
  return transaction.category?.name ?? "Uncategorized";
}

function transactionWalletLabel(transaction: TransactionWithMeta) {
  if (transaction.type === "transfer") {
    return `${transaction.wallet?.name ?? "Wallet"} -> ${transaction.destinationWallet?.name ?? "Wallet"}`;
  }

  return transaction.wallet?.name ?? "Wallet";
}

function signedAmount(transaction: TransactionWithMeta) {
  const amount = toNumber(transaction.amount);
  if (transaction.type === "income") return amount;
  if (transaction.type === "expense") return -amount;
  return amount;
}

function displayAmount(transaction: TransactionWithMeta, currency = "IDR") {
  if (transaction.type === "transfer") return formatCurrency(transaction.amount, currency);
  if (transaction.type === "adjustment") {
    const amount = toNumber(transaction.amount);
    return `${amount > 0 ? "+" : "-"}${formatCurrency(Math.abs(amount), currency)}`;
  }
  return formatCurrency(signedAmount(transaction), currency);
}

function groupTransactions(transactions: TransactionWithMeta[]) {
  const formatter = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const todayKey = formatter.format(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = formatter.format(yesterday);
  const groups = new Map<string, TransactionWithMeta[]>();

  transactions.forEach((transaction) => {
    const key = formatter.format(new Date(transaction.transaction_date));
    const label = key === todayKey ? "Today" : key === yesterdayKey ? "Yesterday" : key;
    groups.set(label, [...(groups.get(label) ?? []), transaction]);
  });

  return Array.from(groups.entries()).map(([label, items]) => ({ items, label }));
}

function clearableFilters(filters: TransactionFilters) {
  return Boolean(filters.query || filters.type !== "all" || filters.dateKey || filters.period !== "this_month" || filters.status !== "all" || filters.walletId || filters.categoryId || filters.sort !== "latest");
}

function advancedFilterCount(filters: TransactionFilters) {
  return Number(Boolean(filters.dateKey)) + Number(filters.period !== "this_month") + Number(filters.status !== "all") + Number(Boolean(filters.walletId)) + Number(Boolean(filters.categoryId));
}

function TransactionsSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3, 4].map((item) => (
        <div key={item} className="grid grid-cols-[auto_1fr_auto] gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-slate-100" />
          <div className="min-w-0">
            <div className="h-4 w-40 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-3 h-3 w-64 max-w-full animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="h-4 w-24 animate-pulse rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function TransactionRow({
  currency,
  isSelected,
  onSelect,
  transaction,
}: {
  currency: string;
  isSelected: boolean;
  onSelect: () => void;
  transaction: TransactionWithMeta;
}) {
  const Icon = transactionIcon(transaction.type);
  const date = new Date(transaction.transaction_date);
  const isVoid = transaction.status === "void";
  const timeLabel = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(date);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full border-b border-slate-100 text-left transition last:border-b-0 hover:bg-slate-50 md:border-b-0 ${
        isSelected ? "bg-kash-selected/70" : "bg-white"
      } ${isVoid ? "opacity-65" : ""}`}
    >
      <span className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-3 md:hidden">
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 ${transactionTone[transaction.type]}`}>
          <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-extrabold text-slate-900">{transactionTitle(transaction)}</span>
          <span className="mt-1 block truncate text-xs font-semibold text-slate-600">
            {transactionCategoryLabel(transaction)} • {transactionWalletLabel(transaction)}
          </span>
          {isVoid ? <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-extrabold text-slate-600">Voided</span> : null}
        </span>
        <span className="text-right">
          <span className={`block text-sm font-extrabold ${isVoid ? "text-slate-600 line-through" : transactionTone[transaction.type]}`}>
            {displayAmount(transaction, currency)}
          </span>
          <span className="mt-1 block text-xs font-bold text-slate-600">{timeLabel}</span>
        </span>
      </span>

      <span
        className="hidden items-center gap-4 px-3 py-2.5 text-sm md:grid"
        style={{ gridTemplateColumns: "40px minmax(0, 1fr) minmax(120px, 180px) 128px 64px 16px" }}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 ${transactionTone[transaction.type]}`}>
          <Icon aria-hidden="true" size={17} strokeWidth={2.2} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-bold text-slate-900">{transactionTitle(transaction)}</span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-slate-600">{transactionCategoryLabel(transaction)}</span>
          {isVoid ? <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-slate-600">Voided</span> : null}
        </span>
        <span className="min-w-0 truncate font-semibold text-slate-600">{transactionWalletLabel(transaction)}</span>
        <span className={`text-right font-extrabold ${isVoid ? "text-slate-600 line-through" : transactionTone[transaction.type]}`}>
          {displayAmount(transaction, currency)}
        </span>
        <span className="text-right font-semibold text-slate-600">{timeLabel}</span>
        <ArrowRight aria-hidden="true" className="justify-self-end text-slate-600" size={16} />
      </span>
    </button>
  );
}

function TransactionFormModal({
  categories,
  mode,
  onClose,
  onSaved,
  transaction,
  wallets,
}: {
  categories: Category[];
  mode: EditMode;
  onClose: () => void;
  onSaved: () => void;
  transaction: TransactionWithMeta;
  wallets: Wallet[];
}) {
  const isAmountError = (message: string | null) => {
    if (!message) return false;
    const normalizedMessage = message.toLowerCase();
    return normalizedMessage.includes("amount") || normalizedMessage.includes("balance");
  };
  const duplicateSourceWalletId = wallets.some((wallet) => wallet.id === transaction.wallet_id) ? transaction.wallet_id : wallets[0]?.id ?? "";
  const duplicateDestinationWalletId =
    transaction.destination_wallet_id && wallets.some((wallet) => wallet.id === transaction.destination_wallet_id)
      ? transaction.destination_wallet_id
      : wallets.find((wallet) => wallet.id !== duplicateSourceWalletId)?.id ?? "";
  const duplicateCategoryId =
    transaction.category_id && categories.some((category) => category.id === transaction.category_id && !category.is_archived)
      ? transaction.category_id
      : categories.find((category) => category.category_type === transaction.type && !category.is_archived)?.id ?? "";
  const [amount, setAmount] = useState(() =>
    transaction.type === "adjustment" ? formatSignedMoneyInput(String(transaction.amount)) : formatDatabaseMoneyDigits(transaction.amount),
  );
  const [walletId, setWalletId] = useState(mode === "duplicate" ? duplicateSourceWalletId : transaction.wallet_id);
  const [destinationWalletId, setDestinationWalletId] = useState(mode === "duplicate" ? duplicateDestinationWalletId : transaction.destination_wallet_id ?? "");
  const [categoryId, setCategoryId] = useState(mode === "duplicate" ? duplicateCategoryId : transaction.category_id ?? "");
  const [transferFee, setTransferFee] = useState(formatDatabaseMoneyDigits(transaction.transfer_fee));
  const [transactionDate, setTransactionDate] = useState(mode === "duplicate" ? currentLocalDateTimeValue() : toLocalDateTimeValue(transaction.transaction_date));
  const [note, setNote] = useState(transaction.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLElement>(null);
  const activeWallets = wallets.filter((wallet) => !wallet.is_archived || wallet.id === transaction.wallet_id || wallet.id === transaction.destination_wallet_id);
  const filteredCategories = useMemo(() => {
    if (transaction.type !== "income" && transaction.type !== "expense") return [];
    return filterCategoriesByType(categories, transaction.type).filter((category) => !category.is_archived || (mode === "edit" && category.id === transaction.category_id));
  }, [categories, mode, transaction.category_id, transaction.type]);
  const amountValue = transaction.type === "adjustment" ? parseSignedMoneyDigits(amount) : parseMoneyInputDigits(amount);
  const feeValue = parseMoneyInputDigits(transferFee) || "0";
  const amountHasError = isAmountError(error);

  useEffect(() => {
    if (!error) return;
    modalRef.current?.scrollTo({ behavior: "smooth", top: 0 });
  }, [error]);

  const validate = () => {
    if (!walletId) return "Choose a wallet.";
    if (!transactionDate) return "Choose a transaction date.";
    if (!amountValue || toNumber(amountValue) === 0) return transaction.type === "adjustment" ? "Adjustment amount cannot be zero." : "Amount must be greater than zero.";
    if (transaction.type !== "adjustment" && toNumber(amountValue) <= 0) return "Amount must be greater than zero.";
    if ((transaction.type === "income" || transaction.type === "expense") && !categoryId) return "Choose a category.";
    if (transaction.type === "transfer") {
      if (!destinationWalletId) return "Choose a destination wallet.";
      if (walletId === destinationWalletId) return "Source and destination wallets must be different.";
      if (toNumber(feeValue) < 0) return "Transfer fee cannot be negative.";
    }
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
        mode === "duplicate"
          ? transaction.type === "income"
            ? await createIncome({ amount: amountValue, categoryId, note: noteValue, title: noteValue ?? categoryName, transactionDate, walletId })
            : transaction.type === "expense"
              ? await createExpense({ amount: amountValue, categoryId, note: noteValue, title: noteValue ?? categoryName, transactionDate, walletId })
              : transaction.type === "transfer"
                ? await createTransfer({ amount: amountValue, destinationWalletId, note: noteValue, transactionDate, transferFee: feeValue, walletId })
                : await createAdjustment({ amount: amountValue, reason: noteValue ?? "Balance Adjustment", transactionDate, walletId })
          : await updateTransaction(transaction, {
              amount: amountValue,
              categoryId,
              destinationWalletId,
              note: noteValue,
              title: transaction.type === "income" || transaction.type === "expense" ? noteValue ?? categoryName : transaction.title,
              transactionDate,
              transferFee: feeValue,
              walletId,
            });

      if (result.error) {
        setError("Couldn't save this transaction. Please check the details and try again.");
        setSaving(false);
        return;
      }

      emitTransactionSaved();
      onSaved();
      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Couldn't save this transaction.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-x-hidden bg-slate-900/35" role="dialog" aria-modal="true">
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close transaction form" onClick={onClose} type="button" />
      <section ref={modalRef} className="absolute inset-x-0 bottom-0 max-h-[92vh] w-full max-w-full min-w-0 box-border overflow-y-auto overflow-x-hidden rounded-t-2xl bg-white p-4 shadow-soft md:left-1/2 md:top-1/2 md:bottom-auto md:max-h-[86vh] md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-slate-600">{transaction.type}</p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-900">{mode === "duplicate" ? "Duplicate Transaction" : "Edit Transaction"}</h2>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        {error ? <div className="mt-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">{error}</div> : null}

        <form className="mt-5 grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <FormField
            hasError={amountHasError}
            id="transaction-edit-amount"
            inputMode="numeric"
            label={transaction.type === "adjustment" ? "Signed Amount" : "Amount"}
            onChange={(event) => setAmount(transaction.type === "adjustment" ? formatSignedMoneyInput(event.target.value) : formatMoneyDigits(event.target.value))}
            value={amount}
          />

          {(transaction.type === "income" || transaction.type === "expense") ? (
            <SelectField id="transaction-edit-category" label="Category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              {filteredCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </SelectField>
          ) : null}

          <SelectField id="transaction-edit-wallet" label={transaction.type === "transfer" ? "From" : "Wallet"} value={walletId} onChange={(event) => setWalletId(event.target.value)}>
            {activeWallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name}{wallet.is_archived ? " (Archived)" : ""}
              </option>
            ))}
          </SelectField>

          {transaction.type === "transfer" ? (
            <>
              <SelectField id="transaction-edit-destination" label="To" value={destinationWalletId} onChange={(event) => setDestinationWalletId(event.target.value)}>
                {activeWallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name}{wallet.is_archived ? " (Archived)" : ""}
                  </option>
                ))}
              </SelectField>
              <FormField id="transaction-edit-fee" inputMode="numeric" label="Transfer Fee" value={transferFee} onChange={(event) => setTransferFee(formatMoneyDigits(event.target.value))} />
            </>
          ) : null}

          <DatePickerField
            id="transaction-edit-date"
            label="Date"
            enableTime
            value={transactionDate}
            onChange={(val) => setTransactionDate(val)}
          />
          <FormField id="transaction-edit-note" label={transaction.type === "adjustment" ? "Reason / Note" : "Note"} value={note} onChange={(event) => setNote(event.target.value)} />

          {transaction.type === "transfer" ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              <p className="font-extrabold text-slate-900">Transfer Summary</p>
              <div className="mt-3 flex justify-between gap-4"><span>Total deducted</span><span>{formatCurrency(toNumber(amountValue) + toNumber(feeValue), "IDR")}</span></div>
              <div className="mt-2 flex justify-between gap-4"><span>Destination receives</span><span>{formatCurrency(toNumber(amountValue), "IDR")}</span></div>
            </div>
          ) : null}

          <Button disabled={saving} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            {mode === "duplicate" ? "Create Duplicate" : "Save Changes"}
          </Button>
        </form>
      </section>
    </div>
  );
}

function AdvancedFilterPanel({
  categories,
  filters,
  onClose,
  onReset,
  onUpdate,
  wallets,
}: {
  categories: Category[];
  filters: TransactionFilters;
  onClose: () => void;
  onReset: () => void;
  onUpdate: <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) => void;
  wallets: Wallet[];
}) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/30 md:hidden" role="dialog" aria-modal="true">
        <button aria-label="Close filters" className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} type="button" />
        <section className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-4 shadow-soft">
          <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-200" />
          <AdvancedFilterContent categories={categories} filters={filters} onClose={onClose} onReset={onReset} onUpdate={onUpdate} wallets={wallets} />
        </section>
      </div>
      <div className="absolute right-[calc(100%+4px)] top-[calc(100%+4px)] z-40 hidden w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-soft md:block">
        <AdvancedFilterContent categories={categories} filters={filters} onClose={onClose} onReset={onReset} onUpdate={onUpdate} wallets={wallets} />
      </div>
    </>
  );
}

function AdvancedFilterContent({
  categories,
  filters,
  onClose,
  onReset,
  onUpdate,
  wallets,
}: {
  categories: Category[];
  filters: TransactionFilters;
  onClose: () => void;
  onReset: () => void;
  onUpdate: <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) => void;
  wallets: Wallet[];
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">Filter Transactions</h2>
          <p className="mt-1 text-xs font-semibold text-slate-600">Narrow your ledger by date, wallet, category, or status.</p>
        </div>
        <IconButton icon={X} label="Close filters" onClick={onClose} />
      </div>

      <div className="mt-4 grid gap-3">
        <SelectField id="transaction-period-filter" label="Period" value={filters.period} onChange={(event) => onUpdate("period", event.target.value as TransactionPeriodFilter)}>
          {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </SelectField>
        <SelectField id="transaction-wallet-filter" label="Wallet" value={filters.walletId ?? ""} onChange={(event) => onUpdate("walletId", event.target.value || undefined)}>
          <option value="">All Wallets</option>
          {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}{wallet.is_archived ? " (Archived)" : ""}</option>)}
        </SelectField>
        <SelectField id="transaction-category-filter" label="Category" value={filters.categoryId ?? ""} onChange={(event) => onUpdate("categoryId", event.target.value || undefined)}>
          <option value="">All Categories</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </SelectField>
        <SelectField id="transaction-status-filter" label="Status" value={filters.status} onChange={(event) => onUpdate("status", event.target.value as "all" | TransactionStatus)}>
          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </SelectField>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onReset}>Reset</Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

export function TransactionsPage() {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<TransactionFilters>(() => ({
    dateKey: searchParams.get("date") ?? undefined,
    page: 0,
    pageSize: PAGE_SIZE,
    period: searchParams.get("date") ? "all" : "this_month",
    query: "",
    sort: "latest",
    status: "all",
    type: "all",
  }));
  const [transactions, setTransactions] = useState<TransactionWithMeta[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithMeta | null>(null);
  const [editState, setEditState] = useState<{ mode: EditMode; transaction: TransactionWithMeta } | null>(null);
  const [voidTarget, setVoidTarget] = useState<TransactionWithMeta | null>(null);
  const [voidSaving, setVoidSaving] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const currency = "IDR";

  const loadTransactions = useCallback(async (nextFilters = filters, append = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getTransactions(nextFilters);
      setTransactions((current) => (append ? [...current, ...result.transactions] : result.transactions));
      setWallets(result.wallets);
      setCategories(result.categories);
      setHasMore(result.hasMore);
      if (!append) setSelectedTransaction(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Couldn't load transactions.");
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadTransactions(filters);
  }, [filters, loadTransactions]);

  useEffect(() => {
    const dateKey = searchParams.get("date") ?? undefined;
    setFilters((current) => {
      if (current.dateKey === dateKey) return current;
      return { ...current, dateKey, page: 0, period: dateKey ? "all" : "this_month" };
    });
  }, [searchParams]);

  useAppEvent(appEvents.transactionSaved, () => void loadTransactions(filters));

  useEffect(() => {
    if (!filterPanelOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (filterMenuRef.current?.contains(event.target as Node)) return;
      setFilterPanelOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [filterPanelOpen]);

  const groupedTransactions = useMemo(() => groupTransactions(transactions), [transactions]);
  const activeCategories = categories.filter((category) => !category.is_archived);
  const activeWallets = wallets.filter((wallet) => !wallet.is_archived);
  const activeAdvancedFilters = advancedFilterCount(filters);

  const updateFilter = <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value, page: 0 }));
  };

  const clearFilters = () => {
    setFilters({ page: 0, pageSize: PAGE_SIZE, period: "this_month", query: "", sort: "latest", status: "all", type: "all" });
  };

  const resetAdvancedFilters = () => {
    setFilters((current) => ({ ...current, categoryId: undefined, dateKey: undefined, page: 0, period: "this_month", status: "all", walletId: undefined }));
  };

  const handleVoid = async () => {
    if (!voidTarget || voidSaving) return;
    setVoidSaving(true);

    try {
      const result = await voidTransaction(voidTarget.id);
      if (result.error) throw result.error;
      emitTransactionSaved();
      setVoidTarget(null);
      await loadTransactions(filters);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Couldn't void this transaction.");
    } finally {
      setVoidSaving(false);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-[1180px] md:min-h-[calc(100dvh-3rem)]">
      <div>
        <PageHeader
          eyebrow="Ledger"
          icon={ReceiptText}
          title="Transactions"
          description="Search, filter, and review your financial history."
          actions={
            <label className="hidden h-11 w-full min-w-80 max-w-sm items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus-within:border-kash-emerald focus-within:ring-4 focus-within:ring-kash-emerald/20 md:flex">
              <Search aria-hidden="true" size={17} />
              <input
                value={filters.query ?? ""}
                onChange={(event) => updateFilter("query", event.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-600"
                placeholder="Search transactions..."
              />
            </label>
          }
        />

        <div className="mt-4 md:hidden">
          <label className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus-within:border-kash-emerald focus-within:ring-4 focus-within:ring-kash-emerald/20">
            <Search aria-hidden="true" size={17} />
            <input
              value={filters.query ?? ""}
              onChange={(event) => updateFilter("query", event.target.value)}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-600"
              placeholder="Search transactions..."
            />
          </label>
        </div>

        <section className="relative mt-5 pb-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {typeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateFilter("type", option.value)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-extrabold transition ${
                    filters.type === option.value ? "bg-kash-emerald text-white shadow-sm" : "bg-kash-selected/70 text-slate-700 hover:bg-kash-selected hover:text-kash-emeraldDark"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 md:justify-end">
              <div ref={filterMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setFilterPanelOpen((current) => !current)}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-extrabold transition ${
                    activeAdvancedFilters > 0
                      ? "border-kash-emerald bg-kash-emerald text-white shadow-sm hover:bg-kash-emeraldDark"
                      : "border-slate-200 bg-white text-slate-900 hover:border-kash-emerald/40 hover:bg-kash-selected"
                  }`}
                >
                  <Filter aria-hidden="true" size={16} />
                  Filter
                  {activeAdvancedFilters > 0 ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] text-kash-emeraldDark">{activeAdvancedFilters}</span>
                  ) : null}
                </button>
                {filterPanelOpen ? (
                  <AdvancedFilterPanel
                    categories={activeCategories}
                    filters={filters}
                    onClose={() => setFilterPanelOpen(false)}
                    onReset={resetAdvancedFilters}
                    onUpdate={updateFilter}
                    wallets={wallets}
                  />
                ) : null}
              </div>

              <div className="w-40">
                <SelectField
                  aria-label="Sort transactions"
                  className="[&>button]:mt-0 [&>button]:h-10"
                  id="transaction-sort"
                  label="Sort:"
                  value={filters.sort}
                  onChange={(event) => updateFilter("sort", event.target.value as TransactionSort)}
                >
                  {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </SelectField>
              </div>
            </div>
          </div>

          {clearableFilters(filters) ? (
            <button type="button" onClick={clearFilters} className="mt-3 inline-flex items-center gap-2 text-sm font-extrabold text-kash-emerald">
              <SlidersHorizontal size={16} />
              {filters.dateKey ? `Clear date filter (${filters.dateKey})` : "Clear filters"}
            </button>
          ) : null}
        </section>

        <section className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          {isLoading && transactions.length === 0 ? <div className="p-4"><TransactionsSkeleton /></div> : null}
          {error ? (
            <div className="m-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 p-4 text-sm font-bold text-slate-900">
              {error}
              <button type="button" onClick={() => void loadTransactions(filters)} className="ml-3 text-kash-emerald">Retry</button>
            </div>
          ) : null}
          {!isLoading && !error && transactions.length === 0 ? (
            <div className="p-8 text-center">
              <ReceiptText className="mx-auto text-slate-600" size={34} />
              <p className="mt-3 text-lg font-extrabold text-slate-900">{clearableFilters(filters) ? "No matching transactions." : "No transactions yet."}</p>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                {clearableFilters(filters) ? "Try changing your search or filters." : "Add your first income or expense to start tracking your money."}
              </p>
              {clearableFilters(filters) ? <Button className="mt-4" variant="secondary" onClick={clearFilters}>Clear Filters</Button> : null}
            </div>
          ) : null}

          {!error && groupedTransactions.map((group) => (
            <div key={group.label}>
              <div className="px-0 py-2 text-xs font-extrabold uppercase text-slate-700 md:py-3">{group.label}</div>
              <div className="divide-y divide-slate-100 overflow-hidden">
                {group.items.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    currency={currency}
                    isSelected={selectedTransaction?.id === transaction.id}
                    onSelect={() => setSelectedTransaction(transaction)}
                    transaction={transaction}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>

        {hasMore ? (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              onClick={() => void loadTransactions({ ...filters, page: Math.floor(transactions.length / PAGE_SIZE) }, true)}
            >
              <Filter size={16} />
              Load More
            </Button>
          </div>
        ) : transactions.length > 0 ? <p className="mt-4 text-center text-sm font-semibold text-slate-600">No more transactions</p> : null}

      </div>

      {selectedTransaction ? (
        <>
          <div className="fixed inset-0 z-30 bg-slate-900/25 md:hidden" onClick={() => setSelectedTransaction(null)} />
          <TransactionDetailPanel
            className="fixed inset-x-0 bottom-0 z-40 max-h-[92vh] rounded-t-2xl md:absolute md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[360px] md:rounded-lg"
            currency={currency}
            transaction={selectedTransaction}
            onClose={() => setSelectedTransaction(null)}
            onEdit={() => setEditState({ mode: "edit", transaction: selectedTransaction })}
            onDuplicate={() => setEditState({ mode: "duplicate", transaction: selectedTransaction })}
            onVoid={() => setVoidTarget(selectedTransaction)}
          />
        </>
      ) : null}

      {editState ? (
        <TransactionFormModal
          categories={categories}
          mode={editState.mode}
          onClose={() => setEditState(null)}
          onSaved={() => void loadTransactions(filters)}
          transaction={editState.transaction}
          wallets={editState.mode === "edit" ? wallets : activeWallets}
        />
      ) : null}

      {voidTarget ? (
        <ConfirmationDialog
          confirmLabel="Void Transaction"
          description="This transaction will stop affecting your wallet balance, but will remain in transaction history for audit purposes."
          icon={ReceiptText}
          isLoading={voidSaving}
          itemLabel={transactionTitle(voidTarget)}
          onCancel={() => setVoidTarget(null)}
          onConfirm={() => void handleVoid()}
          title="Void this transaction?"
          tone="danger"
        />
      ) : null}
    </div>
  );
}
