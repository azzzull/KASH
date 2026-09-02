import {
  Archive,
  ChevronLeft,
  CreditCard,
  Edit3,
  Loader2,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  WalletCards,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import { ContextualCreateAction } from "../components/ui/ContextualCreateAction";
import { EntityMoreActionsMenu } from "../components/ui/EntityMoreActionsMenu";
import { FormField } from "../components/ui/FormField";
import { HeaderArchiveButton } from "../components/ui/HeaderActionControls";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { ToggleField } from "../components/ui/ToggleField";
import {
  AdjustmentModal,
  EditWalletModal,
} from "../components/wallets/WalletModals";
import { useAuth } from "../context/AuthContext";
import { useActiveSpace } from "../context/ActiveSpaceContext";
import { useAppEvent } from "../hooks/useAppEvent";
import { useI18n } from "../i18n";
import { appEvents, emitTransactionSaved } from "../lib/appEvents";
import {
  formatCurrency,
  formatMoneyDigits,
  parseMoneyInputDigits,
  toNumber,
} from "../lib/money";
import {
  getWalletIcon,
  getWalletTypeOption,
  isLiquidWallet,
  walletColors,
  walletIconOptions,
  walletTypeOptions,
} from "../lib/walletMeta";
import {
  archiveWallet,
  createWallet,
  getArchivedWalletsCount,
  getWalletTransactionCount,
  getWallets,
  restoreWallet,
  type WalletWithBalance,
} from "../lib/wallets";
import type { WalletType } from "../types/domain";

type WalletFormState = {
  name: string;
  walletType: WalletType;
  institutionName: string;
  initialBalance: string;
  currency: string;
  includeInNetWorth: boolean;
  icon: string;
  color: string;
};

const defaultFormState: WalletFormState = {
  name: "",
  walletType: "bank",
  institutionName: "",
  initialBalance: "",
  currency: "IDR",
  includeInNetWorth: true,
  icon: "landmark",
  color: "#10B981",
};

function WalletRow({
  wallet,
  onEdit,
  onAdjustBalance,
  onArchive,
  onRestore,
  onDeletePermanently,
}: {
  wallet: WalletWithBalance;
  onEdit?: () => void;
  onAdjustBalance?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDeletePermanently?: () => void;
}) {
  const { t, formatCurrency } = useI18n();
  const typeOption = getWalletTypeOption(wallet.wallet_type);
  const Icon = getWalletIcon(wallet.icon, wallet.wallet_type);
  const accent = wallet.color ?? "#10B981";
  const isGoalPocket = Boolean(wallet.goal_id);
  const isSavingsPocket = wallet.wallet_type === "savings" && !wallet.goal_id;
  const isInvestment = wallet.wallet_type === "investment";
  const currentBal = wallet.balance?.current_balance ?? wallet.initial_balance;

  return (
    <div
      className={`kash-activity-row flex items-center justify-between gap-3 rounded-2xl border border-slate-200/60 bg-white p-3.5 shadow-card transition hover:border-kash-emerald/40 hover:shadow-md min-w-0 max-w-full ${
        wallet.is_archived ? "opacity-80" : ""
      }`}
    >
      <Link
        to={`/wallets/${wallet.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition"
          style={{ backgroundColor: `${accent}15`, color: accent }}
        >
          <Icon aria-hidden="true" size={20} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm font-extrabold ${
              wallet.is_archived
                ? "text-slate-700 line-through"
                : "text-slate-900 hover:text-kash-emerald transition"
            }`}
          >
            {wallet.name}
          </p>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
            {[
              wallet.institution_name,
              isGoalPocket
                ? t("wallets.goalPocket") || "Kantong Target"
                : typeOption.label,
            ]
              .filter(Boolean)
              .join(" • ")}
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-2.5 shrink-0">
        <Link to={`/wallets/${wallet.id}`} className="text-right">
          <p className="text-sm font-extrabold text-slate-900 md:text-base">
            {formatCurrency(currentBal, wallet.currency)}
          </p>
          {isGoalPocket ? (
            <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200/50">
              {t("goals.goal") || "Goal"}: {wallet.goal_name}
            </span>
          ) : isSavingsPocket ? (
            <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-kash-emerald/10 px-2 py-0.5 text-[10px] font-bold text-kash-emeraldDark border border-kash-emerald/20">
              {t("wallets.savingsPocket") || "Tabungan"}
            </span>
          ) : isInvestment && wallet.balance?.return_percentage !== undefined ? (
            <span
              className={`mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-bold ${
                Number(wallet.balance.return_percentage) >= 0
                  ? "text-kash-emerald"
                  : "text-[#E50914]"
              }`}
            >
              {Number(wallet.balance.return_percentage) >= 0 ? "+" : ""}
              {Number(wallet.balance.return_percentage).toFixed(2)}%{" "}
              {t("wallets.return") || "return"}
            </span>
          ) : null}
        </Link>

        <EntityMoreActionsMenu
          triggerVariant="ghost"
          ariaLabel={`Opsi dompet ${wallet.name}`}
          items={[
            {
              label: t("common.edit") || "Edit",
              icon: Edit3,
              hidden: wallet.is_archived || !onEdit,
              onClick: onEdit ?? (() => {}),
            },
            {
              label: t("wallets.adjustBalance") || "Sesuaikan Saldo",
              icon: SlidersHorizontal,
              hidden:
                isInvestment ||
                Boolean(wallet.goal_id) ||
                wallet.is_archived ||
                !onAdjustBalance,
              onClick: onAdjustBalance ?? (() => {}),
            },
            {
              label: wallet.is_archived
                ? t("wallets.restoreWallet") || "Pulihkan Dompet"
                : t("common.archive") || "Arsipkan",
              icon: wallet.is_archived ? RotateCcw : Trash2,
              isDestructive: !wallet.is_archived,
              separatorBefore: true,
              onClick:
                (wallet.is_archived ? onRestore : onArchive) ?? (() => {}),
            },
            {
              label: t("wallets.deleteWalletPermanently") || "Hapus Permanen",
              icon: Trash2,
              isDestructive: true,
              hidden: !wallet.is_archived || !onDeletePermanently,
              separatorBefore: true,
              onClick: onDeletePermanently ?? (() => {}),
            },
          ]}
        />
      </div>
    </div>
  );
}

function WalletFormModal({
  defaultCurrency,
  onClose,
  onSaved,
}: {
  defaultCurrency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<WalletFormState>({
    ...defaultFormState,
    currency: defaultCurrency,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedType = getWalletTypeOption(form.walletType);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    const institutionName = selectedType.needsInstitution
      ? form.institutionName.trim()
      : "";
    const initialBalance = parseMoneyInputDigits(form.initialBalance);

    if (!name) {
      setError(t("wallets.nameRequired") || "Nama dompet wajib diisi.");
      return;
    }

    if (selectedType.needsInstitution && !institutionName) {
      setError(
        t("wallets.institutionRequired") ||
          "Institusi / Bank wajib diisi untuk tipe dompet ini.",
      );
      return;
    }

    if (!initialBalance) {
      setError(
        t("wallets.initialBalanceRequired") ||
          "Saldo awal wajib diisi. Masukkan 0 jika kosong.",
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: createError } = await createWallet({
        name,
        walletType: form.walletType,
        institutionName: selectedType.needsInstitution ? institutionName : null,
        initialBalance,
        currency: form.currency,
        includeInNetWorth: form.includeInNetWorth,
        icon: form.icon,
        color: form.color,
      });

      if (createError) {
        setError(
          t("wallets.createError") ||
            "Gagal membuat dompet. Silakan periksa data dan coba lagi.",
        );
        setSaving(false);
        return;
      }

      onSaved();
    } catch {
      setError(
        t("wallets.createErrorAuth") || "Gagal membuat dompet. Silakan coba lagi.",
      );
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title={t("wallets.create") || "Tambah Dompet"}
      description={
        t("wallets.initialBalanceHelp") ||
        "Saldo awal dicatat pada dompet, bukan sebagai transaksi."
      }
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-xl border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form
          className="grid w-full max-w-full min-w-0 gap-4"
          onSubmit={submit}
        >
          <SelectField
            id="wallet-type"
            label={t("wallets.type") || "Tipe Dompet"}
            value={form.walletType}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                walletType: event.target.value as WalletType,
              }))
            }
          >
            {walletTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <FormField
            id="wallet-name"
            label={t("wallets.name") || "Nama Dompet"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            placeholder="BCA Utama"
            value={form.name}
          />
          {selectedType.needsInstitution ? (
            <FormField
              id="institution-name"
              label={t("wallets.institution") || "Institusi / Bank"}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  institutionName: event.target.value,
                }))
              }
              placeholder="BCA"
              value={form.institutionName}
            />
          ) : null}
          <FormField
            id="initial-balance"
            inputMode="numeric"
            label={t("wallets.initialBalance") || "Saldo Awal"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                initialBalance: formatMoneyDigits(event.target.value),
              }))
            }
            placeholder="2.500.000"
            value={form.initialBalance}
          />
          <SelectField
            id="currency"
            label={t("wallets.currency") || "Mata Uang"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                currency: event.target.value,
              }))
            }
            value={form.currency}
          >
            <option value="IDR">IDR - Indonesian Rupiah</option>
          </SelectField>
          <SelectField
            id="wallet-icon"
            label={t("wallets.icon") || "Ikon"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                icon: event.target.value,
              }))
            }
            value={form.icon}
          >
            {walletIconOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <fieldset>
            <legend className="text-sm font-bold text-slate-900">
              {t("wallets.colorAccent") || "Aksen Warna"}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {walletColors.map((color) => (
                <button
                  aria-label={`Use ${color}`}
                  className={`h-9 w-9 rounded-full border-2 ${form.color === color ? "border-slate-900" : "border-white"} shadow-sm ring-1 ring-slate-200`}
                  key={color}
                  onClick={() =>
                    setForm((current) => ({ ...current, color }))
                  }
                  style={{ backgroundColor: color }}
                  type="button"
                />
              ))}
            </div>
          </fieldset>
          <ToggleField
            checked={form.includeInNetWorth}
            description={
              t("wallets.includeInNetWorthHelp") ||
              "Dompet yang disertakan akan dihitung dalam Total Aset."
            }
            id="include-net-worth"
            label={
              t("wallets.includeInNetWorth") ||
              "Sertakan dalam Kekayaan Bersih"
            }
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                includeInNetWorth: event.target.checked,
              }))
            }
          />
          <Button disabled={saving} type="submit">
            {saving ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={18} />
            ) : null}
            {saving
              ? t("common.saving") || "Menyimpan..."
              : t("wallets.create") || "Tambah Dompet"}
          </Button>
        </form>
      </div>
    </Modal>
  );
}

function WalletSkeleton() {
  return (
    <div className="grid gap-3">
      {[0, 1, 2].map((item) => (
        <div
          className="h-16 animate-pulse rounded-2xl bg-slate-100 p-3.5"
          key={item}
        />
      ))}
    </div>
  );
}

export function WalletsPage() {
  const { profile } = useAuth();
  const { t, formatCurrency } = useI18n();
  const { activeSpace, userRole, loading: spaceLoading } = useActiveSpace();
  const canManageWallet = !activeSpace || activeSpace.space_type === "personal" || userRole === "owner" || userRole === "admin";
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals & Action states
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [editingWallet, setEditingWallet] = useState<WalletWithBalance | null>(
    null,
  );
  const [canEditInitialBalance, setCanEditInitialBalance] = useState(false);
  const [adjustingWallet, setAdjustingWallet] =
    useState<WalletWithBalance | null>(null);
  const [archivingWallet, setArchivingWallet] =
    useState<WalletWithBalance | null>(null);
  const [archivingLoading, setArchivingLoading] = useState(false);
  const [restoringWallet, setRestoringWallet] =
    useState<WalletWithBalance | null>(null);
  const [restoringLoading, setRestoringLoading] = useState(false);
  const [deletingPermanentlyWallet, setDeletingPermanentlyWallet] =
    useState<WalletWithBalance | null>(null);
  const [deletingPermanentlyLoading, setDeletingPermanentlyLoading] =
    useState(false);

  const loadWallets = useCallback(async () => {
    if (spaceLoading) return;
    setLoading(true);
    setError(null);
    const [{ data, error: loadError }, { count: archCount }] = await Promise.all([
      getWallets(activeSpace?.id ?? undefined, activeTab === "archived"),
      getArchivedWalletsCount(activeSpace?.id ?? undefined),
    ]);

    if (loadError || !data) {
      setError(
        t("wallets.loadError") || "Gagal memuat dompet. Silakan coba lagi.",
      );
      setLoading(false);
      return;
    }

    setWallets(data);
    setArchivedCount(archCount);
    setLoading(false);
  }, [activeTab, activeSpace?.id, spaceLoading, t]);

  useEffect(() => {
    if (!spaceLoading) {
      void loadWallets();
    }
  }, [loadWallets, spaceLoading]);

  useAppEvent(appEvents.transactionSaved, () => void loadWallets());
  useAppEvent(appEvents.goalSaved, () => void loadWallets());
  useAppEvent(appEvents.spaceChanged, () => void loadWallets());

  const totals = useMemo(() => {
    return wallets.reduce(
      (summary, wallet) => {
        const balance = toNumber(
          wallet.balance?.current_balance ?? wallet.initial_balance,
        );

        if (wallet.include_in_net_worth) {
          summary.totalAssets += balance;
        }

        if (isLiquidWallet(wallet.wallet_type)) {
          summary.liquid += balance;
          if (wallet.include_in_net_worth) {
            summary.available += balance;
          }
        }

        if (wallet.wallet_type === "investment") {
          summary.investments += balance;
        }

        if (wallet.wallet_type === "savings") {
          if (wallet.goal_id) {
            summary.goalPockets += balance;
          } else {
            summary.savingsPockets += balance;
          }
        }

        return summary;
      },
      {
        available: 0,
        investments: 0,
        liquid: 0,
        savingsPockets: 0,
        goalPockets: 0,
        totalAssets: 0,
      },
    );
  }, [wallets]);

  const groupedWallets = useMemo(() => {
    const groups: { group: string; wallets: WalletWithBalance[] }[] = [];

    // 1. Bank Accounts
    const bankWallets = wallets.filter(
      (w) => w.wallet_type === "bank" || w.wallet_type === "digital_bank",
    );
    if (bankWallets.length > 0)
      groups.push({ group: t("wallets.bank"), wallets: bankWallets });

    // 2. E-Wallets
    const ewallets = wallets.filter((w) => w.wallet_type === "ewallet");
    if (ewallets.length > 0)
      groups.push({ group: t("wallets.eWallet"), wallets: ewallets });

    // 3. Cash
    const cashWallets = wallets.filter((w) => w.wallet_type === "cash");
    if (cashWallets.length > 0)
      groups.push({ group: t("wallets.cash"), wallets: cashWallets });

    // 4. Savings Pockets
    const savingsPockets = wallets.filter(
      (w) => w.wallet_type === "savings" && !w.goal_id,
    );
    if (savingsPockets.length > 0)
      groups.push({
        group: `${t("wallets.savings")} (${t("wallets.savingsPocket") || "Kantong Tabungan"})`,
        wallets: savingsPockets,
      });

    // 5. Goal Pockets
    const goalPockets = wallets.filter((w) => Boolean(w.goal_id));
    if (goalPockets.length > 0)
      groups.push({
        group: `${t("wallets.goalPockets") || "Goal Pockets"} (${t("wallets.goalPocket") || "Kantong Target"})`,
        wallets: goalPockets,
      });

    // 6. Investments
    const investmentWallets = wallets.filter(
      (w) => w.wallet_type === "investment",
    );
    if (investmentWallets.length > 0)
      groups.push({
        group: t("wallets.investment"),
        wallets: investmentWallets,
      });

    // 7. Custom
    const customWallets = wallets.filter((w) => w.wallet_type === "custom");
    if (customWallets.length > 0)
      groups.push({
        group: t("wallets.custom") || "Custom",
        wallets: customWallets,
      });

    return groups;
  }, [wallets, t]);

  const createActionRef = useRef<HTMLDivElement>(null);
  const defaultCurr = profile?.default_currency ?? "IDR";

  const handleStartEdit = async (wallet: WalletWithBalance) => {
    const { count } = await getWalletTransactionCount(wallet.id);
    setCanEditInitialBalance(count === 0);
    setEditingWallet(wallet);
  };

  const handleConfirmArchive = async () => {
    if (!archivingWallet) return;
    setArchivingLoading(true);
    const { error: archError } = await archiveWallet(archivingWallet.id);
    if (archError) {
      setError(archError.message || "Gagal mengarsipkan dompet.");
    } else {
      emitTransactionSaved();
      setArchivingWallet(null);
      void loadWallets();
    }
    setArchivingLoading(false);
  };

  const handleConfirmRestore = async () => {
    if (!restoringWallet) return;
    setRestoringLoading(true);
    const { error: resError } = await restoreWallet(restoringWallet.id);
    if (resError) {
      setError(resError.message || "Gagal memulihkan dompet.");
    } else {
      emitTransactionSaved();
      setRestoringWallet(null);
      void loadWallets();
    }
    setRestoringLoading(false);
  };

  const handleConfirmDeletePermanently = async () => {
    if (!deletingPermanentlyWallet) return;
    setDeletingPermanentlyLoading(true);
    try {
      const { deleteWalletPermanently, parseWalletDeleteError } = await import("../lib/wallets");
      const { error: delError } = await deleteWalletPermanently(deletingPermanentlyWallet.id);
      if (delError) {
        const errorKey = parseWalletDeleteError(delError.message);
        setError(t(errorKey) || t("wallets.deleteError") || "Gagal menghapus dompet permanen.");
      } else {
        emitTransactionSaved();
        setDeletingPermanentlyWallet(null);
        void loadWallets();
      }
    } catch (e: any) {
      setError(e?.message || "Gagal menghapus dompet secara permanen.");
    }
    setDeletingPermanentlyLoading(false);
  };

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-4">
      <PageHeader
        breadcrumb={
          activeTab === "archived" ? (
            <button
              type="button"
              onClick={() => setActiveTab("active")}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-kash-emerald transition focus:outline-none"
            >
              <ChevronLeft aria-hidden="true" size={15} />
              <span>{t("wallets.activeWallets") || "Dompet Aktif"}</span>
            </button>
          ) : null
        }
        eyebrow={activeTab === "archived" ? undefined : (t("wallets.title") || "Dompet")}
        icon={activeTab === "archived" ? undefined : WalletCards}
        title={
          activeTab === "archived"
            ? t("wallets.archivedWallets") || "Dompet Diarsipkan"
            : t("wallets.title") || "Dompet"
        }
        description={activeTab === "archived" ? undefined : t("wallets.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <HeaderArchiveButton
              count={archivedCount}
              isActive={activeTab === "archived"}
              onClick={() =>
                setActiveTab((curr) =>
                  curr === "archived" ? "active" : "archived",
                )
              }
              label={
                activeTab === "archived"
                  ? t("wallets.activeWallets") || "Dompet Aktif"
                  : t("wallets.archivedWallets") || "Dompet Diarsipkan"
              }
            />
            {activeTab === "active" && (
              <div ref={createActionRef} className="hidden sm:block">
                <Button onClick={() => setShowAddWallet(true)}>
                  <Plus aria-hidden="true" size={18} />
                  {t("wallets.create")}
                </Button>
              </div>
            )}
          </div>
        }
      />

      {/* Hero Header Summary */}
      <section className="kash-hero-card p-5 md:p-6 min-w-0 max-w-full">
        <p className="text-xs font-bold uppercase tracking-wide text-white/60">
          {t("wallets.totalAssets") || "Total Saldo Dompet"}
        </p>
        <p className="mt-2 break-words text-3xl font-extrabold text-white md:text-4xl">
          {formatCurrency(totals.totalAssets, defaultCurr)}
        </p>

        {/* Sub-breakdown badges inline */}
        <div className="mt-6 flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto py-0.5 text-[10px] font-semibold text-white/90 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 whitespace-nowrap rounded-lg bg-white/15 px-2.5 py-1">
            <span className="font-medium text-white/65">
              {t("wallets.availableBalance") || "Tersedia"}:{" "}
            </span>
            <span className="font-extrabold text-white">
              {formatCurrency(totals.available, defaultCurr)}
            </span>
          </span>
          {totals.savingsPockets > 0 ? (
            <span className="shrink-0 whitespace-nowrap rounded-lg bg-white/15 px-2.5 py-1">
              <span className="font-medium text-white/65">
                {t("wallets.savings") || "Tabungan"}:{" "}
              </span>
              <span className="font-extrabold text-white">
                {formatCurrency(totals.savingsPockets, defaultCurr)}
              </span>
            </span>
          ) : null}
          {totals.goalPockets > 0 ? (
            <span className="shrink-0 whitespace-nowrap rounded-lg bg-white/15 px-2.5 py-1">
              <span className="font-medium text-white/65">
                {t("wallets.allocatedToGoals") || "Target"}:{" "}
              </span>
              <span className="font-extrabold text-white">
                {formatCurrency(totals.goalPockets, defaultCurr)}
              </span>
            </span>
          ) : null}
          {totals.investments > 0 ? (
            <span className="shrink-0 whitespace-nowrap rounded-lg bg-white/15 px-2.5 py-1">
              <span className="font-medium text-white/65">
                {t("wallets.investment") || "Investasi"}:{" "}
              </span>
              <span className="font-extrabold text-white">
                {formatCurrency(totals.investments, defaultCurr)}
              </span>
            </span>
          ) : null}
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-kash-expense/30 bg-white p-5 shadow-card">
          <h3 className="text-base font-extrabold text-slate-900">
            {t("common.error")}
          </h3>
          <p className="mt-2 text-sm font-semibold text-slate-700">{error}</p>
          <Button className="mt-4" onClick={() => void loadWallets()}>
            {t("common.retry")}
          </Button>
        </section>
      ) : null}

      {/* Wallets List Section */}
      <section className="space-y-4">
        {loading ? <WalletSkeleton /> : null}

        {!loading && wallets.length === 0 ? (
          activeTab === "archived" ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-card">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <WalletCards aria-hidden="true" size={26} strokeWidth={2.4} />
              </div>
              <h4 className="mt-4 text-base font-extrabold text-slate-900">
                {t("wallets.noArchivedWallets") ||
                  "Belum ada dompet yang diarsipkan"}
              </h4>
              <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-600">
                {t("wallets.noArchivedWalletsDesc") ||
                  "Dompet yang Anda arsipkan akan tersimpan di sini dan dapat dipulihkan kapan saja."}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-card">
              <h4 className="text-base font-extrabold text-slate-900">
                {t("wallets.emptyTitle")}
              </h4>
              <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-600">
                {t("wallets.emptyDesc")}
              </p>
              <Button className="mt-5" onClick={() => setShowAddWallet(true)}>
                {t("wallets.create")}
              </Button>
            </div>
          )
        ) : null}

        {!loading
          ? groupedWallets.map((group) => (
              <div key={group.group} className="space-y-2">
                <h4 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                  {group.group}
                </h4>
                <div className="grid gap-2">
                  {group.wallets.map((wallet) => (
                    <WalletRow
                      key={wallet.id}
                      onAdjustBalance={canManageWallet ? () => setAdjustingWallet(wallet) : undefined}
                      onArchive={canManageWallet ? () => setArchivingWallet(wallet) : undefined}
                      onEdit={canManageWallet ? () => void handleStartEdit(wallet) : undefined}
                      onRestore={
                        wallet.is_archived && canManageWallet
                          ? () => setRestoringWallet(wallet)
                          : undefined
                      }
                      onDeletePermanently={canManageWallet ? () => setDeletingPermanentlyWallet(wallet) : undefined}
                      wallet={wallet}
                    />
                  ))}
                </div>
              </div>
            ))
          : null}
      </section>

      {activeTab === "active" && canManageWallet && (
        <ContextualCreateAction
          targetRef={createActionRef}
          onClick={() => setShowAddWallet(true)}
          label={t("wallets.create")}
        />
      )}

      {showAddWallet ? (
        <WalletFormModal
          defaultCurrency={profile?.default_currency ?? "IDR"}
          onClose={() => setShowAddWallet(false)}
          onSaved={() => {
            setShowAddWallet(false);
            void loadWallets();
          }}
        />
      ) : null}

      {editingWallet ? (
        <EditWalletModal
          canEditInitialBalance={canEditInitialBalance}
          wallet={editingWallet}
          onClose={() => setEditingWallet(null)}
          onSaved={() => {
            setEditingWallet(null);
            void loadWallets();
          }}
        />
      ) : null}

      {adjustingWallet ? (
        <AdjustmentModal
          currentBalance={
            adjustingWallet.balance?.current_balance ??
            adjustingWallet.initial_balance
          }
          wallet={adjustingWallet}
          onClose={() => setAdjustingWallet(null)}
          onSaved={() => {
            setAdjustingWallet(null);
            void loadWallets();
          }}
        />
      ) : null}

      {archivingWallet ? (
        <ConfirmationDialog
          confirmLabel={t("common.archive") || "Arsipkan"}
          description={
            t("wallets.archiveWalletConfirm") ||
            "Apakah Anda yakin ingin mengarsipkan dompet ini? Riwayat transaksi dan saldo akan tetap tersimpan."
          }
          icon={Trash2}
          isLoading={archivingLoading}
          itemLabel={archivingWallet.name}
          onCancel={() => setArchivingWallet(null)}
          onConfirm={() => void handleConfirmArchive()}
          title={t("wallets.archiveWallet") || "Arsipkan dompet ini?"}
          tone="neutral"
        />
      ) : null}

      {restoringWallet ? (
        <ConfirmationDialog
          confirmLabel={t("wallets.restoreWallet") || "Pulihkan Dompet"}
          description={
            t("wallets.restoreWalletConfirm") ||
            "Pulihkan dompet ini ke daftar dompet aktif?"
          }
          icon={RotateCcw}
          isLoading={restoringLoading}
          itemLabel={restoringWallet.name}
          onCancel={() => setRestoringWallet(null)}
          onConfirm={() => void handleConfirmRestore()}
          title={t("wallets.restoreWallet") || "Pulihkan dompet ini?"}
          tone="neutral"
        />
      ) : null}

      {deletingPermanentlyWallet ? (
        <ConfirmationDialog
          confirmLabel={t("wallets.deleteWalletPermanently") || "Hapus Permanen"}
          description={
            t("wallets.hardDeleteExplanation") ||
            "Tindakan ini tidak dapat dibatalkan. Dompet ini akan dihapus secara permanen dari sistem."
          }
          icon={Trash2}
          isLoading={deletingPermanentlyLoading}
          itemLabel={deletingPermanentlyWallet.name}
          onCancel={() => setDeletingPermanentlyWallet(null)}
          onConfirm={() => void handleConfirmDeletePermanently()}
          title={t("wallets.deleteWalletPermanentlyConfirm") || "Hapus Dompet Permanen?"}
          tone="danger"
        />
      ) : null}
    </div>
  );
}
