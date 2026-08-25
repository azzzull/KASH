import { Loader2, Plus, WalletCards, TrendingUp, PiggyBank, Landmark, CreditCard, Banknote } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { ContextualCreateAction } from "../components/ui/ContextualCreateAction";
import { FormField } from "../components/ui/FormField";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { ToggleField } from "../components/ui/ToggleField";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { appEvents } from "../lib/appEvents";
import { useAppEvent } from "../hooks/useAppEvent";
import { formatCurrency, formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../lib/money";
import {
  getWalletIcon,
  getWalletTypeOption,
  isLiquidWallet,
  walletColors,
  walletIconOptions,
  walletTypeOptions,
} from "../lib/walletMeta";
import { createWallet, getWallets, type WalletWithBalance } from "../lib/wallets";
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

function WalletRow({ wallet }: { wallet: WalletWithBalance }) {
  const { t, formatCurrency } = useI18n();
  const typeOption = getWalletTypeOption(wallet.wallet_type);
  const Icon = getWalletIcon(wallet.icon, wallet.wallet_type);
  const accent = wallet.color ?? "#10B981";
  const isGoalPocket = Boolean(wallet.goal_id);
  const isSavingsPocket = wallet.wallet_type === "savings" && !wallet.goal_id;
  const isInvestment = wallet.wallet_type === "investment";
  const currentBal = wallet.balance?.current_balance ?? wallet.initial_balance;

  return (
    <Link
      className="kash-activity-row flex items-center justify-between gap-3 rounded-2xl border border-slate-200/60 bg-white p-3.5 shadow-card transition hover:border-kash-emerald/40 hover:shadow-md active:bg-slate-50 min-w-0 max-w-full"
      to={`/wallets/${wallet.id}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition"
          style={{ backgroundColor: `${accent}15`, color: accent }}
        >
          <Icon aria-hidden="true" size={20} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-slate-900">{wallet.name}</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
            {[wallet.institution_name, isGoalPocket ? (t("wallets.goalPocket") || "Kantong Target") : typeOption.label].filter(Boolean).join(" • ")}
          </p>
        </div>
      </div>

      <div className="shrink-0 text-right">
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
          <span className={`mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-bold ${Number(wallet.balance.return_percentage) >= 0 ? "text-kash-emerald" : "text-[#E50914]"}`}>
            {Number(wallet.balance.return_percentage) >= 0 ? "+" : ""}{Number(wallet.balance.return_percentage).toFixed(2)}% {t("wallets.return") || "return"}
          </span>
        ) : null}
      </div>
    </Link>
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
  const [form, setForm] = useState<WalletFormState>({ ...defaultFormState, currency: defaultCurrency });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedType = getWalletTypeOption(form.walletType);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    const institutionName = selectedType.needsInstitution ? form.institutionName.trim() : "";
    const initialBalance = parseMoneyInputDigits(form.initialBalance);

    if (!name) {
      setError(t("wallets.nameRequired") || "Nama dompet wajib diisi.");
      return;
    }

    if (selectedType.needsInstitution && !institutionName) {
      setError(t("wallets.institutionRequired") || "Institusi / Bank wajib diisi untuk tipe dompet ini.");
      return;
    }

    if (!initialBalance) {
      setError(t("wallets.initialBalanceRequired") || "Saldo awal wajib diisi. Masukkan 0 jika kosong.");
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
        setError(t("wallets.createError") || "Gagal membuat dompet. Silakan periksa data dan coba lagi.");
        setSaving(false);
        return;
      }

      onSaved();
    } catch {
      setError(t("wallets.createErrorAuth") || "Gagal membuat dompet. Silakan coba lagi.");
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title={t("wallets.create") || "Tambah Dompet"}
      description={t("wallets.initialBalanceHelp") || "Saldo awal dicatat pada dompet, bukan sebagai transaksi."}
    >
      <div>
        {error ? (
          <div className="mb-4 rounded-xl border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <SelectField
            id="wallet-type"
            label={t("wallets.type") || "Tipe Dompet"}
            value={form.walletType}
            onChange={(event) => setForm((current) => ({ ...current, walletType: event.target.value as WalletType }))}
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
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="BCA Utama"
            value={form.name}
          />
          {selectedType.needsInstitution ? (
            <FormField
              id="institution-name"
              label={t("wallets.institution") || "Institusi / Bank"}
              onChange={(event) => setForm((current) => ({ ...current, institutionName: event.target.value }))}
              placeholder="BCA"
              value={form.institutionName}
            />
          ) : null}
          <FormField
            id="initial-balance"
            inputMode="numeric"
            label={t("wallets.initialBalance") || "Saldo Awal"}
            onChange={(event) => setForm((current) => ({ ...current, initialBalance: formatMoneyDigits(event.target.value) }))}
            placeholder="2.500.000"
            value={form.initialBalance}
          />
          <SelectField id="currency" label={t("wallets.currency") || "Mata Uang"} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))} value={form.currency}>
            <option value="IDR">IDR - Indonesian Rupiah</option>
          </SelectField>
          <SelectField id="wallet-icon" label={t("wallets.icon") || "Ikon"} onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))} value={form.icon}>
            {walletIconOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <fieldset>
            <legend className="text-sm font-bold text-slate-900">{t("wallets.colorAccent") || "Aksen Warna"}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {walletColors.map((color) => (
                <button
                  aria-label={`Use ${color}`}
                  className={`h-9 w-9 rounded-full border-2 ${form.color === color ? "border-slate-900" : "border-white"} shadow-sm ring-1 ring-slate-200`}
                  key={color}
                  onClick={() => setForm((current) => ({ ...current, color }))}
                  style={{ backgroundColor: color }}
                  type="button"
                />
              ))}
            </div>
          </fieldset>
          <ToggleField
            checked={form.includeInNetWorth}
            description={t("wallets.includeInNetWorthHelp") || "Dompet yang disertakan akan dihitung dalam Total Aset."}
            id="include-net-worth"
            label={t("wallets.includeInNetWorth") || "Sertakan dalam Kekayaan Bersih"}
            onChange={(event) => setForm((current) => ({ ...current, includeInNetWorth: event.target.checked }))}
          />
          <Button disabled={saving} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            {saving ? (t("common.saving") || "Menyimpan...") : (t("wallets.create") || "Tambah Dompet")}
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
        <div className="h-16 animate-pulse rounded-2xl bg-slate-100 p-3.5" key={item} />
      ))}
    </div>
  );
}

export function WalletsPage() {
  const { profile } = useAuth();
  const { t, formatCurrency } = useI18n();
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddWallet, setShowAddWallet] = useState(false);

  const loadWallets = async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await getWallets();

    if (loadError || !data) {
      setError(t("wallets.loadError") || "Gagal memuat dompet. Silakan coba lagi.");
      setLoading(false);
      return;
    }

    setWallets(data);
    setLoading(false);
  };

  useEffect(() => {
    void loadWallets();
  }, []);

  useAppEvent(appEvents.transactionSaved, () => void loadWallets());
  useAppEvent(appEvents.goalSaved, () => void loadWallets());
  useAppEvent(appEvents.spaceChanged, () => void loadWallets());

  const totals = useMemo(() => {
    return wallets.reduce(
      (summary, wallet) => {
        const balance = toNumber(wallet.balance?.current_balance ?? wallet.initial_balance);

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
      { available: 0, investments: 0, liquid: 0, savingsPockets: 0, goalPockets: 0, totalAssets: 0 },
    );
  }, [wallets]);

  const groupedWallets = useMemo(() => {
    const groups: { group: string; wallets: WalletWithBalance[] }[] = [];

    // 1. Bank Accounts
    const bankWallets = wallets.filter((w) => w.wallet_type === "bank" || w.wallet_type === "digital_bank");
    if (bankWallets.length > 0) groups.push({ group: t("wallets.bank"), wallets: bankWallets });

    // 2. E-Wallets
    const ewallets = wallets.filter((w) => w.wallet_type === "ewallet");
    if (ewallets.length > 0) groups.push({ group: t("wallets.eWallet"), wallets: ewallets });

    // 3. Cash
    const cashWallets = wallets.filter((w) => w.wallet_type === "cash");
    if (cashWallets.length > 0) groups.push({ group: t("wallets.cash"), wallets: cashWallets });

    // 4. Savings Pockets
    const savingsPockets = wallets.filter((w) => w.wallet_type === "savings" && !w.goal_id);
    if (savingsPockets.length > 0) groups.push({ group: `${t("wallets.savings")} (${t("wallets.savingsPocket") || "Kantong Tabungan"})`, wallets: savingsPockets });

    // 5. Goal Pockets
    const goalPockets = wallets.filter((w) => Boolean(w.goal_id));
    if (goalPockets.length > 0) groups.push({ group: `${t("wallets.goalPockets") || "Goal Pockets"} (${t("wallets.goalPocket") || "Kantong Target"})`, wallets: goalPockets });

    // 6. Investments
    const investmentWallets = wallets.filter((w) => w.wallet_type === "investment");
    if (investmentWallets.length > 0) groups.push({ group: t("wallets.investment"), wallets: investmentWallets });

    // 7. Custom
    const customWallets = wallets.filter((w) => w.wallet_type === "custom");
    if (customWallets.length > 0) groups.push({ group: t("wallets.custom") || "Custom", wallets: customWallets });

    return groups;
  }, [wallets, t]);

  const createActionRef = useRef<HTMLDivElement>(null);
  const defaultCurr = profile?.default_currency ?? "IDR";

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-4">
      <PageHeader
        eyebrow={t("wallets.title")}
        icon={WalletCards}
        title={t("wallets.title")}
        description={t("wallets.subtitle")}
        actions={
          <div ref={createActionRef} className="hidden sm:block">
            <Button onClick={() => setShowAddWallet(true)}>
              <Plus aria-hidden="true" size={18} />
              {t("wallets.create")}
            </Button>
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
            <span className="font-medium text-white/65">{t("wallets.availableBalance") || "Tersedia"}: </span>
            <span className="font-extrabold text-white">{formatCurrency(totals.available, defaultCurr)}</span>
          </span>
          {totals.savingsPockets > 0 ? (
            <span className="shrink-0 whitespace-nowrap rounded-lg bg-white/15 px-2.5 py-1">
              <span className="font-medium text-white/65">{t("wallets.savings") || "Tabungan"}: </span>
              <span className="font-extrabold text-white">{formatCurrency(totals.savingsPockets, defaultCurr)}</span>
            </span>
          ) : null}
          {totals.goalPockets > 0 ? (
            <span className="shrink-0 whitespace-nowrap rounded-lg bg-white/15 px-2.5 py-1">
              <span className="font-medium text-white/65">{t("wallets.allocatedToGoals") || "Target"}: </span>
              <span className="font-extrabold text-white">{formatCurrency(totals.goalPockets, defaultCurr)}</span>
            </span>
          ) : null}
          {totals.investments > 0 ? (
            <span className="shrink-0 whitespace-nowrap rounded-lg bg-white/15 px-2.5 py-1">
              <span className="font-medium text-white/65">{t("wallets.investment") || "Investasi"}: </span>
              <span className="font-extrabold text-white">{formatCurrency(totals.investments, defaultCurr)}</span>
            </span>
          ) : null}
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-kash-expense/30 bg-white p-5 shadow-card">
          <h3 className="text-base font-extrabold text-slate-900">{t("common.error")}</h3>
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
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-card">
            <h4 className="text-base font-extrabold text-slate-900">{t("wallets.emptyTitle")}</h4>
            <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-600">
              {t("wallets.emptyDesc")}
            </p>
            <Button className="mt-5" onClick={() => setShowAddWallet(true)}>
              {t("wallets.create")}
            </Button>
          </div>
        ) : null}

        {!loading
          ? groupedWallets.map((group) => (
              <div key={group.group} className="space-y-2">
                <h4 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">{group.group}</h4>
                <div className="grid gap-2">
                  {group.wallets.map((wallet) => (
                    <WalletRow key={wallet.id} wallet={wallet} />
                  ))}
                </div>
              </div>
            ))
          : null}
      </section>

      <ContextualCreateAction
        targetRef={createActionRef}
        onClick={() => setShowAddWallet(true)}
        label={t("wallets.create")}
      />

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
    </div>
  );
}
