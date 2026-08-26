import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Loader2,
  Plus,
  ReceiptText,
  Search,
  SlidersHorizontal,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { startOfLocalMonth } from "../lib/calendar";
import { QuickCreateCategoryModal } from "../components/categories/QuickCreateCategoryModal";
import { TransactionDetailPanel } from "../components/transactions/TransactionDetailPanel";
import { TransactionRow as CanonicalTransactionRow } from "../components/transactions/TransactionRow";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { DatePickerField } from "../components/ui/DatePickerField";
import { FilterTabs } from "../components/ui/FilterTabs";
import { FormField } from "../components/ui/FormField";
import { HeaderFilterButton } from "../components/ui/HeaderActionControls";
import { IconButton } from "../components/ui/IconButton";
import { Modal } from "../components/ui/Modal";
import { SelectField } from "../components/ui/SelectField";
import { useI18n } from "../i18n";
import { useSpaceTerminology } from "../hooks/useSpaceTerminology";
import { getCategoryIcon } from "../lib/categoryMeta";
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

function clearableFilters(filters: TransactionFilters) {
  return Boolean(
    filters.query ||
    (filters.type && filters.type !== "all") ||
    filters.dateKey ||
    (filters.status && filters.status !== "all") ||
    filters.walletId ||
    filters.categoryId ||
    filters.envelopeId ||
    (filters.sort && filters.sort !== "latest")
  );
}

function transactionDailyNetAmount(transaction: TransactionWithMeta, walletId?: string) {
  if (transaction.status !== "completed") return 0;

  const amount = toNumber(transaction.amount);

  if (transaction.type === "income") return amount;
  if (transaction.type === "expense") return -amount;
  if (transaction.type === "adjustment") return amount;

  if (transaction.type === "transfer") {
    const fee = toNumber(transaction.transfer_fee);

    if (walletId) {
      if (transaction.wallet_id === walletId) return -(amount + fee);
      if (transaction.destination_wallet_id === walletId) return amount;
      return 0;
    }

    return -fee;
  }

  return 0;
}

function iconSurfaceStyle(transaction: TransactionWithMeta): CSSProperties | undefined {
  const color = transaction.category?.color;
  if (!color) return undefined;

  return {
    backgroundColor: `${color}18`,
    color,
  };
}

function advancedFilterCount(filters: TransactionFilters) {
  return (
    Number(Boolean(filters.dateKey)) +
    Number(Boolean(filters.status && filters.status !== "all")) +
    Number(Boolean(filters.walletId)) +
    Number(Boolean(filters.categoryId)) +
    Number(Boolean(filters.envelopeId))
  );
}

function MonthPicker({
  activeMonth,
  onChange,
}: {
  activeMonth: Date;
  onChange: (month: Date) => void;
}) {
  const { t, formatMonthYear } = useI18n();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(activeMonth.getFullYear());
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    setViewYear(activeMonth.getFullYear());
  }, [activeMonth]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePopoverPosition = () => {
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const width = Math.min(304, window.innerWidth - 24);
      const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12);
      const top = Math.min(rect.bottom + 8, window.innerHeight - 292);

      setPopoverStyle({
        left,
        position: "fixed",
        top: Math.max(12, top),
        width,
        zIndex: 1200,
      });
    };

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (buttonRef.current?.contains(event.target as Node)) return;
      if (popoverRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };

    updatePopoverPosition();
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen]);

  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, monthIndex) => new Date(viewYear, monthIndex, 1)),
    [viewYear],
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((current) => !current)}
        className={`inline-flex h-8 max-w-[10rem] shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-kash-emerald/25 ${
          isOpen
            ? "border-kash-emerald bg-kash-selected text-kash-emeraldDark"
            : "border-slate-200/80 bg-white text-slate-800 hover:border-kash-emerald/40 hover:bg-kash-selected/60"
        }`}
      >
        <CalendarDays aria-hidden="true" className="shrink-0 text-kash-emerald" size={13} />
        <span className="truncate">{formatMonthYear(activeMonth)}</span>
        <ChevronDown aria-hidden="true" className={`shrink-0 text-slate-500 transition ${isOpen ? "rotate-180" : ""}`} size={13} />
      </button>

      {isOpen && popoverStyle
        ? createPortal(
            <div
              ref={popoverRef}
              style={popoverStyle}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-soft"
              role="menu"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label={t("common.prevYear") || "Previous year"}
                  onClick={() => setViewYear((year) => year - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-kash-emerald/20"
                >
                  <ChevronLeft size={17} />
                </button>
                <span className="text-sm font-extrabold text-slate-900">{viewYear}</span>
                <button
                  type="button"
                  aria-label={t("common.nextYear") || "Next year"}
                  onClick={() => setViewYear((year) => year + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-kash-emerald/20"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {monthOptions.map((month) => {
                  const isSelected =
                    activeMonth.getFullYear() === month.getFullYear() &&
                    activeMonth.getMonth() === month.getMonth();

                  return (
                    <button
                      key={month.toISOString()}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onChange(month);
                        setIsOpen(false);
                      }}
                      className={`flex h-9 items-center justify-center gap-1 rounded-lg px-2 text-xs font-extrabold transition ${
                        isSelected
                          ? "bg-kash-emerald text-white"
                          : "text-slate-700 hover:bg-kash-selected hover:text-kash-emeraldDark"
                      }`}
                    >
                      <span className="truncate">{formatMonthYear(month).replace(String(viewYear), "").trim()}</span>
                      {isSelected ? <Check aria-hidden="true" className="shrink-0" size={13} /> : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function TransactionsSkeleton() {
  return (
    <div className="space-y-1">
      {[0, 1, 2, 3, 4].map((item) => (
        <div key={item} className="flex items-center gap-3 rounded-xl p-3">
          <div className="h-9 w-9 animate-pulse rounded-xl bg-slate-100" />
          <div className="min-w-0 flex-1">
            <div className="h-3.5 w-36 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-2 h-3 w-52 max-w-full animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="h-3.5 w-20 animate-pulse rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
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
        {error ? <div className="mb-4 rounded-xl border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">{error}</div> : null}

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
              <option value="">{t("categories.selectCategory") || "Pilih Kategori"}</option>
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
            <option value="">{t("wallets.selectWallet") || "Pilih Dompet"}</option>
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
              <option value="">{t("transactions.selectDestinationWallet") || "Pilih Dompet Tujuan"}</option>
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
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
              <p className="font-bold text-slate-900">{t("transactions.transferSummary") || "Ringkasan Transfer"}</p>
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
  envelopes,
  filters,
  onClose,
  onReset,
  onUpdate,
  sortOptions,
  wallets,
}: {
  categories: Category[];
  envelopes: Envelope[];
  filters: TransactionFilters;
  onClose: () => void;
  onReset: () => void;
  onUpdate: <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) => void;
  sortOptions: Array<{ label: string; value: TransactionSort }>;
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
          description={t("transactions.filterSubtitle") || "Persempit buku kas berdasarkan dompet, kategori, pos anggaran, atau status."}
        >
          <AdvancedFilterContent hideHeader categories={categories} envelopes={envelopes} filters={filters} onClose={onClose} onReset={onReset} onUpdate={onUpdate} sortOptions={sortOptions} wallets={wallets} />
        </Modal>
      </div>
      <div className="absolute right-[calc(100%+4px)] top-[calc(100%+4px)] z-40 hidden w-72 rounded-xl border border-slate-200/60 bg-white p-4 shadow-soft md:block">
        <AdvancedFilterContent categories={categories} envelopes={envelopes} filters={filters} onClose={onClose} onReset={onReset} onUpdate={onUpdate} sortOptions={sortOptions} wallets={wallets} />
      </div>
    </>
  );
}

function AdvancedFilterContent({
  categories,
  envelopes,
  filters,
  hideHeader = false,
  onClose,
  onReset,
  onUpdate,
  sortOptions,
  wallets,
}: {
  categories: Category[];
  envelopes: Envelope[];
  filters: TransactionFilters;
  hideHeader?: boolean;
  onClose: () => void;
  onReset: () => void;
  onUpdate: <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) => void;
  sortOptions: Array<{ label: string; value: TransactionSort }>;
  wallets: Wallet[];
}) {
  const { t } = useI18n();

  const statusOptions: Array<{ label: string; value: "all" | TransactionStatus }> = [
    { label: t("transactions.allStatus") || "Semua Status", value: "all" },
    { label: t("transactions.completed") || "Selesai", value: "completed" },
    { label: t("transactions.voided") || "Dibatalkan", value: "void" },
  ];

  return (
    <div data-transaction-filter-panel="true">
      {!hideHeader && (
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">{t("transactions.filterTitle") || "Filter Transaksi"}</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500">{t("transactions.filterSubtitle") || "Persempit berdasarkan dompet, kategori, pos anggaran, atau status."}</p>
          </div>
          <IconButton icon={X} label="Close filters" onClick={onClose} />
        </div>
      )}

      <div className="mt-4 grid gap-3">
        <SelectField id="transaction-wallet-filter" label={t("wallets.title") || "Dompet"} value={filters.walletId ?? ""} onChange={(event) => onUpdate("walletId", event.target.value || undefined)}>
          <option value="">{t("wallets.allWallets") || "Semua Dompet"}</option>
          {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}{wallet.is_archived ? ` (${t("common.archived") || "Diarsipkan"})` : ""}</option>)}
        </SelectField>
        <SelectField id="transaction-category-filter" label={t("categories.title") || "Kategori"} value={filters.categoryId ?? ""} onChange={(event) => onUpdate("categoryId", event.target.value || undefined)}>
          <option value="">{t("categories.allCategories") || "Semua Kategori"}</option>
          <option value="uncategorized">{t("categories.uncategorized") || "Tanpa Kategori"}</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </SelectField>
        {envelopes.length > 0 ? (
          <SelectField id="transaction-envelope-filter" label={t("budgets.envelope") || "Pos Anggaran"} value={filters.envelopeId ?? ""} onChange={(event) => onUpdate("envelopeId", event.target.value || undefined)}>
            <option value="">{t("budgets.allEnvelopes") || "Semua Pos Anggaran"}</option>
            {envelopes.map((envelope) => (
              <option key={envelope.id} value={envelope.id}>
                {envelope.name}
              </option>
            ))}
          </SelectField>
        ) : null}
        <SelectField id="transaction-status-filter" label={t("common.status") || "Status"} value={filters.status} onChange={(event) => onUpdate("status", event.target.value as "all" | TransactionStatus)}>
          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </SelectField>
        <SelectField
          id="transaction-sort-filter"
          label={t("transactions.sort") || "Urutkan"}
          value={filters.sort}
          onChange={(event) => onUpdate("sort", event.target.value as TransactionSort)}
        >
          {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
  const { t, formatDate, formatCurrency: formatLocalizedCurrency } = useI18n();
  const terms = useSpaceTerminology();
  const [searchParams] = useSearchParams();

  const [activeMonth, setActiveMonth] = useState(() => {
    const monthParam = searchParams.get("month");
    if (monthParam) {
      const parsed = new Date(monthParam.length === 7 ? `${monthParam}-01` : monthParam);
      if (!isNaN(parsed.getTime())) return startOfLocalMonth(parsed);
    }
    return startOfLocalMonth(new Date());
  });
  const [filters, setFilters] = useState<TransactionFilters>(() => {
    const initialDateKey = searchParams.get("date") ?? undefined;
    const initialWalletId = searchParams.get("wallet") ?? undefined;
    const initialCategoryId = searchParams.get("category") ?? searchParams.get("categoryId") ?? undefined;
    const initialType = (searchParams.get("type") as TransactionTypeFilter) ?? "all";
    return {
      categoryId: initialCategoryId,
      dateKey: initialDateKey,
      monthDate: activeMonth,
      page: 0,
      pageSize: PAGE_SIZE,
      query: "",
      sort: "latest",
      status: "all",
      type: initialType,
      walletId: initialWalletId,
    };
  });
  const [transactions, setTransactions] = useState<TransactionWithMeta[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
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
    { label: terms.isManaged ? terms.incomeLabel : (t("transactions.income") || "Pemasukan"), value: "income" },
    { label: terms.isManaged ? terms.expenseLabel : (t("transactions.expense") || "Pengeluaran"), value: "expense" },
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
      setEnvelopes(result.envelopes || []);
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
    const walletId = searchParams.get("wallet") ?? undefined;
    const categoryId = searchParams.get("category") ?? searchParams.get("categoryId") ?? undefined;
    const type = (searchParams.get("type") as TransactionTypeFilter) ?? undefined;
    const monthParam = searchParams.get("month");

    let nextMonth = activeMonth;
    if (monthParam) {
      const parsed = new Date(monthParam.length === 7 ? `${monthParam}-01` : monthParam);
      if (!isNaN(parsed.getTime())) {
        nextMonth = startOfLocalMonth(parsed);
        setActiveMonth(nextMonth);
      }
    }

    setFilters((current) => {
      if (
        current.dateKey === dateKey &&
        current.walletId === walletId &&
        current.categoryId === categoryId &&
        (type === undefined || current.type === type) &&
        current.monthDate === nextMonth
      ) {
        return current;
      }
      return {
        ...current,
        dateKey,
        monthDate: nextMonth,
        page: 0,
        type: type ?? current.type,
        walletId: walletId ?? current.walletId,
        categoryId: categoryId ?? current.categoryId,
      };
    });
  }, [searchParams]);

  const goToMonth = (nextMonth: Date) => {
    const normalized = startOfLocalMonth(nextMonth);
    setActiveMonth(normalized);
    setFilters((current) => ({
      ...current,
      monthDate: normalized,
      page: 0,
    }));
  };

  useAppEvent(appEvents.transactionSaved, () => void loadTransactions(filters));
  useAppEvent(appEvents.spaceChanged, () => void loadTransactions(filters));

  useEffect(() => {
    if (!filterPanelOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (filterMenuRef.current?.contains(event.target as Node)) return;
      if ((event.target as Element | null)?.closest('[data-transaction-filter-panel="true"]')) return;
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

    return Array.from(groups.entries()).map(([label, items]) => ({
      dailyNet: items.reduce((total, transaction) => total + transactionDailyNetAmount(transaction, filters.walletId), 0),
      items,
      label,
    }));
  };

  const groupedTransactions = useMemo(() => groupTransactionsLocalized(transactions), [filters.walletId, transactions, t]);
  const activeCategories = categories.filter((category) => !category.is_archived);
  const activeWallets = wallets.filter((wallet) => !wallet.is_archived);
  const activeAdvancedFilters = advancedFilterCount(filters);

  const updateFilter = <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value, page: 0 }));
  };

  const clearFilters = () => {
    setFilters((current) => ({
      ...current,
      categoryId: undefined,
      dateKey: undefined,
      envelopeId: undefined,
      page: 0,
      query: "",
      sort: "latest",
      status: "all",
      type: "all",
      walletId: undefined,
    }));
  };

  const resetAdvancedFilters = () => {
    setFilters((current) => ({
      ...current,
      categoryId: undefined,
      dateKey: undefined,
      envelopeId: undefined,
      page: 0,
      sort: "latest",
      status: "all",
      walletId: undefined,
    }));
  };

  const formatDailyNet = (amount: number) => {
    if (amount === 0) return formatLocalizedCurrency(0, currency);
    const formatted = formatLocalizedCurrency(Math.abs(amount), currency);
    return `${amount > 0 ? "+" : "-"}${formatted}`;
  };

  const dailyNetTone = (amount: number) => {
    if (amount > 0) return "text-kash-emerald";
    if (amount < 0) return "text-kash-expense";
    return "text-slate-500";
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
    <div className="relative w-full max-w-full min-w-0 space-y-3 overflow-x-hidden md:min-h-[calc(100dvh-3rem)]">
      <div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h1 className="min-w-0 truncate text-xl font-extrabold text-slate-950 md:text-2xl">{t("transactions.title")}</h1>
          <MonthPicker activeMonth={activeMonth} onChange={goToMonth} />
        </div>

        <div className="mt-3 flex min-w-0 items-center gap-2">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-100/70 px-3 text-sm font-medium text-slate-700 transition focus-within:bg-white focus-within:shadow-card focus-within:ring-2 focus-within:ring-kash-emerald/30">
            <Search aria-hidden="true" size={16} className="text-slate-500" />
            <input
              value={filters.query ?? ""}
              onChange={(event) => updateFilter("query", event.target.value)}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-500"
              placeholder={t("transactions.searchPlaceholder") || "Cari transaksi..."}
            />
          </label>
          <div ref={filterMenuRef} className="relative shrink-0">
            <HeaderFilterButton
              activeCount={activeAdvancedFilters}
              onClick={() => setFilterPanelOpen((current) => !current)}
              label={t("common.filter") || "Filter"}
              size="md"
            />
            {filterPanelOpen ? (
              <AdvancedFilterPanel
                categories={activeCategories}
                envelopes={envelopes}
                filters={filters}
                onClose={() => setFilterPanelOpen(false)}
                onReset={resetAdvancedFilters}
                onUpdate={updateFilter}
                sortOptions={sortOptions}
                wallets={wallets}
              />
            ) : null}
          </div>
        </div>

        {(filters.walletId || filters.categoryId || filters.dateKey) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 px-1">
            {filters.walletId && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-kash-selected px-3 py-0.5 text-xs font-extrabold text-kash-emeraldDark border border-kash-emerald/20">
                <span className="font-semibold text-slate-500">{t("wallets.title") || "Dompet"}:</span>
                {wallets.find((w) => w.id === filters.walletId)?.name || filters.walletId}
                <button
                  type="button"
                  aria-label="Clear wallet filter"
                  onClick={() => updateFilter("walletId", undefined)}
                  className="ml-0.5 text-kash-emeraldDark hover:text-kash-expense transition"
                >
                  <X size={13} />
                </button>
              </span>
            )}
            {filters.categoryId && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-kash-selected px-3 py-0.5 text-xs font-extrabold text-kash-emeraldDark border border-kash-emerald/20">
                <span className="font-semibold text-slate-500">{t("categories.title") || "Kategori"}:</span>
                {filters.categoryId === "uncategorized"
                  ? (t("categories.uncategorized") || "Tanpa Kategori")
                  : (categories.find((c) => c.id === filters.categoryId)?.name || filters.categoryId)}
                <button
                  type="button"
                  aria-label="Clear category filter"
                  onClick={() => updateFilter("categoryId", undefined)}
                  className="ml-0.5 text-kash-emeraldDark hover:text-kash-expense transition"
                >
                  <X size={13} />
                </button>
              </span>
            )}
            {filters.dateKey && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-kash-selected px-3 py-0.5 text-xs font-extrabold text-kash-emeraldDark border border-kash-emerald/20">
                <span className="font-semibold text-slate-500">{t("common.date") || "Tanggal"}:</span>
                {formatDate(filters.dateKey)}
                <button
                  type="button"
                  aria-label="Clear date filter"
                  onClick={() => updateFilter("dateKey", undefined)}
                  className="ml-0.5 text-kash-emeraldDark hover:text-kash-expense transition"
                >
                  <X size={13} />
                </button>
              </span>
            )}
          </div>
        )}

        <section className="relative mt-3 pb-1">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <FilterTabs
              className="w-full bg-transparent p-0 md:w-auto [&>button[aria-selected=false]]:bg-slate-100/70 [&>button[aria-selected=false]]:hover:bg-slate-100"
              options={typeOptions}
              size="sm"
              value={filters.type ?? "all"}
              onChange={(val) => updateFilter("type", val as TransactionTypeFilter)}
            />

            <div className="hidden items-center justify-end gap-2.5 md:flex">
              <div className="w-36">
                <SelectField
                  aria-label="Sort transactions"
                  className="[&>button]:mt-0 [&>button]:h-8 [&>button]:text-xs"
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
            <button type="button" onClick={clearFilters} className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-kash-emerald">
              <SlidersHorizontal size={14} />
              {filters.dateKey ? `${t("transactions.clearDateFilter") || "Hapus filter tanggal"} (${filters.dateKey})` : (t("transactions.clearFilters") || "Hapus Filter")}
            </button>
          ) : null}
        </section>

        {/* Transaction List — Activity Feed */}
        <section className="mt-1">
          {isLoading && transactions.length === 0 ? <TransactionsSkeleton /> : null}
          {error ? (
            <div className="rounded-xl border border-kash-expense/20 bg-kash-expense/5 p-4 text-sm font-bold text-slate-900">
              {error}
              <button type="button" onClick={() => void loadTransactions(filters)} className="ml-3 text-kash-emerald">{t("common.retry") || "Coba Lagi"}</button>
            </div>
          ) : null}
          {!isLoading && !error && transactions.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <ReceiptText className="mx-auto text-slate-400" size={32} strokeWidth={1.5} />
              <p className="mt-3 text-sm font-bold text-slate-800">{clearableFilters(filters) ? (t("transactions.noMatching") || "Tidak ada transaksi yang cocok.") : (t("transactions.emptyStateTitle") || "Belum ada transaksi.")}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {clearableFilters(filters)
                  ? t("transactions.noMatchingDesc") || "Coba ubah kata kunci pencarian atau filter Anda."
                  : terms.isManaged
                  ? t("transactions.managedEmptyStateDesc") || "Tambah dana masuk atau pengeluaran pertama di space ini untuk mulai mencatat keuangan."
                  : t("transactions.emptyStateDesc") || "Tambah pemasukan atau pengeluaran pertama Anda."}
              </p>
              {clearableFilters(filters) ? <Button className="mt-4" variant="secondary" size="sm" onClick={clearFilters}>{t("transactions.clearFilters") || "Hapus Filter"}</Button> : null}
            </div>
          ) : null}

          {!error && groupedTransactions.map((group, groupIndex) => (
            <div key={group.label}>
              {/* Date group header */}
              <div className={`kash-date-header flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5 pt-2 ${groupIndex > 0 ? "mt-3" : ""}`}>
                <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-slate-500">{group.label}</span>
                <span className={`shrink-0 text-xs font-extrabold ${dailyNetTone(group.dailyNet)}`}>{formatDailyNet(group.dailyNet)}</span>
              </div>
              {/* Transactions */}
              <div>
                {group.items.map((transaction) => (
                  <CanonicalTransactionRow
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
          <div className="mt-3 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadTransactions({ ...filters, page: Math.floor(transactions.length / PAGE_SIZE) }, true)}
            >
              {t("common.loadMore") || "Muat Lebih Banyak"}
            </Button>
          </div>
        ) : transactions.length > 0 ? <p className="mt-3 text-center text-xs font-medium text-slate-500">{t("transactions.noMore") || "Semua transaksi telah dimuat"}</p> : null}

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
