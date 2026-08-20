import { ArrowUpLeft, Wallet, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";
import { getWallets, type WalletWithBalance } from "../../lib/wallets";
import { submitWithdrawalRequest } from "../../lib/sharedSavings";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../../lib/money";
import { useI18n } from "../../i18n";

type WithdrawSharedModalProps = {
  isOpen: boolean;
  spaceId: string;
  spaceName: string;
  myAvailableShare: number;
  spaceColor?: string;
  onClose: () => void;
  onSubmitted: () => void;
};

export function WithdrawSharedModal({
  isOpen,
  spaceId,
  spaceName,
  myAvailableShare,
  spaceColor = "#10B981",
  onClose,
  onSubmitted,
}: WithdrawSharedModalProps) {
  const { t, formatCurrency } = useI18n();
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [amountDigits, setAmountDigits] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    getWallets()
      .then((res) => {
        if (res.error) {
          setError(res.error.message || t("common.error"));
          return;
        }
        const activeWallets = (res.data ?? []).filter((w) => !w.is_archived);
        setWallets(activeWallets);
        if (activeWallets.length > 0 && !selectedWalletId) {
          setSelectedWalletId(activeWallets[0].id);
        }
      })
      .catch((err) => setError(err.message || t("common.error")))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedWalletId) {
      setError(t("common.required"));
      return;
    }

    const amountNum = Number(amountDigits);
    if (!amountDigits || isNaN(amountNum) || amountNum <= 0) {
      setError(t("common.invalidAmount"));
      return;
    }

    if (amountNum > myAvailableShare) {
      setError(t("shared.withdrawAmountMax", { amount: formatCurrency(myAvailableShare, "IDR") }));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await submitWithdrawalRequest({
        spaceId,
        destinationWalletId: selectedWalletId,
        amount: amountNum,
        note: note.trim() || undefined,
      });

      onSubmitted();
      onClose();
    } catch (err: any) {
      setError(err.message || t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      title={
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-xs"
            style={{ backgroundColor: spaceColor }}
          >
            <ArrowUpLeft size={20} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">{t("shared.withdrawTitle")}</h2>
            <p className="text-xs font-semibold text-slate-600">{spaceName}</p>
          </div>
        </div>
      }
    >
      <div>
        <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
          {error && (
            <div className="rounded-xl border border-kash-expense/30 bg-kash-expense/10 p-3 text-xs font-bold text-kash-expense">
              {error}
            </div>
          )}

          {/* Available Share Banner */}
          <div className="rounded-xl border border-kash-emerald/30 bg-kash-selected/70 p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-600">{t("shared.myShare")}</p>
              <p className="text-lg font-black text-kash-emeraldDark">{formatCurrency(myAvailableShare, "IDR")}</p>
            </div>
          </div>

          {/* Destination Wallet */}
          <SelectField
            id="dest-wallet"
            label={t("shared.destinationWallet")}
            value={selectedWalletId}
            onChange={(e) => {
              setSelectedWalletId(e.target.value);
              if (error) setError(null);
            }}
          >
            {wallets.map((w) => {
              const bal = toNumber(w.balance?.current_balance ?? w.initial_balance);
              return (
                <option key={w.id} value={w.id}>
                  {w.name} ({formatCurrency(bal, w.currency)})
                </option>
              );
            })}
          </SelectField>

          {/* Amount Field */}
          <FormField
            id="withdrawal-amount"
            label={t("shared.amount")}
            required
            autoFocus
            placeholder="0"
            hint={t("shared.withdrawAmountMax", { amount: formatCurrency(myAvailableShare, "IDR") })}
            value={formatMoneyDigits(amountDigits)}
            onChange={(e) => {
              setAmountDigits(parseMoneyInputDigits(e.target.value));
              if (error) setError(null);
            }}
          />

          {/* Optional Note */}
          <FormField
            id="withdrawal-note"
            label={t("shared.noteOptional")}
            placeholder={t("shared.notePlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting || loading || myAvailableShare <= 0}>
              {submitting ? t("shared.saving") : t("shared.submitWithdrawal")}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
