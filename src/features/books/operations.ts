import { create } from "zustand";
import { getAccountEpoch } from "@/shared/session/accountEpoch";
/** Shared lifetime of writes and device exports, including time outside the HTTP request. */
export const useBookOperations = create<{ active: number }>(() => ({
  active: 0,
}));
let next = 0;
const operations = new Map<number, number>();
export function beginBookOperation() {
  const id = ++next;
  operations.set(id, getAccountEpoch());
  refresh();
  return id;
}
function refresh() {
  useBookOperations.setState({
    active: [...operations.values()].filter(
      (epoch) => epoch === getAccountEpoch(),
    ).length,
  });
}
export function endBookOperation(id?: number) {
  if (id !== undefined) operations.delete(id);
  refresh();
}
export function hasBookOperation() {
  refresh();
  return useBookOperations.getState().active > 0;
}
export async function duringBookOperation<T>(
  work: () => Promise<T>,
): Promise<T> {
  const id = beginBookOperation();
  try {
    return await work();
  } finally {
    endBookOperation(id);
  }
}

export function resetBookOperations() {
  operations.clear();
  refresh();
}
