import axios from "axios";

import type {
  PaymentMethod,
  TransactionCreatePayload,
  TransactionResponse,
  TransactionType,
} from "@/shared/types/api";
import type { Transaction } from "@/shared/types/models";
import { localDateToYmd } from "@/shared/utils/ledgerDate";
import { getApiErrorCode } from "@/shared/api/errors";

export type { Transaction, TransactionType, PaymentMethod };
export type TransactionKind = TransactionType;

const PAYMENT_SET: PaymentMethod[] = ["CASH", "CARD", "BANK_TRANSFER", "WALLET", "OTHER"];

export function isPaymentMethod(x: unknown): x is PaymentMethod {
  return typeof x === "string" && (PAYMENT_SET as string[]).includes(x);
}

/** Unknown or missing input is `null` ("Not specified"), never a fabricated CASH. */
export function normalizePaymentMethod(input: unknown): PaymentMethod | null {
  if (input === null || input === undefined) return null;
  if (isPaymentMethod(input)) return input;
  const s = String(input).toUpperCase().replace(/[\s-]+/g, "_");
  if (s === "BANK") return "BANK_TRANSFER";
  if (s === "CREDIT" || s === "DEBIT") return "CARD";
  if (isPaymentMethod(s)) return s;
  return null;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  WALLET: "Wallet",
  OTHER: "Other",
};

export function paymentMethodLabel(value: PaymentMethod | null | undefined) {
  return value ? PAYMENT_LABELS[value] : "Not specified";
}

export function normalizeTransactionType(input: unknown): TransactionType {
  return String(input ?? "").toUpperCase() === "INCOME" ? "INCOME" : "EXPENSE";
}

export function normalizeAmountMinor(input: unknown, fallback = 0) {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(Math.abs(n)));
}

/**
 * API row to UI model. `occurredAt` is the event instant and `createdAt` the record's
 * creation time; they are never substituted for each other. `title` stays null when
 * the user set none - display code falls back to the category name.
 */
export function mapTransactionResponse(input: TransactionResponse): Transaction {
  const raw = input as TransactionResponse & { name?: string; kind?: string; amountCents?: number };
  const now = new Date().toISOString();
  const occurredAt = String(raw.occurredAt ?? (raw.occurredOn ? `${raw.occurredOn}T00:00:00.000Z` : now));
  const categoryName = String(raw.categoryName ?? raw.category?.name ?? "Uncategorized").trim() || "Uncategorized";
  const parsed = new Date(occurredAt);

  return {
    id: String(raw.id),
    bookId: String(raw.bookId ?? ""),
    type: normalizeTransactionType(raw.type ?? raw.kind),
    amountMinor: normalizeAmountMinor(raw.amountMinor ?? raw.amountCents),
    categoryId: String(raw.categoryId ?? raw.category?.id ?? ""),
    categoryName,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : null,
    note: typeof raw.note === "string" && raw.note.trim() ? raw.note.trim() : undefined,
    paymentMethod: normalizePaymentMethod(raw.paymentMethod),
    occurredAt,
    // The server always sends the book-local ledger day. Only a malformed row falls back,
    // and then to the device's calendar day, never a UTC slice of the instant.
    occurredOn:
      typeof raw.occurredOn === "string" && raw.occurredOn
        ? raw.occurredOn
        : localDateToYmd(Number.isNaN(parsed.getTime()) ? new Date() : parsed),
    externalId: typeof raw.externalId === "string" && raw.externalId ? raw.externalId : null,
    version: Number(raw.version ?? 0) || 0,
    createdAt: String(raw.createdAt ?? now),
    updatedAt: String(raw.updatedAt ?? raw.createdAt ?? now),
  };
}

/**
 * Date policy for Duplicate: the copy is a new transaction *as of now* (its event
 * time is the moment of duplication), not a second entry on the original's day.
 * Payment method carries over as-is (null stays "Not specified"). createdAt/updatedAt
 * are never sent - the server stamps the copy - and the idempotency key is fresh per
 * attempt so it can never replay the original's create.
 */
export const DUPLICATE_DATE_POLICY = "now" as const;

export function buildDuplicatePayload(tx: Transaction, now: Date = new Date()): TransactionCreatePayload {
  return {
    type: tx.type,
    amountMinor: tx.amountMinor,
    categoryId: tx.categoryId,
    // Null/absent optionals are omitted on create, which the server stores as null.
    title: tx.title ?? undefined,
    note: tx.note ?? undefined,
    paymentMethod: tx.paymentMethod ?? undefined,
    occurredAt: now.toISOString(),
  };
}

export function randomIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** The `If-Match` version no longer matches: someone (or another device) changed the row. */
export function isStaleVersionError(error: unknown) {
  return axios.isAxiosError(error) && (error.response?.status === 412 || getApiErrorCode(error) === "ETAG_MISMATCH");
}

export function isNotFoundError(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 404;
}
