import { Check, Loader2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KashLogo } from "../components/brand/KashLogo";
import { Button } from "../components/ui/Button";
import { FormField } from "../components/ui/FormField";
import { SelectField } from "../components/ui/SelectField";
import { ToggleField } from "../components/ui/ToggleField";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { completeProfileOnboarding, updateProfileCurrency, updateProfileFullName } from "../lib/auth";
import { formatCurrency as formatMoneyCurrency, formatMoneyDigits, parseMoneyInputDigits } from "../lib/money";
import { createFirstWallet } from "../lib/wallets";
import type { Wallet, WalletType } from "../types/domain";

export function OnboardingPage() {
  const { t, formatCurrency } = useI18n();
  const navigate = useNavigate();
  const { profile, refreshProfile, user } = useAuth();

  const walletTypes: Array<{ label: string; value: WalletType; needsInstitution: boolean }> = useMemo(() => [
    { label: t("wallets.bank") || "Bank", value: "bank", needsInstitution: true },
    { label: t("wallets.digitalBank") || "Bank Digital", value: "digital_bank", needsInstitution: true },
    { label: t("wallets.eWallet") || "E-Wallet", value: "ewallet", needsInstitution: true },
    { label: t("wallets.cash") || "Uang Tunai", value: "cash", needsInstitution: false },
    { label: t("wallets.investment") || "Investasi", value: "investment", needsInstitution: true },
    { label: t("wallets.savings") || "Tabungan", value: "savings", needsInstitution: true },
    { label: t("wallets.custom") || "Lainnya", value: "custom", needsInstitution: true },
  ], [t]);

  const steps = useMemo(() => [
    t("onboarding.welcome") || "Selamat Datang",
    t("onboarding.profile") || "Profil",
    t("onboarding.currency") || "Mata Uang",
    t("onboarding.firstWallet") || "Dompet Pertama",
    t("onboarding.initialBalance") || "Saldo Awal",
  ], [t]);

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
    [walletType, walletTypes],
  );
  const isFinish = step >= steps.length;
  const progressPercent = isFinish ? 100 : ((step + 1) / steps.length) * 100;

  const persistDisplayName = async () => {
    if (!user) return;
    const trimmed = displayName.trim();

    if (!trimmed) {
      setError(t("onboarding.displayNameRequired") || "Silakan masukkan nama tampilan Anda.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: updateError } = await updateProfileFullName(user.id, trimmed);

    if (updateError) {
      setError(t("onboarding.displayNameSaveError") || "Gagal menyimpan nama tampilan. Silakan coba lagi.");
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
      setError(t("onboarding.currencySaveError") || "Gagal menyimpan mata uang. Silakan coba lagi.");
      setLoading(false);
      return;
    }

    await refreshProfile();
    setLoading(false);
    setStep(3);
  };

  const validateWalletInfo = () => {
    if (!walletName.trim()) {
      setError(t("wallets.nameRequired") || "Nama dompet wajib diisi.");
      return false;
    }

    if (selectedWalletType.needsInstitution && !institutionName.trim()) {
      setError(t("wallets.institutionRequired") || "Institusi / Bank wajib diisi untuk tipe dompet ini.");
      return false;
    }

    setError(null);
    return true;
  };

  const createWalletAndComplete = async () => {
    if (!user) return;

    const effectiveName = displayName.trim() || profile?.full_name?.trim();
    if (!effectiveName) {
      setError(t("onboarding.displayNameRequired") || "Silakan atur nama tampilan sebelum menyelesaikan orientasi.");
      setStep(1);
      return;
    }

    const normalizedBalance = parseMoneyInputDigits(initialBalance);

    if (!normalizedBalance) {
      setError(t("wallets.initialBalanceRequired") || "Saldo awal wajib diisi. Masukkan 0 jika dompet kosong.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: nameError } = await updateProfileFullName(user.id, effectiveName);
    if (nameError) {
      setError(t("onboarding.displayNameSaveError") || "Gagal menyimpan nama tampilan. Silakan coba lagi.");
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
        setError(t("onboarding.walletCreateError") || "Gagal membuat dompet pertama Anda. Silakan periksa data dan coba lagi.");
        setLoading(false);
        return;
      }

      wallet = data;
      setCreatedWallet(data);
    }

    const { error: profileError } = await completeProfileOnboarding(user.id);

    if (profileError) {
      setError(t("onboarding.completeError") || "Dompet Anda berhasil dibuat, tetapi proses onboarding belum selesai. Silakan coba lagi.");
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
          <h1 className="mt-8 text-xl font-bold text-slate-900">{t("onboarding.preparingProfile") || "Menyiapkan profil Anda"}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            {t("onboarding.loadingProfileNotice") || "Kami sedang memuat profil KASH Anda. Tunggu sebentar dan coba lagi."}
          </p>
          <Button className="mt-6 w-full" onClick={() => void refreshProfile()}>
            {t("common.retry") || "Coba Lagi"}
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
                {t("onboarding.stepOf", { current: step + 1, total: steps.length }) || `Langkah ${step + 1} dari ${steps.length}`}
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
              {t("onboarding.heroTitleLine1") || "Keuangan Anda,"}
              <br />
              {t("onboarding.heroTitleLine2") || "tertata dalam satu tempat."}
            </h1>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-slate-700">
              {t("onboarding.heroDesc") || "Atur profil, mata uang, dan dompet pertama Anda agar KASH dapat mulai mencatat saldo riil Anda."}
            </p>
            <Button className="mt-8 w-full sm:w-auto" onClick={() => setStep(1)}>
              {t("onboarding.getStarted") || "Mulai Sekarang"}
            </Button>
          </div>
        ) : null}

        {step > 0 && step < steps.length ? (
          <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
            {step === 1 ? (
              <>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">{t("onboarding.nameTitle") || "Siapa nama panggilan Anda?"}</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {t("onboarding.nameDesc") || "Nama ini akan muncul pada dashboard, profil, dan navigasi Anda."}
                  </p>
                </div>
                <FormField
                  id="onboarding-display-name"
                  label={t("onboarding.displayName") || "Nama Tampilan"}
                  placeholder="mis. Alex"
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
                  <h1 className="text-2xl font-bold text-slate-900">{t("onboarding.currencyTitle") || "Apa mata uang utama Anda?"}</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{t("onboarding.currencyDesc") || "IDR adalah mata uang standar yang didukung."}</p>
                </div>
                <SelectField id="currency" label={t("wallets.currency") || "Mata Uang"} value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  <option value="IDR">IDR - Indonesian Rupiah</option>
                </SelectField>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">{t("onboarding.walletTitle") || "Tambah dompet pertama Anda"}</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{t("onboarding.walletDesc") || "Tambahkan tempat Anda menyimpan uang saat ini."}</p>
                </div>
                <SelectField
                  id="wallet-type"
                  label={t("wallets.type") || "Tipe Dompet"}
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
                  label={t("wallets.name") || "Nama Dompet"}
                  onChange={(event) => setWalletName(event.target.value)}
                  placeholder="BCA Utama"
                  value={walletName}
                />
                {selectedWalletType.needsInstitution ? (
                  <FormField
                    id="institution-name"
                    label={t("wallets.institution") || "Institusi / Bank"}
                    onChange={(event) => setInstitutionName(event.target.value)}
                    placeholder="BCA"
                    value={institutionName}
                  />
                ) : null}
                <SelectField id="wallet-currency" label={t("wallets.currency") || "Mata Uang"} value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  <option value="IDR">IDR - Indonesian Rupiah</option>
                </SelectField>
                <ToggleField
                  checked={includeInNetWorth}
                  description={t("wallets.includeInNetWorthHelp") || "Sertakan dompet ini saat KASH menghitung kekayaan bersih Anda."}
                  id="include-net-worth"
                  label={t("wallets.includeInNetWorth") || "Sertakan dalam Kekayaan Bersih"}
                  onChange={(event) => setIncludeInNetWorth(event.target.checked)}
                />
              </>
            ) : null}

            {step === 4 ? (
              <>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">{t("onboarding.balanceTitle") || "Saldo Saat Ini"}</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {t("onboarding.balanceDesc") || "Masukkan saldo riil yang ada pada dompet ini. Saldo awal bukan merupakan pemasukan."}
                  </p>
                </div>
                <label className="block" htmlFor="initial-balance">
                  <span className="text-sm font-bold text-slate-900">{t("wallets.initialBalance") || "Saldo Awal"}</span>
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
                {t("common.back") || "Kembali"}
              </Button>
              <Button disabled={loading} type="submit">
                {loading ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
                {step === 4 ? (t("wallets.create") || "Tambah Dompet") : (t("common.continue") || "Lanjutkan")}
              </Button>
            </div>
          </form>
        ) : null}

        {isFinish ? (
          <div className="mt-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-kash-selected text-kash-emerald">
              <Check aria-hidden="true" size={24} strokeWidth={2.4} />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-slate-900">{t("onboarding.readyTitle", { name: displayName.trim() || "Kawan" }) || `Anda siap, ${displayName.trim() || "Kawan"}.`}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              {createdWallet
                ? (t("onboarding.walletTrackedNotice", { amount: formatCurrency(createdWallet.initial_balance, createdWallet.currency) }) || `${formatMoneyCurrency(createdWallet.initial_balance, createdWallet.currency)} kini tercatat di KASH.`)
                : (t("onboarding.firstWalletTracked") || "Dompet pertama Anda kini tercatat di KASH.")}
            </p>
            <Button className="mt-8 w-full sm:w-auto" onClick={() => navigate("/dashboard", { replace: true })}>
              {t("onboarding.goToDashboard") || "Buka Dashboard"}
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
