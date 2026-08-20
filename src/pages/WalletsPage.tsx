import { Loader2, Plus, WalletCards, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { FormField } from "../components/ui/FormField";
import { IconButton } from "../components/ui/IconButton";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { ToggleField } from "../components/ui/ToggleField";
import { useAuth } from "../context/AuthContext";
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
  const typeOption = getWalletTypeOption(wallet.wallet_type);
  const Icon = getWalletIcon(wallet.icon, wallet.wallet_type);
  const accent = wallet.color ?? "#10B981";
  const isSavingsPocket = wallet.wallet_type === "savings";

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
          {[wallet.institution_name, typeOption.label].filter(Boolean).join(" / ")}
        </span>
      </span>
      <span className="min-w-[8.5rem] text-right">
        <span className="block text-sm font-extrabold text-slate-900">
          {formatCurrency(wallet.balance?.current_balance ?? wallet.initial_balance, wallet.currency)}
        </span>
        {isSavingsPocket ? (
          <span className="mt-1 block text-xs font-bold text-kash-emerald">
            Savings pocket
          </span>
        ) : wallet.wallet_type === "investment" && wallet.balance?.return_percentage !== undefined ? (
          <span className={`mt-1 block text-xs font-bold ${Number(wallet.balance.return_percentage) >= 0 ? "text-kash-emerald" : "text-kash-expense"}`}>
            {Number(wallet.balance.return_percentage) >= 0 ? "+" : ""}{Number(wallet.balance.return_percentage).toFixed(2)}% return
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
      setError("Wallet name is required.");
      return;
    }

    if (selectedType.needsInstitution && !institutionName) {
      setError("Institution is required for this wallet type.");
      return;
    }

    if (!initialBalance) {
      setError("Initial balance is required. Enter 0 if this wallet is empty.");
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
        setError("Couldn't create this wallet. Please check the details and try again.");
        setSaving(false);
        return;
      }

      onSaved();
    } catch {
      setError("Couldn't create this wallet. Please sign in and try again.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-x-hidden bg-slate-900/35" role="dialog" aria-modal="true">
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close add wallet" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 max-h-[92vh] w-full max-w-full min-w-0 box-border overflow-y-auto overflow-x-hidden rounded-t-2xl bg-white p-4 shadow-soft md:left-1/2 md:top-1/2 md:bottom-auto md:max-h-[86vh] md:w-full md:max-w-xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Add Wallet</h2>
            <p className="mt-1 text-sm font-semibold text-slate-700">Initial balance is stored on the wallet, not as a transaction.</p>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        <form className="mt-5 grid w-full max-w-full min-w-0 gap-4" onSubmit={submit}>
          <SelectField
            id="wallet-type"
            label="Wallet Type"
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
            label="Wallet Name"
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="BCA Secondary"
            value={form.name}
          />
          {selectedType.needsInstitution ? (
            <FormField
              id="institution-name"
              label="Institution"
              onChange={(event) => setForm((current) => ({ ...current, institutionName: event.target.value }))}
              placeholder="BCA"
              value={form.institutionName}
            />
          ) : null}
          <FormField
            id="initial-balance"
            inputMode="numeric"
            label="Initial Balance"
            onChange={(event) => setForm((current) => ({ ...current, initialBalance: formatMoneyDigits(event.target.value) }))}
            placeholder="2.500.000"
            value={form.initialBalance}
          />
          <SelectField id="currency" label="Currency" onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))} value={form.currency}>
            <option value="IDR">IDR - Indonesian Rupiah</option>
          </SelectField>
          <SelectField id="wallet-icon" label="Icon" onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))} value={form.icon}>
            {walletIconOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <fieldset>
            <legend className="text-sm font-bold text-slate-900">Color Accent</legend>
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
            description="Included wallets count toward Total Assets."
            id="include-net-worth"
            label="Include in Net Worth"
            onChange={(event) => setForm((current) => ({ ...current, includeInNetWorth: event.target.checked }))}
          />
          <Button disabled={saving} type="submit">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            Create Wallet
          </Button>
        </form>
      </section>
    </div>
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
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddWallet, setShowAddWallet] = useState(false);

  const loadWallets = async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await getWallets();

    if (loadError || !data) {
      setError("Couldn't load wallets. Please try again.");
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
          summary.savings += balance;
        }

        return summary;
      },
      { available: 0, investments: 0, liquid: 0, savings: 0, totalAssets: 0 },
    );
  }, [wallets]);

  const groupedWallets = useMemo(() => {
    return walletTypeOptions
      .map((option) => {
        const groupWallets = wallets.filter((wallet) => getWalletTypeOption(wallet.wallet_type).group === option.group);
        return { group: option.group, wallets: groupWallets };
      })
      .filter((group, index, groups) => group.wallets.length > 0 && groups.findIndex((item) => item.group === group.group) === index);
  }, [wallets]);

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 p-4 md:p-6">
      <PageHeader
        eyebrow="Wallet Summary"
        icon={WalletCards}
        title="Wallets"
        description="Track where your money is stored."
        actions={
          <Button onClick={() => setShowAddWallet(true)}>
            <Plus aria-hidden="true" size={18} />
            Add Wallet
          </Button>
        }
      />

      <section className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Total Assets" value={formatCurrency(totals.totalAssets, profile?.default_currency ?? "IDR")} />
        <SummaryCard label="Available" value={formatCurrency(totals.available, profile?.default_currency ?? "IDR")} />
        <SummaryCard label="Savings Pockets" labelClassName="text-kash-emerald" value={formatCurrency(totals.savings, profile?.default_currency ?? "IDR")} />
        <SummaryCard label="Investments" value={formatCurrency(totals.investments, profile?.default_currency ?? "IDR")} />
      </section>

      {error ? (
        <section className="rounded-lg border border-kash-expense/30 bg-white p-5 shadow-sm">
          <h3 className="text-base font-extrabold text-slate-900">Something went wrong.</h3>
          <p className="mt-2 text-sm font-semibold text-slate-700">{error}</p>
          <Button className="mt-4" onClick={() => void loadWallets()}>
            Retry
          </Button>
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-extrabold text-slate-900">All Wallets</h3>
          <WalletCards aria-hidden="true" className="text-slate-600" size={19} />
        </div>

        <div className="mt-4 grid gap-5">
          {loading ? <WalletSkeleton /> : null}
          {!loading && wallets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <h4 className="text-base font-extrabold text-slate-900">No wallets yet.</h4>
              <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-700">
                Add where you keep your money to start tracking your finances.
              </p>
              <Button className="mt-4" onClick={() => setShowAddWallet(true)}>
                Add Wallet
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
