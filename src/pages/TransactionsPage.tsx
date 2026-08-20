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
  Plus,
  ReceiptText,
  Search,
  SlidersHorizontal,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { QuickCreateCategoryModal } from "../components/categories/QuickCreateCategoryModal";
import { TransactionDetailPanel } from "../components/transactions/TransactionDetailPanel";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { DatePickerField } from "../components/ui/DatePickerField";
import { FilterTabs } from "../components/ui/FilterTabs";
import { FormField } from "../components/ui/FormField";
import { IconButton } from "../components/ui/IconButton";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { useI18n } from "../i18n";
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
import { getCurrentLocalDatetimeString, toLocalDatetimeInputValue } from "../lib/datetime";
import { getEnvelopes } from "../lib/envelopes";
import { formatCurrency, formatDatabaseMoneyDigits, formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../lib/money";
import { appEvents, emitTransactionSaved } from "../lib/appEvents";
import { useAppEvent } from "../hooks/useAppEvent";
import type { Category, Envelope, TransactionStatus, TransactionType, Wallet } from "../types/domain";

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
  if (transaction.type === "adjustment") {
    if (transaction.related_entity_type === "debt_payment") return "Debt Payment";
    if (transaction.related_entity_type === "receivable_payment") return "Receivable Collection";
    if (transaction.related_entity_type === "shared_savings_contribution") return "Shared Savings Contribution";
    if (transaction.related_entity_type === "shared_savings_withdrawal") return "Shared Savings Withdrawal";
    if (transaction.related_entity_type === "goal_contribution") return "Goal Contribution";
    if (transaction.related_entity_type === "goal_refund") return "Goal Refund";
    return "Balance Adjustment";
  }
  return transaction.category?.name ?? (transaction.type === "income" ? "Income" : "Expense");
}

function transactionCategoryLabel(transaction: TransactionWithMeta) {
  if (transaction.type === "transfer") return "Transfer";
  if (transaction.type === "adjustment") {
    if (transaction.related_entity_type === "debt_payment" || transaction.related_entity_type === "debt_creation") return "Debt";
    if (transaction.related_entity_type === "receivable_payment" || transaction.related_entity_type === "receivable_creation") return "Receivable";
    if (
      transaction.related_entity_type === "shared_savings_contribution" ||
      transaction.related_entity_type === "shared_savings_withdrawal"
    ) {
      return "Shared Savings";
    }
    if (
      transaction.related_entity_type === "goal_contribution" ||
      transaction.related_entity_type === "goal_refund"
    ) {
      return "Goal";
    }
    return "Adjustment";
  }
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
  const { t, formatCurrency } = useI18n();
  const Icon = transactionIcon(transaction.type);
  const date = new Date(transaction.transaction_date);
  const isVoid = transaction.status === "void";
  const timeLabel = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(date);

  const getTranslatedTitle = () => {
    if (transaction.title) return transaction.title;
    if (transaction.type === "transfer") return `${t("transactions.transferTo") || "Transfer ke"} ${transaction.destinationWallet?.name ?? (t("wallets.title") || "Dompet")}`;
    if (transaction.type === "adjustment") {
      if (transaction.related_entity_type === "debt_payment") return t("debts.debtPayment") || "Pembayaran Utang";
      if (transaction.related_entity_type === "receivable_payment") return t("debts.receivableCollection") || "Pelunasan Piutang";
      if (transaction.related_entity_type === "shared_savings_contribution") return t("sharedSavings.contribution") || "Setoran Tabungan Bersama";
      if (transaction.related_entity_type === "shared_savings_withdrawal") return t("sharedSavings.withdrawal") || "Penarikan Tabungan Bersama";
      if (transaction.related_entity_type === "goal_contribution") return t("goals.contribution") || "Setoran Target";
      if (transaction.related_entity_type === "goal_refund") return t("goals.refund") || "Pengembalian Target";
      return t("wallets.balanceAdjustment") || "Penyesuaian Saldo";
    }
    return transaction.category?.name ?? (transaction.type === "income" ? (t("transactions.income") || "Pemasukan") : (t("transactions.expense") || "Pengeluaran"));
  };

  const getTranslatedCategoryLabel = () => {
    if (transaction.type === "transfer") return t("transactions.transfer") || "Transfer";
    if (transaction.type === "adjustment") {
      if (transaction.related_entity_type === "debt_payment" || transaction.related_entity_type === "debt_creation") return t("debts.debt") || "Utang";
      if (transaction.related_entity_type === "receivable_payment" || transaction.related_entity_type === "receivable_creation") return t("debts.receivable") || "Piutang";
      if (
        transaction.related_entity_type === "shared_savings_contribution" ||
        transaction.related_entity_type === "shared_savings_withdrawal"
      ) {
        return t("sharedSavings.title") || "Tabungan Bersama";
      }
      if (
        transaction.related_entity_type === "goal_contribution" ||
        transaction.related_entity_type === "goal_refund"
      ) {
        return t("goals.title") || "Target";
      }
      return t("wallets.adjustment") || "Penyesuaian";
    }
    return transaction.category?.name ?? (t("categories.uncategorized") || "Tanpa Kategori");
  };

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
          <span className="block truncate text-sm font-extrabold text-slate-900">{getTranslatedTitle()}</span>
          <span className="mt-1 block truncate text-xs font-semibold text-slate-600">
            {getTranslatedCategoryLabel()} • {transactionWalletLabel(transaction)}
          </span>
          {isVoid ? <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-extrabold text-slate-600">{t("transactions.voided") || "Dibatalkan"}</span> : null}
        </span>
        <span className="text-right">
          <span className={`block text-sm font-extrabold ${isVoid ? "text-slate-600 line-through" : transactionTone[transaction.type]}`}>
            {displayAmount(transaction, currency)}
          </span>
          {transaction.type === "transfer" && toNumber(transaction.transfer_fee) > 0 ? (
            <span className="block text-[11px] font-bold text-kash-expense">
              + {t("transactions.fee") || "biaya"} {formatCurrency(transaction.transfer_fee, currency)}
            </span>
          ) : null}
          <span className="mt-1 block text-xs font-bold text-slate-600">{timeLabel}</span>
        </span>
      </span>

      <span
        className="hidden items-center gap-4 px-3 py-2.5 text-sm md:grid"
        style={{ gridTemplateColumns: "40px minmax(0, 1fr) minmax(120px, 180px) 140px 64px 16px" }}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 ${transactionTone[transaction.type]}`}>
          <Icon aria-hidden="true" size={17} strokeWidth={2.2} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-bold text-slate-900">{getTranslatedTitle()}</span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-slate-600">{getTranslatedCategoryLabel()}</span>
          {isVoid ? <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-slate-600">{t("transactions.voided") || "Dibatalkan"}</span> : null}
        </span>
        <span className="min-w-0 truncate font-semibold text-slate-600">{transactionWalletLabel(transaction)}</span>
        <span className={`text-right font-extrabold ${isVoid ? "text-slate-600 line-through" : transactionTone[transaction.type]}`}>
          <span>{displayAmount(transaction, currency)}</span>
          {transaction.type === "transfer" && toNumber(transaction.transfer_fee) > 0 ? (
            <span className="block text-[11px] font-bold text-kash-expense">
              + {t("transactions.fee") || "biaya"} {formatCurrency(transaction.transfer_fee, currency)}
            </span>
          ) : null}
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
  const { t, formatCurrency } = useI18n();
  const isAmountError = (message: string | null) => {
    if (!message) return false;
    const normalizedMessage = message.toLowerCase();
    return normalizedMessage.includes("amount") || normalizedMessage.includes("balance");
  };
  const [localCategories, setLocalCategories] = useState(categories);
  const [showQuickCategoryModal, setShowQuickCategoryModal] = useState(false);
  const duplicateSourceWalletId = wallets.some((wallet) => wallet.id === transaction.wallet_id) ? transaction.wallet_id : wallets[0]?.id ?? "";
  const duplicateDestinationWalletId =
    transaction.destination_wallet_id && wallets.some((wallet) => wallet.id === transaction.destination_wallet_id)
      ? transaction.destination_wallet_id
      : wallets.find((wallet) => wallet.id !== duplicateSourceWalletId)?.id ?? "";
  const duplicateCategoryId =
    transaction.category_id && localCategories.some((category) => category.id === transaction.category_id && !category.is_archived)
      ? transaction.category_id
      : localCategories.find((category) => category.category_type === transaction.type && !category.is_archived)?.id ?? "";
  const [amount, setAmount] = useState(() =>
    transaction.type === "adjustment" ? formatSignedMoneyInput(String(transaction.amount)) : formatDatabaseMoneyDigits(transaction.amount),
  );
  const [walletId, setWalletId] = useState(mode === "duplicate" ? duplicateSourceWalletId : transaction.wallet_id);
  const [destinationWalletId, setDestinationWalletId] = useState(mode === "duplicate" ? duplicateDestinationWalletId : transaction.destination_wallet_id ?? "");
  const [categoryId, setCategoryId] = useState(mode === "duplicate" ? duplicateCategoryId : transaction.category_id ?? "");
  const [envelopeId, setEnvelopeId] = useState(transaction.envelope_id ?? "");
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [transferFee, setTransferFee] = useState(formatDatabaseMoneyDigits(transaction.transfer_fee));
  const [transactionDate, setTransactionDate] = useState(mode === "duplicate" ? getCurrentLocalDatetimeString() : toLocalDatetimeInputValue(transaction.transaction_date));
  const [note, setNote] = useState(transaction.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLElement>(null);
  const activeWallets = wallets.filter((wallet) => !wallet.is_archived || wallet.id === transaction.wallet_id || wallet.id === transaction.destination_wallet_id);
  const filteredCategories = useMemo(() => {
    if (transaction.type !== "income" && transaction.type !== "expense") return [];
    return filterCategoriesByType(localCategories, transaction.type).filter((category) => !category.is_archived || (mode === "edit" && category.id === transaction.category_id));
  }, [localCategories, mode, transaction.category_id, transaction.type]);
  const amountValue = transaction.type === "adjustment" ? parseSignedMoneyDigits(amount) : parseMoneyInputDigits(amount);
  const feeValue = parseMoneyInputDigits(transferFee) || "0";
  const amountHasError = isAmountError(error);

  useEffect(() => {
    getEnvelopes().then((res) => {
      if (res.data) setEnvelopes(res.data);
    });
  }, []);

  useEffect(() => {
    if (!error) return;
    modalRef.current?.scrollTo({ behavior: "smooth", top: 0 });
  }, [error]);

  const validate = () => {
    if (!walletId) return t("transactions.chooseWallet") || "Pilih dompet.";
    if (!transactionDate) return t("transactions.chooseDate") || "Pilih tanggal transaksi.";
    if (!amountValue || toNumber(amountValue) === 0) return transaction.type === "adjustment" ? (t("wallets.adjustmentNonZero") || "Nilai penyesuaian tidak boleh nol.") : (t("transactions.amountGreaterThanZero") || "Nominal harus lebih besar dari nol.");
    if (transaction.type !== "adjustment" && toNumber(amountValue) <= 0) return t("transactions.amountGreaterThanZero") || "Nominal harus lebih besar dari nol.";
    if ((transaction.type === "income" || transaction.type === "expense") && !categoryId) return t("transactions.chooseCategory") || "Pilih kategori.";
    if (transaction.type === "transfer") {
      if (!destinationWalletId) return t("transactions.chooseDestinationWallet") || "Pilih dompet tujuan.";
      if (walletId === destinationWalletId) return t("transactions.walletsMustBeDifferent") || "Dompet asal dan tujuan harus berbeda.";
      if (toNumber(feeValue) < 0) return t("transactions.feeCannotBeNegative") || "Biaya transfer tidak boleh bernilai negatif.";
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

    try {
      const selectedCategory = localCategories.find((category) => category.id === categoryId);
      const categoryName = selectedCategory?.name ?? "Transaction";
      const noteValue = note.trim() ? note.trim() : null;

      const result =
        mode === "duplicate"
          ? transaction.type === "income"
            ? await createIncome({
                amount: amountValue,
                categoryId,
                note: noteValue,
                title: noteValue ?? categoryName,
                transactionDate,
                walletId,
              })
            : transaction.type === "expense"
              ? await createExpense({
                  amount: amountValue,
                  categoryId,
                  envelopeId: envelopeId || null,
                  note: noteValue,
                  title: noteValue ?? categoryName,
                  transactionDate,
                  walletId,
                })
              : transaction.type === "transfer"
                ? await createTransfer({
                    amount: amountValue,
                    destinationWalletId,
                    note: noteValue,
                    transactionDate,
                    transferFee: feeValue,
                    walletId,
                  })
                : await createAdjustment({
                    amount: amountValue,
                    reason: noteValue ?? "Balance Adjustment",
                    transactionDate,
                    walletId,
                  })
          : await updateTransaction(transaction, {
              amount: amountValue,
              categoryId: transaction.type === "income" || transaction.type === "expense" ? categoryId : null,
              envelopeId: transaction.type === "expense" ? (envelopeId || null) : null,
              destinationWalletId: transaction.type === "transfer" ? destinationWalletId : null,
              note: noteValue,
              title: transaction.type === "income" || transaction.type === "expense" ? noteValue ?? categoryName : transaction.title,
              transactionDate,
              transferFee: feeValue,
              walletId,
            });

      if (result.error) {
        setError(t("transactions.saveError") || "Gagal menyimpan transaksi. Silakan periksa data dan coba lagi.");
        setSaving(false);
        return;
      }

      emitTransactionSaved();
      onSaved();
      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : (t("transactions.saveError") || "Gagal menyimpan transaksi."));
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title={mode === "duplicate" ? (t("transactions.duplicateTitle") || "Duplikat Transaksi") : (t("transactions.editTitle") || "Edit Transaksi")}
      description={`${t("transactions.type") || "Tipe"}: ${transaction.type}`}
    >
      <div>
        {error ? <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">{error}</div> : null}

        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <FormField
            hasError={amountHasError}
            id="transaction-edit-amount"
            inputMode="numeric"
            label={transaction.type === "adjustment" ? (t("transactions.signedAmount") || "Nominal Bertanda (+/-)") : (t("transactions.amount") || "Nominal")}
            onChange={(event) => setAmount(transaction.type === "adjustment" ? formatSignedMoneyInput(event.target.value) : formatMoneyDigits(event.target.value))}
            value={amount}
          />

          {(transaction.type === "income" || transaction.type === "expense") ? (
            <SelectField
              id="transaction-edit-category"
              label={t("categories.title") || "Kategori"}
              action={
                <button
                  type="button"
                  onClick={() => setShowQuickCategoryModal(true)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-kash-emerald transition hover:text-kash-emeraldDark focus:outline-none"
                >
                  <Plus size={13} strokeWidth={2.5} />
                  {t("categories.create") || "Tambah Kategori"}
                </button>
              }
              value={categoryId}
              onChange={(event) => {
                if (event.target.value === "__create_new__") {
                  setShowQuickCategoryModal(true);
                } else {
                  setCategoryId(event.target.value);
                }
              }}
            >
              {filteredCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
              <option value="__create_new__">{t("categories.createNewOption") || "+ Tambah Kategori Baru..."}</option>
            </SelectField>
          ) : null}

          {transaction.type === "expense" && envelopes.length > 0 ? (
            <SelectField
              id="transaction-edit-envelope"
              label={t("envelopes.title") || "Amplop / Purpose Group (Opsional)"}
              value={envelopeId}
              onChange={(event) => setEnvelopeId(event.target.value)}
            >
              <option value="">{t("envelopes.noEnvelope") || "Tanpa Amplop (Pengeluaran Bebas)"}</option>
              {envelopes.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </SelectField>
          ) : null}

          <SelectField
            disabled={mode !== "duplicate" && (transaction.type === "adjustment" || transaction.type === "transfer")}
            id="transaction-edit-wallet"
            label={transaction.type === "transfer" ? (t("transactions.fromWallet") || "Dari Dompet") : (t("wallets.title") || "Dompet")}
            onChange={(event) => setWalletId(event.target.value)}
            value={walletId}
          >
            {activeWallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name}{wallet.is_archived ? ` (${t("common.archived") || "Diarsipkan"})` : ""}
              </option>
            ))}
          </SelectField>

          {transaction.type === "transfer" ? (
            <SelectField
              disabled={mode !== "duplicate"}
              id="transaction-edit-destination-wallet"
              label={t("transactions.toWallet") || "Ke Dompet"}
              onChange={(event) => setDestinationWalletId(event.target.value)}
              value={destinationWalletId}
            >
              {activeWallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}{wallet.is_archived ? ` (${t("common.archived") || "Diarsipkan"})` : ""}
                </option>
              ))}
            </SelectField>
          ) : null}

          {transaction.type === "transfer" ? (
            <FormField id="transaction-edit-transfer-fee" inputMode="numeric" label={t("transactions.transferFeeOptional") || "Biaya Transfer (Opsional)"} onChange={(event) => setTransferFee(formatMoneyDigits(event.target.value))} value={transferFee} />
          ) : null}

          <DatePickerField
            id="transaction-edit-date"
            label={t("common.date") || "Tanggal"}
            enableTime
            onChange={(val) => setTransactionDate(val)}
            value={transactionDate}
          />

          <FormField id="transaction-edit-note" label={transaction.type === "adjustment" ? (t("transactions.reasonOrNote") || "Alasan / Catatan") : (t("transactions.note") || "Catatan")} value={note} onChange={(event) => setNote(event.target.value)} />

          {transaction.type === "transfer" ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              <p className="font-extrabold text-slate-900">{t("transactions.transferSummary") || "Ringkasan Transfer"}</p>
              <div className="mt-3 flex justify-between gap-4"><span>{t("transactions.totalDeducted") || "Total Terpotong"}</span><span>{formatCurrency(toNumber(amountValue) + toNumber(feeValue), "IDR")}</span></div>
              <div className="mt-2 flex justify-between gap-4"><span>{t("transactions.destinationReceives") || "Tujuan Menerima"}</span><span>{formatCurrency(toNumber(amountValue), "IDR")}</span></div>
            </div>
          ) : null}

          <Button disabled={saving} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            {saving ? (t("common.saving") || "Menyimpan...") : mode === "duplicate" ? (t("transactions.createDuplicate") || "Buat Duplikat") : (t("common.saveChanges") || "Simpan Perubahan")}
          </Button>
        </form>

        {(transaction.type === "income" || transaction.type === "expense") ? (
          <QuickCreateCategoryModal
            isOpen={showQuickCategoryModal}
            categoryType={transaction.type}
            onClose={() => setShowQuickCategoryModal(false)}
            onCreated={(newCat) => {
              setLocalCategories((prev) => {
                const exists = prev.some((c) => c.id === newCat.id);
                return exists ? prev.map((c) => (c.id === newCat.id ? newCat : c)) : [...prev, newCat];
              });
              setCategoryId(newCat.id);
              setShowQuickCategoryModal(false);
            }}
          />
        ) : null}
      </div>
    </Modal>
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
  const { t } = useI18n();

  return (
    <>
      <div className="md:hidden">
        <Modal
          isOpen
          onClose={onClose}
          maxWidth="md"
          title={t("transactions.filterTitle") || "Filter Transaksi"}
          description={t("transactions.filterSubtitle") || "Persempit buku kas berdasarkan tanggal, dompet, kategori, atau status."}
        >
          <AdvancedFilterContent categories={categories} filters={filters} onClose={onClose} onReset={onReset} onUpdate={onUpdate} wallets={wallets} />
        </Modal>
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
  const { t } = useI18n();

  const periodOptions: Array<{ label: string; value: TransactionPeriodFilter }> = [
    { label: t("calendar.allTime") || "Semua Waktu", value: "all" },
    { label: t("calendar.thisMonth") || "Bulan Ini", value: "this_month" },
    { label: t("calendar.lastMonth") || "Bulan Lalu", value: "last_month" },
    { label: t("calendar.thisYear") || "Tahun Ini", value: "this_year" },
  ];

  const statusOptions: Array<{ label: string; value: "all" | TransactionStatus }> = [
    { label: t("transactions.allStatus") || "Semua Status", value: "all" },
    { label: t("transactions.completed") || "Selesai", value: "completed" },
    { label: t("transactions.voided") || "Dibatalkan", value: "void" },
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">{t("transactions.filterTitle") || "Filter Transaksi"}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-600">{t("transactions.filterSubtitle") || "Persempit buku kas berdasarkan tanggal, dompet, kategori, atau status."}</p>
        </div>
        <IconButton icon={X} label="Close filters" onClick={onClose} />
      </div>

      <div className="mt-4 grid gap-3">
        <SelectField id="transaction-period-filter" label={t("analytics.period") || "Periode"} value={filters.period} onChange={(event) => onUpdate("period", event.target.value as TransactionPeriodFilter)}>
          {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </SelectField>
        <SelectField id="transaction-wallet-filter" label={t("wallets.title") || "Dompet"} value={filters.walletId ?? ""} onChange={(event) => onUpdate("walletId", event.target.value || undefined)}>
          <option value="">{t("wallets.allWallets") || "Semua Dompet"}</option>
          {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}{wallet.is_archived ? ` (${t("common.archived") || "Diarsipkan"})` : ""}</option>)}
        </SelectField>
        <SelectField id="transaction-category-filter" label={t("categories.title") || "Kategori"} value={filters.categoryId ?? ""} onChange={(event) => onUpdate("categoryId", event.target.value || undefined)}>
          <option value="">{t("categories.allCategories") || "Semua Kategori"}</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </SelectField>
        <SelectField id="transaction-status-filter" label={t("common.status") || "Status"} value={filters.status} onChange={(event) => onUpdate("status", event.target.value as "all" | TransactionStatus)}>
          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </SelectField>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onReset}>{t("common.reset") || "Reset"}</Button>
        <Button onClick={onClose}>{t("common.done") || "Selesai"}</Button>
      </div>
    </div>
  );
}

export function TransactionsPage() {
  const { t, formatDate } = useI18n();
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

  const typeOptions: Array<{ label: string; value: TransactionTypeFilter }> = [
    { label: t("common.all") || "Semua", value: "all" },
    { label: t("transactions.income") || "Pemasukan", value: "income" },
    { label: t("transactions.expense") || "Pengeluaran", value: "expense" },
    { label: t("transactions.transfer") || "Transfer", value: "transfer" },
    { label: t("wallets.adjustment") || "Penyesuaian", value: "adjustment" },
  ];

  const sortOptions: Array<{ label: string; value: TransactionSort }> = [
    { label: t("transactions.latest") || "Terbaru", value: "latest" },
    { label: t("transactions.oldest") || "Terlama", value: "oldest" },
    { label: t("transactions.amountHigh") || "Nominal Terbesar", value: "amount_high" },
    { label: t("transactions.amountLow") || "Nominal Terkecil", value: "amount_low" },
  ];

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
      setError(caughtError instanceof Error ? caughtError.message : (t("transactions.loadTransactionsError") || "Gagal memuat transaksi."));
    } finally {
      setIsLoading(false);
    }
  }, [filters, t]);

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

  const groupTransactionsLocalized = (txList: TransactionWithMeta[]) => {
    const today = new Date();
    const todayStr = today.toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();
    const groups = new Map<string, TransactionWithMeta[]>();

    txList.forEach((transaction) => {
      const txDate = new Date(transaction.transaction_date);
      const isToday = txDate.toDateString() === todayStr;
      const isYesterday = txDate.toDateString() === yesterdayStr;
      const label = isToday ? (t("calendar.today") || "Hari Ini") : isYesterday ? (t("calendar.yesterday") || "Kemarin") : formatDate(txDate);
      groups.set(label, [...(groups.get(label) ?? []), transaction]);
    });

    return Array.from(groups.entries()).map(([label, items]) => ({ items, label }));
  };

  const groupedTransactions = useMemo(() => groupTransactionsLocalized(transactions), [transactions, t]);
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
      setError(caughtError instanceof Error ? caughtError.message : (t("transactions.voidError") || "Gagal membatalkan transaksi."));
    } finally {
      setVoidSaving(false);
    }
  };

  return (
    <div className="relative w-full min-w-0 space-y-5 md:min-h-[calc(100dvh-3rem)]">
      <div>
        <PageHeader
          eyebrow={t("transactions.eyebrow") || "Buku Kas"}
          icon={ReceiptText}
          title={t("transactions.title")}
          description={t("transactions.subtitle")}
          actions={
            <label className="hidden h-11 w-full min-w-80 max-w-sm items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus-within:border-kash-emerald focus-within:ring-4 focus-within:ring-kash-emerald/20 md:flex">
              <Search aria-hidden="true" size={17} />
              <input
                value={filters.query ?? ""}
                onChange={(event) => updateFilter("query", event.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-600"
                placeholder={t("transactions.searchPlaceholder") || "Cari transaksi..."}
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
              placeholder={t("transactions.searchPlaceholder") || "Cari transaksi..."}
            />
          </label>
        </div>

        <section className="relative mt-5 pb-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <FilterTabs
              options={typeOptions}
              value={filters.type ?? "all"}
              onChange={(val) => updateFilter("type", val as TransactionTypeFilter)}
            />

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
                  {t("common.filter") || "Filter"}
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
                  label={`${t("transactions.sort") || "Urutkan"}:`}
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
              {filters.dateKey ? `${t("transactions.clearDateFilter") || "Hapus filter tanggal"} (${filters.dateKey})` : (t("transactions.clearFilters") || "Hapus Filter")}
            </button>
          ) : null}
        </section>

        <section className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          {isLoading && transactions.length === 0 ? <div className="p-4"><TransactionsSkeleton /></div> : null}
          {error ? (
            <div className="m-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 p-4 text-sm font-bold text-slate-900">
              {error}
              <button type="button" onClick={() => void loadTransactions(filters)} className="ml-3 text-kash-emerald">{t("common.retry") || "Coba Lagi"}</button>
            </div>
          ) : null}
          {!isLoading && !error && transactions.length === 0 ? (
            <div className="p-8 text-center">
              <ReceiptText className="mx-auto text-slate-600" size={34} />
              <p className="mt-3 text-lg font-extrabold text-slate-900">{clearableFilters(filters) ? (t("transactions.noMatching") || "Tidak ada transaksi yang cocok.") : (t("transactions.emptyStateTitle") || "Belum ada transaksi.")}</p>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                {clearableFilters(filters) ? (t("transactions.noMatchingDesc") || "Coba ubah kata kunci pencarian atau filter Anda.") : (t("transactions.emptyStateDesc") || "Tambah pemasukan atau pengeluaran pertama Anda untuk mulai mencatat keuangan.")}
              </p>
              {clearableFilters(filters) ? <Button className="mt-4" variant="secondary" onClick={clearFilters}>{t("transactions.clearFilters") || "Hapus Filter"}</Button> : null}
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
              {t("common.loadMore") || "Muat Lebih Banyak"}
            </Button>
          </div>
        ) : transactions.length > 0 ? <p className="mt-4 text-center text-sm font-semibold text-slate-600">{t("transactions.noMore") || "Semua transaksi telah dimuat"}</p> : null}

      </div>

      <TransactionDetailPanel
        currency={currency}
        isOpen={Boolean(selectedTransaction)}
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        onEdit={() => {
          const tx = selectedTransaction;
          setSelectedTransaction(null);
          if (tx) setEditState({ mode: "edit", transaction: tx });
        }}
        onDuplicate={() => {
          const tx = selectedTransaction;
          setSelectedTransaction(null);
          if (tx) setEditState({ mode: "duplicate", transaction: tx });
        }}
        onVoid={() => {
          const tx = selectedTransaction;
          if (tx) setVoidTarget(tx);
        }}
      />

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
          confirmLabel={t("transactions.voidTransaction") || "Batalkan Transaksi (Void)"}
          description={t("transactions.voidConfirmDesc") || "Transaksi ini tidak akan lagi mempengaruhi saldo dompet Anda, namun tetap tercatat dalam riwayat untuk keperluan audit."}
          icon={ReceiptText}
          isLoading={voidSaving}
          itemLabel={transactionTitle(voidTarget)}
          onCancel={() => setVoidTarget(null)}
          onConfirm={() => void handleVoid()}
          title={t("transactions.voidConfirmTitle") || "Batalkan transaksi ini?"}
          tone="danger"
        />
      ) : null}
    </div>
  );
}
