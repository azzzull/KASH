import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { categoryIconOptions, getCategoryIcon } from "../../lib/categoryMeta";

type CategoryIconPickerProps = {
  value: string;
  onChange: (iconKey: string) => void;
  accentColor?: string;
  label?: string;
};

const GROUPS = [
  "Semua",
  "Kuliner",
  "Transportasi",
  "Belanja",
  "Tagihan",
  "Keluarga",
  "Pekerjaan",
  "Hiburan",
  "Kesehatan",
  "Edukasi",
  "Travel",
  "Sosial",
];

export function CategoryIconPicker({
  value,
  onChange,
  accentColor = "#10B981",
  label = "Ikon Kategori",
}: CategoryIconPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("Semua");
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = useMemo(
    () => categoryIconOptions.find((opt) => opt.value === value) ?? categoryIconOptions[0],
    [value],
  );

  const CurrentIcon = getCategoryIcon(value);

  const filteredIcons = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categoryIconOptions.filter((opt) => {
      const matchGroup = activeGroup === "Semua" || opt.group === activeGroup;
      if (!matchGroup) return false;
      if (!q) return true;

      const matchLabel = opt.label.toLowerCase().includes(q);
      const matchValue = opt.value.toLowerCase().includes(q);
      const matchKeywords = opt.keywords?.some((k) => k.toLowerCase().includes(q));
      return matchLabel || matchValue || matchKeywords;
    });
  }, [search, activeGroup]);

  // Auto-scroll into view when opened (matching DatePickerField behavior)
  useEffect(() => {
    if (isOpen && popoverRef.current) {
      popoverRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [isOpen]);

  // Handle outside click & Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    // Auto-focus search input when opened
    const timer = setTimeout(() => {
      searchInputRef.current?.focus({ preventScroll: true });
    }, 50);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative block w-full max-w-full min-w-0 ${isOpen ? "z-40" : "z-10"}`}>
      {label && (
        <label className="block text-sm font-bold text-slate-900 mb-1.5">{label}</label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex h-11 w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 text-left transition ${
          isOpen
            ? "border-kash-emerald ring-4 ring-[rgba(16,185,129,0.20)] shadow-xs"
            : "border-slate-200 hover:border-kash-emerald/50 hover:bg-kash-selected/30"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow-xs"
            style={{ backgroundColor: accentColor }}
          >
            <CurrentIcon size={16} strokeWidth={2.4} />
          </span>
          <span className="truncate text-sm font-bold text-slate-900">
            {selectedOption.label}
          </span>
        </div>
        <ChevronDown
          size={17}
          className={`shrink-0 text-slate-600 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-kash-emerald" : ""
          }`}
        />
      </button>

      {/* Dropdown Popover (Compact DatePicker-like popup) */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-[calc(100%+6px)] z-50 flex max-h-72 w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100"
          style={{ width: "100%", minWidth: "280px" }}
        >
          {/* Search bar inside popup */}
          <div className="relative mb-2 shrink-0">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600"
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Cari ikon (kopi, bensin, wifi, kado, gym)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-8 pr-7 text-xs font-semibold text-slate-900 placeholder:text-slate-600 focus:border-kash-emerald focus:bg-white focus:outline-none focus:ring-2 focus:ring-kash-emerald/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-900"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Group Filter Chips */}
          <div className="mb-2 flex shrink-0 gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
            {GROUPS.map((grp) => (
              <button
                key={grp}
                type="button"
                onClick={() => setActiveGroup(grp)}
                className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                  activeGroup === grp
                    ? "bg-kash-emerald text-white shadow-xs"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {grp}
              </button>
            ))}
          </div>

          {/* Icons Grid (Compact & Scrollable) */}
          <div className="flex-1 overflow-y-auto p-0.5 no-scrollbar max-h-40 min-h-[120px]">
            {filteredIcons.length === 0 ? (
              <div className="py-6 text-center text-xs font-semibold text-slate-600">
                Tidak ada ikon untuk &quot;{search}&quot;.
              </div>
            ) : (
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5">
                {filteredIcons.map((opt) => {
                  const IconComp = opt.icon;
                  const isSelected = opt.value === value;

                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                      }}
                      className={`group relative flex flex-col items-center justify-center rounded-lg p-1.5 text-center transition ${
                        isSelected
                          ? "border-2 border-kash-emerald bg-kash-selected/70 text-kash-emeraldDark"
                          : "border border-slate-100 bg-white hover:border-kash-emerald/40 hover:bg-slate-50 text-slate-700"
                      }`}
                      title={opt.label}
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-md transition ${
                          isSelected
                            ? "text-white shadow-xs"
                            : "bg-slate-100 group-hover:bg-slate-200 text-slate-700"
                        }`}
                        style={{
                          backgroundColor: isSelected ? accentColor : undefined,
                        }}
                      >
                        <IconComp size={15} strokeWidth={2.2} />
                      </span>
                      <span className="mt-1 line-clamp-1 w-full text-[9px] font-bold text-slate-600 group-hover:text-slate-900">
                        {opt.label.split(" ")[0]}
                      </span>
                      {isSelected && (
                        <span className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-kash-emerald text-white">
                          <Check size={8} strokeWidth={3.5} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer inside popup */}
          <div className="mt-2 flex shrink-0 items-center justify-between border-t border-slate-100 pt-1.5 text-[10px] font-semibold text-slate-600">
            <span>{filteredIcons.length} ikon</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="font-bold text-kash-emerald hover:text-kash-emeraldDark"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
