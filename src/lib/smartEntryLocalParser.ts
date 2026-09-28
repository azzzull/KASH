import type {
  SmartEntryIntent,
  SmartEntryOption,
  SmartEntryParserContext,
  SmartEntryRawDraft,
  SmartEntryResources,
} from "./smartEntry.ts";

export type SmartEntryLocalParseResult = {
  draft: SmartEntryRawDraft;
  normalizedText: string;
  rawText: string;
  shouldUseAiFallback: boolean;
};

export type RupiahAmountResult = {
  amount: number | null;
  ambiguous: boolean;
};

type OptionMatch = {
  ambiguous: boolean;
  option: SmartEntryOption | null;
};

const NORMALIZATION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b(?:gue|gua|aku|saya)\b/gi, "aku"],
  [/\bpake\b/gi, "pakai"],
  [/\bdapet\b/gi, "dapat"],
  [/\budah\b/gi, "sudah"],
  [/\b(?:nombokin|nombok)\b/gi, "nombok"],
  [/\b(?:ngembaliin|mengembalikan)\b/gi, "balikin"],
  [/\b(?:minjem|minjam)\b/gi, "pinjam"],
  [/\b(?:tf|transferin)\b/gi, "transfer"],
  [/\bbelanja\b/gi, "beli"],
];

const EXPENSE_SIGNALS = ["beli", "bayar", "jajan", "makan", "ngopi", "keluar", "habis", "ngabisin"];
const INCOME_SIGNALS = ["gaji", "freelance", "bonus", "dapat", "dibayar", "income", "pemasukan"];
const TRANSFER_SIGNALS = ["pindah", "pindahin", "transfer", "kirim", "masukin"];
const REIMBURSEMENT_SIGNALS = ["nombok", "direimburse", "diganti", "bayarin kantor"];

const CATEGORY_SEMANTICS = {
  food: {
    labels: ["food", "drink", "makan", "jajan", "dining", "kuliner", "restaurant", "resto", "cafe"],
    signals: ["makan", "nasi", "resto", "restaurant", "lunch", "dinner", "sarapan", "kopi", "ngopi", "cafe", "solaria"],
  },
  transport: {
    labels: ["transport", "transportation", "bensin", "tol", "parkir", "commute"],
    signals: ["gojek", "grab", "ojol", "bensin", "tol", "parkir", "krl", "kereta", "bus"],
  },
  shopping: {
    labels: ["shopping", "belanja", "shop"],
    signals: ["belanja", "shopping", "baju", "sepatu"],
  },
  health: {
    labels: ["health", "kesehatan", "medical", "obat"],
    signals: ["dokter", "obat", "rumah sakit", "klinik"],
  },
  bills: {
    labels: ["bills", "tagihan", "pulsa", "listrik", "internet", "subscription"],
    signals: ["tagihan", "pulsa", "listrik", "internet", "langganan"],
  },
  income: {
    labels: ["salary", "gaji", "income", "freelance", "bonus", "pemasukan"],
    signals: INCOME_SIGNALS,
  },
} as const;

function normalizeForMatch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(value: string) {
  return normalizeForMatch(value).replace(/\s+/g, "");
}

function hasAny(text: string, signals: readonly string[]) {
  return signals.some((signal) => text.includes(signal));
}

function localDateKey() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * Creates a transaction title from the meaningful activity, not the whole
 * conversational instruction. This keeps quantities such as "1 porsi" while
 * dropping pricing and payment-method clauses.
 */
export function summarizeSmartEntryDescription(rawText: string, fallback: string | null = null) {
  const source = (fallback?.trim() || rawText.trim())
    .replace(/^\s*(?:(?:tadi|barusan|hari\s+ini|kemarin|semalam|pagi\s+ini|siang\s+ini|sore\s+ini|malam\s+ini)\s+)*(?:(?:saya|aku|gue|gua)\s+)?/i, "")
    // A price is explicit when it has an Rp prefix, grouped thousands, or an Indonesian unit.
    .replace(/\s+(?:dengan\s+harga|harga(?:nya)?|seharga|senilai|sebesar|total(?:nya)?)\s+(?:(?:rp\s*)?\d{1,3}(?:[.,]\d{3})+|rp\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:rb|ribu|k|jt|juta|miliar|m))\b/gi, " ")
    .replace(/\s+(?:(?:rp\s*)?\d{1,3}(?:[.,]\d{3})+|rp\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:rb|ribu|k|jt|juta|miliar|m))\b(?=\s+(?:pakai|menggunakan|via)\b|$)/gi, " ")
    .replace(/\s+(?:pakai|menggunakan|via)\s+[^,.;]+$/i, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,.;:!?\s]+|[,.;:!?\s]+$/g, "")
    .trim();

  return source.slice(0, 160);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function optionAliases(option: SmartEntryOption) {
  const name = compact(option.name);
  const aliases = new Set([name]);
  if (name.startsWith("my") && name.length > 4) aliases.add(name.slice(2));
  return [...aliases].filter((alias) => alias.length >= 3);
}

function findOptionsInText(text: string, options: SmartEntryOption[]): SmartEntryOption[] {
  const source = compact(text);
  return options
    .flatMap((option) => {
      const positions = optionAliases(option)
        .map((alias) => source.indexOf(alias))
        .filter((position) => position >= 0);
      return positions.length ? [{ option, position: Math.min(...positions) }] : [];
    })
    .sort((left, right) => left.position - right.position)
    .map((item) => item.option);
}

function findSingleOption(text: string, options: SmartEntryOption[]): OptionMatch {
  const matches = findOptionsInText(text, options);
  return {
    ambiguous: matches.length > 1,
    option: matches.length === 1 ? matches[0] : null,
  };
}

function titleFromRaw(value: string) {
  return value
    .trim()
    .replace(/\s+(?:dari|ke|pakai|buat|untuk|pada)\s*$/i, "")
    .trim();
}

function candidateAfter(rawText: string, pattern: RegExp) {
  const match = rawText.match(pattern);
  return match?.[1] ? titleFromRaw(match[1]) : null;
}

function knownCounterparty(normalizedText: string, resources: SmartEntryResources) {
  const candidates = new Map<string, string>();
  for (const obligation of resources.obligations) {
    const name = obligation.counterpartyName.trim();
    if (name && compact(normalizedText).includes(compact(name))) candidates.set(name, name);
  }
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}

function extractCounterparty(rawText: string, normalizedText: string, resources: SmartEntryResources, intent: SmartEntryIntent) {
  const known = knownCounterparty(normalizedText, resources);
  if (known) return known;

  const patterns = intent === "debt_borrow"
    ? [/\bdari\s+([^,.;]+?)(?:\s+(?:pakai|ke|masuk)\b|$)/i]
    : intent === "receivable_lend"
      ? [/^\s*([^,.;]+?)\s+(?:minjem|minjam|pinjam)\b/i]
      : intent === "debt_payment"
        ? [/\butang\s+([^,.;]+?)(?:\s+(?:pakai|dari|ke)\b|$)/i, /\bbayar(?:in)?\s+([^,.;]+?)(?:\s+(?:pakai|dari|ke)\b|$)/i]
        : intent === "receivable_collection"
          ? [/^\s*([^,.;]+?)\s+(?:balikin|ngembaliin|mengembalikan)\b/i]
          : [/\bke\s+([^,.;]+?)(?:\s+(?:dari|pakai)\b|$)/i];
  for (const pattern of patterns) {
    const candidate = candidateAfter(rawText, pattern);
    if (candidate && candidate.length <= 80 && !/^(aku|uang|dompet)$/i.test(candidate)) return candidate;
  }
  return null;
}

function categoryFor(text: string, resources: SmartEntryResources, kind: "expense" | "income") {
  const groups = kind === "income" ? ["income"] as const : ["food", "transport", "shopping", "health", "bills"] as const;
  const semantic = groups.find((group) => hasAny(text, CATEGORY_SEMANTICS[group].signals));
  if (!semantic) return null;
  const aliases = CATEGORY_SEMANTICS[semantic].labels;
  const candidates = resources.categories
    .filter((category) => category.kind === kind)
    .map((category) => ({ category, score: aliases.filter((alias) => normalizeForMatch(category.name).includes(alias)).length }))
    .filter((item) => item.score > 0);
  if (!candidates.length) return null;
  const topScore = Math.max(...candidates.map((item) => item.score));
  const top = candidates.filter((item) => item.score === topScore);
  return top.length === 1 ? top[0].category.name : null;
}

function transferCategory(resources: SmartEntryResources) {
  const candidates = resources.categories.filter((item) => item.kind === "expense" && /transfer|kirim/i.test(item.name));
  return candidates.length === 1 ? candidates[0].name : null;
}

function parseTime(text: string) {
  const match = text.match(/\bjam\s*(\d{1,2})(?:[:.]?(\d{2}))?\s*(pagi|siang|sore|malam)?\b/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const period = match[3]?.toLocaleLowerCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) return null;
  if (period === "siang" || period === "sore" || period === "malam") {
    if (hour < 12) hour += 12;
    if (period === "malam" && hour === 24) hour = 0;
  } else if (period === "pagi" && hour === 12) {
    hour = 0;
  }
  if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseDate(text: string, contextDate: string) {
  const baseDate = /^\d{4}-\d{2}-\d{2}$/.test(contextDate) ? contextDate : localDateKey();
  if (/\b(?:kemarin|semalam)\b/.test(text)) return { confidence: 0.99, date: addDays(baseDate, -1) };
  if (/\b(?:hari ini|tadi|barusan)\b/.test(text)) return { confidence: 0.99, date: baseDate };
  return { confidence: 0.92, date: baseDate };
}

export function normalizeSmartEntryText(rawText: string) {
  let normalized = rawText.trim();
  for (const [pattern, replacement] of NORMALIZATION_REPLACEMENTS) normalized = normalized.replace(pattern, replacement);
  return normalizeForMatch(normalized);
}

export function parseRupiahAmount(text: string): RupiahAmountResult {
  const matches = [...text.matchAll(/(?:rp\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta|miliar|m)?\b/gi)];
  let hasAmbiguousNumber = false;

  for (const match of matches) {
    const rawNumber = match[1];
    const unit = match[2]?.toLocaleLowerCase() ?? null;
    const groupedThousands = /^\d{1,3}(?:[.,]\d{3})+$/.test(rawNumber);
    const hasRupiahPrefix = /^\s*rp\s*/i.test(match[0]);
    // Do not mistake a quantity such as "1 porsi" for the price. Three-digit
    // or shorter plain values remain ambiguous; 35000 keeps the established
    // direct-entry behavior.
    if (!unit && !groupedThousands && !hasRupiahPrefix && /^\d{1,3}$/.test(rawNumber)) {
      hasAmbiguousNumber = true;
      continue;
    }

    const normalizedNumber = groupedThousands
      ? rawNumber.replace(/[.,]/g, "")
      : rawNumber.replace(",", ".");
    const numeric = Number(normalizedNumber);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    const multiplier = unit === "rb" || unit === "ribu" || unit === "k"
      ? 1_000
      : unit === "jt" || unit === "juta"
        ? 1_000_000
        : unit === "miliar" || unit === "m"
          ? 1_000_000_000
          : 1;
    const amount = Math.round(numeric * multiplier);
    if (Number.isSafeInteger(amount)) return { amount, ambiguous: false };
  }

  return { amount: null, ambiguous: hasAmbiguousNumber };
}

function resolveIntent(text: string, rawText: string, resources: SmartEntryResources) {
  const transfer = hasAny(text, TRANSFER_SIGNALS);
  const reimbursement = hasAny(text, REIMBURSEMENT_SIGNALS);
  const debtPayment = /\bbayar(?:in)?\s+utang\b|\butang\s+\w+/.test(text);
  const collection = /\b(?:balikin|mengembalikan|ngembaliin)\b.*\butang\b|\butang\b.*\b(?:balikin|mengembalikan|ngembaliin)\b/.test(text);
  const borrowsFromSomeone = /\baku\s+pinjam\b.*\bdari\b/.test(text);
  const lendsToUser = !/^\s*aku\s+pinjam\b/.test(text) && /\bpinjam\b.*\bdari\s+aku\b/.test(text);
  const ambiguousPinjam = /\baku\s+pinjam\b/.test(text) && !/\bdari\b/.test(text);
  const wallets = findOptionsInText(text, resources.wallets);

  if (ambiguousPinjam) return { clarification: "pinjam_direction" as const, intent: "unknown" as const };
  if (collection) return { clarification: null, intent: "receivable_collection" as const };
  if (debtPayment) return { clarification: null, intent: "debt_payment" as const };
  if (borrowsFromSomeone) return { clarification: null, intent: "debt_borrow" as const };
  if (lendsToUser || (/^\s*[^\d,.;]+\s+pinjam\b/.test(rawText) && /\bke\s+aku\b/.test(text))) {
    return { clarification: null, intent: "receivable_lend" as const };
  }
  if (reimbursement) return { clarification: null, intent: "reimbursable_expense" as const };
  if (transfer) {
    if (wallets.length >= 2) return { clarification: null, intent: "internal_transfer" as const };
    if (wallets.length === 1 && /\bke\s+[a-z]/.test(text)) return { clarification: null, intent: "external_transfer" as const };
    return { clarification: null, intent: "unknown" as const };
  }
  if (hasAny(text, INCOME_SIGNALS) || /\b(?:client|klien)\s+bayar\b/.test(text) || /\bmasuk\b.*\bke\b/.test(text)) {
    return { clarification: null, intent: "income" as const };
  }
  if (hasAny(text, EXPENSE_SIGNALS)) return { clarification: null, intent: "expense" as const };
  return { clarification: null, intent: "unknown" as const };
}

function parseWallets(text: string, intent: SmartEntryIntent, resources: SmartEntryResources) {
  const matches = findOptionsInText(text, resources.wallets);
  if (intent === "internal_transfer") {
    return {
      ambiguous: matches.length !== 2,
      destinationWallet: matches[1]?.name ?? null,
      sourceWallet: matches[0]?.name ?? null,
      wallet: null,
    };
  }
  if (intent === "external_transfer") {
    return { ambiguous: matches.length !== 1, destinationWallet: null, sourceWallet: matches[0]?.name ?? null, wallet: null };
  }
  if (matches.length === 1) return { ambiguous: false, destinationWallet: null, sourceWallet: null, wallet: matches[0].name };
  return { ambiguous: matches.length > 1, destinationWallet: null, sourceWallet: null, wallet: null };
}

function rawDraft(overrides: Partial<SmartEntryRawDraft>): SmartEntryRawDraft {
  return {
    amount: null,
    category: null,
    clarification: null,
    confidence: {},
    counterparty: null,
    description: null,
    destinationWallet: null,
    envelope: null,
    intent: "unknown",
    managedSpace: null,
    message: null,
    missingFields: [],
    multipleActions: false,
    reimbursement: null,
    settlementSource: null,
    sourceWallet: null,
    transactionDate: null,
    transactionTime: null,
    wallet: null,
    ...overrides,
  };
}

export function parseLocalSmartEntry(
  rawText: string,
  context: SmartEntryParserContext,
  resources: SmartEntryResources,
): SmartEntryLocalParseResult {
  const normalizedText = normalizeSmartEntryText(rawText);
  const amountResult = parseRupiahAmount(normalizedText);
  const date = parseDate(normalizedText, context.contextDate);
  const time = parseTime(normalizedText);
  const multipleActions = /\b(?:terus|kemudian|lalu|setelah itu)\b/.test(normalizedText)
    && (normalizedText.match(/(?:rp\s*)?\d+(?:[.,]\d+)?\s*(?:rb|ribu|k|jt|juta|miliar)?\b/g) ?? []).length > 1;
  if (multipleActions) {
    return {
      draft: rawDraft({ multipleActions: true }),
      normalizedText,
      rawText,
      shouldUseAiFallback: false,
    };
  }

  const intentResult = resolveIntent(normalizedText, rawText, resources);
  const intent = intentResult.intent;
  const wallet = parseWallets(normalizedText, intent, resources);
  const envelope = findSingleOption(normalizedText, resources.envelopes);
  const managedSpace = findSingleOption(normalizedText, resources.managedSpaces);
  const kind = intent === "income" ? "income" : "expense";
  const category = intent === "external_transfer" ? transferCategory(resources) : categoryFor(normalizedText, resources, kind);
  const counterparty = extractCounterparty(rawText, normalizedText, resources, intent);
  const clarification = intentResult.clarification ?? (wallet.ambiguous ? "wallet_ambiguous" : amountResult.ambiguous ? "amount_ambiguous" : null);
  const deterministicMissing = clarification !== null || (!amountResult.amount && intent !== "unknown") || wallet.ambiguous;
  const complexReimbursement = intent === "reimbursable_expense"
    && /\b(?:kantor|bos|teknisi|diganti|direimburse)\b/.test(normalizedText);
  const shouldUseAiFallback = !deterministicMissing && (complexReimbursement || (intent === "unknown" && Boolean(amountResult.amount)));

  return {
    draft: rawDraft({
      amount: amountResult.amount,
      category,
      clarification,
      confidence: {
        amount: amountResult.amount ? 1 : 0,
        category: category ? 0.88 : 0.2,
        counterparty: counterparty ? 0.8 : 0.2,
        date: date.confidence,
        envelope: envelope.option ? 0.96 : 0.2,
        intent: intent === "unknown" ? 0.2 : 0.94,
        managedSpace: managedSpace.option ? 0.96 : 0.25,
        time: time ? 0.98 : 0.3,
        wallet: wallet.wallet || wallet.sourceWallet ? (wallet.ambiguous ? 0.35 : 0.96) : 0.2,
      },
      counterparty,
      description: summarizeSmartEntryDescription(rawText),
      destinationWallet: wallet.destinationWallet,
      envelope: envelope.option?.name ?? null,
      intent,
      managedSpace: managedSpace.option?.name ?? null,
      missingFields: clarification === "amount_ambiguous" ? ["amount"] : clarification === "pinjam_direction" ? ["direction"] : clarification === "wallet_ambiguous" ? ["wallet"] : [],
      sourceWallet: wallet.sourceWallet,
      transactionDate: date.date,
      transactionTime: time,
      wallet: wallet.wallet,
    }),
    normalizedText,
    rawText,
    shouldUseAiFallback,
  };
}

export function shouldUseAiFallback(result: SmartEntryLocalParseResult) {
  return result.shouldUseAiFallback;
}
