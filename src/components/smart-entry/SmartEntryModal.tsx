import { Loader2, Mic, Pencil, SendHorizontal, Sparkles, Square, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useActiveSpace } from "../../context/ActiveSpaceContext";
import { useI18n } from "../../i18n";
import { emitDebtSaved, emitTransactionSaved } from "../../lib/appEvents";
import {
  createDebt,
  findOrCreateCounterparty,
  getOutstandingDebtItems,
  recordCounterpartySettlement,
} from "../../lib/debts";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "../../lib/money";
import {
  buildSmartEntryDraft,
  parseSmartEntry,
  refreshSmartEntryDraft,
  smartEntryDateTime,
  type SmartEntryDraft,
  type SmartEntryIntent,
  type SmartEntryParserSource,
  type SmartEntryReimbursablePrefill,
  type SmartEntryResources,
} from "../../lib/smartEntry";
import { getTransactionSupportData, createExpense, createExternalTransfer, createIncome, createTransfer, recordCrossSpaceSettlement } from "../../lib/transactions";
import type { Category } from "../../types/domain";
import { Button } from "../ui/Button";
import { DatePickerField } from "../ui/DatePickerField";
import { FormField } from "../ui/FormField";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";

type SpeechRecognitionResultLike = {
  0: { transcript: string };
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { results: ArrayLike<SpeechRecognitionResultLike> }) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SmartEntryModalProps = {
  contextDate?: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenReimbursable?: (prefill: SmartEntryReimbursablePrefill) => void;
  onSaved?: () => void;
};

type SmartEntryStage = "reply" | "review";

function localDateKey() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const browser = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}

function intentLabel(intent: SmartEntryIntent, t: ReturnType<typeof useI18n>["t"]) {
  const labels: Record<SmartEntryIntent, Parameters<typeof t>[0]> = {
    debt_borrow: "smartEntry.debtBorrow",
    debt_payment: "smartEntry.debtPayment",
    expense: "smartEntry.expense",
    external_transfer: "smartEntry.externalTransfer",
    income: "smartEntry.income",
    internal_transfer: "smartEntry.internalTransfer",
    receivable_collection: "smartEntry.receivableCollection",
    receivable_lend: "smartEntry.receivableLend",
    reimbursable_expense: "smartEntry.reimbursableExpense",
    reimbursement_settlement: "smartEntry.reimbursementSettlement",
    unknown: "smartEntry.unsupported",
  };
  return t(labels[intent]);
}

function actionLabel(intent: SmartEntryIntent, t: ReturnType<typeof useI18n>["t"]) {
  const labels: Record<SmartEntryIntent, Parameters<typeof t>[0]> = {
    debt_borrow: "smartEntry.createDebt",
    debt_payment: "smartEntry.recordPayment",
    expense: "smartEntry.addExpense",
    external_transfer: "smartEntry.transfer",
    income: "smartEntry.recordIncome",
    internal_transfer: "smartEntry.transfer",
    receivable_collection: "smartEntry.recordCollection",
    receivable_lend: "smartEntry.createReceivable",
    reimbursable_expense: "smartEntry.recordReimbursement",
    reimbursement_settlement: "smartEntry.settleReimbursement",
    unknown: "smartEntry.manualEntry",
  };
  return t(labels[intent]);
}

function parseErrorMessage(error: unknown, t: ReturnType<typeof useI18n>["t"]) {
  const code = error instanceof Error ? error.message : "";
  if (code === "SMART_ENTRY_INVALID_TEXT") return t("smartEntry.invalidText");
  if (code === "SMART_ENTRY_GEMINI_ACCESS_DENIED") return t("smartEntry.apiAccessDenied");
  if (code === "SMART_ENTRY_GEMINI_MODEL_UNAVAILABLE") return t("smartEntry.modelUnavailable");
  if (code === "SMART_ENTRY_GEMINI_QUOTA_OR_RATE_LIMIT") return t("smartEntry.apiQuotaOrRateLimit");
  if (code === "SMART_ENTRY_GEMINI_REQUEST_REJECTED") return t("smartEntry.apiRequestRejected");
  return t("smartEntry.parserUnavailable");
}

function draftMessage(draft: SmartEntryDraft, t: ReturnType<typeof useI18n>["t"]) {
  if (draft.clarification === "amount_ambiguous") return t("smartEntry.amountAmbiguous");
  if (draft.clarification === "pinjam_direction") return t("smartEntry.pinjamDirection");
  if (draft.clarification === "wallet_ambiguous") return t("smartEntry.walletAmbiguous");
  if (draft.clarification === "ai_unavailable") return t("smartEntry.aiFallbackUnavailable");
  return draft.message || t("smartEntry.missingFields");
}

export function SmartEntryModal({
  contextDate,
  isOpen,
  onClose,
  onOpenReimbursable,
  onSaved,
}: SmartEntryModalProps) {
  const { activeSpace, activeSpaceId, spaces } = useActiveSpace();
  const { formatCurrency, locale, t } = useI18n();
  const [text, setText] = useState("");
  const [submittedText, setSubmittedText] = useState<string | null>(null);
  const [resources, setResources] = useState<SmartEntryResources | null>(null);
  const [draft, setDraft] = useState<SmartEntryDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [stage, setStage] = useState<SmartEntryStage>("reply");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const resourceRequestRef = useRef(0);
  const parserSourceRef = useRef<SmartEntryParserSource | null>(null);
  const normalizedTextRef = useRef<string | null>(null);
  const effectiveDate = contextDate ?? localDateKey();

  const loadResources = async () => {
    if (!activeSpaceId) return;
    const requestId = ++resourceRequestRef.current;
    const [support, obligations] = await Promise.all([
      getTransactionSupportData(activeSpaceId),
      getOutstandingDebtItems(activeSpaceId),
    ]);
    if (requestId !== resourceRequestRef.current) return;
    setResources({
      // The canonical service queries the active space and is protected by
      // RLS. Keep the complete active-space option sets for manual edits.
      categories: support.categories
        .filter((category) => !category.is_archived)
        .map((category) => ({ id: category.id, kind: category.category_type, name: category.name })),
      envelopes: support.envelopes
        .filter((envelope) => !envelope.is_archived)
        .map((envelope) => ({ id: envelope.id, name: envelope.name })),
      managedSpaces: spaces
        .filter((space) => space.space_type === "managed" && !space.is_archived && !space.deleted_at)
        .map((space) => ({ id: space.id, name: space.name })),
      obligations: obligations.map((item) => ({
        counterpartyId: item.counterparty_id,
        counterpartyName: item.counterparty_name,
        crossSpaceEventId: item.cross_space_event_id ?? null,
        id: item.debt_id,
        remainingAmount: toNumber(item.remaining_amount),
        title: item.title,
        type: item.type,
      })),
      wallets: support.wallets
        .filter((wallet) => !wallet.is_archived)
        .map((wallet) => ({ id: wallet.id, name: wallet.name })),
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    setVoiceAvailable(Boolean(speechRecognitionConstructor()));
    void loadResources().catch(() => setError(t("transactions.loadError")));
  }, [activeSpaceId, isOpen, spaces, t]);

  useEffect(() => {
    if (!isOpen) return;
    setResources(null);
    setText("");
    setSubmittedText(null);
    setDraft(null);
    parserSourceRef.current = null;
    normalizedTextRef.current = null;
    setEditing(false);
    setStage("reply");
    setError(null);
    setSuccess(false);
  }, [activeSpaceId, isOpen]);

  useEffect(() => {
    if (isOpen) return;
    recognitionRef.current?.stop();
    setText("");
    setSubmittedText(null);
    setDraft(null);
    parserSourceRef.current = null;
    normalizedTextRef.current = null;
    setEditing(false);
    setStage("reply");
    setError(null);
    setSuccess(false);
  }, [isOpen]);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  const categoryOptions = useMemo(() => {
    if (!resources) return [];
    const kind: Category["category_type"] = draft?.intent === "income" ? "income" : "expense";
    return resources.categories.filter((category) => category.kind === kind);
  }, [draft?.intent, resources]);

  const updateDraft = (changes: Partial<SmartEntryDraft>) => {
    setDraft((current) => current ? refreshSmartEntryDraft({ ...current, ...changes }) : current);
  };

  const parse = async () => {
    if (loading || !text.trim()) return;
    const entryText = text.trim();
    if (!navigator.onLine) {
      setError(t("smartEntry.offline"));
      return;
    }
    if (!resources || !activeSpaceId) {
      setError(t("transactions.loadError"));
      return;
    }
    setLoading(true);
    setSubmittedText(entryText);
    setError(null);
    setSuccess(false);
    try {
      const result = await parseSmartEntry(entryText, {
        activeSpace: activeSpace ? { name: activeSpace.name, type: activeSpace.space_type } : null,
        categories: resources.categories.map((category) => category.name),
        contextDate: effectiveDate,
        envelopes: resources.envelopes.map((envelope) => envelope.name),
        locale,
        managedSpaces: resources.managedSpaces.map((space) => space.name),
        obligations: resources.obligations.map((item) => ({
          counterpartyName: item.counterpartyName,
          title: item.title,
          type: item.type,
        })),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta",
        wallets: resources.wallets.map((wallet) => wallet.name),
      }, resources);
      const resolvedDraft = buildSmartEntryDraft(result.draft, resources, effectiveDate);
      setDraft(resolvedDraft);
      parserSourceRef.current = result.parserSource;
      normalizedTextRef.current = result.normalizedText;
      setText("");
      setEditing(resolvedDraft.missingFields.length > 0);
      setStage("reply");
    } catch (parseError) {
      setError(parseErrorMessage(parseError, t));
    } finally {
      setLoading(false);
    }
  };

  const startListening = () => {
    const Constructor = speechRecognitionConstructor();
    if (!Constructor) {
      setError(t("smartEntry.voiceUnavailable"));
      return;
    }
    const recognition = new Constructor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = locale === "id" ? "id-ID" : "en-US";
    recognition.maxAlternatives = 1;
    recognition.onerror = () => {
      setListening(false);
      setError(t("smartEntry.voiceUnavailable"));
    };
    recognition.onend = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) setText(transcript);
      setListening(false);
    };
    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  };

  const commit = async () => {
    if (!draft || !resources || committing || draft.missingFields.length > 0 || !activeSpaceId) return;
    if (draft.intent === "reimbursable_expense") {
      if (!onOpenReimbursable) return;
      onOpenReimbursable({
        amount: draft.amount,
        description: draft.description,
        managedSpaceId: draft.managedSpaceId,
        transactionDate: smartEntryDateTime(draft.transactionDate, draft.transactionTime),
        walletId: draft.walletId,
      });
      onClose();
      return;
    }

    const amount = String(draft.amount);
    const transactionDate = smartEntryDateTime(draft.transactionDate, draft.transactionTime);
    // The chat is an instruction, not the persisted transaction description.
    // The concise reviewed title is saved separately; raw chat stays ephemeral.
    const note = null;
    setCommitting(true);
    setError(null);
    try {
      if (draft.intent === "expense") {
        const result = await createExpense({
          amount,
          categoryId: draft.categoryId!,
          envelopeId: draft.envelopeId,
          note,
          spaceId: activeSpaceId,
          title: draft.description || draft.categoryLabel,
          transactionDate,
          walletId: draft.walletId!,
        });
        if (result.error) throw result.error;
        emitTransactionSaved();
      } else if (draft.intent === "income") {
        const result = await createIncome({
          amount,
          categoryId: draft.categoryId!,
          note,
          spaceId: activeSpaceId,
          title: draft.description || draft.categoryLabel,
          transactionDate,
          walletId: draft.walletId!,
        });
        if (result.error) throw result.error;
        emitTransactionSaved();
      } else if (draft.intent === "internal_transfer") {
        const result = await createTransfer({
          amount,
          destinationWalletId: draft.destinationWalletId!,
          note,
          spaceId: activeSpaceId,
          transactionDate,
          transferFee: "0",
          walletId: draft.sourceWalletId!,
        });
        if (result.error) throw result.error;
        emitTransactionSaved();
      } else if (draft.intent === "external_transfer") {
        const result = await createExternalTransfer({
          amount,
          categoryId: draft.categoryId!,
          note,
          recipient: draft.counterparty,
          spaceId: activeSpaceId,
          transactionDate,
          transferFee: "0",
          walletId: draft.sourceWalletId!,
        });
        if (result.error) throw result.error;
        emitTransactionSaved();
      } else if (draft.intent === "debt_borrow" || draft.intent === "receivable_lend") {
        const counterpartyResult = await findOrCreateCounterparty(draft.counterparty, activeSpaceId);
        if (counterpartyResult.error || !counterpartyResult.data) throw counterpartyResult.error ?? new Error(t("debts.resolveCounterpartyFailed"));
        const result = await createDebt({
          counterpartyId: counterpartyResult.data.id,
          dueDate: null,
          note,
          originalAmount: amount,
          title: draft.description,
          type: draft.intent === "debt_borrow" ? "debt" : "receivable",
        }, {
          counterpartyName: counterpartyResult.data.name,
          spaceId: activeSpaceId,
          transactionDate,
          walletId: draft.walletId,
        });
        if (result.error) throw result.error;
        emitDebtSaved();
        emitTransactionSaved();
      } else if (draft.intent === "debt_payment" || draft.intent === "receivable_collection") {
        const obligation = resources.obligations.find((item) => item.id === draft.obligationId);
        if (!obligation) throw new Error(t("smartEntry.missingFields"));
        const result = await recordCounterpartySettlement({
          amount,
          counterpartyId: obligation.counterpartyId,
          debtId: obligation.id,
          debtType: draft.intent === "debt_payment" ? "debt" : "receivable",
          note,
          paymentDate: transactionDate,
          paymentMode: "wallet",
          walletId: draft.walletId,
        });
        if (result.error) throw result.error;
        emitDebtSaved();
        emitTransactionSaved();
      } else if (draft.intent === "reimbursement_settlement") {
        await recordCrossSpaceSettlement({
          amount: draft.amount!,
          clientRequestId: crypto.randomUUID(),
          eventId: draft.reimbursementEventId!,
          managedWalletId: draft.settlementSource === "managed_wallet" ? draft.walletId : null,
          note: note ?? undefined,
          settlementDate: transactionDate,
          settlementSource: draft.settlementSource,
        });
        emitDebtSaved();
        emitTransactionSaved();
      } else {
        throw new Error(t("smartEntry.unsupported"));
      }
      setSuccess(true);
      onSaved?.();
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : t("transactions.saveError"));
    } finally {
      setCommitting(false);
    }
  };

  const reset = () => {
    setText("");
    setSubmittedText(null);
    setDraft(null);
    parserSourceRef.current = null;
    normalizedTextRef.current = null;
    setEditing(false);
    setStage("reply");
    setError(null);
    setSuccess(false);
  };

  const returnToComposer = () => {
    setDraft(null);
    parserSourceRef.current = null;
    normalizedTextRef.current = null;
    setEditing(false);
    setStage("reply");
    setError(null);
    setText(submittedText ?? "");
    setSubmittedText(null);
  };

  const selectOption = (id: string, options: NonNullable<typeof resources>["wallets"], idKey: "walletId" | "sourceWalletId" | "destinationWalletId") => {
    const selected = options.find((option) => option.id === id) ?? null;
    const labelKey = idKey === "walletId" ? "walletLabel" : idKey === "sourceWalletId" ? "sourceWalletLabel" : "destinationWalletLabel";
    updateDraft({ [idKey]: selected?.id ?? null, [labelKey]: selected?.name ?? null });
  };

  const isReady = Boolean(draft && draft.intent !== "unknown" && !draft.multipleActions && draft.missingFields.length === 0);
  const reviewObligation = draft?.obligationId ? resources?.obligations.find((item) => item.id === draft.obligationId) : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!committing) onClose();
      }}
      dismissible={!committing}
      maxWidth="md"
      initialMobileDetent="large"
      className="md:max-h-[44rem] md:pb-0"
      bodyClassName="!p-0"
      title={
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-kash-selected text-kash-emeraldDark">
            <Sparkles aria-hidden="true" size={20} strokeWidth={2.3} />
          </span>
          <span className="text-lg font-extrabold text-slate-900">{t("smartEntry.title")}</span>
        </div>
      }
      description={t("smartEntry.description")}
    >
      <div className="flex min-h-[max(9rem,calc(90dvh-9rem))] flex-col md:min-h-[32rem]">
        <div className="flex-1 space-y-4 px-5 py-4 md:px-6">
          <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2.5 text-sm font-semibold leading-5 text-slate-700">
            {t("smartEntry.description")}
          </div>
          {submittedText ? (
            <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-kash-emerald px-3 py-2.5 text-sm font-semibold leading-5 text-white">
              {submittedText}
            </div>
          ) : null}
        {success ? (
          <div className="rounded-xl border border-kash-emerald/25 bg-kash-selected p-4">
            <p className="font-extrabold text-kash-emeraldDark">{t("smartEntry.success")}</p>
            {draft?.amount ? <p className="mt-1 text-sm font-semibold text-slate-700">{formatCurrency(draft.amount, "IDR")} · {intentLabel(draft.intent, t)}</p> : null}
            <Button className="mt-4" type="button" onClick={reset}>{t("smartEntry.tryAnother")}</Button>
          </div>
        ) : !draft ? (
          <>
            {loading ? (
              <div className="flex w-fit items-center gap-2 rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2.5 text-sm font-bold text-slate-700">
                <Loader2 aria-hidden="true" className="animate-spin text-kash-emerald" size={16} />
                {t("smartEntry.parseLoading")}
              </div>
            ) : null}
            {error ? (
              <div className="flex items-start gap-2 rounded-2xl rounded-tl-sm border border-kash-expense/30 bg-kash-expense/10 p-3 text-sm font-semibold text-slate-800">
                {!navigator.onLine ? <WifiOff aria-hidden="true" className="mt-0.5 shrink-0" size={16} /> : null}
                <div className="min-w-0">
                  <span>{error}</span>
                  <Button className="mt-3" type="button" variant="secondary" onClick={onClose}>{t("smartEntry.manualEntry")}</Button>
                </div>
              </div>
            ) : null}
          </>
        ) : draft.multipleActions ? (
          <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-sm font-bold text-amber-950">{t("smartEntry.multipleActions")}</p>
            <Button type="button" variant="secondary" onClick={returnToComposer}>{t("common.back")}</Button>
          </div>
        ) : draft.intent === "unknown" ? (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-800">{draft.message || t("smartEntry.unsupported")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={returnToComposer}>{t("common.back")}</Button>
              <Button type="button" onClick={onClose}>{t("smartEntry.manualEntry")}</Button>
            </div>
          </div>
        ) : stage === "reply" ? (
          <div className="space-y-3">
            <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2.5 text-sm font-semibold leading-5 text-slate-700">
              <p>{t("smartEntry.reviewIntro")} <span className="font-extrabold text-slate-900">{intentLabel(draft.intent, t)}</span>.</p>
              <p className="mt-1.5 text-slate-600">{draft.missingFields.length > 0 ? t("smartEntry.replyNeedsDetails") : t("smartEntry.replyReadyForReview")}</p>
            </div>
            <Button type="button" onClick={() => setStage("review")}>{t("smartEntry.openReview")}</Button>
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-700">{t("smartEntry.reviewTitle")}</p>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <p className="font-extrabold text-slate-900">{intentLabel(draft.intent, t)}</p>
                <p className="text-base font-black text-slate-900">{draft.amount ? formatCurrency(draft.amount, "IDR") : "—"}</p>
              </div>
              {!editing ? (
                <div className="mt-3 space-y-2 text-sm">
                  {draft.description ? <ReviewLine label={t("smartEntry.descriptionLabel")} value={draft.description} /> : null}
                  {draft.walletLabel ? <ReviewLine label={t("smartEntry.wallet")} value={draft.walletLabel} /> : null}
                  {draft.sourceWalletLabel ? <ReviewLine label={t("smartEntry.sourceWallet")} value={draft.sourceWalletLabel} /> : null}
                  {draft.destinationWalletLabel ? <ReviewLine label={t("smartEntry.destinationWallet")} value={draft.destinationWalletLabel} /> : null}
                  {draft.categoryLabel ? <ReviewLine label={t("smartEntry.category")} value={draft.categoryLabel} /> : null}
                  {draft.envelopeLabel ? <ReviewLine label={t("smartEntry.envelope")} value={draft.envelopeLabel} /> : null}
                  {draft.counterparty ? <ReviewLine label={t("smartEntry.counterparty")} value={draft.counterparty} /> : null}
                  {reviewObligation ? <ReviewLine label={t("smartEntry.obligation")} value={`${reviewObligation.counterpartyName} · ${reviewObligation.title}`} /> : null}
                  {draft.managedSpaceLabel ? <ReviewLine label={t("smartEntry.managedSpace")} value={draft.managedSpaceLabel} /> : null}
                  <ReviewLine label={t("smartEntry.date")} value={`${draft.transactionDate}${draft.transactionTime ? ` · ${draft.transactionTime}` : ""}`} />
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  <FormField
                    id="smart-entry-amount"
                    inputMode="numeric"
                    label={t("smartEntry.amount")}
                    onChange={(event) => updateDraft({ amount: toNumber(parseMoneyInputDigits(event.target.value)) || null })}
                    value={draft.amount ? formatMoneyDigits(String(draft.amount)) : ""}
                  />
                  <SelectField
                    id="smart-entry-intent"
                    label={t("smartEntry.type")}
                    value={draft.intent}
                    onChange={(event) => updateDraft({ intent: event.target.value as SmartEntryIntent })}
                  >
                    {(["expense", "income", "internal_transfer", "external_transfer"] as const).map((intent) => <option key={intent} value={intent}>{intentLabel(intent, t)}</option>)}
                  </SelectField>
                  {(draft.intent === "expense" || draft.intent === "income" || draft.intent === "debt_borrow" || draft.intent === "receivable_lend" || draft.intent === "debt_payment" || draft.intent === "receivable_collection" || (draft.intent === "reimbursement_settlement" && draft.settlementSource === "managed_wallet")) ? (
                    <SelectField id="smart-entry-wallet" label={t("smartEntry.wallet")} value={draft.walletId ?? ""} onChange={(event) => selectOption(event.target.value, resources!.wallets, "walletId")}>
                      <option value="">{t("smartEntry.selectOption")}</option>
                      {resources?.wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
                    </SelectField>
                  ) : null}
                  {(draft.intent === "internal_transfer" || draft.intent === "external_transfer") ? <SelectField id="smart-entry-source-wallet" label={t("smartEntry.sourceWallet")} value={draft.sourceWalletId ?? ""} onChange={(event) => selectOption(event.target.value, resources!.wallets, "sourceWalletId")}><option value="">{t("smartEntry.selectOption")}</option>{resources?.wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</SelectField> : null}
                  {draft.intent === "internal_transfer" ? <SelectField id="smart-entry-destination-wallet" label={t("smartEntry.destinationWallet")} value={draft.destinationWalletId ?? ""} onChange={(event) => selectOption(event.target.value, resources!.wallets, "destinationWalletId")}><option value="">{t("smartEntry.selectOption")}</option>{resources?.wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</SelectField> : null}
                  {(draft.intent === "expense" || draft.intent === "income" || draft.intent === "external_transfer") ? <SelectField id="smart-entry-category" label={t("smartEntry.category")} value={draft.categoryId ?? ""} onChange={(event) => { const option = categoryOptions.find((category) => category.id === event.target.value); updateDraft({ categoryId: option?.id ?? null, categoryLabel: option?.name ?? null }); }}><option value="">{t("smartEntry.selectOption")}</option>{categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectField> : null}
                  {draft.intent === "expense" ? <SelectField id="smart-entry-envelope" label={t("smartEntry.envelope")} value={draft.envelopeId ?? ""} onChange={(event) => { const option = resources?.envelopes.find((envelope) => envelope.id === event.target.value); updateDraft({ envelopeId: option?.id ?? null, envelopeLabel: option?.name ?? null }); }}><option value="">{t("smartEntry.noEnvelope")}</option>{resources?.envelopes.map((envelope) => <option key={envelope.id} value={envelope.id}>{envelope.name}</option>)}</SelectField> : null}
                  {(draft.intent === "external_transfer" || draft.intent === "debt_borrow" || draft.intent === "receivable_lend" || draft.intent === "reimbursable_expense") ? <FormField id="smart-entry-counterparty" label={t("smartEntry.counterparty")} onChange={(event) => updateDraft({ counterparty: event.target.value })} value={draft.counterparty} /> : null}
                  {(draft.intent === "debt_payment" || draft.intent === "receivable_collection") ? <SelectField id="smart-entry-obligation" label={t("smartEntry.obligation")} value={draft.obligationId ?? ""} onChange={(event) => { const option = resources?.obligations.find((item) => item.id === event.target.value); updateDraft({ counterparty: option?.counterpartyName ?? "", obligationId: option?.id ?? null }); }}><option value="">{t("smartEntry.selectOption")}</option>{resources?.obligations.filter((item) => item.type === (draft.intent === "debt_payment" ? "debt" : "receivable")).map((item) => <option key={item.id} value={item.id}>{item.counterpartyName} · {item.title} · {formatCurrency(item.remainingAmount, "IDR")}</option>)}</SelectField> : null}
                  {draft.intent === "reimbursable_expense" ? <SelectField id="smart-entry-managed-space" label={t("smartEntry.managedSpace")} value={draft.managedSpaceId ?? ""} onChange={(event) => { const option = resources?.managedSpaces.find((space) => space.id === event.target.value); updateDraft({ managedSpaceId: option?.id ?? null, managedSpaceLabel: option?.name ?? null }); }}><option value="">{t("smartEntry.selectOption")}</option>{resources?.managedSpaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</SelectField> : null}
                  {draft.intent === "reimbursement_settlement" ? <><SelectField id="smart-entry-reimbursement" label={t("smartEntry.reimbursement")} value={draft.obligationId ?? ""} onChange={(event) => { const option = resources?.obligations.find((item) => item.id === event.target.value); updateDraft({ obligationId: option?.id ?? null, reimbursementEventId: option?.crossSpaceEventId ?? null }); }}><option value="">{t("smartEntry.selectOption")}</option>{resources?.obligations.filter((item) => item.crossSpaceEventId).map((item) => <option key={item.id} value={item.id}>{item.counterpartyName} · {item.title}</option>)}</SelectField><SelectField id="smart-entry-settlement-source" label={t("smartEntry.settlementSource")} value={draft.settlementSource} onChange={(event) => updateDraft({ settlementSource: event.target.value as "managed_wallet" | "external_direct" })}><option value="external_direct">{t("smartEntry.externalDirect")}</option><option value="managed_wallet">{t("smartEntry.managedWallet")}</option></SelectField></> : null}
                  <FormField id="smart-entry-description" label={t("smartEntry.descriptionLabel")} onChange={(event) => updateDraft({ description: event.target.value })} value={draft.description} />
                  <DatePickerField id="smart-entry-date" label={t("smartEntry.date")} value={draft.transactionDate} onChange={(value) => updateDraft({ transactionDate: value.slice(0, 10) })} />
                  <FormField id="smart-entry-time" label={t("smartEntry.time")} type="time" onChange={(event) => updateDraft({ transactionTime: event.target.value || null })} value={draft.transactionTime ?? ""} />
                </div>
              )}
            </div>
            {error ? <div className="rounded-lg border border-kash-expense/30 bg-kash-expense/10 p-3 text-sm font-semibold text-slate-800">{error}</div> : null}
            {!isReady ? <p className="text-sm font-semibold text-kash-expense">{draftMessage(draft, t)}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing((value) => !value)}>
                <Pencil aria-hidden="true" size={16} />
                {editing ? t("smartEntry.doneEditing") : t("smartEntry.editDetails")}
              </Button>
              <Button disabled={!isReady || committing} isLoading={committing} type="button" onClick={() => void commit()}>{actionLabel(draft.intent, t)}</Button>
            </div>
          </>
        )}
        </div>
        <div className="sticky bottom-0 z-10 mt-auto shrink-0 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_20px_rgba(15,23,42,0.06)] backdrop-blur md:px-6">
          <label className="sr-only" htmlFor="smart-entry-composer">{t("smartEntry.description")}</label>
          <div className="flex items-end gap-2">
            <textarea
              id="smart-entry-composer"
              autoFocus={isOpen && !draft && !success}
              className="min-h-11 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold leading-5 text-slate-900 placeholder:text-slate-400 focus:border-kash-emerald focus:bg-white focus:outline-none focus:ring-4 focus:ring-kash-emerald/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              disabled={loading || Boolean(draft) || success || committing}
              maxLength={1000}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void parse();
                }
              }}
              placeholder={t("smartEntry.placeholder")}
              rows={1}
              value={text}
            />
            {voiceAvailable ? (
              <button
                aria-label={listening ? t("smartEntry.stopListening") : t("smartEntry.listening")}
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20 ${listening ? "border-kash-emerald bg-kash-emerald text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                disabled={loading || Boolean(draft) || success || committing}
                onClick={() => listening ? recognitionRef.current?.stop() : startListening()}
                type="button"
              >
                {listening ? <Square aria-hidden="true" size={17} /> : <Mic aria-hidden="true" size={18} />}
              </button>
            ) : null}
            <button
              aria-label={t("smartEntry.send")}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-kash-emerald text-white shadow-sm transition [@media(hover:hover)_and_(pointer:fine)]:hover:bg-kash-emeraldDark disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kash-emerald/20"
              disabled={loading || !text.trim() || Boolean(draft) || success || committing}
              onClick={() => void parse()}
              type="button"
            >
              {loading ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : <SendHorizontal aria-hidden="true" size={18} />}
            </button>
          </div>
          {listening ? <p className="mt-2 text-xs font-bold text-kash-emeraldDark">{t("smartEntry.listening")}</p> : null}
          {!voiceAvailable ? <p className="mt-2 text-xs font-semibold text-slate-600">{t("smartEntry.voiceUnavailable")}</p> : null}
        </div>
      </div>
    </Modal>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4"><span className="text-slate-600">{label}</span><span className="text-right font-bold text-slate-900">{value}</span></div>;
}
