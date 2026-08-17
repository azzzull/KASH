import { AlertTriangle } from "lucide-react";
import { Link, useRouteError } from "react-router-dom";
import { Button } from "../ui/Button";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unexpected route error occurred.";
}

export function RouteErrorBoundary() {
  const error = useRouteError();

  return (
    <main className="kash-page-bg flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-kash-emerald/10 bg-white/95 p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-kash-expense/10 text-kash-expense">
          <AlertTriangle aria-hidden="true" size={24} />
        </div>
        <h1 className="mt-5 text-xl font-extrabold text-slate-900">Something went wrong.</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">
          KASH couldn't load this screen. The error has not been hidden; this page only keeps the app readable.
        </p>
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-700">
          {getErrorMessage(error)}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => window.location.reload()} variant="secondary">
            Reload
          </Button>
          <Link to="/dashboard">
            <Button>Go to Dashboard</Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
