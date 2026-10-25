import type { TransactionUpdatePayload } from "@/shared/types/api";
import type { PaymentMethod, Transaction, TransactionKind } from "./model";

export type EditForm = {
  kind: TransactionKind;
  amountMinor: number;
  title: string;
  categoryId: string;
  note: string;
  paymentMethod: PaymentMethod | null;
  occurredAt: Date;
};

/**
 * The PATCH body for an edit: only what the user actually changed. Omitted means
 * unchanged, so an untouched row is never rewritten - its `updatedAt`/`version` stay
 * put and its ledger date is not re-derived from an instant nobody edited. A blanked
 * title or note, or a deselected payment method, is an explicit `null` (clear). Audit
 * fields (`createdAt`, `updatedAt`, `version`, `id`, `externalId`) are never part of it.
 */
export function buildEditPatch(original: Transaction, form: EditForm): TransactionUpdatePayload {
  const patch: TransactionUpdatePayload = {};
  if (form.kind !== original.type) patch.type = form.kind;
  if (form.amountMinor !== original.amountMinor) patch.amountMinor = form.amountMinor;
  if (form.categoryId !== original.categoryId) patch.categoryId = form.categoryId;

  const title = form.title.trim();
  if (title !== (original.title ?? "")) patch.title = title || null;

  const note = form.note.trim();
  if (note !== (original.note ?? "")) patch.note = note || null;

  if (form.paymentMethod !== original.paymentMethod) patch.paymentMethod = form.paymentMethod;

  const originalInstant = Date.parse(original.occurredAt);
  if (Number.isNaN(originalInstant) || form.occurredAt.getTime() !== originalInstant) {
    patch.occurredAt = form.occurredAt.toISOString();
  }
  return patch;
}
