import React, { type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  isLoading?: boolean;
  size?: "sm" | "md" | "lg";
};

export function Button({
  children,
  className = "",
  disabled,
  isLoading = false,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  let styles = "";

  if (variant === "primary") {
    styles =
      "border-kash-emerald bg-kash-emerald text-white hover:border-kash-emeraldDark hover:bg-kash-emeraldDark active:border-kash-emeraldPressed active:bg-kash-emeraldPressed shadow-xs";
  } else if (variant === "secondary") {
    styles =
      "border-slate-200 bg-white text-slate-800 hover:border-kash-emerald/40 hover:bg-kash-selected/60 hover:text-kash-emeraldDark active:bg-kash-selected shadow-xs";
  } else if (variant === "ghost") {
    styles =
      "border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200";
  } else if (variant === "danger") {
    styles =
      "border-kash-expense bg-kash-expense text-white hover:bg-red-700 active:bg-red-800 shadow-xs";
  }

  const sizeStyles =
    size === "sm"
      ? "min-h-8 px-3 py-1.5 text-xs rounded-lg gap-1.5"
      : size === "lg"
        ? "min-h-12 px-5 py-3 text-base rounded-xl gap-2.5"
        : "min-h-11 px-4 py-2.5 text-sm rounded-lg gap-2";

  return (
    <button
      className={`inline-flex items-center justify-center font-bold border transition-all duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(16,185,129,0.20)] disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed ${sizeStyles} ${styles} ${className}`}
      disabled={disabled || isLoading}
      type={type}
      {...props}
    >
      {isLoading ? <Loader2 className="animate-spin" size={size === "sm" ? 14 : 16} strokeWidth={2.4} /> : null}
      {children}
    </button>
  );
}
