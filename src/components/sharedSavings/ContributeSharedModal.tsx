import { ArrowDownRight, Wallet, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";
import { getWallets, type WalletWithBalance } from "../../lib/wallets";
import { submitContributionRequest } from "../../lib/sharedSavings";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../../lib/money";
import { useI18n } from "../../i18n";

type ContributeSharedModalProps = {
  isOpen: boolean;
  spaceId: string;
  spaceName: string;
  spaceColor?: string;
  onClose: () => void;
  onSubmitted: () => void;
};

export function ContributeSharedModal({
  isOpen,
  spaceId,
  spaceName,
  spaceColor = "#10B981",
  onClose,
  onSubmitted,
}: ContributeSharedModalProps) {
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

    setSubmitting(true);
    setError(null);

    try {
      await submitContributionRequest({
        spaceId,
        sourceWalletId: selectedWalletId,
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

  const selectedWallet = wallets.find((w) => w.id === selectedWalletId);
  const selectedBalance = selectedWallet
    ? toNumber(selectedWallet.balance?.current_balance ?? selectedWallet.initial_balance)
    : 0;

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
            <ArrowDownRight size={20} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">{t("shared.contributeTitle")}</h2>
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

          {/* Source Wallet Selector */}
          <SelectField
            id="source-wallet"
            label={t("shared.sourceWallet")}
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
            id="contribution-amount"
            label={t("shared.amount")}
            required
            autoFocus
            placeholder="0"
            hint={`Saldo: ${formatCurrency(selectedBalance, "IDR")}`}
            value={formatMoneyDigits(amountDigits)}
            onChange={(e) => {
              setAmountDigits(parseMoneyInputDigits(e.target.value));
              if (error) setError(null);
            }}
          />

          {/* Optional Note */}
          <FormField
            id="contribution-note"
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
            <Button type="submit" disabled={submitting || loading}>
              {submitting ? t("shared.saving") : t("shared.submitContribution")}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
