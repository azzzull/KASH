import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";
import { Children, isValidElement, ReactNode, useEffect, useMemo, useRef, useState } from "react";

type SelectFieldChangeEvent = {
  target: {
    value: string;
  };
};

type SelectFieldProps = {
  "aria-label"?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  hasError?: boolean;
  id?: string;
  label?: string;
  name?: string;
  onChange?: (event: SelectFieldChangeEvent) => void;
  placeholder?: string;
  required?: boolean;
  value?: string;
};

type OptionProps = {
  children?: ReactNode;
  disabled?: boolean;
  value?: string | number;
};

type SelectOption = {
  disabled: boolean;
  label: ReactNode;
  value: string;
};

function getOptions(children: ReactNode): SelectOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<OptionProps>(child)) return [];

    return [
      {
        disabled: Boolean(child.props.disabled),
        label: child.props.children,
        value: child.props.value === undefined ? String(child.props.children ?? "") : String(child.props.value),
      },
    ];
  });
}

export function autoScrollFieldIntoContainer(triggerElement: HTMLElement | null) {
  if (!triggerElement || typeof window === "undefined") return;

  const scrollFieldIntoContainer = () => {
    const container = (
      triggerElement.closest('[data-bottom-sheet-scroll-owner="true"]') ??
      triggerElement.closest('[data-modal-body="true"], [role="dialog"] .overflow-y-auto, div.overflow-y-auto, form')
    ) as HTMLElement | null;

    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const triggerRect = triggerElement.getBoundingClientRect();

    const parentDiv = triggerElement.parentElement;
    const optionsElement = (
      parentDiv?.querySelector('.absolute.z-50, [data-headlessui-state*="open"]') ??
      container.querySelector('[data-headlessui-state*="open"]')
    ) as HTMLElement | null;

    const optionsHeight = optionsElement ? optionsElement.getBoundingClientRect().height : 220;
    const buffer = 16;
    const requiredBottom = triggerRect.bottom + optionsHeight + buffer;

    const isCutOffBottom = requiredBottom > containerRect.bottom;
    const isCutOffTop = triggerRect.top < containerRect.top + buffer;

    if (isCutOffBottom) {
      const scrollNeeded = requiredBottom - containerRect.bottom;
      container.scrollTo({
        top: container.scrollTop + scrollNeeded,
        behavior: "smooth",
      });
    } else if (isCutOffTop) {
      const scrollNeeded = containerRect.top + buffer - triggerRect.top;
      container.scrollTo({
        top: Math.max(0, container.scrollTop - scrollNeeded),
        behavior: "smooth",
      });
    }
  };

  requestAnimationFrame(() => {
    const container = triggerElement.closest('[data-bottom-sheet-scroll-owner="true"]') as HTMLElement | null;
    const sheetPanel = triggerElement.closest('[data-bottom-sheet-panel="true"]') as HTMLElement | null;
    const isMobileSheet = Boolean(sheetPanel && window.matchMedia("(max-width: 767px)").matches);

    if (!container || !sheetPanel || !isMobileSheet) {
      scrollFieldIntoContainer();
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const triggerRect = triggerElement.getBoundingClientRect();
    const parentDiv = triggerElement.parentElement;
    const optionsElement = (
      parentDiv?.querySelector('.absolute.z-50, [data-headlessui-state*="open"]') ??
      container.querySelector('[data-headlessui-state*="open"]')
    ) as HTMLElement | null;
    const optionsHeight = optionsElement ? optionsElement.getBoundingClientRect().height : 220;
    const needsMoreSpace = triggerRect.bottom + optionsHeight + 16 > containerRect.bottom;

    if (needsMoreSpace && sheetPanel.dataset.bottomSheetDetent !== "large") {
      sheetPanel.dispatchEvent(new CustomEvent("kash:bottom-sheet-expand", { bubbles: true }));
      window.setTimeout(scrollFieldIntoContainer, 180);
      return;
    }

    scrollFieldIntoContainer();
  });
}

export function SelectField({
  "aria-label": ariaLabel,
  action,
  children,
  className = "",
  defaultValue,
  disabled,
  hasError,
  id,
  label,
  name,
  onChange,
  placeholder,
  required,
  value,
}: SelectFieldProps) {
  const options = useMemo(() => getOptions(children), [children]);
  const fallbackValue = defaultValue ?? "";
  const [internalValue, setInternalValue] = useState(fallbackValue);
  const selectedValue = value !== undefined ? value : internalValue;
  const selectedOption = options.find((option) => option.value === selectedValue);
  const buttonRef = useRef<HTMLButtonElement>(null!);

  const handleChange = (nextValue: string) => {
    setInternalValue(nextValue);
    onChange?.({ target: { value: nextValue } });
  };

  return (
    <Listbox disabled={disabled} value={selectedValue} onChange={handleChange}>
      {({ open }) => (
        <SelectFieldContent
          action={action}
          ariaLabel={ariaLabel}
          buttonRef={buttonRef}
          className={className}
          disabled={disabled}
          hasError={hasError}
          id={id}
          label={label}
          name={name}
          open={open}
          options={options}
          placeholder={placeholder}
          required={required}
          selectedOption={selectedOption}
          selectedValue={selectedValue}
        />
      )}
    </Listbox>
  );
}

function SelectFieldContent({
  action,
  ariaLabel,
  buttonRef,
  className,
  disabled,
  hasError,
  id,
  label,
  name,
  open,
  options,
  placeholder,
  required,
  selectedOption,
  selectedValue,
}: {
  action?: ReactNode;
  ariaLabel?: string;
  buttonRef: React.RefObject<HTMLButtonElement>;
  className: string;
  disabled?: boolean;
  hasError?: boolean;
  id?: string;
  label?: string;
  name?: string;
  open: boolean;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  selectedOption?: SelectOption;
  selectedValue: string;
}) {
  useEffect(() => {
    if (open && buttonRef.current) {
      autoScrollFieldIntoContainer(buttonRef.current);
    }
  }, [open, buttonRef]);

  const isPlaceholderSelected = !selectedValue || selectedValue === "" || selectedOption?.value === "";
  const displayLabel = selectedOption?.label ?? placeholder ?? "Select";

  return (
    <div className={`relative block w-full max-w-full min-w-0 ${className}`}>
      {name ? <input name={name} required={required} type="hidden" value={selectedValue} /> : null}
      {(label || action) ? (
        <div className="flex items-center justify-between gap-2">
          {label ? <span className="block text-sm font-bold text-slate-900">{label}</span> : <span />}
          {action}
        </div>
      ) : null}
      <ListboxButton
        ref={buttonRef}
        aria-label={ariaLabel}
        id={id}
        className={`group mt-2 flex h-12 w-full touch-manipulation items-center justify-between gap-3 rounded-lg border bg-white px-3 text-left text-base transition focus-visible:outline-none focus-visible:ring-4 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-600 md:text-sm ${
          hasError
            ? "border-kash-expense/50 focus:border-kash-expense focus-visible:ring-[rgba(239,68,68,0.20)]"
            : "border-slate-200 focus:border-kash-emerald focus-visible:ring-[rgba(16,185,129,0.20)] [@media(hover:hover)_and_(pointer:fine)]:hover:border-kash-emerald/50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-selected/40"
        }`}
      >
        <span
          className={`min-w-0 truncate ${
            isPlaceholderSelected
              ? "font-normal text-slate-400 group-disabled:text-slate-400"
              : "font-semibold text-slate-900 group-disabled:text-slate-600"
          }`}
        >
          {displayLabel}
        </span>
        <ChevronDown aria-hidden="true" className="shrink-0 text-slate-600 transition group-data-[open]:rotate-180" size={18} strokeWidth={2.2} />
      </ListboxButton>

      <ListboxOptions className="absolute z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-soft focus:outline-none">
        {options.map((option) => (
          <ListboxOption
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className="group flex cursor-pointer select-none items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-slate-700 transition data-[active]:bg-kash-selected data-[active]:text-kash-emerald data-[disabled]:cursor-not-allowed data-[disabled]:text-slate-600"
          >
            <span className="min-w-0 truncate">{option.label}</span>
            <Check aria-hidden="true" className="hidden shrink-0 text-kash-emerald group-data-[selected]:block" size={16} strokeWidth={2.4} />
          </ListboxOption>
        ))}
      </ListboxOptions>
    </div>
  );
}
