import { create } from "zustand";

/** Promise-based replacement for native Alert / window.confirm; rendered by <ConfirmHost />. */
export type ConfirmRequest = {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  /** Only an acknowledge button, no cancel. */
  alertOnly?: boolean;
};

export const useConfirmStore = create<{ request: (ConfirmRequest & { resolve: (ok: boolean) => void }) | null }>(
  () => ({ request: null }),
);

export function confirmDialog(request: ConfirmRequest): Promise<boolean> {
  useConfirmStore.getState().request?.resolve(false);
  return new Promise((resolve) => useConfirmStore.setState({ request: { ...request, resolve } }));
}

export function settleConfirm(ok: boolean) {
  const request = useConfirmStore.getState().request;
  useConfirmStore.setState({ request: null });
  request?.resolve(ok);
}

export function confirmDestructive(title: string, message: string, onConfirm: () => void, confirmLabel = "Delete") {
  void confirmDialog({ title, message, confirmLabel, destructive: true }).then((ok) => ok && onConfirm());
}

type AlertButton = { text?: string; style?: "default" | "cancel" | "destructive"; onPress?: () => void };

/** Same contract as the mobile helper: no buttons -> acknowledge; one action -> confirm; several -> nothing. */
export function alertCompat(title: string, message?: string, buttons?: AlertButton[]) {
  const actions = (buttons ?? []).filter((b) => b.style !== "cancel");
  if (actions.length > 1) return;
  const action = actions[0];
  void confirmDialog({
    title,
    message,
    confirmLabel: action?.text ?? "OK",
    destructive: action?.style === "destructive",
    alertOnly: !action,
  }).then((ok) => ok && action?.onPress?.());
}
