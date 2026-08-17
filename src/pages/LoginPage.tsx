import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { GoogleIcon } from "../components/brand/GoogleIcon";
import { KashLogo } from "../components/brand/KashLogo";
import { Button } from "../components/ui/Button";
import { FormField } from "../components/ui/FormField";
import { useAuth } from "../context/AuthContext";

type AuthMode = "signin" | "signup";

export function LoginPage() {
  const { resendConfirmationEmail, signInWithGoogle, signInWithPassword, signUpWithPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailConfirmationSent, setEmailConfirmationSent] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setResendCooldown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const resetForm = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setResendSuccess(null);
    setEmailConfirmationSent(false);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);

    const { errorMessage } = await signInWithGoogle();

    if (errorMessage) {
      setError(errorMessage);
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResendSuccess(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    if (mode === "signup") {
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);

    if (mode === "signin") {
      const { errorMessage } = await signInWithPassword(trimmedEmail, password);
      if (errorMessage) {
        setError(errorMessage);
        setLoading(false);
      }
    } else {
      const { errorMessage, needsEmailConfirmation } = await signUpWithPassword(
        trimmedEmail,
        password,
        fullName.trim() || undefined,
      );

      if (errorMessage) {
        setError(errorMessage);
        setLoading(false);
        return;
      }

      if (needsEmailConfirmation) {
        setEmailConfirmationSent(true);
        setLoading(false);
      }
    }
  };

  const handleResendConfirmation = async () => {
    if (resendCooldown > 0 || resending) return;

    setResending(true);
    setResendSuccess(null);
    setError(null);

    const { errorMessage } = await resendConfirmationEmail(email.trim());
    setResending(false);

    if (errorMessage) {
      setError(errorMessage);
    } else {
      setResendSuccess("Confirmation email resent. Please check your inbox and spam folder.");
      setResendCooldown(60);
    }
  };

  return (
    <main className="kash-page-bg flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-xl border border-kash-emerald/15 bg-white/95 p-6 shadow-soft sm:p-8">
        <div className="flex justify-center">
          <KashLogo className="h-auto w-44 max-w-full" />
        </div>

        <div className="mt-6 text-center">
          <h1 className="text-xl font-extrabold leading-tight text-slate-900">Your money, organized in one place.</h1>
          <p className="mt-1 text-xs font-semibold text-slate-600">Track everything. Understand your money.</p>
        </div>

        {/* Tab Switcher */}
        <div className="mt-6 flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => resetForm("signin")}
            className={`flex-1 rounded-md py-2 text-xs font-extrabold transition ${
              mode === "signin"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => resetForm("signup")}
            className={`flex-1 rounded-md py-2 text-xs font-extrabold transition ${
              mode === "signup"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Create Account
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-xs font-bold text-slate-900">
            {error}
          </div>
        ) : null}

        {resendSuccess ? (
          <div className="mt-4 rounded-lg border border-kash-emerald/30 bg-kash-selected px-4 py-3 text-xs font-bold text-slate-900">
            {resendSuccess}
          </div>
        ) : null}

        {emailConfirmationSent ? (
          <div className="mt-6 rounded-lg border border-kash-emerald/30 bg-kash-selected p-5 text-center">
            <CheckCircle2 aria-hidden="true" className="mx-auto text-kash-emerald" size={36} strokeWidth={2.2} />
            <h2 className="mt-3 text-base font-extrabold text-slate-900">Check your inbox</h2>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-700">
              We sent a verification link to <span className="font-extrabold text-slate-900">{email}</span>. Click the link in the email to activate your account.
            </p>
            <p className="mt-2 text-[11px] font-medium leading-4 text-slate-600">
              If you don't see it within a minute, please check your spam folder or click below to resend.
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={resending || resendCooldown > 0}
                onClick={() => void handleResendConfirmation()}
                className="inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-extrabold text-kash-emeraldDark transition hover:underline disabled:cursor-not-allowed disabled:text-slate-600 disabled:no-underline"
              >
                {resending ? <RefreshCw aria-hidden="true" className="animate-spin" size={13} /> : null}
                {resending
                  ? "Sending..."
                  : resendCooldown > 0
                  ? `Resend confirmation email (${resendCooldown}s)`
                  : "Resend confirmation email"}
              </button>

              <Button
                className="mt-2 w-full"
                onClick={() => {
                  setEmailConfirmationSent(false);
                  setMode("signin");
                }}
                variant="secondary"
              >
                Back to Sign In
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Google OAuth Button */}
            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleSignIn}
              className="mt-5 flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-kash-emerald/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleIcon className="h-5 w-5 shrink-0" />
              <span>Continue with Google</span>
            </button>

            <div className="relative my-5 flex items-center justify-center">
              <div className="w-full border-t border-slate-200" />
              <span className="absolute bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                or with email
              </span>
            </div>

            {/* Email & Password Form */}
            <form className="grid gap-3.5" onSubmit={handleEmailSubmit}>
              {mode === "signup" ? (
                <FormField
                  id="auth-fullname"
                  label="Display Name (Optional)"
                  placeholder="e.g. Alex"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                />
              ) : null}

              <FormField
                id="auth-email"
                label="Email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />

              <FormField
                id="auth-password"
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
              />

              {mode === "signup" ? (
                <FormField
                  id="auth-confirm-password"
                  label="Confirm Password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              ) : null}

              <Button className="mt-2 w-full" disabled={loading} type="submit">
                {loading ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
                {loading
                  ? mode === "signin"
                    ? "Signing In..."
                    : "Creating Account..."
                  : mode === "signin"
                    ? "Sign In"
                    : "Create Account"}
              </Button>
            </form>
          </>
        )}

        <p className="mt-5 text-center text-[11px] leading-5 text-slate-600">
          By continuing, you agree to keep your financial data organized and secure in KASH.
        </p>
      </section>
    </main>
  );
}
