import { Check, Loader2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KashLogo } from "../components/brand/KashLogo";
import { Button } from "../components/ui/Button";
import { FormField } from "../components/ui/FormField";
import { SelectField } from "../components/ui/SelectField";
import { ToggleField } from "../components/ui/ToggleField";
import { useAuth } from "../context/AuthContext";
import { completeProfileOnboarding, updateProfileCurrency, updateProfileFullName } from "../lib/auth";
import { formatCurrency as formatMoneyCurrency, formatMoneyDigits, parseMoneyInputDigits } from "../lib/money";
import { createFirstWallet } from "../lib/wallets";
import type { Wallet, WalletType } from "../types/domain";

const walletTypes: Array<{ label: string; value: WalletType; needsInstitution: boolean }> = [
  { label: "Bank", value: "bank", needsInstitution: true },
  { label: "Digital Bank", value: "digital_bank", needsInstitution: true },
  { label: "E-Wallet", value: "ewallet", needsInstitution: true },
  { label: "Cash", value: "cash", needsInstitution: false },
  { label: "Investment", value: "investment", needsInstitution: true },
  { label: "Savings", value: "savings", needsInstitution: true },
  { label: "Custom", value: "custom", needsInstitution: true },
];

const steps = ["Welcome", "Profile", "Currency", "First Wallet", "Initial Balance"];

export function OnboardingPage() {
  const navigate = useNavigate();
  const { profile, refreshProfile, user } = useAuth();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(
    profile?.full_name ||
      (user?.user_metadata?.full_name as string) ||
      (user?.user_metadata?.name as string) ||
      "",
  );
  const [currency, setCurrency] = useState(profile?.default_currency ?? "IDR");
  const [walletName, setWalletName] = useState("");
  const [walletType, setWalletType] = useState<WalletType>("bank");
  const [institutionName, setInstitutionName] = useState("");
  const [includeInNetWorth, setIncludeInNetWorth] = useState(true);
  const [initialBalance, setInitialBalance] = useState("");
  const [createdWallet, setCreatedWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedWalletType = useMemo(
    () => walletTypes.find((type) => type.value === walletType) ?? walletTypes[0],
    [walletType],
  );
  const isFinish = step >= steps.length;
  const progressPercent = isFinish ? 100 : ((step + 1) / steps.length) * 100;

  const persistDisplayName = async () => {
    if (!user) return;
    const trimmed = displayName.trim();

    if (!trimmed) {
      setError("Please enter a display name.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: updateError } = await updateProfileFullName(user.id, trimmed);

    if (updateError) {
      setError("Couldn't save your display name. Please try again.");
      setLoading(false);
      return;
    }

    await refreshProfile();
    setLoading(false);
    setStep(2);
  };

  const persistCurrency = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const { error: updateError } = await updateProfileCurrency(user.id, currency);

    if (updateError) {
      setError("Couldn't save your currency. Please try again.");
      setLoading(false);
      return;
    }

    await refreshProfile();
    setLoading(false);
    setStep(3);
  };

  const validateWalletInfo = () => {
    if (!walletName.trim()) {
      setError("Wallet name is required.");
      return false;
    }

    if (selectedWalletType.needsInstitution && !institutionName.trim()) {
      setError("Institution is required for this wallet type.");
      return false;
    }

    setError(null);
    return true;
  };

  const createWalletAndComplete = async () => {
    if (!user) return;

    const effectiveName = displayName.trim() || profile?.full_name?.trim();
    if (!effectiveName) {
      setError("Please set a display name before completing onboarding.");
      setStep(1);
      return;
    }

    const normalizedBalance = parseMoneyInputDigits(initialBalance);

    if (!normalizedBalance) {
      setError("Initial balance is required. Enter 0 if the wallet is empty.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: nameError } = await updateProfileFullName(user.id, effectiveName);
    if (nameError) {
      setError("Couldn't save your display name. Please try again.");
      setLoading(false);
      return;
    }

    let wallet = createdWallet;

    if (!wallet) {
      const { data, error: walletError } = await createFirstWallet({
        name: walletName.trim(),
        walletType,
        institutionName: selectedWalletType.needsInstitution ? institutionName.trim() : null,
        initialBalance: normalizedBalance,
        currency,
        includeInNetWorth,
      });

      if (walletError || !data) {
        setError("Couldn't create your first wallet. Please check the details and try again.");
        setLoading(false);
        return;
      }

      wallet = data;
      setCreatedWallet(data);
    }

    const { error: profileError } = await completeProfileOnboarding(user.id);

    if (profileError) {
      setError("Your wallet was created, but onboarding couldn't be completed. Please try again.");
      setLoading(false);
      return;
    }

    setStep(steps.length);
    navigate("/onboarding", { replace: true, state: { showFinish: true } });
    await refreshProfile();
    setCreatedWallet(wallet);
    setLoading(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (step === 1) {
      void persistDisplayName();
      return;
    }

    if (step === 2) {
      void persistCurrency();
      return;
    }

    if (step === 3 && validateWalletInfo()) {
      setStep(4);
      return;
    }

    if (step === 4) {
      void createWalletAndComplete();
    }
  };

  if (!profile) {
    return (
      <main className="kash-page-bg flex min-h-screen items-center justify-center px-4 py-10">
        <section className="w-full max-w-md rounded-lg border border-kash-emerald/10 bg-white/95 p-6 text-center shadow-sm">
          <KashLogo className="mx-auto h-auto w-40" />
          <h1 className="mt-8 text-xl font-bold text-slate-900">Preparing your profile</h1>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            We could not load your KASH profile yet. If you just signed in, wait a moment and try again.
          </p>
          <Button className="mt-6 w-full" onClick={() => void refreshProfile()}>
            Retry
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="kash-page-bg flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-xl rounded-lg border border-kash-emerald/10 bg-white/95 p-5 shadow-sm sm:p-8">
        <div className="flex justify-center">
          <KashLogo className="h-auto w-44 max-w-full" />
        </div>

        {!isFinish ? (
          <div className="mt-8">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span>
                Step {step + 1} of {steps.length}
              </span>
              <span>{steps[step]}</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-kash-emerald transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-semibold text-slate-900">
            {error}
          </div>
        ) : null}

        {step === 0 ? (
          <div className="mt-10 text-center">
            <h1 className="text-3xl font-bold leading-tight text-slate-900">
              Your money,
              <br />
              organized in one place.
            </h1>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-slate-700">
              Set up your profile, currency, and first wallet so KASH can start tracking your real balances.
            </p>
            <Button className="mt-8 w-full sm:w-auto" onClick={() => setStep(1)}>
              Get Started
            </Button>
          </div>
        ) : null}

        {step > 0 && step < steps.length ? (
          <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
            {step === 1 ? (
              <>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">What should we call you?</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    This name will appear on your dashboard, profile, and navigation.
                  </p>
                </div>
                <FormField
                  id="onboarding-display-name"
                  label="Display Name"
                  placeholder="e.g. Alex"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoFocus
                  required
                />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">What's your main currency?</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-700">IDR is the supported currency for the MVP.</p>
                </div>
                <SelectField id="currency" label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  <option value="IDR">IDR - Indonesian Rupiah</option>
                </SelectField>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Add your first wallet</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-700">Add where you keep money today.</p>
                </div>
                <SelectField
                  id="wallet-type"
                  label="Wallet Type"
                  value={walletType}
                  onChange={(event) => setWalletType(event.target.value as WalletType)}
                >
                  {walletTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </SelectField>
                <FormField
                  id="wallet-name"
                  label="Wallet Name"
                  onChange={(event) => setWalletName(event.target.value)}
                  placeholder="BCA Utama"
                  value={walletName}
                />
                {selectedWalletType.needsInstitution ? (
                  <FormField
                    id="institution-name"
                    label="Institution"
                    onChange={(event) => setInstitutionName(event.target.value)}
                    placeholder="BCA"
                    value={institutionName}
                  />
                ) : null}
                <SelectField id="wallet-currency" label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  <option value="IDR">IDR - Indonesian Rupiah</option>
                </SelectField>
                <ToggleField
                  checked={includeInNetWorth}
                  description="Include this wallet when KASH calculates your net worth."
                  id="include-net-worth"
                  label="Include in Net Worth"
                  onChange={(event) => setIncludeInNetWorth(event.target.checked)}
                />
              </>
            ) : null}

            {step === 4 ? (
              <>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Current Balance</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Enter the real-world balance in this wallet. Initial balance is not income.
                  </p>
                </div>
                <label className="block" htmlFor="initial-balance">
                  <span className="text-sm font-bold text-slate-900">Initial Balance</span>
                  <div className="mt-2 flex h-14 items-center rounded-lg border border-slate-200 bg-white px-3 transition focus-within:border-kash-emerald focus-within:ring-4 focus-within:ring-[rgba(16,185,129,0.20)]">
                    <span className="mr-2 text-sm font-bold text-slate-700">Rp</span>
                    <input
                      className="min-w-0 flex-1 border-0 bg-transparent text-lg font-bold text-slate-900 outline-none placeholder:text-slate-600"
                      id="initial-balance"
                      inputMode="numeric"
                      onChange={(event) => setInitialBalance(formatMoneyDigits(event.target.value))}
                      placeholder="8.500.000"
                      value={initialBalance}
                    />
                  </div>
                </label>
              </>
            ) : null}

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
              <Button disabled={loading} onClick={() => setStep((current) => Math.max(0, current - 1))} variant="secondary">
                Back
              </Button>
              <Button disabled={loading} type="submit">
                {loading ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
                {step === 4 ? "Create Wallet" : "Continue"}
              </Button>
            </div>
          </form>
        ) : null}

        {isFinish ? (
          <div className="mt-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-kash-selected text-kash-emerald">
              <Check aria-hidden="true" size={24} strokeWidth={2.4} />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-slate-900">You're ready, {displayName.trim() || "friend"}.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              {createdWallet
                ? `${formatMoneyCurrency(createdWallet.initial_balance, createdWallet.currency)} is now tracked in KASH.`
                : "Your first wallet is now tracked in KASH."}
            </p>
            <Button className="mt-8 w-full sm:w-auto" onClick={() => navigate("/dashboard", { replace: true })}>
              Go to Dashboard
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
