import { motion, useReducedMotion } from "motion/react";
import { useId, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { captureBookScope } from "@/features/books/coordinator";
import { useBooksStore } from "@/features/books/store";
import { useCategoriesStore } from "@/features/categories/store";
import { invalidateTransactionData } from "@/features/transactions/queries";
import { getApiErrorMessage } from "@/shared/api/errors";
import { importTransactions } from "@/shared/api/transactions";
import { queryClient } from "@/shared/api/queryClient";
import type { ImportResponse } from "@/shared/types/api";
import { Icon } from "@/shared/ui/Icon";
import { ResponsiveDialog } from "@/shared/ui/ResponsiveDialog";
import { confirmDialog } from "@/shared/ui/utils/confirm";
import { useImportResultStore } from "./store";

const isXlsx = (f: File) => /\.xlsx$/i.test(f.name);

function Results({ result }: { result: ImportResponse }) {
  const reduce = useReducedMotion();
  const failed = result.failedCount > 0;
  const tiles = [
    { label: "Imported", value: result.importedCount },
    { label: "Blank", value: result.skippedBlankCount },
    { label: "Duplicate", value: result.skippedDuplicateCount },
    { label: "Failed", value: result.failedCount, bad: failed },
  ];
  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-center gap-3">
        <motion.span
          initial={reduce ? false : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 20 }}
          className={cn("grid size-12 shrink-0 place-items-center rounded-full", failed ? "bg-warning-soft text-warning" : "bg-income-soft text-income")}
        >
          <Icon name={failed ? "alert-circle-outline" : "checkmark"} size={24} weight="bold" />
        </motion.span>
        <div>
          <p className="font-semibold">{failed ? "Import finished with errors" : "Import complete"}</p>
          <p className="text-sm text-muted-foreground">
            {result.importedCount} of {result.totalRows} rows added to this cash book.
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t, i) => (
          <motion.div
            key={t.label}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.04, type: "spring", stiffness: 360, damping: 30 }}
            className="rounded-lg bg-surface-2 p-3"
          >
            <dt className="text-xs text-muted-foreground">{t.label}</dt>
            <dd className={cn("money mt-1 text-xl font-semibold", t.bad && "text-expense")}>{t.value}</dd>
          </motion.div>
        ))}
      </dl>

      {result.categoriesCreated.length > 0 && (
        <div className="rounded-lg bg-surface-2 p-3 text-sm">
          <p className="text-muted-foreground">New categories created</p>
          <p className="mt-1">{result.categoriesCreated.join(", ")}</p>
        </div>
      )}

      {result.errors.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Row errors ({result.errors.length})</p>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {result.errors.map((e, i) => (
              <li key={`${e.rowNumber}-${i}`} className="flex items-start gap-3 rounded-lg bg-surface-2 p-3">
                <span className="money grid h-7 min-w-7 place-items-center rounded-full bg-expense-soft px-1.5 text-xs font-semibold text-expense">
                  {e.rowNumber}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Row {e.rowNumber}</span>
                  <span className="block text-sm text-muted-foreground">{e.message || e.code}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const inputId = useId();
  const reduce = useReducedMotion();
  const bookId = useBooksStore((s) => s.selectedBookId);
  const bookName = useBooksStore((s) => s.books.find((b) => b.id === s.selectedBookId)?.name ?? "this cash book");
  const result = useImportResultStore((s) => (s.bookId === bookId ? s.result : null));
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!isXlsx(f)) return setError("Choose an .xlsx file.");
    setError("");
    setFile(f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (progress === null) pick(e.dataTransfer.files[0]);
  };

  const close = (o: boolean) => {
    if (o) return onOpenChange(true);
    if (progress !== null) return; // an upload can't be cancelled server-side; keep the dialog until it answers
    useImportResultStore.getState().clear();
    onOpenChange(false);
  };

  const run = async () => {
    if (!file || progress !== null) return;
    const ok = await confirmDialog({
      title: "Import transactions?",
      message: `This adds every valid row in “${file.name}” to ${bookName}. This can't be undone.`,
      confirmLabel: "Import",
    });
    if (!ok) return;
    const isCurrent = captureBookScope();
    setProgress(0);
    setError("");
    try {
      const response = await importTransactions(bookId, file, setProgress);
      if (!isCurrent()) return;
      useImportResultStore.getState().setResult(response, bookId);
      // Imported rows touch every list, total, balance and budget of the book; new categories join the picker.
      if (response.importedCount > 0) void invalidateTransactionData(queryClient, bookId);
      if (response.categoriesCreated.length > 0) void useCategoriesStore.getState().loadCategories(bookId).catch(() => {});
    } catch (err) {
      if (isCurrent()) setError(getApiErrorMessage(err, "Couldn't import transactions."));
    } finally {
      setProgress(null);
    }
  };

  const uploading = progress !== null;
  const processing = uploading && progress >= 1;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      title={result ? "Import results" : "Import transactions"}
      description={result ? undefined : `Add rows from a PennyWise .xlsx export (or a file in the same format) to ${bookName}.`}
      footer={
        result ? (
          <>
            <Button
              variant="outline"
              className="h-11 rounded-full px-5"
              onClick={() => {
                useImportResultStore.getState().clear();
                setFile(null);
              }}
            >
              Import another
            </Button>
            <Button className="h-11 rounded-full px-6 font-semibold" onClick={() => close(false)}>
              Done
            </Button>
          </>
        ) : (
          <Button disabled={!file || uploading} onClick={() => void run()} className="glow h-11 rounded-full px-6 font-semibold active:scale-[0.98]">
            {processing ? "Processing rows" : uploading ? "Uploading" : "Import"}
          </Button>
        )
      }
    >
      {result ? (
        <Results result={result} />
      ) : (
        <div className="space-y-3 pb-2">
          <label
            htmlFor={inputId}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "relative flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors focus-within:ring-2 focus-within:ring-ring",
              dragging ? "border-primary bg-primary-soft" : "border-border-strong bg-surface-2 hover:bg-surface-3",
              uploading && "pointer-events-none",
            )}
          >
            <motion.span
              animate={reduce ? undefined : { y: dragging ? -4 : 0, scale: dragging ? 1.08 : 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary"
            >
              <Icon name={file ? "table" : "cloud-upload-outline"} size={22} />
            </motion.span>
            <span className="max-w-full">
              <span className="block truncate font-semibold">{file ? file.name : "Choose an .xlsx file"}</span>
              <span className="block text-sm text-muted-foreground">
                {file ? "Click to choose a different file" : "Or drop it here"}
              </span>
            </span>
            <input
              id={inputId}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={uploading}
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
              className="sr-only"
            />
          </label>

          {uploading && (
            <div aria-live="polite" className="space-y-1.5">
              <div
                role="progressbar"
                aria-label="Import progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                className={cn("h-1.5 overflow-hidden rounded-full bg-surface-2", processing && "shimmer")}
              >
                <motion.div
                  className="h-full origin-left rounded-full bg-primary"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: progress }}
                  transition={{ type: "spring", stiffness: 160, damping: 26 }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {processing ? "Uploaded. Checking each row." : `Uploading ${Math.round(progress * 100)}%`}
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          )}
        </div>
      )}
    </ResponsiveDialog>
  );
}
