import { InputHTMLAttributes, ReactNode } from "react";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  hasError?: boolean;
};

export function FormField({ className = "", hasError = false, hint, id, label, ...props }: FormFieldProps) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-sm font-bold text-slate-900">{label}</span>
      <input
        aria-invalid={hasError || props["aria-invalid"]}
        className={`mt-2 h-12 w-full rounded-lg border border-slate-200 bg-white px-3 text-base font-semibold text-slate-900 transition placeholder:text-slate-600 focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-[rgba(16,185,129,0.20)] disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-600 md:text-sm ${
          hasError ? "!border-[#E50914] !shadow-[0_0_0_4px_rgba(229,9,20,0.14)] focus:!border-[#E50914] focus:!ring-[rgba(229,9,20,0.22)]" : ""
        } ${className}`}
        id={id}
        {...props}
      />
      {hint ? <span className="mt-2 block text-xs font-medium text-slate-700">{hint}</span> : null}
    </label>
  );
}

