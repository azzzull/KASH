import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";

type ConfirmationTone = "danger" | "warning" | "neutral";

type ConfirmationDialogProps = {
  cancelLabel?: string;
  children?: ReactNode;
  confirmLabel: string;
  description: ReactNode;
  disabled?: boolean;
  icon?: LucideIcon;
  isLoading?: boolean;
  itemLabel?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  tone?: ConfirmationTone;
};

const toneStyles: Record<ConfirmationTone, { icon: string; confirm: string }> = {
  danger: {
    confirm: "border-kash-expense bg-kash-expense hover:border-kash-expense hover:bg-kash-expense",
    icon: "bg-kash-expense/10 text-kash-expense ring-kash-expense/20",
  },
  neutral: {
    confirm: "",
    icon: "bg-slate-100 text-slate-700 ring-slate-200",
  },
  warning: {
    confirm: "",
    icon: "bg-kash-selected text-kash-emeraldDark ring-kash-emerald/20",
  },
};

export function ConfirmationDialog({
  cancelLabel = "Cancel",
  children,
  confirmLabel,
  description,
  disabled,
  icon: Icon = AlertTriangle,
  isLoading,
  itemLabel,
  onCancel,
  onConfirm,
  title,
  tone = "warning",
}: ConfirmationDialogProps) {
  const styles = toneStyles[tone];

  return (
    <div className="fixed inset-0 z-50 overflow-x-hidden bg-slate-900/35" role="dialog" aria-modal="true" aria-labelledby="confirmation-dialog-title">
      <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Close confirmation" onClick={onCancel} type="button" />
      <section className="absolute inset-x-0 bottom-0 w-full max-w-full min-w-0 box-border overflow-x-hidden rounded-t-2xl bg-white p-4 shadow-soft md:left-1/2 md:top-1/2 md:bottom-auto md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-5">
        <div className="flex items-start gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 ${styles.icon}`}>
            <Icon aria-hidden="true" size={21} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold text-slate-900" id="confirmation-dialog-title">
              {title}
            </h2>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-700">{description}</div>
          </div>
        </div>

        {itemLabel ? <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-900">{itemLabel}</div> : null}
        {children ? <div className="mt-4">{children}</div> : null}

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button disabled={isLoading} onClick={onCancel} variant="secondary">
            {cancelLabel}
          </Button>
          <Button className={styles.confirm} disabled={disabled || isLoading} onClick={onConfirm}>
            {isLoading ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
