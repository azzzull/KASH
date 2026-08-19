import { AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { Link, useRouteError } from "react-router-dom";
import { Button } from "../ui/Button";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Terjadi kendala saat memuat halaman.";
}

function isDynamicImportError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("dynamically imported module")
  );
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  const isUpdate = isDynamicImportError(error);

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <main className="kash-page-bg flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 text-center shadow-lg sm:p-8">
        {isUpdate ? (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-kash-emerald/10 text-kash-emeraldDark ring-8 ring-kash-emerald/5">
              <Sparkles aria-hidden="true" size={28} />
            </div>
            <h1 className="mt-5 text-xl font-black text-slate-900">
              Pembaruan Versi Tersedia
            </h1>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">
              KASH telah diperbarui ke versi terbaru. Silakan muat ulang halaman untuk menggunakan fitur dan penyempurnaan terbaru.
            </p>
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              <Button onClick={handleReload} className="w-full sm:w-auto">
                <RefreshCw size={16} />
                Muat Ulang Sekarang
              </Button>
              <Link to="/dashboard" className="w-full sm:w-auto">
                <Button variant="secondary" className="w-full">
                  Ke Dashboard
                </Button>
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-8 ring-amber-50/50">
              <AlertTriangle aria-hidden="true" size={28} />
            </div>
            <h1 className="mt-5 text-xl font-black text-slate-900">
              Halaman Perlu Dimuat Ulang
            </h1>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">
              Terjadi kendala saat memuat layar ini. Silakan muat ulang halaman atau kembali ke Dashboard.
            </p>
            <p className="mt-3 rounded-lg bg-slate-50 p-2.5 text-left text-xs font-mono text-slate-600 break-all">
              {getErrorMessage(error)}
            </p>
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              <Button onClick={handleReload} className="w-full sm:w-auto">
                <RefreshCw size={16} />
                Muat Ulang Halaman
              </Button>
              <Link to="/dashboard" className="w-full sm:w-auto">
                <Button variant="secondary" className="w-full">
                  Ke Dashboard
                </Button>
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
