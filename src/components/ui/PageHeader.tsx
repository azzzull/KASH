import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type PageHeaderProps = {
  actions?: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  icon?: LucideIcon;
  title: string;
};

export function PageHeader({ actions, description, eyebrow, icon: Icon, title }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-kash-emerald">
            {Icon ? <Icon aria-hidden="true" size={16} strokeWidth={2.4} /> : null}
            <span>{eyebrow}</span>
          </div>
        ) : null}
        <h1 className={`${eyebrow ? "mt-1.5" : ""} text-xl font-extrabold text-slate-900 md:text-2xl`}>{title}</h1>
        {description ? <p className="mt-1 text-sm font-medium text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="w-full shrink-0 lg:w-auto">{actions}</div> : null}
    </div>
  );
}
