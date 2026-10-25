import { lazy, Suspense } from "react";
import { useOverlay } from "./overlays";

// Each editor is its own chunk; it loads the first time it opens.
const AddTransactionDialog = lazy(() =>
  import("@/features/transactions/add/AddTransactionDialog").then((m) => ({ default: m.AddTransactionDialog })),
);
const CategoryEditorDialog = lazy(() =>
  import("@/features/categories/CategoryEditorDialog").then((m) => ({ default: m.CategoryEditorDialog })),
);
const BudgetEditorDialog = lazy(() =>
  import("@/features/budgets/BudgetEditorDialog").then((m) => ({ default: m.BudgetEditorDialog })),
);
const ImportDialog = lazy(() => import("@/features/imports/ImportDialog").then((m) => ({ default: m.ImportDialog })));

/**
 * Contract for every editor: `open` + `onOpenChange` drive the dialog/sheet; the payload props come from the
 * overlay. Components unmount after the exit animation (useOverlay clears the payload 320 ms after close).
 */
export function OverlayHost() {
  const { overlay, open, close } = useOverlay();
  if (!overlay || overlay.kind === "palette") return null;
  const common = { open, onOpenChange: (o: boolean) => !o && close() };
  return (
    <Suspense fallback={null}>
      {overlay.kind === "add-transaction" && <AddTransactionDialog {...common} type={overlay.type} />}
      {overlay.kind === "category-editor" && <CategoryEditorDialog {...common} id={overlay.id} type={overlay.type} />}
      {overlay.kind === "budget-editor" && (
        <BudgetEditorDialog {...common} categoryId={overlay.categoryId} month={overlay.month} />
      )}
      {overlay.kind === "import" && <ImportDialog {...common} />}
    </Suspense>
  );
}
