import { buildEditPatch } from "../editPatch";
import { buildDuplicatePayload, DUPLICATE_DATE_POLICY, mapTransactionResponse } from "../model";

const original = mapTransactionResponse({
  id: "t1", bookId: "b1", type: "EXPENSE", amountMinor: 1234, occurredOn: "2026-03-05", occurredAt: "2026-03-05T12:00:00Z",
  title: "Coffee", categoryId: "c1", paymentMethod: null, note: "beans", version: 3,
  createdAt: "2026-03-05T12:01:10.123456Z", updatedAt: "2026-03-06T09:00:00Z",
});
const same = { kind: original.type, amountMinor: 1234, title: "Coffee", categoryId: "c1", note: "beans", paymentMethod: null, occurredAt: new Date(original.occurredAt) };

describe("edit patch", () => {
  it("an untouched form is an empty patch (no version bump, ledger date not re-derived)", () => {
    expect(buildEditPatch(original, same)).toEqual({});
  });

  it("sends only what changed, clears with explicit null, and never sends audit fields", () => {
    const patch = buildEditPatch(original, { ...same, amountMinor: 2000, title: "  ", note: "" });
    expect(patch).toEqual({ amountMinor: 2000, title: null, note: null });
    const all = buildEditPatch(original, { ...same, kind: "INCOME", categoryId: "c2", occurredAt: new Date("2026-03-07T10:00:00Z") });
    expect(Object.keys(all).sort()).toEqual(["categoryId", "occurredAt", "type"]);
    for (const forbidden of ["id", "createdAt", "updatedAt", "version", "externalId", "paymentMethod"]) {
      expect(all).not.toHaveProperty(forbidden);
    }
  });

  it("sets a payment method, and clears it with an explicit null", () => {
    expect(buildEditPatch(original, { ...same, paymentMethod: "CARD" })).toEqual({ paymentMethod: "CARD" });
    const carded = { ...original, paymentMethod: "CARD" as const };
    expect(buildEditPatch(carded, { ...same, paymentMethod: "CARD" })).toEqual({});
    expect(buildEditPatch(carded, { ...same, paymentMethod: null })).toEqual({ paymentMethod: null });
  });

  it("keeps Created/Updated as separate read-only values, distinct from the transaction date", () => {
    expect(original.occurredAt).toBe("2026-03-05T12:00:00Z");
    expect(original.createdAt).toBe("2026-03-05T12:01:10.123456Z");
    expect(original.updatedAt).toBe("2026-03-06T09:00:00Z");
    const noOccurredAt = mapTransactionResponse({ id: "x", bookId: "b", type: "EXPENSE", amountMinor: 1, occurredOn: "2026-01-02", categoryId: "c", version: 1, createdAt: "2026-05-05T00:00:00Z", updatedAt: "2026-05-05T00:00:00Z", paymentMethod: null, title: null } as never);
    // A missing event time falls back to the ledger date, never to the creation time.
    expect(noOccurredAt.occurredAt).toBe("2026-01-02T00:00:00.000Z");
    expect(noOccurredAt.title).toBeNull();
  });
});

describe("duplicate", () => {
  it("date policy is explicit: the copy happens now, null fields stay unspecified, no audit fields", () => {
    expect(DUPLICATE_DATE_POLICY).toBe("now");
    const now = new Date("2026-09-20T08:00:00Z");
    const payload = buildDuplicatePayload(original, now);
    expect(payload.occurredAt).toBe("2026-09-20T08:00:00.000Z");
    expect(payload.paymentMethod).toBeUndefined(); // was null -> stays "Not specified", never CASH
    expect(payload).not.toHaveProperty("createdAt");
    expect(payload).not.toHaveProperty("updatedAt");
    expect(payload).not.toHaveProperty("id");
    expect(payload).toMatchObject({ type: "EXPENSE", amountMinor: 1234, categoryId: "c1", title: "Coffee", note: "beans" });
  });
});
