import React, { type ReactNode } from "react";

export type FilterTabOption<T extends string = string> = {
  value: T;
  label: ReactNode;
  count?: number | string | null;
  icon?: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  disabled?: boolean;
};

export type FilterTabsProps<T extends string = string> = {
  options: FilterTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
  fullWidth?: boolean;
  "aria-label"?: string;
};

export function FilterTabs<T extends string = string>({
  options,
  value,
  onChange,
  className = "",
  size = "md",
  fullWidth = false,
  "aria-label": ariaLabel,
}: FilterTabsProps<T>) {
  const isSm = size === "sm";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100/60 p-1 ${className}`}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-bold transition-all duration-150 focus:outline-none focus:ring-4 focus:ring-kash-emerald/20 disabled:opacity-40 disabled:pointer-events-none ${
              fullWidth ? "flex-1" : ""
            } ${
              isSm
                ? "h-7 px-2.5 text-[11px]"
                : "h-8 px-3 text-xs"
            } ${
              isActive
                ? "bg-kash-emerald text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/70"
            }`}
          >
            {Icon ? <Icon size={isSm ? 13 : 14} strokeWidth={2.4} className={isActive ? "text-white" : "text-slate-600"} /> : null}
            <span>{option.label}</span>
            {option.count !== undefined && option.count !== null && option.count !== "" ? (
              <span
                className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none min-w-4 ${
                  isActive
                    ? "bg-white/25 text-white"
                    : "bg-kash-emerald/10 text-kash-emeraldDark"
                }`}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
