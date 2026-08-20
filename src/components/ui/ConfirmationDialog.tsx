import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

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
    confirm: "border-kash-expense bg-kash-expense hover:border-kash-expense hover:bg-kash-expense text-white",
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
  cancelLabel = "Batal",
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
    <Modal
      isOpen
      onClose={onCancel}
      maxWidth="sm"
      dismissible={!isLoading}
      title={
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${styles.icon}`}>
            <Icon aria-hidden="true" size={20} strokeWidth={2.4} />
          </span>
          <span className="text-lg font-extrabold text-slate-900">{title}</span>
        </div>
      }
      description={description}
    >
      <div className="space-y-4 pt-1">
        {itemLabel ? (
          <div className="rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-900 border border-slate-200">
            {itemLabel}
          </div>
        ) : null}

        {children ? <div>{children}</div> : null}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:flex sm:justify-end pt-2">
          <Button disabled={isLoading} onClick={onCancel} variant="secondary" className="justify-center">
            {cancelLabel}
          </Button>
          <Button
            className={`${styles.confirm} justify-center`}
            disabled={disabled || isLoading}
            onClick={onConfirm}
          >
            {isLoading ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
