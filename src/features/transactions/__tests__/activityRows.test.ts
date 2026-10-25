import { buildActivityRows } from "../activityRows";
import type { Transaction } from "../model";

const tx = (id: string, day: string, amount: number, type: "INCOME" | "EXPENSE" = "EXPENSE"): Transaction => ({
  id, bookId: "b", type, amountMinor: amount, title: id, categoryId: "c", categoryName: "C", paymentMethod: null,
  occurredAt: `${day}T12:00:00Z`, occurredOn: day, externalId: null, createdAt: "", updatedAt: "", version: 1,
});

const rows = [tx("a", "2026-03-15", 100), tx("b", "2026-03-15", 50, "INCOME"), tx("c", "2026-03-14", 70), tx("d", "2026-03-14", 30)];

describe("Activity rows", () => {
  it("date-primary sorts get day headers, in server order", () => {
    const out = buildActivityRows(rows, [{ field: "occurredOn", direction: "DESC" }], { today: "2026-03-15", hasMore: false });
    expect(out.map((r) => (r.type === "header" ? `H:${r.title}` : r.id))).toEqual(["H:Today", "a", "b", "H:Yesterday", "c", "d"]);
  });

  it("never re-sorts and never adds headers for other sorts", () => {
    const out = buildActivityRows(rows, [{ field: "amountMinor", direction: "DESC" }], { today: "2026-03-15", hasMore: false });
    expect(out.every((r) => r.type === "tx")).toBe(true);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("a day's net is shown only once the day is provably complete", () => {
    // More pages exist, and the last loaded day may continue on the next page: no net for it.
    const partial = buildActivityRows(rows, [], { today: "2026-03-15", hasMore: true });
    const nets = partial.filter((r) => r.type === "header").map((r) => (r.type === "header" ? r.netMinor : 0));
    expect(nets).toEqual([-50, null]);
    // Once nothing more can arrive, the last day is complete too.
    const done = buildActivityRows(rows, [], { today: "2026-03-15", hasMore: false });
    expect(done.filter((r) => r.type === "header").map((r) => (r.type === "header" ? r.netMinor : 0))).toEqual([-50, -100]);
  });
});
