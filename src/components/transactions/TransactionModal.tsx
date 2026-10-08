import { ArrowDown, ArrowRightLeft, ArrowUp, Loader2, Plus, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { QuickCreateCategoryModal } from "../categories/QuickCreateCategoryModal";
import { CounterpartyCombobox } from "../debts/CounterpartyCombobox";
import { QuickCreateEnvelopeModal } from "../envelopes/QuickCreateEnvelopeModal";
import { Button } from "../ui/Button";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";
import { ExpenseContextSelector } from "./ExpenseContextSelector";
import { useI18n } from "../../i18n";
import { getActiveCategories } from "../../lib/categories";
import { getEnvelopes } from "../../lib/envelopes";
import { getActiveManagedSpaces, getPersonalSpace, getActiveSpaceId } from "../../lib/spaces";
import { getCounterparties } from "../../lib/debts";
import { addMoneyValues, formatCurrency, formatMoneyDigits, isMoneyGreaterThan, parseMoneyInputDigits, toNumber } from "../../lib/money";
import { createExpense, createExternalTransfer, createIncome, createTransfer, filterCategoriesByType, createCrossSpaceExpense, recordCrossSpaceAdvance, canCreateTransaction } from "../../lib/transactions";
import { getWallets, type WalletWithBalance } from "../../lib/wallets";
import { emitDebtSaved, emitTransactionSaved } from "../../lib/appEvents";
import { getCurrentLocalDatetimeString } from "../../lib/datetime";
import type { Category, Counterparty, Envelope, ExpenseContext, FinancialSpace } from "../../types/domain";
import { useActiveSpace } from "../../context/ActiveSpaceContext";
import { useSpaceTerminology } from "../../hooks/useSpaceTerminology";

export type QuickTransactionMode = "expense" | "income" | "transfer";

type TransactionModalProps = {
  mode: QuickTransactionMode;
  /** A date-only local key supplied by contextual entry points such as Daily Review. */
  initialDate?: string;
  /** Keeps a contextual entry point safely scoped to its intended financial space. */
  spaceId?: string;
  /** Smart Entry can hand off a reviewed reimbursement draft to this unified form. */
  initialReimbursement?: {
    amount: number | null;
    description: string;
    managedSpaceId: string | null;
    transactionDate: string;
    walletId: string | null;
  } | null;
  onClose: () => void;
  onSaved?: () => void;
};

function initialTransactionDatetime(initialDate?: string) {
  const current = getCurrentLocalDatetimeString();
  return initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)
    ? `${initialDate}T${current.slice(11)}`
    : current;
}

function isAmountError(error: string | null) {
  if (!error) return false;
  const normalizedError = error.toLowerCase();
  return normalizedError.includes("amount") || normalizedError.includes("balance");
}

export function TransactionModal({ mode, initialDate, initialReimbursement, spaceId, onClose, onSaved }: TransactionModalProps) {
  const { t, formatCurrency } = useI18n();
  const { activeSpace, userRole } = useActiveSpace();
  const terms = useSpaceTerminology();
  const isContextualPersonalEntry = Boolean(spaceId);
  const isManaged = !isContextualPersonalEntry && terms.isManaged;
  const canCreate = isContextualPersonalEntry || canCreateTransaction(activeSpace, userRole);

  const modeCopy: Record<
    QuickTransactionMode,
    {
      accent: string;
      icon: typeof ArrowDown;
      title: string;
      submitLabel: string;
    }
  > = {
    expense: {
      accent: "text-kash-expense",
      icon: ArrowDown,
      submitLabel: terms.saveExpenseLabel,
      title: terms.newExpenseTitle,
    },
    income: {
      accent: "text-kash-income",
      icon: ArrowUp,
      submitLabel: terms.saveIncomeLabel,
      title: terms.newIncomeTitle,
    },
    transfer: {
      accent: "text-kash-transfer",
      icon: ArrowRightLeft,
      submitLabel: t("transactions.transfer") || "Transfer",
      title: t("transactions.newTransfer") || "Transfer Baru",
    },
  };

  const copy = modeCopy[mode];
  const Icon = copy.icon;
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [walletId, setWalletId] = useState("");
  const [destinationWalletId, setDestinationWalletId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [envelopeId, setEnvelopeId] = useState("");
  const [transferKind, setTransferKind] = useState<"internal" | "outgoing">("internal");
  const [recipient, setRecipient] = useState("");
  const [showQuickCategoryModal, setShowQuickCategoryModal] = useState(false);
  const [showQuickEnvelopeModal, setShowQuickEnvelopeModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [transferFee, setTransferFee] = useState("0");
  const [transactionDate, setTransactionDate] = useState(() => initialTransactionDatetime(initialDate));
  const [note, setNote] = useState("");
  const [expenseContext, setExpenseContext] = useState<ExpenseContext>("personal");
  const [reimbursementCounterparty, setReimbursementCounterparty] = useState("");
  const [reimbursementTitle, setReimbursementTitle] = useState("");
  const [reimbursementTarget, setReimbursementTarget] = useState<"managed" | "contact">("contact");
  const [reimbursementManagedSpaceId, setReimbursementManagedSpaceId] = useState("");
  const [reimbursementManagedSpaces, setReimbursementManagedSpaces] = useState<FinancialSpace[]>([]);
  const [reimbursementManagedCategories, setReimbursementManagedCategories] = useState<Category[]>([]);
  const [reimbursementCounterparties, setReimbursementCounterparties] = useState<Counterparty[]>([]);
  const [reimbursementSupportLoading, setReimbursementSupportLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paymentSource, setPaymentSource] = useState<"managed" | "personal">("managed");
  const [workPaymentSource, setWorkPaymentSource] = useState<
    "personal" | "work_fund"
  >("personal");
  const [personalWallets, setPersonalWallets] = useState<WalletWithBalance[]>([]);
  const [personalSpaceId, setPersonalSpaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLElement>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    const [walletResult, categoryResult, envelopeResult, personalSpaceResult, managedSpacesResult, counterpartiesResult] = await Promise.all([
      getWallets(spaceId),
      getActiveCategories(spaceId),
      getEnvelopes(false, spaceId),
      isManaged ? getPersonalSpace() : Promise.resolve({ data: null, error: null }),
      mode === "expense" && !isManaged ? getActiveManagedSpaces() : Promise.resolve({ data: [], error: null }),
      mode === "expense" ? getCounterparties(undefined, spaceId).catch(() => null) : Promise.resolve(null),
    ]);

    if (walletResult.error || categoryResult.error || !walletResult.data || !categoryResult.data) {
      setError(t("transactions.loadError") || "Gagal memuat dompet dan kategori. Silakan coba lagi.");
      setLoading(false);
      return;
    }

    setWallets(walletResult.data);
    setCategories(categoryResult.data);
    setEnvelopes(envelopeResult.data ?? []);
    setReimbursementManagedSpaces(managedSpacesResult.data ?? []);
    setReimbursementCounterparties(
      (counterpartiesResult?.allCounterparties ?? []).filter((counterparty) => !counterparty.linked_space_id),
    );

    if (isManaged && personalSpaceResult.data) {
      setPersonalSpaceId(personalSpaceResult.data.id);
      const personalWalletsResult = await getWallets(personalSpaceResult.data.id);
      if (personalWalletsResult.data) {
        setPersonalWallets(personalWalletsResult.data);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [isManaged, mode, spaceId]);

  useEffect(() => {
    setTransactionDate(initialTransactionDatetime(initialDate));
  }, [initialDate]);

  useEffect(() => {
    if (!initialReimbursement || mode !== "expense") return;
    setAmount(initialReimbursement.amount ? formatMoneyDigits(String(initialReimbursement.amount)) : "");
    setWalletId(initialReimbursement.walletId ?? "");
    setExpenseContext("reimbursable");
    setReimbursementTitle(initialReimbursement.description);
    setReimbursementManagedSpaceId(initialReimbursement.managedSpaceId ?? "");
    setReimbursementTarget(initialReimbursement.managedSpaceId ? "managed" : "contact");
    setTransactionDate(initialReimbursement.transactionDate);
  }, [initialReimbursement, mode]);

  useEffect(() => {
    if (!error) return;
    modalRef.current?.scrollTo({ behavior: "smooth", top: 0 });
  }, [error]);

  const workFundWallets = wallets.filter((wallet) => Boolean(wallet.work_fund_kind));
  const standardWallets = wallets.filter((wallet) => !wallet.work_fund_kind);
  const privateWorkExpense =
    mode === "expense" && !isManaged && expenseContext === "work";
  const activeWallets = privateWorkExpense
    ? workPaymentSource === "work_fund"
      ? workFundWallets
      : standardWallets
    : paymentSource === "personal"
      ? personalWallets.filter((wallet) => !wallet.work_fund_kind)
      : isManaged
        ? wallets
        : standardWallets;
  const selectedWallet = activeWallets.find((wallet) => wallet.id === walletId) ?? null;
  const destinationWallet = standardWallets.find((wallet) => wallet.id === destinationWalletId) ?? null;
  const isOutgoingTransfer = mode === "transfer" && transferKind === "outgoing";
  const filteredCategories = useMemo(
    () => filterCategoriesByType(categories, mode === "income" ? "income" : "expense"),
    [categories, mode],
  );
  const isReimbursement = mode === "expense" && expenseContext === "reimbursable";
  const isManagedTargetReimbursement = isReimbursement && !isManaged && reimbursementTarget === "managed";
  const isManagedSpacePersonalPayment = mode === "expense" && isManaged && paymentSource === "personal";
  const isCrossSpaceReimbursement = isManagedTargetReimbursement || isManagedSpacePersonalPayment;
  const requiresExternalCounterparty = isReimbursement && !isManagedTargetReimbursement && !isManagedSpacePersonalPayment;
  const reimbursementCategoryOptions = isManagedTargetReimbursement
    ? filterCategoriesByType(reimbursementManagedCategories, "expense")
    : filteredCategories;
  const selectedReimbursementCategory = reimbursementCategoryOptions.find((category) => category.id === categoryId) ?? null;
  const selectedReimbursementManagedSpace = reimbursementManagedSpaces.find((space) => space.id === reimbursementManagedSpaceId) ?? null;
  const currentSpaceId = spaceId ?? activeSpace?.id ?? getActiveSpaceId();

  useEffect(() => {
    if (!isReimbursement || isManaged) return;
    if (reimbursementTarget === "managed" && reimbursementManagedSpaces.length === 0) {
      setReimbursementTarget("contact");
      setReimbursementManagedSpaceId("");
      return;
    }
    if (reimbursementTarget === "managed" && !reimbursementManagedSpaceId) {
      setReimbursementManagedSpaceId(reimbursementManagedSpaces[0]?.id ?? "");
    }
  }, [isManaged, isReimbursement, reimbursementManagedSpaceId, reimbursementManagedSpaces, reimbursementTarget]);

  useEffect(() => {
    if (!isManagedTargetReimbursement || !reimbursementManagedSpaceId) {
      setReimbursementManagedCategories([]);
      setReimbursementSupportLoading(false);
      return;
    }

    let isCurrent = true;
    setReimbursementSupportLoading(true);
    setCategoryId("");
    void getActiveCategories(reimbursementManagedSpaceId)
      .then(({ data }) => {
        if (isCurrent) setReimbursementManagedCategories(data ?? []);
      })
      .finally(() => {
        if (isCurrent) setReimbursementSupportLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [isManagedTargetReimbursement, reimbursementManagedSpaceId]);

  const amountDigits = parseMoneyInputDigits(amount);
  const feeDigits = parseMoneyInputDigits(transferFee);
  const amountNumber = toNumber(amountDigits);
  const feeNumber = toNumber(feeDigits);
  const totalDeducted = amountNumber + feeNumber;
  const selectedWalletBalance = selectedWallet?.balance?.current_balance ?? selectedWallet?.initial_balance ?? "0";
  const totalTransferDeduction = mode === "transfer" ? addMoneyValues(amountDigits, feeDigits || "0") : amountDigits;
  const amountHasError = isAmountError(error);

  const validate = () => {
    if (!canCreate) {
      return t("transactions.createUnauthorizedViewer") || "Viewer tidak memiliki izin untuk menambah transaksi.";
    }
    if (!walletId) return t("transactions.chooseWallet") || "Pilih dompet.";
    if (!amountDigits || amountNumber <= 0) return t("transactions.amountGreaterThanZero") || "Nominal harus lebih besar dari nol.";
    if (!transactionDate) return t("transactions.chooseDate") || "Pilih tanggal transaksi.";

    if (mode === "transfer") {
      if (isOutgoingTransfer) {
        if (!recipient.trim()) return t("transactions.chooseRecipient") || "Isi penerima atau tujuan transfer.";
        if (!categoryId) return t("transactions.chooseCategory") || "Pilih kategori untuk pemasukan atau pengeluaran.";
      } else {
        if (!destinationWalletId) return t("transactions.chooseDestinationWallet") || "Pilih dompet tujuan.";
        if (walletId === destinationWalletId) return t("transactions.walletsMustBeDifferent") || "Dompet asal dan tujuan harus berbeda.";
      }
      if (feeNumber < 0) return t("transactions.feeCannotBeNegative") || "Biaya transfer tidak boleh bernilai negatif.";
      if (isMoneyGreaterThan(totalTransferDeduction, selectedWalletBalance)) {
        return t("transactions.insufficientBalanceTransfer") || "Saldo dompet tidak mencukupi. Periksa kembali nominal transfer.";
      }
      return null;
    }

    if (mode === "income" && isManaged && paymentSource === "personal") {
      if (!walletId) return "Pilih dompet pribadi sumber dana.";
      if (!destinationWalletId) return "Pilih dompet tujuan.";
      return null;
    }

    if (!categoryId) return t("transactions.chooseCategory") || "Pilih kategori.";
    if (isReimbursement && !reimbursementTitle.trim()) {
      return t("debts.itemTitleRequiredDirect") || "Judul / keterangan pengeluaran wajib diisi.";
    }
    if (isManagedTargetReimbursement && !reimbursementManagedSpaceId) {
      return t("reimbursable.selectManagedSpace") || "Pilih Managed Space yang akan mereimburse.";
    }
    if (isManagedTargetReimbursement && !currentSpaceId) {
      return "Personal Space tidak ditemukan.";
    }
    if (isManagedSpacePersonalPayment && !personalSpaceId) {
      return "Personal Space tidak ditemukan.";
    }
    if (requiresExternalCounterparty && !reimbursementCounterparty.trim()) {
      return t("expenseContext.reimbursementCounterparty") || "Isi pihak yang akan mengganti.";
    }
    if (mode === "expense" && isMoneyGreaterThan(amountDigits, selectedWalletBalance)) {
      return t("transactions.insufficientBalanceExpense") || "Saldo dompet tidak mencukupi. Periksa kembali nominal transaksi.";
    }
    return null;
  };

  const submit = async (event?: FormEvent<HTMLFormElement>, saveAndAddAnother = false) => {
    event?.preventDefault();
    if (saving) return;

    if (!canCreate) {
      setError(t("transactions.createUnauthorizedViewer") || "Viewer tidak memiliki izin untuk menambah transaksi.");
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    const noteValue = note.trim() || null;
    const categoryName = reimbursementCategoryOptions.find((category) => category.id === categoryId)?.name ?? null;
    const transactionTitle = isReimbursement
      ? reimbursementTitle.trim()
      : noteValue ?? categoryName;

    try {
      const result =
        mode === "income"
          ? (paymentSource === "personal" && personalSpaceId) ? await recordCrossSpaceAdvance({
              amount: amountDigits,
              managedSpaceId: getActiveSpaceId()!,
              managedWalletId: destinationWalletId,
              personalSpaceId,
              personalWalletId: walletId,
              title: noteValue || "Talangan Dana Pribadi",
              transactionDate,
              note: noteValue,
            }) : await createIncome({
            amount: amountDigits,
            categoryId,
            note: noteValue,
            title: noteValue ?? categoryName,
            transactionDate,
            walletId,
          })
          : mode === "expense"
            ? isManagedSpacePersonalPayment ? await createCrossSpaceExpense({
              amount: amountDigits,
              categoryId,
              note: noteValue,
              title: transactionTitle,
              transactionDate,
              personalWalletId: walletId,
              personalSpaceId: personalSpaceId!,
              managedSpaceId: getActiveSpaceId()!,
            }) : isManagedTargetReimbursement ? await createCrossSpaceExpense({
              amount: amountDigits,
              categoryId,
              note: noteValue,
              title: transactionTitle,
              transactionDate,
              personalWalletId: walletId,
              personalSpaceId: currentSpaceId!,
              managedSpaceId: reimbursementManagedSpaceId,
            }) : await createExpense({
              amount: amountDigits,
              categoryId,
              envelopeId: envelopeId || null,
              expenseContext,
              note: noteValue,
              reimbursementCounterparty,
              title: transactionTitle,
              transactionDate,
              walletId,
              spaceId,
            })
            : isOutgoingTransfer
              ? await createExternalTransfer({
                amount: amountDigits,
                categoryId,
                note: noteValue,
                recipient,
                transactionDate,
                transferFee: feeDigits || "0",
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
        const errMsg = result.error.message || "";
        const isAuthError = errMsg.includes("JWT") || errMsg.includes("session expired") || errMsg.includes("not authenticated");
        const isViewerError = !canCreate || (activeSpace?.space_type === "managed" && userRole === "viewer") || errMsg.includes("Unauthorized for managed space") || (errMsg.includes("row-level security") && userRole === "viewer");
        setError(
          isViewerError
            ? (t("transactions.createUnauthorizedViewer") || "Viewer tidak memiliki izin untuk menambah transaksi.")
            : isAuthError
              ? (t("transactions.saveErrorAuth") || "Sesi masuk telah berakhir. Silakan login kembali.")
              : (errMsg || t("transactions.saveError") || "Gagal menyimpan transaksi. Silakan periksa data dan coba lagi.")
        );
        setSaving(false);
        return;
      }

      emitTransactionSaved();
      if (isReimbursement) emitDebtSaved();
      onSaved?.();
      if (saveAndAddAnother) {
        setAmount("");
        setNote("");
        setCategoryId("");
        setEnvelopeId("");
        setExpenseContext("personal");
        setWorkPaymentSource("personal");
        setReimbursementCounterparty("");
        setReimbursementTitle("");
        setReimbursementTarget(reimbursementManagedSpaces.length > 0 ? "managed" : "contact");
        setReimbursementManagedSpaceId(reimbursementManagedSpaces[0]?.id ?? "");
        setSaving(false);
        return;
      }
      onClose();
    } catch (transactionError) {
      console.error("Failed to create transaction", transactionError);
      const errMsg =
        transactionError instanceof Error
          ? transactionError.message
          : typeof transactionError === "object" && transactionError !== null && "message" in transactionError
            ? String(transactionError.message)
            : "";

      const isAuthError = errMsg.includes("JWT") || errMsg.includes("session expired") || errMsg.includes("not authenticated");
      const isViewerError = !canCreate || (activeSpace?.space_type === "managed" && userRole === "viewer") || errMsg.includes("Unauthorized for managed space") || (errMsg.includes("row-level security") && userRole === "viewer");
      setError(
        isViewerError
          ? (t("transactions.createUnauthorizedViewer") || "Viewer tidak memiliki izin untuk menambah transaksi.")
          : isAuthError
            ? (t("transactions.saveErrorAuth") || "Sesi masuk telah berakhir. Silakan login kembali.")
            : (errMsg || t("transactions.saveError") || "Gagal menyimpan transaksi. Silakan periksa data dan coba lagi.")
      );
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
            <Icon aria-hidden="true" className={copy.accent} size={20} />
          </span>
          <span className="text-lg font-extrabold text-slate-900">{copy.title}</span>
        </div>
      }
      description={
        initialDate
          ? `${t("transactions.singleTransactionDesc") || "Catat satu transaksi keuangan."} ${t("dailyCheckin.recordingFor") || "Mencatat untuk"} ${initialDate}.`
          : mode === "transfer"
            ? (t("transactions.transferDesc") || "Pindahkan saldo antar dompet pribadi.")
            : (t("transactions.singleTransactionDesc") || "Catat satu transaksi keuangan.")
      }
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
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
          <form className="mt-5 grid w-full max-w-full min-w-0 gap-4" onSubmit={(event) => void submit(event)}>
            <FormField
              hasError={amountHasError}
              id={`${mode}-amount`}
              inputMode="numeric"
              label={t("transactions.amount") || "Nominal"}
              onChange={(event) => setAmount(formatMoneyDigits(event.target.value))}
              placeholder="125.000"
              value={amount}
            />

            {mode === "expense" && paymentSource !== "personal" ? (
              <>
                <ExpenseContextSelector
                  value={expenseContext}
                  onChange={(nextContext) => {
                    setExpenseContext(nextContext);
                    setWalletId("");
                    if (nextContext !== "work") {
                      setWorkPaymentSource("personal");
                    }
                    // Managed-space categories cannot be reused for a normal
                    // personal expense after the reimbursement path is left.
                    if (nextContext !== "reimbursable") setCategoryId("");
                  }}
                />
                {privateWorkExpense ? (
                  <div className="grid gap-2 rounded-xl border border-kash-emerald/20 bg-kash-selected/35 p-3">
                    <div>
                      <p className="text-sm font-extrabold text-slate-900">
                        {t("transactions.paymentSource")}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-slate-600">
                        {t("expenseContext.workHint")}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/80 p-1">
                      <button
                        className={`rounded-md px-2 py-2 text-xs font-bold transition ${
                          workPaymentSource === "personal"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                        onClick={() => {
                          setWorkPaymentSource("personal");
                          setWalletId("");
                        }}
                        type="button"
                      >
                        {t("workFunds.personalPaymentSource")}
                      </button>
                      <button
                        className={`rounded-md px-2 py-2 text-xs font-bold transition ${
                          workPaymentSource === "work_fund"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                        onClick={() => {
                          setWorkPaymentSource("work_fund");
                          setWalletId("");
                        }}
                        type="button"
                      >
                        {t("workFunds.workPaymentSource")}
                      </button>
                    </div>
                    {workPaymentSource === "work_fund" && workFundWallets.length === 0 ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                        {t("workFunds.emptyForExpense")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {isReimbursement && !isManaged ? (
                  <div className="grid gap-3 rounded-xl border border-kash-emerald/20 bg-kash-selected/35 p-3">
                    <div>
                      <p className="text-sm font-extrabold text-slate-900">{t("reimbursable.reimbursedBy") || "Direimburse oleh"}</p>
                      <p className="mt-0.5 text-xs font-medium text-slate-600">{t("expenseContext.reimbursableHint") || "Dibayar dulu dan dicatat sebagai piutang sampai diganti."}</p>
                    </div>
                    {reimbursementManagedSpaces.length > 0 ? (
                      <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/80 p-1">
                        <button
                          type="button"
                          onClick={() => { setReimbursementTarget("managed"); setCategoryId(""); }}
                          className={`rounded-md px-2 py-2 text-xs font-bold transition ${reimbursementTarget === "managed" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                        >
                          {t("reimbursable.targetModeManaged") || "Financial Space (Managed)"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setReimbursementTarget("contact"); setCategoryId(""); }}
                          className={`rounded-md px-2 py-2 text-xs font-bold transition ${reimbursementTarget === "contact" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                        >
                          {t("reimbursable.targetModeContact") || "Kontak / Pihak Luar"}
                        </button>
                      </div>
                    ) : null}
                    {isManagedTargetReimbursement ? (
                      <SelectField
                        id="expense-reimbursement-managed-space"
                        label={t("reimbursable.selectManagedSpace") || "Pilih Managed Space"}
                        onChange={(event) => setReimbursementManagedSpaceId(event.target.value)}
                        value={reimbursementManagedSpaceId}
                      >
                        <option value="">{t("reimbursable.selectManagedSpace") || "Pilih Managed Space"}</option>
                        {reimbursementManagedSpaces.map((managedSpace) => (
                          <option key={managedSpace.id} value={managedSpace.id}>{managedSpace.name}</option>
                        ))}
                      </SelectField>
                    ) : null}
                  </div>
                ) : null}
                {requiresExternalCounterparty ? (
                  <CounterpartyCombobox
                    id="expense-reimbursement-counterparty"
                    counterparties={reimbursementCounterparties}
                    label={t("expenseContext.reimbursementCounterparty")}
                    onChange={(name) => setReimbursementCounterparty(name)}
                    placeholder={t("expenseContext.reimbursementCounterpartyPlaceholder")}
                    required
                    value={reimbursementCounterparty}
                  />
                ) : null}
                {isReimbursement ? (
                  <FormField
                    id="expense-reimbursement-title"
                    label={`${t("debts.itemTitleLabel") || "Keterangan / Judul"} *`}
                    onChange={(event) => setReimbursementTitle(event.target.value)}
                    placeholder={t("transactions.notePlaceholder") || "mis. Makan siang kantor, wifi bulanan"}
                    required
                    value={reimbursementTitle}
                  />
                ) : null}
              </>
            ) : null}

            {mode === "transfer" ? (
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setTransferKind("internal");
                    setCategoryId("");
                  }}
                  className={`rounded-md px-3 py-2 text-left text-xs font-bold transition ${transferKind === "internal" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  <span className="block">{t("transactions.betweenWallets") || "Antar Wallet"}</span>
                  <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{t("transactions.betweenWalletsDesc") || "Pindahkan uang antar wallet/rekening milik sendiri."}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTransferKind("outgoing");
                    setDestinationWalletId("");
                  }}
                  className={`rounded-md px-3 py-2 text-left text-xs font-bold transition ${transferKind === "outgoing" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  <span className="block">{t("transactions.outgoingTransfer") || "Transfer Keluar"}</span>
                  <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{t("transactions.outgoingTransferDesc") || "Kirim uang ke orang lain atau rekening/wallet yang bukan milik saya."}</span>
                </button>
              </div>
            ) : null}

            {isOutgoingTransfer ? (
              <FormField
                id="transfer-recipient"
                label={t("transactions.recipient") || "Penerima / Tujuan"}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder={t("transactions.recipientPlaceholder") || "Andi"}
                value={recipient}
              />
            ) : null}

            {(mode !== "transfer" || isOutgoingTransfer) && !(mode === "income" && isManaged && paymentSource === "personal") ? (
              <SelectField
                id={`${mode}-category`}
                label={isManagedTargetReimbursement ? (t("reimbursable.expenseCategory") || "Kategori pengeluaran space") : mode === "income" ? terms.incomeCategoryLabel : (isOutgoingTransfer ? t("transactions.category") || "Kategori" : (t("categories.title") || "Kategori"))}
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
                onChange={(event) => {
                  if (event.target.value === "__create_new__") {
                    setShowQuickCategoryModal(true);
                  } else {
                    setCategoryId(event.target.value);
                  }
                }}
                value={categoryId}
              >
                <option value="">{reimbursementSupportLoading ? (t("common.loading") || "Memuat...") : (isManagedTargetReimbursement ? (t("reimbursable.selectCategory") || "Pilih Kategori Space") : (t("categories.selectCategory") || "Pilih Kategori"))}</option>
                {reimbursementCategoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
                <option value="__create_new__">{t("categories.createNewOption") || "+ Tambah Kategori Baru..."}</option>
              </SelectField>
            ) : null}

            {mode === "expense" && !isCrossSpaceReimbursement ? (
              <SelectField
                id="expense-envelope"
                label={t("envelopes.title") || "Amplop / Grup Anggaran (Opsional)"}
                action={
                  <button
                    type="button"
                    onClick={() => setShowQuickEnvelopeModal(true)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-kash-emerald transition hover:text-kash-emeraldDark focus:outline-none"
                  >
                    <Plus size={13} strokeWidth={2.5} />
                    {t("envelopes.create") || "Tambah Amplop"}
                  </button>
                }
                onChange={(event) => {
                  if (event.target.value === "__create_new__") {
                    setShowQuickEnvelopeModal(true);
                  } else {
                    setEnvelopeId(event.target.value);
                  }
                }}
                value={envelopeId}
              >
                <option value="">{t("envelopes.noEnvelope") || "-- Tanpa Amplop --"}</option>
                {envelopes.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
                <option value="__create_new__">{t("envelopes.createNewOption") || "+ Buat Amplop Baru..."}</option>
              </SelectField>
            ) : null}

            {mode === "expense" && isManaged ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">{t("transactions.paymentSource") || "Sumber Dana"}</label>
                <div className="flex rounded-lg bg-slate-100 p-1">
                  <button type="button" onClick={() => { setPaymentSource("managed"); setWalletId(""); }} className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${paymentSource === "managed" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Dana Managed</button>
                  <button type="button" onClick={() => { setPaymentSource("personal"); setWalletId(""); setExpenseContext("reimbursable"); }} className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${paymentSource === "personal" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Dana Pribadi</button>
                </div>
              </div>
            ) : null}

            {mode === "income" && isManaged ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">{t("transactions.paymentSource") || "Sumber Dana"}</label>
                <div className="flex rounded-lg bg-slate-100 p-1">
                  <button type="button" onClick={() => { setPaymentSource("managed"); setWalletId(""); }} className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${paymentSource === "managed" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Dana Masuk</button>
                  <button type="button" onClick={() => { setPaymentSource("personal"); setWalletId(""); }} className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${paymentSource === "personal" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Dana Pribadi (Talangan)</button>
                </div>
              </div>
            ) : null}

            <SelectField
              id={`${mode}-wallet`}
              label={
                mode === "transfer"
                  ? t("transactions.fromWallet") || "Dari Dompet"
                  : mode === "income" && isManaged && paymentSource === "personal"
                  ? "Pilih Dompet Pribadi (Sumber Talangan)"
                  : mode === "income" && isManaged
                  ? t("transactions.fundingWalletDestination") || "Pilih Dompet Penerima Dana"
                  : privateWorkExpense && workPaymentSource === "work_fund"
                  ? t("workFunds.selectFund")
                  : paymentSource === "personal" ? t("transactions.personalWallet") || "Pilih Dompet Pribadi"
                  : t("wallets.title") || "Dompet"
              }
              onChange={(event) => setWalletId(event.target.value)}
              value={walletId}
            >
              <option value="">{t("wallets.selectWallet") || "Pilih Dompet"}</option>
              {activeWallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name} / {formatCurrency(wallet.balance?.current_balance ?? wallet.initial_balance, wallet.currency)}
                </option>
              ))}
            </SelectField>

            {isManagedSpacePersonalPayment ? (
              <FormField
                id="expense-managed-reimbursement-title"
                label={`${t("debts.itemTitleLabel") || "Keterangan / Judul"} *`}
                onChange={(event) => setReimbursementTitle(event.target.value)}
                placeholder={t("transactions.notePlaceholder") || "mis. Makan siang kantor, wifi bulanan"}
                required
                value={reimbursementTitle}
              />
            ) : null}

            {mode === "income" && isManaged && paymentSource === "personal" ? (
              <SelectField id="income-destination" label="Pilih Dompet Penerima Dana" onChange={(event) => setDestinationWalletId(event.target.value)} value={destinationWalletId}>
                <option value="">Pilih Dompet Tujuan</option>
                {standardWallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name} / {formatCurrency(wallet.balance?.current_balance ?? wallet.initial_balance, wallet.currency)}
                  </option>
                ))}
              </SelectField>
            ) : null}

            {mode === "transfer" && !isOutgoingTransfer ? (
              <>
                <SelectField id="transfer-destination" label={t("transactions.toWallet") || "Ke Dompet"} onChange={(event) => setDestinationWalletId(event.target.value)} value={destinationWalletId}>
                  <option value="">{t("transactions.selectDestinationWallet") || "Pilih Dompet Tujuan"}</option>
                  {standardWallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name} / {formatCurrency(wallet.balance?.current_balance ?? wallet.initial_balance, wallet.currency)}
                    </option>
                  ))}
                </SelectField>
                <FormField
                  id="transfer-fee"
                  inputMode="numeric"
                  label={t("transactions.transferFeeOptional") || "Biaya Transfer (Opsional)"}
                  onChange={(event) => setTransferFee(formatMoneyDigits(event.target.value))}
                  placeholder="0"
                  value={transferFee}
                />
              </>
            ) : null}

            {isOutgoingTransfer ? (
              <FormField
                id="transfer-fee"
                inputMode="numeric"
                label={t("transactions.adminFeeOptional") || "Biaya Admin (Opsional)"}
                onChange={(event) => setTransferFee(formatMoneyDigits(event.target.value))}
                placeholder="0"
                value={transferFee}
              />
            ) : null}

            <DatePickerField id={`${mode}-date`} label={t("transactions.dateTime") || "Tanggal & Waktu"} enableTime onChange={(value) => setTransactionDate(value)} value={transactionDate} />

            <FormField
              disabled={saving}
              hasError={!isAmountError(error) ? Boolean(error) : false}
              hint={!isAmountError(error) ? error ?? undefined : undefined}
              id="transaction-note"
              label={t("transactions.noteOptional") || "Catatan (Opsional)"}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("transactions.notePlaceholder") || "mis. Makan siang bersama tim, wifi bulanan"}
              value={note}
            />

            {isReimbursement ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">{t("reimbursable.preview") || "Pratinjau Reimbursement"}</p>
                <div className="mt-2 grid gap-2">
                  <div className="rounded-lg border border-slate-200/80 bg-white p-2.5">
                    <p className="font-bold text-slate-900">{selectedWallet?.name ?? (t("reimbursable.paidFrom") || "Dompet")}</p>
                    <div className="mt-1 flex justify-between gap-3 font-semibold text-slate-600"><span>{t("reimbursable.paidFrom") || "Dibayar dari"}</span><span className="font-extrabold text-kash-expense">-{formatCurrency(amountNumber, selectedWallet?.currency ?? "IDR")}</span></div>
                    <div className="mt-1 flex justify-between gap-3 font-semibold text-slate-600"><span>{t("debts.receivable") || "Piutang"}</span><span className="font-extrabold text-kash-emeraldDark">+{formatCurrency(amountNumber, selectedWallet?.currency ?? "IDR")}</span></div>
                  </div>
                  <div className="rounded-lg border border-slate-200/80 bg-white p-2.5">
                    <p className="font-bold text-slate-900">{isManagedTargetReimbursement ? selectedReimbursementManagedSpace?.name ?? (t("spaces.managed") || "Managed Space") : isManagedSpacePersonalPayment ? activeSpace?.name ?? (t("spaces.managed") || "Managed Space") : reimbursementCounterparty.trim() || "—"}</p>
                    <div className="mt-1 flex justify-between gap-3 font-semibold text-slate-600"><span>{isCrossSpaceReimbursement ? `${t("transactions.expense") || "Pengeluaran"}${selectedReimbursementCategory ? ` (${selectedReimbursementCategory.name})` : ""}` : (t("reimbursable.reimbursedBy") || "Direimburse oleh")}</span><span className="font-extrabold text-slate-900">{isCrossSpaceReimbursement ? `+${formatCurrency(amountNumber, selectedWallet?.currency ?? "IDR")}` : (t("reimbursable.awaitingReimbursement") || "Menunggu reimbursement")}</span></div>
                    {isCrossSpaceReimbursement ? <div className="mt-1 flex justify-between gap-3 font-semibold text-slate-600"><span>{t("reimbursable.cashMovement") || "Pergerakan kas"}</span><span>{formatCurrency(0, selectedWallet?.currency ?? "IDR")}</span></div> : null}
                  </div>
                </div>
              </div>
            ) : null}

            {mode === "transfer" && selectedWallet && (destinationWallet || isOutgoingTransfer) ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
                <p className="font-bold text-slate-900">{isOutgoingTransfer ? t("transactions.outgoingTransfer") || "Transfer Keluar" : t("transactions.transferBreakdown") || "Rincian Transfer"}</p>
                <dl className="mt-2 space-y-1">
                  <div className="flex justify-between gap-4">
                    <dt>{isOutgoingTransfer ? t("transactions.transferAmount") || "Nominal Transfer" : `${t("transactions.from") || "Dari"} ${selectedWallet?.name ?? "-"}`}</dt>
                    <dd>{formatCurrency(amountNumber, selectedWallet?.currency ?? "IDR")}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>{isOutgoingTransfer ? t("transactions.adminFee") || "Biaya Admin" : t("transactions.fee") || "Biaya"}</dt>
                    <dd>{formatCurrency(feeNumber, selectedWallet?.currency ?? "IDR")}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-slate-900">
                    <dt>{isOutgoingTransfer ? t("transactions.totalOutgoing") || "Total Keluar" : t("transactions.totalDeducted") || "Total Terpotong"}</dt>
                    <dd>{formatCurrency(totalDeducted, selectedWallet?.currency ?? "IDR")}</dd>
                  </div>
                  {!isOutgoingTransfer ? (
                    <div className="flex justify-between gap-4">
                      <dt>{destinationWallet?.name ?? "Tujuan"} {t("transactions.receives") || "menerima"}</dt>
                      <dd>{formatCurrency(amountNumber, destinationWallet?.currency ?? "IDR")}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            ) : null}

            {mode === "transfer" && !isOutgoingTransfer && standardWallets.length < 2 ? (
              <p className="rounded-lg border border-kash-gold/40 bg-kash-gold/10 px-4 py-3 text-sm font-bold text-slate-900">
                {t("transactions.needTwoWallets") || "Tambahkan setidaknya satu dompet aktif lainnya sebelum membuat transfer."}
              </p>
            ) : null}

            <Button disabled={saving || (mode === "transfer" && !isOutgoingTransfer && standardWallets.length < 2)} type="submit">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
              {saving ? (t("common.saving") || "Menyimpan...") : copy.submitLabel}
            </Button>
            {initialDate ? (
              <Button
                disabled={saving || (mode === "transfer" && !isOutgoingTransfer && standardWallets.length < 2)}
                type="button"
                variant="secondary"
                onClick={() => void submit(undefined, true)}
              >
                {t("dailyCheckin.saveAndAddAnother") || "Simpan & Tambah Lagi"}
              </Button>
            ) : null}
          </form>
        )}

        <QuickCreateCategoryModal
          isOpen={showQuickCategoryModal}
          categoryType={mode === "income" ? "income" : "expense"}
          spaceId={isManagedTargetReimbursement ? reimbursementManagedSpaceId : spaceId}
          onClose={() => setShowQuickCategoryModal(false)}
          onCreated={(newCat) => {
            const updateCategories = (prev: Category[]) => {
              const exists = prev.some((c) => c.id === newCat.id);
              return exists ? prev.map((c) => (c.id === newCat.id ? newCat : c)) : [...prev, newCat];
            };
            if (isManagedTargetReimbursement) {
              setReimbursementManagedCategories(updateCategories);
            } else {
              setCategories(updateCategories);
            }
            setCategoryId(newCat.id);
            setShowQuickCategoryModal(false);
          }}
        />

        <QuickCreateEnvelopeModal
          isOpen={showQuickEnvelopeModal}
          spaceId={spaceId}
          onClose={() => setShowQuickEnvelopeModal(false)}
          onCreated={(newEnv) => {
            setEnvelopes((prev) => {
              const exists = prev.some((e) => e.id === newEnv.id);
              return exists ? prev.map((e) => (e.id === newEnv.id ? newEnv : e)) : [newEnv, ...prev];
            });
            setEnvelopeId(newEnv.id);
            setShowQuickEnvelopeModal(false);
          }}
        />
      </div>
    </Modal>
  );
}
