import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { Check, ChevronDown, Plus, User, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import type { Counterparty } from "../../types/domain";
import { useI18n } from "../../i18n";

export type CounterpartyComboboxProps = {
  counterparties: Counterparty[];
  value: string;
  onChange: (name: string, counterparty?: Counterparty | null) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
};

export function CounterpartyCombobox({
  counterparties,
  disabled = false,
  id = "counterparty-combobox",
  label,
  onChange,
  placeholder,
  required = false,
  value,
}: CounterpartyComboboxProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  const effectiveLabel = label ?? (`${t("debts.personOrBusiness") || "Orang / Kontak"} *`);
  const effectivePlaceholder = placeholder ?? (t("debts.searchOrAddPerson") || "Pilih atau ketik nama orang / kontak...");

  const filteredCounterparties = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return counterparties;
    }
    return counterparties.filter((cp) =>
      cp.name.toLowerCase().includes(trimmed),
    );
  }, [counterparties, query]);

  const hasExactMatch = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return false;
    return counterparties.some(
      (cp) => cp.name.trim().toLowerCase() === trimmed,
    );
  }, [counterparties, query]);

  const selectedCounterparty = useMemo(() => {
    if (!value) return null;
    return (
      counterparties.find(
        (cp) => cp.name.trim().toLowerCase() === value.trim().toLowerCase(),
      ) ?? null
    );
  }, [counterparties, value]);

  const handleSelect = (selected: Counterparty | { name: string } | null) => {
    if (!selected) return;
    const name = selected.name.trim();
    const existing = counterparties.find(
      (cp) => cp.name.trim().toLowerCase() === name.toLowerCase(),
    );
    onChange(name, existing ?? null);
    setQuery("");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextQuery = e.target.value;
    setQuery(nextQuery);
    onChange(nextQuery, null);
  };

  return (
    <Combobox
      disabled={disabled}
      value={selectedCounterparty ?? (value ? { id: "", name: value, user_id: "", created_at: "", updated_at: "" } : null)}
      onChange={handleSelect}
      onClose={() => setQuery("")}
    >
      <div className="relative w-full max-w-full min-w-0">
        {effectiveLabel && (
          <label
            htmlFor={id}
            className="block text-sm font-bold text-slate-900"
          >
            {effectiveLabel}
          </label>
        )}

        <div className="relative mt-2">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-600">
            <User size={16} />
          </div>

          <ComboboxInput
            id={id}
            displayValue={(item: Counterparty | { name: string } | null) =>
              item?.name ?? value ?? ""
            }
            onChange={handleInputChange}
            placeholder={effectivePlaceholder}
            required={required}
            className="block h-12 w-full max-w-full min-w-0 rounded-lg border border-slate-200 bg-white pl-9 pr-10 text-sm font-semibold text-slate-900 transition placeholder:text-slate-600 focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-[rgba(16,185,129,0.20)] disabled:bg-slate-50 disabled:text-slate-600"
          />

          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-600 hover:text-slate-900">
            <ChevronDown size={18} strokeWidth={2.2} />
          </ComboboxButton>
        </div>

        <ComboboxOptions className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-soft focus:outline-none">
          {/* Create new counterparty option if query is not empty and no exact match */}
          {query.trim().length > 0 && !hasExactMatch && (
            <ComboboxOption
              value={{ id: "", name: query.trim(), user_id: "", created_at: "", updated_at: "" }}
              className="group flex cursor-pointer select-none items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-bold text-kash-emerald transition data-[focus]:bg-kash-selected data-[focus]:text-kash-emeraldDark"
            >
              <UserPlus size={16} className="shrink-0" />
              <span className="truncate">
                {t("debts.addAsNewPerson", { name: query.trim() }) || `Tambah "${query.trim()}" sebagai kontak baru`}
              </span>
            </ComboboxOption>
          )}

          {/* List existing counterparties */}
          {filteredCounterparties.map((cp) => (
            <ComboboxOption
              key={cp.id}
              value={cp}
              className="group flex cursor-pointer select-none items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-slate-800 transition data-[focus]:bg-kash-selected data-[focus]:text-kash-emeraldDark"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 group-data-[focus]:bg-kash-emerald100 group-data-[focus]:text-kash-emeraldDark">
                  <User size={13} />
                </span>
                <span className="truncate">{cp.name}</span>
              </div>
              <Check
                size={16}
                strokeWidth={2.4}
                className="hidden shrink-0 text-kash-emerald group-data-[selected]:block"
              />
            </ComboboxOption>
          ))}

          {/* Empty fallback */}
          {filteredCounterparties.length === 0 && query.trim().length === 0 && (
            <div className="p-3 text-center text-xs font-semibold text-slate-600">
              {t("debts.noSavedCounterparties") || "Belum ada kontak tersimpan. Ketik nama untuk membuat baru."}
            </div>
          )}

          {filteredCounterparties.length === 0 && query.trim().length > 0 && hasExactMatch && (
            <div className="p-3 text-center text-xs font-semibold text-slate-600">
              {t("debts.noMatchingCounterparties") || "Tidak ada kontak yang cocok."}
            </div>
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  );
}
