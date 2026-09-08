import { ArrowDownRight, Wallet, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { IconButton } from "../ui/IconButton";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";
import { DatePickerField } from "../ui/DatePickerField";
import { getWallets, type WalletWithBalance } from "../../lib/wallets";
import { getHistoricalContributionCandidates, recordSharedSavingsPaymentReceived, submitContributionRequest, type HistoricalContributionCandidate } from "../../lib/sharedSavings";
import type { SharedSavingsMemberShare } from "../../types/domain";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../../lib/money";
import { useI18n } from "../../i18n";

type ContributeSharedModalProps = {
  isOpen: boolean;
  spaceId: string;
  spaceName: string;
  spaceColor?: string;
  members: SharedSavingsMemberShare[];
  canRecordReceived: boolean;
  onClose: () => void;
  onSubmitted: () => void;
};

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function ContributeSharedModal({
  isOpen,
  spaceId,
  spaceName,
  spaceColor = "#10B981",
  members,
  canRecordReceived,
  onClose,
  onSubmitted,
}: ContributeSharedModalProps) {
  const { t, formatCurrency } = useI18n();
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [historicalCandidates, setHistoricalCandidates] = useState<HistoricalContributionCandidate[]>([]);
  const [mode, setMode] = useState<"wallet" | "historical" | "received">("wallet");
  const [participantId, setParticipantId] = useState("");
  const [selectedHistoricalId, setSelectedHistoricalId] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [amountDigits, setAmountDigits] = useState("");
  const [contributionDate, setContributionDate] = useState(localToday);
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
        setWallets((res.data ?? []).filter((w) => !w.is_archived));
      })
      .catch((err) => setError(err.message || t("common.error")))
      .finally(() => setLoading(false));
    getHistoricalContributionCandidates().then(setHistoricalCandidates).catch(() => undefined);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const selectedHistorical = historicalCandidates.find((candidate) => candidate.id === selectedHistoricalId);
    if (mode === "wallet" && !selectedWalletId) {
      setError(t("common.required"));
      return;
    }
    if (mode === "historical" && !selectedHistorical) {
      setError(t("common.required"));
      return;
    }
    if (mode === "received" && !participantId) { setError(t("common.required")); return; }

    const amountNum = Number(amountDigits);
    if (!amountDigits || isNaN(amountNum) || amountNum <= 0) {
      setError(t("common.invalidAmount"));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (mode === "received") {
        await recordSharedSavingsPaymentReceived({ spaceId, participantId, amount: amountNum, contributionDate, note: note.trim() || undefined });
      } else await submitContributionRequest({
        spaceId,
        sourceWalletId: mode === "wallet" ? selectedWalletId : selectedHistorical?.wallet_id,
        amount: amountNum,
        note: note.trim() || undefined,
        contributionDate,
        sourceType: mode === "wallet" ? "wallet_contribution" : "linked_historical_movement",
        sourceTransactionId: selectedHistorical?.id ?? null,
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
  const selectedHistorical = historicalCandidates.find((candidate) => candidate.id === selectedHistoricalId);
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

          <div className={`grid gap-2 rounded-xl bg-slate-100 p-1 ${canRecordReceived ? "grid-cols-3" : "grid-cols-2"}`}>
            <button type="button" onClick={() => { setMode("wallet"); setError(null); }} className={`rounded-lg px-3 py-2.5 text-xs font-extrabold transition ${mode === "wallet" ? "bg-white text-kash-emeraldDark shadow-sm" : "text-slate-600"}`}>
              {t("shared.contributionModeWallet")}
            </button>
            <button type="button" onClick={() => { setMode("historical"); setError(null); }} className={`rounded-lg px-3 py-2.5 text-xs font-extrabold transition ${mode === "historical" ? "bg-white text-kash-emeraldDark shadow-sm" : "text-slate-600"}`}>
              {t("shared.contributionModeHistorical")}
            </button>
            {canRecordReceived && <button type="button" onClick={() => { setMode("received"); setError(null); }} className={`rounded-lg px-2 py-2.5 text-xs font-extrabold transition ${mode === "received" ? "bg-white text-kash-emeraldDark shadow-sm" : "text-slate-600"}`}>
              {t("shared.contributionModeReceived")}
            </button>}
          </div>

          {mode === "historical" && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-medium text-blue-900">
              {t("shared.historicalContributionHelp")}
            </div>
          )}
          {mode === "received" && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-medium text-blue-900">{t("shared.receivedContributionHelp")}</div>}

          {mode === "received" ? <SelectField id="received-member" label={t("shared.member")} value={participantId} onChange={(e) => setParticipantId(e.target.value)}>
            <option value="">{t("shared.selectMember")}</option>
            {members.filter((member) => member.member_status === "active").map((member) => <option key={member.participant_id || member.user_id} value={member.participant_id || ""}>{member.member_name || member.display_name || member.member_email}{member.member_type === "guest" ? ` · ${t("shared.guest")}` : ""}</option>)}
          </SelectField> : mode === "wallet" ? <SelectField
            id="source-wallet"
            label={t("shared.sourceWallet")}
            value={selectedWalletId}
            onChange={(e) => {
              setSelectedWalletId(e.target.value);
              if (error) setError(null);
            }}
          >
            <option value="">{t("wallets.selectWallet") || "Pilih Dompet"}</option>
            {wallets.map((w) => {
              const bal = toNumber(w.balance?.current_balance ?? w.initial_balance);
              return (
                <option key={w.id} value={w.id}>
                  {w.name} ({formatCurrency(bal, w.currency)})
                </option>
              );
            })}
          </SelectField> : <SelectField
            id="historical-movement"
            label={t("shared.historicalMovement")}
            value={selectedHistoricalId}
            onChange={(e) => {
              const candidate = historicalCandidates.find((item) => item.id === e.target.value);
              setSelectedHistoricalId(e.target.value);
              if (candidate) {
                setAmountDigits(String(candidate.amount));
                setContributionDate(candidate.transaction_date.slice(0, 10));
              }
              if (error) setError(null);
            }}
          >
            <option value="">{t("shared.selectHistoricalMovement")}</option>
            {historicalCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.transaction_date.slice(0, 10)} · {formatCurrency(candidate.amount, "IDR")} · {candidate.title || t("tx.adjustment")}
              </option>
            ))}
          </SelectField>}

          {/* Amount Field */}
          <FormField
            id="contribution-amount"
            label={t("shared.amount")}
            required
            autoFocus
            placeholder="0"
            inputMode="numeric"
            disabled={mode === "historical" && Boolean(selectedHistorical)}
            hint={mode === "wallet" ? `Saldo: ${formatCurrency(selectedBalance, "IDR")}` : undefined}
            value={formatMoneyDigits(amountDigits)}
            onChange={(e) => {
              setAmountDigits(parseMoneyInputDigits(e.target.value));
              if (error) setError(null);
            }}
          />

          <DatePickerField
            id="contribution-date"
            label={t("shared.contributionDate")}
            value={contributionDate}
            max={localToday()}
            disabled={mode === "historical" && Boolean(selectedHistorical)}
            onChange={setContributionDate}
            required
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
