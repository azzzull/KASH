import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type PageHeaderProps = {
  actions?: ReactNode;
  description?: ReactNode;
  eyebrow: string;
  icon: LucideIcon;
  title: string;
};

export function PageHeader({ actions, description, eyebrow, icon: Icon, title }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-extrabold text-kash-emerald">
          <Icon aria-hidden="true" size={18} strokeWidth={2.4} />
          <span>{eyebrow}</span>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm font-semibold text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="w-full shrink-0 lg:w-auto">{actions}</div> : null}
    </div>
  );
}
