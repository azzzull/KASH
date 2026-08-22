import { Check } from "lucide-react";
import type { InputHTMLAttributes } from "react";

type ToggleFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  description?: string;
};

export function ToggleField({ description, id, label, checked, ...props }: ToggleFieldProps) {
  return (
    <label
      className="flex cursor-pointer touch-manipulation items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-3 transition [@media(hover:hover)_and_(pointer:fine)]:hover:border-slate-300 active:border-kash-emerald/40"
      htmlFor={id}
    >
      <span>
        <span className="block text-sm font-bold text-slate-900">{label}</span>
        {description ? <span className="mt-1 block text-xs font-medium text-slate-700">{description}</span> : null}
      </span>
      <div className="relative flex items-center shrink-0">
        <input
          className="sr-only peer"
          id={id}
          type="checkbox"
          checked={checked}
          {...props}
        />
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-300 bg-white transition peer-checked:border-kash-emerald peer-checked:bg-kash-emerald peer-focus-visible:ring-4 peer-focus-visible:ring-[rgba(16,185,129,0.20)]">
          {checked ? (
            <Check size={13} strokeWidth={3.5} className="text-white" style={{ color: "#ffffff", stroke: "#ffffff" }} />
          ) : null}
        </div>
      </div>
    </label>
  );
}
