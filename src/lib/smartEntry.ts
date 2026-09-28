import { parseLocalSmartEntry, shouldUseAiFallback, summarizeSmartEntryDescription } from "./smartEntryLocalParser.ts";

export { normalizeSmartEntryText, parseLocalSmartEntry, parseRupiahAmount, shouldUseAiFallback } from "./smartEntryLocalParser.ts";

export const SMART_ENTRY_INTENTS = [
  "expense",
  "income",
  "internal_transfer",
  "external_transfer",
  "debt_borrow",
  "receivable_lend",
  "debt_payment",
  "receivable_collection",
  "reimbursable_expense",
  "reimbursement_settlement",
  "unknown",
] as const;

export type SmartEntryIntent = (typeof SMART_ENTRY_INTENTS)[number];

export const SMART_ENTRY_CONFIDENCE_FIELDS = [
  "amount",
  "category",
  "counterparty",
  "date",
  "envelope",
  "intent",
  "managedSpace",
  "obligation",
  "time",
  "wallet",
] as const;

export type SmartEntryConfidenceField = (typeof SMART_ENTRY_CONFIDENCE_FIELDS)[number];

export type SmartEntryClarification =
  | "amount_ambiguous"
  | "ai_unavailable"
  | "pinjam_direction"
  | "wallet_ambiguous";

export type SmartEntryParserSource = "gemini" | "local" | "local_with_ai_fallback";

export type SmartEntryParseResult = {
  draft: SmartEntryRawDraft;
  normalizedText: string;
  parserSource: SmartEntryParserSource;
  rawText: string;
};

export type SmartEntryOption = {
  id: string;
  kind?: "expense" | "income";
  name: string;
};

export type SmartEntryReimbursablePrefill = {
  amount: number | null;
  description: string;
  managedSpaceId: string | null;
  transactionDate: string;
  walletId: string | null;
};

export type SmartEntryObligation = {
  counterpartyId: string;
  id: string;
  counterpartyName: string;
  crossSpaceEventId?: string | null;
  remainingAmount: number;
  title: string;
  type: "debt" | "receivable";
};

export type SmartEntryParserContext = {
  activeSpace: { name: string; type: "personal" | "managed" } | null;
  categories: string[];
  contextDate: string;
  envelopes: string[];
  locale: "id" | "en";
  managedSpaces: string[];
  obligations: Array<{
    counterpartyName: string;
    title: string;
    type: "debt" | "receivable";
  }>;
  timezone: string;
  wallets: string[];
};

export type SmartEntryResources = {
  categories: SmartEntryOption[];
  envelopes: SmartEntryOption[];
  managedSpaces: SmartEntryOption[];
  obligations: SmartEntryObligation[];
  wallets: SmartEntryOption[];
};

export type SmartEntryRawDraft = {
  amount: number | null;
  category: string | null;
  clarification: SmartEntryClarification | null;
  confidence: Partial<Record<SmartEntryConfidenceField, number>>;
  counterparty: string | null;
  description: string | null;
  destinationWallet: string | null;
  envelope: string | null;
  intent: SmartEntryIntent;
  managedSpace: string | null;
  message: string | null;
  missingFields: string[];
  multipleActions: boolean;
  reimbursement: string | null;
  settlementSource: "managed_wallet" | "external_direct" | null;
  sourceWallet: string | null;
  transactionDate: string | null;
  transactionTime: string | null;
  wallet: string | null;
};

export type SmartEntryDraft = {
  amount: number | null;
  categoryId: string | null;
  categoryLabel: string | null;
  clarification: SmartEntryClarification | null;
  confidence: SmartEntryRawDraft["confidence"];
  counterparty: string;
  description: string;
  destinationWalletId: string | null;
  destinationWalletLabel: string | null;
  envelopeId: string | null;
  envelopeLabel: string | null;
  intent: SmartEntryIntent;
  managedSpaceId: string | null;
  managedSpaceLabel: string | null;
  message: string | null;
  missingFields: string[];
  multipleActions: boolean;
  obligationId: string | null;
  reimbursementEventId: string | null;
  settlementSource: "managed_wallet" | "external_direct";
  sourceWalletId: string | null;
  sourceWalletLabel: string | null;
  transactionDate: string;
  transactionTime: string | null;
  walletId: string | null;
  walletLabel: string | null;
};

type CandidateMatch = {
  id: string | null;
  label: string | null;
  ambiguous: boolean;
};

const MAX_TEXT_LENGTH = 1_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchOption(candidate: string | null, options: SmartEntryOption[]): CandidateMatch {
  if (!candidate?.trim()) return { id: null, label: null, ambiguous: false };
  const normalizedCandidate = normalize(candidate);
  const exact = options.filter((option) => normalize(option.name) === normalizedCandidate);
  if (exact.length === 1) return { id: exact[0].id, label: exact[0].name, ambiguous: false };
  if (exact.length > 1) return { id: null, label: null, ambiguous: true };

  const partial = options.filter((option) => {
    const normalizedOption = normalize(option.name);
    return normalizedOption.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedOption);
  });
  if (partial.length === 1) return { id: partial[0].id, label: partial[0].name, ambiguous: false };
  return { id: null, label: null, ambiguous: partial.length > 1 };
}

function safeDate(value: string | null, fallback: string) {
  return value && DATE_PATTERN.test(value) ? value : fallback;
}

function safeTime(value: string | null) {
  return value && TIME_PATTERN.test(value) ? value : null;
}

function requiredFields(draft: SmartEntryDraft) {
  const fields = new Set(draft.missingFields);
  if (!draft.amount || draft.amount <= 0) fields.add("amount");

  switch (draft.intent) {
    case "expense":
    case "income":
      if (!draft.walletId) fields.add("wallet");
      if (!draft.categoryId) fields.add("category");
      break;
    case "internal_transfer":
      if (!draft.sourceWalletId) fields.add("sourceWallet");
      if (!draft.destinationWalletId) fields.add("destinationWallet");
      if (draft.sourceWalletId && draft.sourceWalletId === draft.destinationWalletId) fields.add("destinationWallet");
      break;
    case "external_transfer":
      if (!draft.sourceWalletId) fields.add("sourceWallet");
      if (!draft.categoryId) fields.add("category");
      if (!draft.counterparty.trim()) fields.add("counterparty");
      break;
    case "debt_borrow":
    case "receivable_lend":
      if (!draft.walletId) fields.add("wallet");
      if (!draft.counterparty.trim()) fields.add("counterparty");
      if (!draft.description.trim()) fields.add("description");
      break;
    case "debt_payment":
    case "receivable_collection":
      if (!draft.walletId) fields.add("wallet");
      if (!draft.obligationId) fields.add("obligation");
      break;
    case "reimbursable_expense":
      if (!draft.walletId) fields.add("wallet");
      if (!draft.managedSpaceId && !draft.counterparty.trim()) fields.add("managedSpace");
      if (!draft.description.trim()) fields.add("description");
      break;
    case "reimbursement_settlement":
      if (!draft.reimbursementEventId) fields.add("reimbursement");
      if (draft.settlementSource === "managed_wallet" && !draft.walletId) fields.add("wallet");
      break;
    case "unknown":
      fields.add("intent");
      break;
  }

  return [...fields];
}

function matchingObligations(
  candidate: string | null,
  type: "debt" | "receivable",
  obligations: SmartEntryObligation[],
) {
  const relevant = obligations.filter((item) => item.type === type);
  if (!candidate?.trim()) return { id: null, ambiguous: relevant.length > 1 };
  const candidateValue = normalize(candidate);
  const exact = relevant.filter((item) => normalize(item.counterpartyName) === candidateValue || normalize(item.title) === candidateValue);
  if (exact.length === 1) return { id: exact[0].id, ambiguous: false };
  const partial = relevant.filter((item) => {
    const values = [normalize(item.counterpartyName), normalize(item.title)];
    return values.some((value) => value.includes(candidateValue) || candidateValue.includes(value));
  });
  return { id: partial.length === 1 ? partial[0].id : null, ambiguous: partial.length > 1 };
}

export function buildSmartEntryDraft(
  raw: SmartEntryRawDraft,
  resources: SmartEntryResources,
  fallbackDate: string,
): SmartEntryDraft {
  const wallet = matchOption(raw.wallet ?? raw.sourceWallet, resources.wallets);
  const sourceWallet = matchOption(
    raw.sourceWallet ?? (raw.intent === "internal_transfer" || raw.intent === "external_transfer" ? raw.wallet : null),
    resources.wallets,
  );
  const destinationWallet = matchOption(raw.destinationWallet, resources.wallets);
  const validCategoryKind = raw.intent === "income" ? "income" : "expense";
  const category = matchOption(
    raw.category,
    resources.categories.filter((option) => !option.kind || option.kind === validCategoryKind),
  );
  const envelope = matchOption(raw.envelope, resources.envelopes);
  const managedSpace = matchOption(raw.managedSpace, resources.managedSpaces);
  const obligationType = raw.intent === "debt_payment" ? "debt" : "receivable";
  const obligation = raw.intent === "debt_payment" || raw.intent === "receivable_collection"
    ? matchingObligations(raw.counterparty ?? raw.description, obligationType, resources.obligations)
    : { id: null, ambiguous: false };
  const reimbursement = raw.intent === "reimbursement_settlement"
    ? matchingObligations(raw.reimbursement ?? raw.counterparty ?? raw.description, "debt", resources.obligations.filter((item) => Boolean(item.crossSpaceEventId)))
    : { id: null, ambiguous: false };
  const selectedReimbursement = reimbursement.id ? resources.obligations.find((item) => item.id === reimbursement.id) : null;

  const draft: SmartEntryDraft = {
    amount: raw.amount,
    categoryId: category.id,
    categoryLabel: category.label,
    clarification: raw.clarification,
    confidence: raw.confidence,
    counterparty: raw.counterparty?.trim() ?? "",
    description: raw.description?.trim() ?? "",
    destinationWalletId: destinationWallet.id,
    destinationWalletLabel: destinationWallet.label,
    envelopeId: envelope.id,
    envelopeLabel: envelope.label,
    intent: raw.intent,
    managedSpaceId: managedSpace.id,
    managedSpaceLabel: managedSpace.label,
    message: raw.message,
    missingFields: raw.missingFields.filter((field) => field.length <= 60),
    multipleActions: raw.multipleActions,
    obligationId: obligation.id,
    reimbursementEventId: selectedReimbursement?.crossSpaceEventId ?? null,
    settlementSource: raw.settlementSource ?? "external_direct",
    sourceWalletId: sourceWallet.id,
    sourceWalletLabel: sourceWallet.label,
    transactionDate: safeDate(raw.transactionDate, fallbackDate),
    transactionTime: safeTime(raw.transactionTime),
    walletId: wallet.id,
    walletLabel: wallet.label,
  };

  if (wallet.ambiguous || sourceWallet.ambiguous || destinationWallet.ambiguous) draft.missingFields.push("wallet");
  if (category.ambiguous) draft.missingFields.push("category");
  if (managedSpace.ambiguous) draft.missingFields.push("managedSpace");
  if (obligation.ambiguous) draft.missingFields.push("obligation");
  if (reimbursement.ambiguous) draft.missingFields.push("reimbursement");
  draft.missingFields = [...new Set(requiredFields(draft))];
  return draft;
}

/** Recalculate completion after an explicit user edit; parser uncertainty is not sticky. */
export function refreshSmartEntryDraft(draft: SmartEntryDraft) {
  return { ...draft, missingFields: requiredFields({ ...draft, missingFields: [] }) };
}

export function detectMultipleFinancialActions(text: string) {
  const amounts = text.match(/(?:rp\s*)?\d+(?:[.,]\d+)?\s*(?:rb|ribu|k|jt|juta|miliar)?\b/gi) ?? [];
  return amounts.length > 1 && /\b(terus|kemudian|lalu|setelah itu)\b/i.test(text);
}

function boundedString(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) || null : null;
}

function boundedConfidence(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    SMART_ENTRY_CONFIDENCE_FIELDS.flatMap((key) => {
      const score = source[key];
      return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 1 ? [[key, score]] : [];
    }),
  ) as SmartEntryRawDraft["confidence"];
}

export function validateSmartEntryRawDraft(value: unknown): SmartEntryRawDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const requiredKeys = [
    "intent", "amount", "description", "transactionDate", "transactionTime",
    "wallet", "sourceWallet", "destinationWallet", "category", "envelope",
    "counterparty", "managedSpace", "reimbursement", "settlementSource",
    "clarification", "confidence", "missingFields", "multipleActions", "message",
  ];
  if (!requiredKeys.every((key) => Object.prototype.hasOwnProperty.call(source, key))) return null;
  const intent = typeof source.intent === "string" && SMART_ENTRY_INTENTS.includes(source.intent as SmartEntryIntent)
    ? source.intent as SmartEntryIntent
    : "unknown";
  const amount = typeof source.amount === "number" && Number.isSafeInteger(source.amount) && source.amount > 0
    ? source.amount
    : null;
  const missingFields = Array.isArray(source.missingFields)
    ? source.missingFields.filter((item): item is string => typeof item === "string").slice(0, 12)
    : [];
  const transactionDate = boundedString(source.transactionDate, 10);
  const transactionTime = boundedString(source.transactionTime, 5);

  return {
    amount,
    category: boundedString(source.category),
    clarification: source.clarification === "amount_ambiguous" || source.clarification === "ai_unavailable"
      || source.clarification === "pinjam_direction" || source.clarification === "wallet_ambiguous"
      ? source.clarification
      : null,
    confidence: boundedConfidence(source.confidence),
    counterparty: boundedString(source.counterparty),
    description: boundedString(source.description, 500),
    destinationWallet: boundedString(source.destinationWallet),
    envelope: boundedString(source.envelope),
    intent,
    managedSpace: boundedString(source.managedSpace),
    message: boundedString(source.message, 300),
    missingFields,
    multipleActions: source.multipleActions === true,
    reimbursement: boundedString(source.reimbursement),
    settlementSource: source.settlementSource === "managed_wallet" || source.settlementSource === "external_direct"
      ? source.settlementSource
      : null,
    sourceWallet: boundedString(source.sourceWallet),
    transactionDate: transactionDate && DATE_PATTERN.test(transactionDate) ? transactionDate : null,
    transactionTime: transactionTime && TIME_PATTERN.test(transactionTime) ? transactionTime : null,
    wallet: boundedString(source.wallet),
  };
}

export async function parseSmartEntry(
  text: string,
  context: SmartEntryParserContext,
  resources: SmartEntryResources,
): Promise<SmartEntryParseResult> {
  const content = text.trim();
  if (!content || content.length > MAX_TEXT_LENGTH) {
    throw new Error("SMART_ENTRY_INVALID_TEXT");
  }
  const local = parseLocalSmartEntry(content, context, resources);
  if (!shouldUseAiFallback(local)) {
    return {
      draft: local.draft,
      normalizedText: local.normalizedText,
      parserSource: "local",
      rawText: local.rawText,
    };
  }

  // The provider is only a language-understanding fallback. Local extraction
  // and client-side entity resolution remain available when it is unavailable.
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.functions.invoke("smart-entry-parse", {
    body: { context, text: content },
  });
  if (error) {
    return {
      draft: { ...local.draft, clarification: "ai_unavailable" },
      normalizedText: local.normalizedText,
      parserSource: "local",
      rawText: local.rawText,
    };
  }
  const parsed = validateSmartEntryRawDraft(data?.draft);
  if (!parsed) {
    return {
      draft: { ...local.draft, clarification: "ai_unavailable" },
      normalizedText: local.normalizedText,
      parserSource: "local",
      rawText: local.rawText,
    };
  }
  return {
    draft: {
      ...parsed,
      description: summarizeSmartEntryDescription(content, parsed.description),
    },
    normalizedText: local.normalizedText,
    parserSource: "local_with_ai_fallback",
    rawText: local.rawText,
  };
}

export function smartEntryDateTime(date: string, time: string | null) {
  const resolvedTime = time ?? new Date().toTimeString().slice(0, 5);
  return `${date}T${resolvedTime}`;
}
