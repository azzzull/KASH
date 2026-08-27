import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Building2,
  Loader2,
  Plus,
  ReceiptText,
  User,
} from "lucide-react";

import { CounterpartyCombobox } from "./CounterpartyCombobox";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { SelectField } from "../ui/SelectField";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { QuickCreateCategoryModal } from "../categories/QuickCreateCategoryModal";

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
  getFinancialSpaces,
  getPersonalSpace,
} from "../../lib/spaces";

import {
  getActiveCategories,
} from "../../lib/categories";

import {
  createCrossSpaceExpense,
  filterCategoriesByType,
} from "../../lib/transactions";

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

import { useI18n } from "../../i18n";
import type { Category, Counterparty, FinancialSpace } from "../../types/domain";

type ReimbursableExpenseModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

function getTodayLocalDateTime() {
  const now = new Date();
  const local = new Date(
    now.getTime() - now.getTimezoneOffset() * 60_000,
  );
  return local.toISOString().slice(0, 16);
}

export function ReimbursableExpenseModal({
  isOpen,
  onClose,
  onSaved,
}: ReimbursableExpenseModalProps) {
  const { t } = useI18n();

  // Mode: "managed" (Financial Space) | "contact" (External Contact)
  const [targetMode, setTargetMode] = useState<"managed" | "contact">("managed");

  // Spaces & support data
  const [personalSpace, setPersonalSpace] = useState<FinancialSpace | null>(null);
  const [managedSpaces, setManagedSpaces] = useState<FinancialSpace[]>([]);
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [loadingData, setLoadingData] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Form state
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");
  const [selectedManagedSpaceId, setSelectedManagedSpaceId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [transactionDate, setTransactionDate] = useState(getTodayLocalDateTime());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQuickCategoryModal, setShowQuickCategoryModal] = useState(false);

  // Active wallets list (from current Personal space)
  const activeWallets = useMemo(() => {
    return wallets.filter((w) => !w.is_archived);
  }, [wallets]);

  // Selected personal wallet
  const selectedWallet = useMemo(() => {
    return activeWallets.find((w) => w.id === walletId) ?? null;
  }, [activeWallets, walletId]);

  // Selected Managed Space
  const selectedManagedSpace = useMemo(() => {
    return managedSpaces.find((s) => s.id === selectedManagedSpaceId) ?? null;
  }, [managedSpaces, selectedManagedSpaceId]);

  // Expense categories for the selected Managed Space
  const expenseCategories = useMemo(() => {
    return filterCategoriesByType(categories, "expense");
  }, [categories]);

  // Selected category object
  const selectedCategory = useMemo(() => {
    return expenseCategories.find((c) => c.id === categoryId) ?? null;
  }, [expenseCategories, categoryId]);

  // Numeric parsed amount
  const parsedAmount = useMemo(() => {
    const raw = parseMoneyInputDigits(amount);
    return toNumber(raw);
  }, [amount]);

  // Reset form to defaults
  const resetForm = () => {
    setAmount("");
    setWalletId("");
    setSelectedManagedSpaceId(managedSpaces[0]?.id ?? "");
    setCategoryId("");
    setCounterpartyName("");
    setTitle("");
    setNote("");
    setTransactionDate(getTodayLocalDateTime());
    setError(null);
    setSaving(false);
  };

  // Load initial prerequisite data when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    async function loadPrerequisites() {
      setLoadingData(true);
      setError(null);

      try {
        const [pSpaceRes, allSpacesRes, cpRes] = await Promise.all([
          getPersonalSpace(),
          getFinancialSpaces(),
          getCounterparties(),
        ]);

        if (!isMounted) return;

        const pSpace = pSpaceRes.data;
        const allSpaces = allSpacesRes.data;

        setPersonalSpace(pSpace);

        const activeManaged = (allSpaces ?? []).filter(
          (s) => s.space_type === "managed" && !s.is_archived,
        );
        setManagedSpaces(activeManaged);

        if (activeManaged.length > 0) {
          setSelectedManagedSpaceId((prev) => prev || activeManaged[0].id);
          setTargetMode("managed");
        } else {
          setTargetMode("contact");
        }

        if (pSpace) {
          const walletsRes = await getWallets(pSpace.id);
          if (isMounted && walletsRes.data) {
            setWallets(walletsRes.data);
            const defaultWallet = walletsRes.data.find((w) => !w.is_archived);
            if (defaultWallet) {
              setWalletId((prev) => prev || defaultWallet.id);
            }
          }
        }

        if (cpRes && cpRes.allCounterparties) {
          setCounterparties(cpRes.allCounterparties);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(
          err?.message ?? (t("transactions.loadError") || "Gagal memuat data pendukung."),
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
  }, [isOpen, t]);

  // Load categories whenever selected Managed Space changes
  useEffect(() => {
    if (!isOpen || targetMode !== "managed" || !selectedManagedSpaceId) {
      setCategories([]);
      return;
    }

    let isMounted = true;

    async function loadSpaceCategories() {
      setLoadingCategories(true);
      // Clear previous category immediately so no stale category leaks
      setCategoryId("");

      try {
        const { data: spaceCategories } = await getActiveCategories(selectedManagedSpaceId);
        if (isMounted && spaceCategories) {
          setCategories(spaceCategories);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("Failed to load categories for space", err);
        }
      } finally {
        if (isMounted) {
          setLoadingCategories(false);
        }
      }
    }

    void loadSpaceCategories();

    return () => {
      isMounted = false;
    };
  }, [isOpen, targetMode, selectedManagedSpaceId]);

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
      setError(t("transactions.amountGreaterThanZero") || "Nominal harus lebih besar dari 0.");
      return;
    }

    if (!walletId) {
      setError(t("transactions.chooseWallet") || "Pilih dompet yang valid untuk pembayaran.");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t("debts.itemTitleRequiredDirect") || "Judul / keterangan pengeluaran wajib diisi.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (targetMode === "managed") {
        if (!selectedManagedSpaceId) {
          throw new Error(t("reimbursable.selectManagedSpace") || "Pilih Managed Space yang akan mereimburse.");
        }
        if (!categoryId) {
          throw new Error(t("transactions.chooseCategory") || "Pilih kategori pengeluaran space.");
        }
        if (!personalSpace) {
          throw new Error("Personal Space tidak ditemukan.");
        }

        await createCrossSpaceExpense({
          amount: rawDigits,
          categoryId,
          title: trimmedTitle,
          note: note.trim() || null,
          transactionDate,
          personalWalletId: walletId,
          personalSpaceId: personalSpace.id,
          managedSpaceId: selectedManagedSpaceId,
        });
      } else {
        // Non-space counterparty flow
        const trimmedCounterparty = counterpartyName.trim();
        if (!trimmedCounterparty) {
          throw new Error(t("debts.counterpartyRequired") || "Silakan pilih atau buat nama pihak yang bersangkutan.");
        }

        const cpResult = await findOrCreateCounterparty(trimmedCounterparty);
        if (cpResult.error || !cpResult.data) {
          throw new Error(cpResult.error?.message ?? (t("debts.resolveCounterpartyFailed") || "Gagal memproses kontak."));
        }

        const result = await createMultipleDebts(
          [
            {
              counterpartyId: cpResult.data.id,
              type: "receivable",
              title: trimmedTitle,
              originalAmount: rawDigits,
              dueDate: null,
              note: note.trim() || "Recorded via Reimbursable Expense Quick Entry",
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
      }

      // Notify app of changes
      emitDebtSaved();
      emitTransactionSaved();
      onSaved?.();
      close();
    } catch (err: any) {
      setError(err?.message ?? (t("transactions.saveError") || "Terjadi kesalahan saat menyimpan transaksi."));
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
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-kash-emeraldDark">
            <ReceiptText size={20} strokeWidth={2.5} />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              {t("reimbursable.title") || "Pengeluaran Reimburse"}
            </h2>
            <p className="text-xs font-semibold text-slate-600">
              {t("reimbursable.desc") || "Catat pengeluaran pribadi untuk diganti oleh Managed Space."}
            </p>
          </div>
        </div>
      }
    >
      {loadingData ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-slate-600">
          <Loader2 className="animate-spin" size={18} />
          {t("common.loading") || "Memuat..."}
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          {/* Target Mode Selector (if managed spaces exist) */}
          {managedSpaces.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700">
                {t("reimbursable.reimbursedBy") || "Direimburse oleh"}
              </label>
              <div className="flex rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setTargetMode("managed")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold transition ${
                    targetMode === "managed"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Building2 size={13} />
                  {t("reimbursable.targetModeManaged") || "Financial Space (Managed)"}
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode("contact")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold transition ${
                    targetMode === "contact"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <User size={13} />
                  {t("reimbursable.targetModeContact") || "Kontak / Pihak Luar"}
                </button>
              </div>
            </div>
          ) : null}

          {/* Amount Field */}
          <FormField
            id="reimbursable-amount"
            inputMode="numeric"
            label={`${t("transactions.amount") || "Nominal"} *`}
            onChange={(event) =>
              setAmount(formatMoneyDigits(event.target.value))
            }
            placeholder="100.000"
            required
            value={amount}
          />

          {/* Paid From Wallet (Current Personal Space only) */}
          <SelectField
            id="reimbursable-wallet"
            label={`${t("reimbursable.paidFrom") || "Dibayar dari"} *`}
            onChange={(event) => setWalletId(event.target.value)}
            required
            value={walletId}
          >
            <option value="">
              {t("wallets.selectWallet") || "Pilih Dompet Pribadi"}
            </option>
            {activeWallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name} ({formatCurrency(wallet.balance?.current_balance ?? wallet.initial_balance, wallet.currency)})
              </option>
            ))}
          </SelectField>

          {/* Reimbursed By: Specific Managed Space Picker OR Counterparty Combobox */}
          {targetMode === "managed" ? (
            managedSpaces.length > 0 ? (
              <SelectField
                id="reimbursable-managed-space"
                label={`${t("reimbursable.reimbursedBy") || "Direimburse oleh (Managed Space)"} *`}
                onChange={(event) => setSelectedManagedSpaceId(event.target.value)}
                required
                value={selectedManagedSpaceId}
              >
                {managedSpaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </SelectField>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs font-semibold text-amber-900">
                {t("reimbursable.noManagedSpaces") ||
                  "Belum ada Financial Space kelolaan aktif. Anda dapat mencatat reimbursement ke Kontak Luar."}
              </div>
            )
          ) : (
            <CounterpartyCombobox
              id="reimbursable-counterparty"
              counterparties={counterparties}
              onChange={(name) => setCounterpartyName(name)}
              value={counterpartyName}
              label={`${t("reimbursable.reimbursedBy") || "Direimburse oleh"} *`}
              placeholder={t("debts.typeNameToSearch") || "Ketik atau pilih kontak..."}
              required
            />
          )}

          {/* Managed Category Picker (Only in Managed mode) */}
          {targetMode === "managed" ? (
            <SelectField
              id="reimbursable-category"
              label={`${t("reimbursable.expenseCategory") || "Kategori pengeluaran space"} *`}
              action={
                selectedManagedSpaceId ? (
                  <button
                    type="button"
                    onClick={() => setShowQuickCategoryModal(true)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-kash-emerald transition hover:text-kash-emeraldDark focus:outline-none"
                  >
                    <Plus size={13} strokeWidth={2.5} />
                    {t("categories.create") || "Tambah Kategori"}
                  </button>
                ) : null
              }
              onChange={(event) => {
                if (event.target.value === "__create_new__") {
                  setShowQuickCategoryModal(true);
                } else {
                  setCategoryId(event.target.value);
                }
              }}
              required
              value={categoryId}
            >
              <option value="">
                {loadingCategories
                  ? (t("common.loading") || "Memuat kategori...")
                  : (t("categories.selectCategory") || "Pilih Kategori")}
              </option>
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
              {selectedManagedSpaceId ? (
                <option value="__create_new__">
                  {t("categories.createNewOption") || "+ Tambah Kategori Baru..."}
                </option>
              ) : null}
            </SelectField>
          ) : null}

          {/* Title / Description */}
          <FormField
            id="reimbursable-title"
            label={`${t("debts.itemTitleLabel") || "Keterangan / Judul"} *`}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="misal: Makan siang kantor, Wifi bulanan..."
            required
            value={title}
          />

          {/* Date & Time */}
          <DatePickerField
            id="reimbursable-date"
            label={t("transactions.dateTime") || "Tanggal & Waktu"}
            enableTime
            onChange={setTransactionDate}
            value={transactionDate}
          />

          {/* Note (Optional) */}
          <FormField
            id="reimbursable-note"
            label={t("transactions.noteOptional") || "Catatan (Opsional)"}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("transactions.notePlaceholder") || "Catatan tambahan..."}
            value={note}
          />

          {/* Live Preview */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2">
              {t("reimbursable.preview") || "Pratinjau Reimbursement"}
            </p>

            <div className="space-y-2">
              {/* Personal Space Impact */}
              <div className="rounded-lg bg-white p-2.5 border border-slate-200/80 shadow-xs">
                <div className="font-bold text-slate-900 mb-1.5">
                  {personalSpace?.name ?? "Personal"}
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-slate-600 font-semibold">
                    {selectedWallet?.name ?? (t("reimbursable.paidFrom") || "Dompet")}
                  </span>
                  <span className="font-extrabold text-kash-expense">
                    -{formatCurrency(parsedAmount, "IDR")}
                  </span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-slate-600 font-semibold">
                    {t("debts.receivable") || "Piutang"}
                  </span>
                  <span className="font-extrabold text-kash-emeraldDark">
                    +{formatCurrency(parsedAmount, "IDR")}
                  </span>
                </div>
              </div>

              {/* Managed Space Impact (or Contact target) */}
              {targetMode === "managed" ? (
                <div className="rounded-lg bg-white p-2.5 border border-slate-200/80 shadow-xs">
                  <div className="font-bold text-slate-900 mb-1.5">
                    {selectedManagedSpace?.name ?? (t("spaces.managed") || "Managed Space")}
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-slate-600 font-semibold">
                      {t("transactions.expense") || "Pengeluaran"} {selectedCategory ? `(${selectedCategory.name})` : ""}
                    </span>
                    <span className="font-extrabold text-slate-900">
                      +{formatCurrency(parsedAmount, "IDR")}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-slate-600 font-semibold">
                      {t("reimbursable.cashMovement") || "Pergerakan kas"}
                    </span>
                    <span className="font-extrabold text-slate-500">
                      {formatCurrency(0, "IDR")}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-white p-2.5 border border-slate-200/80 shadow-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 font-semibold">
                      {t("reimbursable.reimbursedBy") || "Direimburse oleh"}
                    </span>
                    <span className="font-extrabold text-slate-900 truncate max-w-[180px]">
                      {counterpartyName.trim() || "—"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-kash-expense/30 bg-kash-expense/10 p-3 text-sm font-semibold text-kash-expense">
              {error}
            </div>
          ) : null}

          <div className="mt-6 flex justify-end gap-3 pt-2 border-t border-slate-100">
            <Button
              disabled={saving}
              onClick={close}
              type="button"
              variant="secondary"
            >
              {t("common.cancel") || "Batal"}
            </Button>

            <Button disabled={saving} type="submit">
              {saving ? <Loader2 className="animate-spin" size={16} /> : null}
              {saving ? (t("common.saving") || "Menyimpan...") : (t("common.save") || "Simpan")}
            </Button>
          </div>
        </form>
      )}

      {/* Quick Create Category Modal for Selected Managed Space */}
      {selectedManagedSpaceId ? (
        <QuickCreateCategoryModal
          isOpen={showQuickCategoryModal}
          categoryType="expense"
          spaceId={selectedManagedSpaceId}
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
      ) : null}
    </Modal>
  );
}