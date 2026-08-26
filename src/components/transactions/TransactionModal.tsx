import { ArrowDown, ArrowRightLeft, ArrowUp, Loader2, Plus, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { QuickCreateCategoryModal } from "../categories/QuickCreateCategoryModal";
import { QuickCreateEnvelopeModal } from "../envelopes/QuickCreateEnvelopeModal";
import { Button } from "../ui/Button";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";
import { useI18n } from "../../i18n";
import { getActiveCategories } from "../../lib/categories";
import { getEnvelopes } from "../../lib/envelopes";
import { addMoneyValues, formatCurrency, formatMoneyDigits, isMoneyGreaterThan, parseMoneyInputDigits, toNumber } from "../../lib/money";
import { createExpense, createIncome, createTransfer, filterCategoriesByType } from "../../lib/transactions";
import { getWallets, type WalletWithBalance } from "../../lib/wallets";
import { emitTransactionSaved } from "../../lib/appEvents";
import { getCurrentLocalDatetimeString } from "../../lib/datetime";
import type { Category, Envelope } from "../../types/domain";
import { useSpaceTerminology } from "../../hooks/useSpaceTerminology";

export type QuickTransactionMode = "expense" | "income" | "transfer";

type TransactionModalProps = {
  mode: QuickTransactionMode;
  onClose: () => void;
  onSaved?: () => void;
};

function isAmountError(error: string | null) {
  if (!error) return false;
  const normalizedError = error.toLowerCase();
  return normalizedError.includes("amount") || normalizedError.includes("balance");
}

export function TransactionModal({ mode, onClose, onSaved }: TransactionModalProps) {
  const { t, formatCurrency } = useI18n();
  const terms = useSpaceTerminology();

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
  const [showQuickCategoryModal, setShowQuickCategoryModal] = useState(false);
  const [showQuickEnvelopeModal, setShowQuickEnvelopeModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [transferFee, setTransferFee] = useState("0");
  const [transactionDate, setTransactionDate] = useState(getCurrentLocalDatetimeString());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLElement>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    const [walletResult, categoryResult, envelopeResult] = await Promise.all([
      getWallets(),
      getActiveCategories(),
      getEnvelopes(),
    ]);

    if (walletResult.error || categoryResult.error || !walletResult.data || !categoryResult.data) {
      setError(t("transactions.loadError") || "Gagal memuat dompet dan kategori. Silakan coba lagi.");
      setLoading(false);
      return;
    }

    setWallets(walletResult.data);
    setCategories(categoryResult.data);
    setEnvelopes(envelopeResult.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!error) return;
    modalRef.current?.scrollTo({ behavior: "smooth", top: 0 });
  }, [error]);

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
  const selectedWalletBalance = selectedWallet?.balance?.current_balance ?? selectedWallet?.initial_balance ?? "0";
  const totalTransferDeduction = mode === "transfer" ? addMoneyValues(amountDigits, feeDigits || "0") : amountDigits;
  const amountHasError = isAmountError(error);

  const validate = () => {
    if (!walletId) return t("transactions.chooseWallet") || "Pilih dompet.";
    if (!amountDigits || amountNumber <= 0) return t("transactions.amountGreaterThanZero") || "Nominal harus lebih besar dari nol.";
    if (!transactionDate) return t("transactions.chooseDate") || "Pilih tanggal transaksi.";

    if (mode === "transfer") {
      if (!destinationWalletId) return t("transactions.chooseDestinationWallet") || "Pilih dompet tujuan.";
      if (walletId === destinationWalletId) return t("transactions.walletsMustBeDifferent") || "Dompet asal dan tujuan harus berbeda.";
      if (feeNumber < 0) return t("transactions.feeCannotBeNegative") || "Biaya transfer tidak boleh bernilai negatif.";
      if (isMoneyGreaterThan(totalTransferDeduction, selectedWalletBalance)) {
        return t("transactions.insufficientBalanceTransfer") || "Saldo dompet tidak mencukupi. Periksa kembali nominal transfer.";
      }
      return null;
    }

    if (!categoryId) return t("transactions.chooseCategory") || "Pilih kategori.";
    if (mode === "expense" && isMoneyGreaterThan(amountDigits, selectedWalletBalance)) {
      return t("transactions.insufficientBalanceExpense") || "Saldo dompet tidak mencukupi. Periksa kembali nominal transaksi.";
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
              envelopeId: envelopeId || null,
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
        setError(t("transactions.saveError") || "Gagal menyimpan transaksi. Silakan periksa data dan coba lagi.");
        setSaving(false);
        return;
      }

      emitTransactionSaved();
      onSaved?.();
      onClose();
    } catch (transactionError) {
      console.error("Failed to create transaction", transactionError);
      setError(transactionError instanceof Error ? transactionError.message : (t("transactions.saveErrorAuth") || "Gagal menyimpan transaksi. Silakan coba lagi."));
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
        mode === "transfer" ? (t("transactions.transferDesc") || "Pindahkan saldo antar dompet pribadi.") : (t("transactions.singleTransactionDesc") || "Catat satu transaksi keuangan.")
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
          <form className="mt-5 grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
            <FormField
              hasError={amountHasError}
              id={`${mode}-amount`}
              inputMode="numeric"
              label={t("transactions.amount") || "Nominal"}
              onChange={(event) => setAmount(formatMoneyDigits(event.target.value))}
              placeholder="125.000"
              value={amount}
            />

            {mode !== "transfer" ? (
              <SelectField
                id={`${mode}-category`}
                label={mode === "income" ? terms.incomeCategoryLabel : (t("categories.title") || "Kategori")}
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
                <option value="">{t("categories.selectCategory") || "Pilih Kategori"}</option>
                {filteredCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
                <option value="__create_new__">{t("categories.createNewOption") || "+ Tambah Kategori Baru..."}</option>
              </SelectField>
            ) : null}

            {mode === "expense" ? (
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

            <SelectField
              id={`${mode}-wallet`}
              label={
                mode === "transfer"
                  ? t("transactions.fromWallet") || "Dari Dompet"
                  : mode === "income" && terms.isManaged
                  ? t("transactions.fundingWalletDestination") || "Pilih Dompet Penerima Dana"
                  : t("wallets.title") || "Dompet"
              }
              onChange={(event) => setWalletId(event.target.value)}
              value={walletId}
            >
              <option value="">{t("wallets.selectWallet") || "Pilih Dompet"}</option>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name} / {formatCurrency(wallet.balance?.current_balance ?? wallet.initial_balance, wallet.currency)}
                </option>
              ))}
            </SelectField>

            {mode === "transfer" ? (
              <>
                <SelectField id="transfer-destination" label={t("transactions.toWallet") || "Ke Dompet"} onChange={(event) => setDestinationWalletId(event.target.value)} value={destinationWalletId}>
                  <option value="">{t("transactions.selectDestinationWallet") || "Pilih Dompet Tujuan"}</option>
                  {wallets.map((wallet) => (
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

            {mode === "transfer" && selectedWallet && destinationWallet ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
                <p className="font-bold text-slate-900">{t("transactions.transferBreakdown") || "Rincian Transfer"}</p>
                <dl className="mt-2 space-y-1">
                  <div className="flex justify-between gap-4">
                    <dt>{t("transactions.from") || "Dari"} {selectedWallet?.name ?? "-"}</dt>
                    <dd>{formatCurrency(amountNumber, selectedWallet?.currency ?? "IDR")}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>{t("transactions.fee") || "Biaya"}</dt>
                    <dd>{formatCurrency(feeNumber, selectedWallet?.currency ?? "IDR")}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-slate-900">
                    <dt>{t("transactions.totalDeducted") || "Total Terpotong"}</dt>
                    <dd>{formatCurrency(totalDeducted, selectedWallet?.currency ?? "IDR")}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>{destinationWallet?.name ?? "Tujuan"} {t("transactions.receives") || "menerima"}</dt>
                    <dd>{formatCurrency(amountNumber, destinationWallet?.currency ?? "IDR")}</dd>
                  </div>
                </dl>
              </div>
            ) : null}

            {mode === "transfer" && wallets.length < 2 ? (
              <p className="rounded-lg border border-kash-gold/40 bg-kash-gold/10 px-4 py-3 text-sm font-bold text-slate-900">
                {t("transactions.needTwoWallets") || "Tambahkan setidaknya satu dompet aktif lainnya sebelum membuat transfer."}
              </p>
            ) : null}

            <Button disabled={saving || (mode === "transfer" && wallets.length < 2)} type="submit">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
              {saving ? (t("common.saving") || "Menyimpan...") : copy.submitLabel}
            </Button>
          </form>
        )}

        <QuickCreateCategoryModal
          isOpen={showQuickCategoryModal}
          categoryType={mode === "income" ? "income" : "expense"}
          onClose={() => setShowQuickCategoryModal(false)}
          onCreated={(newCat) => {
            setCategories((prev) => {
              const exists = prev.some((c) => c.id === newCat.id);
              return exists ? prev.map((c) => (c.id === newCat.id ? newCat : c)) : [...prev, newCat];
            });
            setCategoryId(newCat.id);
            setShowQuickCategoryModal(false);
          }}
        />

        <QuickCreateEnvelopeModal
          isOpen={showQuickEnvelopeModal}
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
