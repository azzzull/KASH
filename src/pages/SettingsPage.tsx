import { ChevronRight, Settings, Tags } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/ui/PageHeader";

export function SettingsPage() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 p-4 md:p-6">
      <PageHeader eyebrow="Account" icon={Settings} title="Settings" description="Manage preferences and finance setup." />

      <section className="grid gap-3">
        <Link
          className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-kash-emerald hover:bg-kash-selected/40"
          to="/settings/categories"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-kash-selected text-kash-emerald">
            <Tags aria-hidden="true" size={19} />
          </span>
          <span>
            <span className="block text-sm font-extrabold text-slate-900">Categories</span>
            <span className="mt-1 block text-xs font-semibold text-slate-700">Manage custom income and expense categories.</span>
          </span>
          <ChevronRight aria-hidden="true" className="text-slate-600" size={18} />
        </Link>

        <article className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 opacity-75 shadow-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <Settings aria-hidden="true" size={19} />
          </span>
          <span>
            <span className="block text-sm font-extrabold text-slate-900">Profile and Preferences</span>
            <span className="mt-1 block text-xs font-semibold text-slate-700">Deferred to a later sprint.</span>
          </span>
        </article>
      </section>
    </div>
  );
}
