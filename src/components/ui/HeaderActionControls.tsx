import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { Archive, Check, ListFilter, SlidersHorizontal } from "lucide-react";
import React from "react";

export type HeaderArchiveButtonProps = {
  count?: number;
  isActive: boolean;
  onClick: () => void;
  label?: string;
  className?: string;
};

export function HeaderArchiveButton({
  count = 0,
  isActive,
  onClick,
  label = "Arsip",
  className = "",
}: HeaderArchiveButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}${count > 0 ? ` (${count})` : ""}`}
      title={`${label}${count > 0 ? ` (${count})` : ""}`}
      className={`relative inline-flex h-9 w-9 items-center justify-center rounded-xl transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-kash-emerald/30 ${
        isActive
          ? "bg-kash-selected text-kash-emeraldDark ring-1 ring-kash-emerald/40 font-extrabold shadow-xs"
          : "border border-slate-200/80 bg-white text-slate-600 hover:border-kash-emerald/40 hover:bg-slate-50 hover:text-slate-900 shadow-xs"
      } ${className}`}
    >
      <Archive size={17} strokeWidth={2.2} />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-kash-emerald px-1 text-[10px] font-black text-white ring-2 ring-white shadow-xs">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

export type HeaderFilterOption<T extends string = string> = {
  value: T;
  label: string;
  badge?: number | string;
};

export type HeaderFilterMenuProps<T extends string = string> = {
  options: HeaderFilterOption<T>[];
  value: T;
  defaultValue?: T;
  onChange: (value: T) => void;
  label?: string;
  className?: string;
};

export function HeaderFilterMenu<T extends string = string>({
  options,
  value,
  defaultValue,
  onChange,
  label = "Filter",
  className = "",
}: HeaderFilterMenuProps<T>) {
  const isFiltered = defaultValue !== undefined ? value !== defaultValue : false;
  const currentOption = options.find((opt) => opt.value === value);

  return (
    <Menu as="div" className={`relative inline-block text-left ${className}`}>
      <MenuButton
        type="button"
        aria-label={`${label}: ${currentOption?.label ?? value}`}
        title={`${label}: ${currentOption?.label ?? value}`}
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-xl transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-kash-emerald/30 ${
          isFiltered
            ? "bg-kash-selected text-kash-emeraldDark ring-1 ring-kash-emerald/40 font-extrabold shadow-xs"
            : "border border-slate-200/80 bg-white text-slate-600 hover:border-kash-emerald/40 hover:bg-slate-50 hover:text-slate-900 shadow-xs"
        }`}
      >
        <ListFilter size={17} strokeWidth={2.2} />
        {isFiltered && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-kash-emerald ring-2 ring-white" />
        )}
      </MenuButton>

      <MenuItems
        transition
        anchor="bottom end"
        className="z-50 min-w-[10rem] rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-xl transition focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0 data-[closed]:pointer-events-none data-[enter]:duration-100 data-[leave]:duration-75"
      >
        <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
          {label}
        </div>
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <MenuItem key={option.value}>
              {({ focus }) => (
                <button
                  type="button"
                  onClick={() => onChange(option.value)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs font-bold transition text-left ${
                    isSelected
                      ? "bg-kash-selected text-kash-emeraldDark"
                      : focus
                      ? "bg-slate-50 text-slate-900"
                      : "text-slate-700"
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <Check size={14} className="shrink-0 text-kash-emeraldDark" strokeWidth={2.5} />}
                </button>
              )}
            </MenuItem>
          );
        })}
      </MenuItems>
    </Menu>
  );
}
