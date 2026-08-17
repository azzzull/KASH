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
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-kash-emerald/15 bg-white text-slate-700 transition hover:border-kash-gold/60 hover:bg-kash-selected hover:text-kash-emeraldDark active:bg-kash-selected ${className}`}
      title={label}
      type="button"
      {...props}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={2} />
    </button>
  );
}
