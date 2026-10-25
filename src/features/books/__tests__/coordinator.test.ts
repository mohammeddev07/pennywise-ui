import { useAuthStore } from "@/features/auth/store";
import { useBooksStore, normalizeBook } from "../store";
import {
  installBookCoordinator,
  selectBook,
  captureBookScope,
  setBookNavigation,
} from "../coordinator";
import { beginBookOperation, endBookOperation } from "../operations";
import { useAddTransactionDraftStore } from "@/features/transactions/addDraftStore";
import { useImportResultStore } from "@/features/imports/store";
import { queryClient } from "@/shared/api/queryClient";
import { useCategoriesStore } from "@/features/categories/store";
import { useBudgetsStore } from "@/features/budgets/store";
import { useFilterStore } from "@/features/transactions/filterStore";
let dispose: () => void;
beforeEach(() => {
  useAuthStore.setState({ sessionStatus: "authenticated" });
  vi
    .spyOn(useCategoriesStore.getState(), "loadCategories")
    .mockResolvedValue();
  vi.spyOn(useBudgetsStore.getState(), "loadBudgets").mockResolvedValue();
  useBooksStore.setState({
    books: ["a", "b"].map((id) => normalizeBook({ id, name: id })),
    selectedBookId: "a",
    ready: true,
    isManaging: false,
  });
  useAddTransactionDraftStore.getState().reset();
  setBookNavigation(() => false, vi.fn());
  dispose = installBookCoordinator();
});
afterEach(() => {
  dispose();
  vi.restoreAllMocks();
  queryClient.clear();
});
it("resets ephemeral state synchronously but preserves scoped applied filters", async () => {
  useFilterStore.getState().ensure("user:a", "2026-09-28");
  const filter = useFilterStore.getState().byScope["user:a"];
  useImportResultStore.setState({ bookId: "a", result: {} as never });
  const old = captureBookScope();
  await selectBook("b");
  expect(old()).toBe(false);
  expect(useImportResultStore.getState().result).toBeNull();
  expect(useFilterStore.getState().byScope["user:a"]).toBe(filter);
  expect(useCategoriesStore.getState().loadCategories).toHaveBeenCalledWith(
    "b",
  );
});
it("guards A to B to A late completions even when the final ID matches", async () => {
  const old = captureBookScope();
  await selectBook("b");
  await selectBook("a");
  expect(old()).toBe(false);
});
it("cancel keeps drafts; confirmed switch discards and closes the modal", async () => {
  const close = vi.fn();
  setBookNavigation(() => true, close);
  useAddTransactionDraftStore.setState({
    bookId: "a",
    amount: "10",
    title: "Draft",
  });
  expect(await selectBook("b", async () => false)).toBe(false);
  expect(useAddTransactionDraftStore.getState().title).toBe("Draft");
  await selectBook("b", async () => true);
  expect(useAddTransactionDraftStore.getState().title).toBe("");
  expect(close).toHaveBeenCalledTimes(1);
});
it("blocks switching while an operation is in progress", async () => {
  const id = beginBookOperation();
  await expect(selectBook("b")).rejects.toThrow("Wait");
  expect(useBooksStore.getState().selectedBookId).toBe("a");
  endBookOperation(id);
  expect(await selectBook("b")).toBe(true);
});
it("does not apply an old confirmation after reconciliation", async () => {
  setBookNavigation(() => true, vi.fn());
  let resolve!: (v: boolean) => void;
  const pending = selectBook(
    "b",
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  useBooksStore.setState({ selectedBookId: "b" });
  resolve(true);
  expect(await pending).toBe(false);
});
