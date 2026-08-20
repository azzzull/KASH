import { LucideIcon } from "lucide-react";
import { PageCard } from "./PageCard";
import { PageHeader } from "./PageHeader";

type PagePlaceholderProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  sections?: string[];
};

export function PagePlaceholder({ title, description, icon: Icon, sections = [] }: PagePlaceholderProps) {
  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHeader eyebrow="Sprint 1 Foundation" icon={Icon} title={title} description={description} />

      <PageCard>
        <div className="grid gap-4 md:grid-cols-3">
          {(sections.length ? sections : ["Shell", "Navigation", "Placeholder"]).map((section) => (
            <div key={section} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 h-2 w-16 rounded-full bg-slate-200" />
              <h2 className="text-sm font-bold text-slate-900">{section}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                UI placeholder only. Data, forms, authentication, and financial logic are intentionally deferred.
              </p>
            </div>
          ))}
        </div>
      </PageCard>
    </div>
  );
}
