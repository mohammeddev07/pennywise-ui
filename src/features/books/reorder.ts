import { useBooksStore } from "./store";
export function movedBookIds(ids: string[], from: number, to: number) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    from >= ids.length ||
    to < 0 ||
    to >= ids.length
  )
    return ids;
  const next = [...ids];
  const [id] = next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
export async function moveBook(id: string, to: number) {
  const state = useBooksStore.getState();
  const ids = state.books.map((b) => b.id);
  const from = ids.indexOf(id);
  const next = movedBookIds(ids, from, to);
  if (from === to || next === ids) return;
  await state.reorderBooks(next);
}
