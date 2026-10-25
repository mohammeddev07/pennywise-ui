import { apiClient } from "@/shared/api/client";
import { mockBackend } from "@/shared/api/mockAdapter";
import { useBooksStore, normalizeBook } from "../store";
import * as api from "@/shared/api/books";
const initial = JSON.parse(JSON.stringify(mockBackend.state));
beforeEach(() => {
  Object.assign(mockBackend.state, JSON.parse(JSON.stringify(initial)));
  mockBackend.offline = false;
  useBooksStore.setState({
    books: [],
    selectedBookId: "",
    ready: false,
    isManaging: false,
  });
});
const create = (name = "Travel") =>
  api.createBook(name, "JPY", "UTC", -100, {
    icon: "airplane",
    color: "orange",
  });
const status = (n: number) =>
  expect.objectContaining({ response: expect.objectContaining({ status: n }) });
it("lists computed balances, preserves existing fields, and seeds categories without income", async () => {
  const book = await create();
  expect(book).toMatchObject({
    openingBalanceMinor: -100,
    balanceMinor: -100,
    currencyCode: "JPY",
    version: 1,
  });
  expect(mockBackend.state.categories.some((c) => c.bookId === book.id)).toBe(
    true,
  );
  const { data } = await apiClient.get(`/v1/books/${book.id}/summary/monthly`);
  expect(data).toMatchObject({ incomeTotalMinor: 0, expenseTotalMinor: 0 });
});
it("enforces styles, immutable fields, nonempty patches and versions", async () => {
  const b = await create();
  for (const patch of [
    { icon: "BOOK" },
    { color: "#16A34A" },
    { color: "" },
    { currencyCode: "USD" },
    { name: null },
  ]) {
    await expect(
      apiClient.patch(`/v1/books/${b.id}`, patch, {
        headers: { "If-Match": '"1"' },
      }),
    ).rejects.toEqual(status(400));
  }
  await expect(api.patchBook(b.id, 0, "New")).rejects.toEqual(status(412));
  const { data } = await apiClient.patch(
    `/v1/books/${b.id}`,
    { name: null, icon: "home" },
    { headers: { "If-Match": '"1"' } },
  );
  expect(data).toMatchObject({ name: "Travel", icon: "home", version: 2 });
});
it("orders all books atomically and rejects duplicates, missing and foreign IDs", async () => {
  const b = await create();
  const ids = (await api.listBooks()).items.map((b) => b.id);
  for (const order of [[], [b.id, b.id], [b.id, "foreign"]])
    await expect(api.reorderBooks(order)).rejects.toEqual(status(400));
  expect((await api.listBooks()).items.map((b) => b.id)).toEqual(ids);
  await api.reorderBooks([...ids].reverse());
  expect((await api.listBooks()).items.map((b) => b.id)).toEqual(
    [...ids].reverse(),
  );
});
it("soft deletes, protects the last book, and rejects all access to deleted or foreign books", async () => {
  const b = await create();
  mockBackend.state.bookOwners[b.id] = "someone-else";
  expect((await api.listBooks()).items.some((x) => x.id === b.id)).toBe(false);
  await expect(api.patchBook(b.id, 1, "Oops")).rejects.toEqual(status(404));
  await expect(api.deleteBook(b.id, 1)).rejects.toEqual(status(404));
  mockBackend.state.bookOwners[b.id] = mockBackend.state.user.id;
  await api.deleteBook(b.id, 1);
  for (const suffix of [
    "categories",
    "balance",
    "summary/monthly",
    "summary/range",
    "transactions",
    "budgets",
  ])
    await expect(apiClient.get(`/v1/books/${b.id}/${suffix}`)).rejects.toEqual(
      status(404),
    );
  await expect(api.deleteBook(b.id, 1)).rejects.toEqual(status(404));
  const last = (await api.listBooks()).items[0];
  await expect(api.deleteBook(last.id, last.version)).rejects.toMatchObject({
    response: { data: { error: { code: "LAST_BOOK_REQUIRED" } } },
  });
});
it("caps active books at ten", async () => {
  for (let i = 1; i < 10; i++) await create();
  await expect(create()).rejects.toMatchObject({
    response: { data: { error: { code: "BOOK_LIMIT_REACHED" } } },
  });
});
it("store preserves selection, creates additional books, trims names and skips unchanged patches", async () => {
  await useBooksStore.getState().loadBooks();
  const id = await useBooksStore.getState().addBook({ name: "  Business  " });
  await useBooksStore.getState().loadBooks();
  expect(useBooksStore.getState().selectedBookId).toBe(id);
  expect(useBooksStore.getState().books.find((b) => b.id === id)?.name).toBe(
    "Business",
  );
  const spy = vi.spyOn(api, "patchBook");
  await useBooksStore.getState().updateBook(id, { name: "Business" });
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});
it("rolls failed reorder back and permits retry after reconciliation", async () => {
  await create();
  await useBooksStore.getState().loadBooks();
  const ids = useBooksStore.getState().books.map((b) => b.id);
  const spy = vi
    .spyOn(api, "reorderBooks")
    .mockRejectedValueOnce(new Error("offline"));
  await expect(
    useBooksStore.getState().reorderBooks([...ids].reverse()),
  ).rejects.toThrow("offline");
  expect(useBooksStore.getState().books.map((b) => b.id)).toEqual(ids);
  expect(useBooksStore.getState().isManaging).toBe(false);
  spy.mockRestore();
});
it("deduplicates ensure calls and never invents a legacy balance", async () => {
  mockBackend.state.books = [];
  const ids = await Promise.all([
    useBooksStore.getState().ensureBook({ name: "Personal" }),
    useBooksStore.getState().ensureBook({ name: "Personal" }),
  ]);
  expect(ids[0]).toBe(ids[1]);
  expect(mockBackend.state.books).toHaveLength(1);
  expect(normalizeBook({ id: "old", currencyCode: "USD" })).toMatchObject({
    icon: "book",
    color: "green",
    balanceMinor: undefined,
  });
});
it("waits for a pending list before creating and preserves the new selection", async () => {
  const snapshot = await api.listBooks();
  let resolve!: (value: typeof snapshot) => void;
  const spy = vi.spyOn(api, "listBooks").mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const read = useBooksStore.getState().loadBooks();
  const write = useBooksStore.getState().addBook({ name: "After read" });
  resolve(snapshot);
  await read;
  const id = await write;
  expect(useBooksStore.getState().selectedBookId).toBe(id);
  expect(useBooksStore.getState().books).toHaveLength(
    snapshot.items.length + 1,
  );
  spy.mockRestore();
});
it("does not write again when uncertain state cannot be reconciled", async () => {
  const list = vi
    .spyOn(api, "listBooks")
    .mockRejectedValue(new Error("offline"));
  const createSpy = vi.spyOn(api, "createBook");
  await expect(
    useBooksStore.getState().addBook({ name: "Offline" }),
  ).rejects.toThrow("offline");
  expect(createSpy).not.toHaveBeenCalled();
  expect(useBooksStore.getState().ready).toBe(false);
  list.mockRestore();
  createSpy.mockRestore();
});
it("does not let a list requested during creation replace the successful write", async () => {
  await useBooksStore.getState().loadBooks();
  const snapshot = await api.listBooks();
  const created = { ...snapshot.items[0], id: "new-during-read", name: "New" };
  let finishCreate!: (value: typeof created) => void;
  const createSpy = vi.spyOn(api, "createBook").mockImplementationOnce(
    () =>
      new Promise((r) => {
        finishCreate = r;
      }),
  );
  const writing = useBooksStore.getState().addBook({ name: "New" });
  const list = vi.spyOn(api, "listBooks").mockResolvedValueOnce(snapshot);
  await useBooksStore.getState().loadBooks();
  finishCreate(created);
  await writing;
  expect(useBooksStore.getState().selectedBookId).toBe(created.id);
  expect(useBooksStore.getState().books.some((b) => b.id === created.id)).toBe(
    true,
  );
  list.mockRestore();
  createSpy.mockRestore();
});
it("requires fresh deletion confirmation if a pending list changes the version", async () => {
  await create();
  await useBooksStore.getState().loadBooks();
  const book = useBooksStore.getState().books[0];
  const snapshot = await api.listBooks();
  snapshot.items[0] = { ...snapshot.items[0], version: book.version + 1 };
  const list = vi.spyOn(api, "listBooks").mockResolvedValueOnce(snapshot);
  const remove = vi.spyOn(api, "deleteBook");
  const read = useBooksStore.getState().loadBooks();
  await expect(
    useBooksStore.getState().removeBook(book.id, book.version),
  ).rejects.toThrow("confirm deletion again");
  await read;
  expect(remove).not.toHaveBeenCalled();
  list.mockRestore();
  remove.mockRestore();
});
