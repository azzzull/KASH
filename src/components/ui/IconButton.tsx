import { LucideIcon } from "lucide-react";
import { ButtonHTMLAttributes } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
};

export function IconButton({ icon: Icon, label, className = "", ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-kash-emerald/40 ${className}`}
      title={label}
      type="button"
      {...props}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
    </button>
  );
}
