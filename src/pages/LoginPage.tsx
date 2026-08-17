import { Loader2 } from "lucide-react";
import { useState } from "react";
import { KashLogo } from "../components/brand/KashLogo";
import { Button } from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);

    const { errorMessage } = await signInWithGoogle();

    if (errorMessage) {
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <main className="kash-page-bg flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-kash-emerald/10 bg-white/95 p-6 shadow-sm sm:p-8">
        <div className="flex justify-center">
          <KashLogo className="h-auto w-48 max-w-full" />
        </div>

        <div className="mt-8 text-center">
          <h1 className="text-2xl font-bold leading-tight text-slate-900">Your money, organized in one place.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-700">Track everything. Understand your money.</p>
        </div>

        {error ? (
          <div className="mt-6 rounded-lg border border-kash-expense/30 bg-kash-expense/10 px-4 py-3 text-sm font-semibold text-slate-900">
            {error}
          </div>
        ) : null}

        <Button className="mt-6 w-full" disabled={loading} onClick={handleGoogleSignIn}>
          {loading ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
          {loading ? "Connecting..." : "Continue with Google"}
        </Button>

        <p className="mt-5 text-center text-xs leading-5 text-slate-600">
          Use your Google account to continue. KASH does not store your Google password.
        </p>
      </section>
    </main>
  );
}
