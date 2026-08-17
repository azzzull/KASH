import { InputHTMLAttributes } from "react";

type ToggleFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  description?: string;
};

export function ToggleField({ description, id, label, ...props }: ToggleFieldProps) {
  return (
    <label
      className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-3"
      htmlFor={id}
    >
      <span>
        <span className="block text-sm font-bold text-slate-900">{label}</span>
        {description ? <span className="mt-1 block text-xs font-medium text-slate-700">{description}</span> : null}
      </span>
      <input
        className="h-5 w-5 rounded border-slate-300 text-kash-emerald focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
        id={id}
        type="checkbox"
        {...props}
      />
    </label>
  );
}
