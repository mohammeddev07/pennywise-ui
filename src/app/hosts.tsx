import { AnimatePresence, motion } from "motion/react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { settleConfirm, useConfirmStore } from "@/shared/ui/utils/confirm";
import { useUndoToastStore } from "@/shared/ui/state/useUndoToastStore";
import { useExportToastStore } from "@/shared/ui/state/useExportToastStore";
import { Icon } from "@/shared/ui/Icon";

/** Renders confirmDialog()/confirmDestructive()/alertCompat() requests from anywhere in the app. */
export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request);
  return (
    <AlertDialog open={!!request} onOpenChange={(open) => !open && settleConfirm(false)}>
      <AlertDialogContent className="glass rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          <AlertDialogDescription className={request?.message ? undefined : "sr-only"}>
            {request?.message ?? request?.title}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {!request?.alertOnly && <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>}
          <AlertDialogAction
            onClick={() => settleConfirm(true)}
            className={cn("rounded-full", request?.destructive && "bg-expense text-white hover:bg-expense/90")}
          >
            {request?.confirmLabel ?? "OK"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A new deploy is cached and waiting: offer a reload instead of swapping code under the user. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="glass fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[75] mx-auto flex max-w-md items-center gap-3 rounded-2xl p-3 pl-4"
        >
          <Icon name="sparkles-outline" className="text-primary" />
          <p className="flex-1 text-sm font-medium">A new version of PennyWise is ready.</p>
          <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setNeedRefresh(false)}>
            Later
          </Button>
          <Button size="sm" className="rounded-full" onClick={() => void updateServiceWorker(true)}>
            Reload
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Error toast (6 s) and export-success toast (4 s), from the stores the domain code already uses. */
export function ToastHost() {
  const error = useUndoToastStore();
  const exported = useExportToastStore();
  const toasts = [
    error.visible && { id: "error", tone: "error" as const, title: error.title, body: error.message, hide: error.hide },
    exported.visible && { id: "export", tone: "ok" as const, title: "Export ready", body: exported.message, hide: exported.hide },
  ].filter(Boolean) as { id: string; tone: "error" | "ok"; title: string; body: string; hide: () => void }[];

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="glass pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl p-3.5"
          >
            <span className={cn("mt-0.5", t.tone === "error" ? "text-expense" : "text-income")}>
              <Icon name={t.tone === "error" ? "alert-circle-outline" : "checkmark"} size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.body && <p className="text-sm text-muted-foreground">{t.body}</p>}
            </div>
            <button
              onClick={t.hide}
              aria-label="Dismiss"
              className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-3"
            >
              <Icon name="close" size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
