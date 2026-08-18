import { Check, ChevronDown, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { categoryIconOptions, getCategoryIcon, type CategoryIconOption } from "../../lib/categoryMeta";

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
  label = "Pilih Ikon",
}: CategoryIconPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("Semua");

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

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-bold text-slate-900 mb-1.5">{label}</label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-12 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 text-left transition hover:border-kash-emerald/50 hover:bg-kash-selected/30 focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]"
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
        <ChevronDown size={17} className="shrink-0 text-slate-600" />
      </button>

      {/* Icon Picker Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-xs"
                  style={{ backgroundColor: accentColor }}
                >
                  <CurrentIcon size={18} strokeWidth={2.4} />
                </span>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Koleksi Ikon Kategori</h3>
                  <p className="text-[11px] font-semibold text-slate-600">
                    Pilih ikon yang paling sesuai untuk kategori ini
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search & Group Filter Bar */}
            <div className="border-b border-slate-100 p-3 space-y-2 bg-slate-50/50">
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
                />
                <input
                  type="text"
                  placeholder="Cari ikon (misal: kopi, bensin, wifi, kado, gym, game)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-900 placeholder:text-slate-600 focus:border-kash-emerald focus:outline-none focus:ring-2 focus:ring-kash-emerald/20"
                />
              </div>

              {/* Group Chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                {GROUPS.map((grp) => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setActiveGroup(grp)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                      activeGroup === grp
                        ? "bg-kash-emerald text-white shadow-xs"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {grp}
                  </button>
                ))}
              </div>
            </div>

            {/* Icons Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {filteredIcons.length === 0 ? (
                <div className="py-10 text-center text-xs font-semibold text-slate-600">
                  Tidak ditemukan ikon dengan kata kunci &quot;{search}&quot;.
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
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
                        className={`group relative flex flex-col items-center justify-center rounded-xl p-2.5 text-center transition ${
                          isSelected
                            ? "border-2 border-kash-emerald bg-kash-selected/70 text-kash-emeraldDark shadow-xs"
                            : "border border-slate-100 bg-white hover:border-kash-emerald/40 hover:bg-slate-50 text-slate-700"
                        }`}
                        title={opt.label}
                      >
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
                            isSelected
                              ? "text-white shadow-xs"
                              : "bg-slate-100 group-hover:bg-slate-200 text-slate-700"
                          }`}
                          style={{
                            backgroundColor: isSelected ? accentColor : undefined,
                          }}
                        >
                          <IconComp size={18} strokeWidth={2.2} />
                        </span>
                        <span className="mt-1.5 line-clamp-1 w-full text-[10px] font-bold text-slate-600 group-hover:text-slate-900">
                          {opt.label.split(" ")[0]}
                        </span>
                        {isSelected && (
                          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-kash-emerald text-white">
                            <Check size={10} strokeWidth={3.5} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
              <span>{filteredIcons.length} ikon tersedia</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="font-bold text-kash-emerald hover:text-kash-emeraldDark"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
