import { X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { mobileMoreItems } from "../../app/navigation";
import { IconButton } from "../ui/IconButton";

type MobileMoreSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function MobileMoreSheet({ open, onClose }: MobileMoreSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/25 lg:hidden" role="dialog" aria-modal="true">
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close more menu" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-soft">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h2 className="text-base font-bold text-slate-900">More</h2>
          <IconButton icon={X} label="Close more menu" onClick={onClose} />
        </div>
        <div className="mt-3 grid gap-1">
          {mobileMoreItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold text-slate-800 transition hover:bg-kash-selected hover:text-kash-emeraldDark"
            >
              <item.icon aria-hidden="true" size={19} strokeWidth={2} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </section>
    </div>
  );
}
