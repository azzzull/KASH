import { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary";
};

export function Button({ children, className = "", disabled, type = "button", variant = "primary", ...props }: ButtonProps) {
  const styles =
    variant === "primary"
      ? "border-kash-emerald bg-kash-emerald text-white hover:border-kash-emeraldDark hover:bg-kash-emeraldDark active:border-kash-emeraldPressed active:bg-kash-emeraldPressed"
      : "border-kash-emerald/15 bg-white text-slate-900 hover:border-kash-gold/60 hover:bg-kash-selected hover:text-kash-emeraldDark active:bg-kash-selected";

  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(16,185,129,0.20)] disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-600 ${styles} ${className}`}
      disabled={disabled}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
