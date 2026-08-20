import { Loader2, Plus, WalletCards, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { FormField } from "../components/ui/FormField";
import { IconButton } from "../components/ui/IconButton";
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

function SummaryCard({ label, labelClassName = "text-slate-600", value }: { label: string; labelClassName?: string; value: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className={`text-xs font-bold uppercase tracking-normal ${labelClassName}`}>{label}</p>
      <p className="mt-2 text-xl font-extrabold text-slate-900">{value}</p>
    </article>
  );
}

function WalletRow({ wallet }: { wallet: WalletWithBalance }) {
  const { t, formatCurrency } = useI18n();
  const typeOption = getWalletTypeOption(wallet.wallet_type);
  const Icon = getWalletIcon(wallet.icon, wallet.wallet_type);
  const accent = wallet.color ?? "#10B981";
  const isGoalPocket = Boolean(wallet.goal_id);
  const isSavingsPocket = wallet.wallet_type === "savings" && !wallet.goal_id;

  return (
    <Link
      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-kash-emerald hover:bg-kash-selected/40"
      to={`/wallets/${wallet.id}`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-900" style={{ color: accent }}>
        <Icon aria-hidden="true" size={19} strokeWidth={2.2} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-extrabold text-slate-900">{wallet.name}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-slate-700">
          {[wallet.institution_name, isGoalPocket ? (t("wallets.goalPocket") || "Kantong Target") : typeOption.label].filter(Boolean).join(" / ")}
        </span>
      </span>
      <span className="min-w-[8.5rem] text-right">
        <span className="block text-sm font-extrabold text-slate-900">
          {formatCurrency(wallet.balance?.current_balance ?? wallet.initial_balance, wallet.currency)}
        </span>
        {isGoalPocket ? (
          <span className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-extrabold text-amber-800 bg-amber-50 border border-amber-200/60">
            {t("goals.goal") || "Goal"}: {wallet.goal_name}
          </span>
        ) : isSavingsPocket ? (
          <span className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-extrabold text-kash-emeraldDark bg-kash-selected border border-kash-emerald/20">
            {t("wallets.savingsPocket") || "Kantong Tabungan"}
          </span>
        ) : wallet.wallet_type === "investment" && wallet.balance?.return_percentage !== undefined ? (
          <span className={`mt-1 block text-xs font-bold ${Number(wallet.balance.return_percentage) >= 0 ? "text-kash-emerald" : "text-kash-expense"}`}>
            {Number(wallet.balance.return_percentage) >= 0 ? "+" : ""}{Number(wallet.balance.return_percentage).toFixed(2)}% {t("wallets.return") || "return"}
          </span>
        ) : null}
      </span>
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
          <div className="mb-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
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
        <div className="h-16 rounded-lg border border-slate-200 bg-white p-3" key={item}>
          <div className="h-3 w-1/3 rounded-full bg-slate-100" />
          <div className="mt-3 h-3 w-2/3 rounded-full bg-slate-100" />
        </div>
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

    // 4. Savings Pockets (pure savings wallets without linked goal)
    const savingsPockets = wallets.filter((w) => w.wallet_type === "savings" && !w.goal_id);
    if (savingsPockets.length > 0) groups.push({ group: `${t("wallets.savings")} (${t("wallets.savingsPocket") || "Kantong Tabungan"})`, wallets: savingsPockets });

    // 5. Goal Pockets (savings wallets linked to a goal)
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

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHeader
        eyebrow={t("wallets.title")}
        icon={WalletCards}
        title={t("wallets.title")}
        description={t("wallets.subtitle")}
        actions={
          <Button onClick={() => setShowAddWallet(true)}>
            <Plus aria-hidden="true" size={18} />
            {t("wallets.create")}
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard label={t("wallets.totalAssets")} value={formatCurrency(totals.totalAssets, profile?.default_currency ?? "IDR")} />
        <SummaryCard label={t("wallets.availableBalance")} value={formatCurrency(totals.available, profile?.default_currency ?? "IDR")} />
        <SummaryCard label={t("wallets.savings")} labelClassName="text-kash-emerald" value={formatCurrency(totals.savingsPockets, profile?.default_currency ?? "IDR")} />
        <SummaryCard label={t("wallets.allocatedToGoals")} labelClassName="text-amber-800" value={formatCurrency(totals.goalPockets, profile?.default_currency ?? "IDR")} />
        <SummaryCard label={t("wallets.investment")} value={formatCurrency(totals.investments, profile?.default_currency ?? "IDR")} />
      </section>

      {error ? (
        <section className="rounded-lg border border-kash-expense/30 bg-white p-5 shadow-sm">
          <h3 className="text-base font-extrabold text-slate-900">{t("common.error")}</h3>
          <p className="mt-2 text-sm font-semibold text-slate-700">{error}</p>
          <Button className="mt-4" onClick={() => void loadWallets()}>
            {t("common.retry")}
          </Button>
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-extrabold text-slate-900">{t("wallets.title")}</h3>
          <WalletCards aria-hidden="true" className="text-slate-600" size={19} />
        </div>

        <div className="mt-4 grid gap-5">
          {loading ? <WalletSkeleton /> : null}
          {!loading && wallets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <h4 className="text-base font-extrabold text-slate-900">{t("wallets.emptyTitle")}</h4>
              <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-700">
                {t("wallets.emptyDesc")}
              </p>
              <Button className="mt-4" onClick={() => setShowAddWallet(true)}>
                {t("wallets.create")}
              </Button>
            </div>
          ) : null}
          {!loading
            ? groupedWallets.map((group) => (
              <div key={group.group}>
                <h4 className="mb-2 text-xs font-extrabold uppercase tracking-normal text-slate-700">{group.group}</h4>
                <div className="grid gap-2">
                  {group.wallets.map((wallet) => (
                    <WalletRow key={wallet.id} wallet={wallet} />
                  ))}
                </div>
              </div>
            ))
            : null}
        </div>
      </section>

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
