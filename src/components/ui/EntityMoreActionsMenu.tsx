import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { type LucideIcon, MoreVertical } from "lucide-react";
import React from "react";

export type MoreActionItem = {
  id?: string;
  label: string;
  icon?: LucideIcon;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  isDestructive?: boolean;
  separatorBefore?: boolean;
  hidden?: boolean;
};

export type EntityMoreActionsMenuProps = {
  items: (MoreActionItem | null | undefined | false)[];
  triggerVariant?: "default" | "hero" | "ghost";
  align?: "right" | "left";
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
  iconSize?: number;
};

export function EntityMoreActionsMenu({
  items,
  triggerVariant = "default",
  align = "right",
  ariaLabel = "Opsi lainnya",
  className = "",
  buttonClassName = "",
  iconSize = 16,
}: EntityMoreActionsMenuProps) {
  const visibleItems = items.filter((item): item is MoreActionItem => Boolean(item && !item.hidden));

  if (visibleItems.length === 0) {
    return null;
  }

  const triggerStyles = {
    default:
      "flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 transition hover:border-kash-emerald/50 hover:bg-kash-selected/40 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-kash-emerald/20",
    hero:
      "flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white transition hover:bg-white/25 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
    ghost:
      "flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-kash-emerald/20",
  };

  const alignClass = align === "left" ? "left-0 origin-top-left" : "right-0 origin-top-right";

  return (
    <Menu as="div" className={`relative inline-block text-left ${className}`}>
      <MenuButton
        type="button"
        className={`${triggerStyles[triggerVariant]} ${buttonClassName}`}
        aria-label={ariaLabel}
      >
        <MoreVertical size={iconSize} />
      </MenuButton>

      <MenuItems
        transition
        className={`absolute ${alignClass} z-50 mt-1.5 min-w-[11rem] rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-xl transition focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0 data-[closed]:pointer-events-none data-[enter]:duration-100 data-[leave]:duration-75`}
      >
        {visibleItems.map((item, index) => {
          const ItemIcon = item.icon;
          return (
            <React.Fragment key={item.id ?? `${item.label}-${index}`}>
              {item.separatorBefore && index > 0 ? (
                <div className="my-1 border-t border-slate-100" />
              ) : null}
              <MenuItem disabled={item.disabled}>
                {({ focus, disabled }) => (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={(e) => {
                      item.onClick(e);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-bold transition text-left ${
                      disabled
                        ? "opacity-40 cursor-not-allowed text-slate-400"
                        : item.isDestructive
                        ? focus
                          ? "bg-red-50 text-kash-expense"
                          : "text-kash-expense"
                        : focus
                        ? "bg-slate-50 text-slate-900"
                        : "text-slate-700"
                    }`}
                  >
                    {ItemIcon ? <ItemIcon size={14} className="shrink-0" /> : null}
                    <span className="truncate">{item.label}</span>
                  </button>
                )}
              </MenuItem>
            </React.Fragment>
          );
        })}
      </MenuItems>
    </Menu>
  );
}
