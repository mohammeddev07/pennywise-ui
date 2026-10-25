import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/shared/ui/Icon";
import { ResponsiveDialog } from "@/shared/ui/ResponsiveDialog";
import { Segmented } from "@/shared/ui/Segmented";
import { QUERY_LIMITS, type SortKey } from "@/shared/types/transactionQuery";
import { FIELDS, SORT_FIELD_LABELS } from "../filterModel";
import { useFilterStore, type ScopeKey } from "../filterStore";
import { directionLabels } from "../sortModel";
import { PillSelect } from "./Chip";

/** Up to three prioritised sort keys, edited as a draft in the filter store and applied together. */
export function SortSheet({ open, onClose, scope }: { open: boolean; onClose: () => void; scope: ScopeKey }) {
  const draft = useFilterStore((s) => s.drafts[scope]);
  const beginDraft = useFilterStore((s) => s.beginDraft);
  const setDraft = useFilterStore((s) => s.setDraft);
  const applyDraft = useFilterStore((s) => s.applyDraft);
  const cancelDraft = useFilterStore((s) => s.cancelDraft);

  useEffect(() => {
    if (open) beginDraft(scope);
  }, [open, scope, beginDraft]);

  const sort = draft?.sort ?? [];
  const set = (next: SortKey[]) => setDraft(scope, { sort: next });
  const cancel = () => {
    cancelDraft(scope);
    onClose();
  };
  const used = new Set(sort.map((s) => s.field));

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && cancel()}
      title="Sort"
      footer={
        <>
          <Button variant="secondary" className="h-11 rounded-full px-5" onClick={cancel}>
            Cancel
          </Button>
          <Button className="h-11 rounded-full px-6 font-semibold" onClick={() => applyDraft(scope, "sort") && onClose()}>
            Apply
          </Button>
        </>
      }
    >
      {sort.length === 0 && <p className="mb-3 text-sm text-muted-foreground">Default order: newest date first, then newest created.</p>}
      <ol className="space-y-3">
        {sort.map((key, i) => (
          <li key={key.field} className="surface space-y-3 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-muted-foreground">{i === 0 ? "Sort by" : "Then by"}</span>
              <PillSelect
                label={`Sort field ${i + 1}`}
                value={key.field}
                className="min-w-0 flex-1"
                options={FIELDS.filter((f) => f.field === key.field || !used.has(f.field)).map((f) => ({
                  value: f.field,
                  label: SORT_FIELD_LABELS[f.field],
                }))}
                onChange={(field) => set(sort.map((s, j) => (j === i ? { ...s, field } : s)))}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-11 rounded-full md:size-9"
                aria-label="Raise priority"
                disabled={i === 0}
                onClick={() => {
                  const next = [...sort];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  set(next);
                }}
              >
                <Icon name="chevron-up" size={18} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 rounded-full text-expense md:size-9"
                aria-label="Remove sort"
                onClick={() => set(sort.filter((_, j) => j !== i))}
              >
                <Icon name="trash-outline" size={18} />
              </Button>
            </div>
            <Segmented
              label="Direction"
              className="w-full"
              value={key.direction}
              options={[
                { value: "DESC", label: directionLabels(key.field).DESC },
                { value: "ASC", label: directionLabels(key.field).ASC },
              ]}
              onChange={(direction) => set(sort.map((s, j) => (j === i ? { ...s, direction } : s)))}
            />
          </li>
        ))}
      </ol>
      <div className="mt-4 flex gap-2">
        <Button
          variant="secondary"
          className="h-11 flex-1 rounded-full"
          disabled={sort.length >= QUERY_LIMITS.maxSortKeys}
          onClick={() => {
            const next = FIELDS.find((f) => !used.has(f.field));
            if (next) set([...sort, { field: sort.length === 0 ? "occurredOn" : next.field, direction: "DESC" }]);
          }}
        >
          <Icon name="add" size={16} /> Add sort
        </Button>
        <Button variant="ghost" className="h-11 flex-1 rounded-full" disabled={sort.length === 0} onClick={() => set([])}>
          Reset
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
