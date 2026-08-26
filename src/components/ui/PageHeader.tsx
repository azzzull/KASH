import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type PageHeaderProps = {
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  icon?: LucideIcon;
  title: string;
};

export function PageHeader({
  actions,
  breadcrumb,
  description,
  eyebrow,
  icon: Icon,
  title,
}: PageHeaderProps) {
  return (
    <div className="mt-2 space-y-1">
      {breadcrumb ? <div className="mb-1">{breadcrumb}</div> : null}
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-kash-emerald">
              {Icon ? <Icon aria-hidden="true" size={16} strokeWidth={2.4} /> : null}
              <span>{eyebrow}</span>
            </div>
          ) : null}
          <h1 className={`${eyebrow ? "mt-0.5" : ""} truncate text-xl font-extrabold text-slate-900 md:text-2xl`}>
            {title}
          </h1>
          {description ? (
            <p className="mt-0.5 text-xs font-medium leading-snug text-slate-600">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
