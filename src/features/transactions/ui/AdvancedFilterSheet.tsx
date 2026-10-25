import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Category } from "@/features/categories/store";
import { cn } from "@/lib/utils";
import { Icon } from "@/shared/ui/Icon";
import { ResponsiveDialog } from "@/shared/ui/ResponsiveDialog";
import { Segmented } from "@/shared/ui/Segmented";
import { QUERY_LIMITS, type GroupOp } from "@/shared/types/transactionQuery";
import { currencySymbol } from "@/shared/utils/formatCurrency";
import {
  FIELDS,
  PAYMENT_OPTIONS,
  TYPE_OPTIONS,
  addChild,
  addGroup,
  blankCondition,
  changeField,
  changeOperator,
  clearAll,
  countConditions,
  describeExpression,
  fieldMeta,
  groupLevel,
  inputCount,
  moveChild,
  nodeRaw,
  operatorIsList,
  operatorLabel,
  operatorTakesValue,
  readQuick,
  removeNode,
  requestOverhead,
  setConditionInput,
  setConditionListText,
  setConditionValue,
  setGroupOp,
  validateTree,
  type DescribeContext,
  type FilterConditionNode,
  type FilterGroupNode,
  type FilterRoot,
  type ModelContext,
} from "../filterModel";
import { useFilterStore, type ScopeKey } from "../filterStore";
import { Chip, PillSelect } from "./Chip";

type Ctx = {
  model: ModelContext;
  categories: Category[];
  errors: Record<string, string>;
  showErrors: boolean;
  root: FilterRoot;
  update: (next: FilterRoot) => void;
};

const FIELD_OPTIONS = FIELDS.map((f) => ({ value: f.field, label: f.label, group: f.metadata ? "Record metadata (read-only)" : "Transaction" }));

function IconAction({ label, icon, onClick, disabled, danger }: { label: string; icon: "chevron-up" | "chevron-down" | "trash-outline"; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("size-11 shrink-0 rounded-full md:size-8", danger && "text-expense")}
    >
      <Icon name={icon} size={16} />
    </Button>
  );
}

function Choices({ options, selected, multi, onChange }: { options: Array<{ value: string; label: string }>; selected: string[]; multi: boolean; onChange: (next: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <Chip
            key={o.value}
            active={active}
            onClick={() => onChange(multi ? (active ? selected.filter((x) => x !== o.value) : [...selected, o.value]) : [o.value])}
          >
            {o.label}
          </Chip>
        );
      })}
    </div>
  );
}

function ValueEditor({ node, ctx, errorId }: { node: FilterConditionNode; ctx: Ctx; errorId?: string }) {
  const meta = fieldMeta(node.field);
  const isList = operatorIsList(node.operator);
  const selected = (Array.isArray(node.value) ? node.value : node.value !== undefined ? [node.value] : []).map(String);
  const pick = (next: string[]) => ctx.update(setConditionValue(ctx.root, node.id, isList ? next : next[0]));
  const count = Math.max(1, inputCount(node.operator));
  const raws = nodeRaw(node, ctx.model);
  const inputProps = { "aria-invalid": Boolean(errorId), "aria-describedby": errorId, className: "h-11 rounded-lg md:h-9", autoComplete: "off" };

  if (node.field === "type") return <Choices options={TYPE_OPTIONS} selected={selected} multi={isList} onChange={pick} />;
  if (node.field === "paymentMethod") return <Choices options={PAYMENT_OPTIONS} selected={selected} multi={isList} onChange={pick} />;
  if (node.field === "categoryId") {
    return <Choices options={ctx.categories.map((c) => ({ value: c.id, label: c.name }))} selected={selected} multi={isList} onChange={pick} />;
  }
  if (meta.kind === "UUID") {
    return (
      <Input
        {...inputProps}
        aria-label="Value"
        value={node.raw?.[0] ?? selected.join(", ")}
        placeholder={isList ? "IDs separated by commas" : "Transaction ID"}
        onChange={(e) =>
          ctx.update(isList ? setConditionListText(ctx.root, node.id, e.target.value) : setConditionInput(ctx.root, node.id, 0, e.target.value, ctx.model))
        }
      />
    );
  }
  if (meta.kind === "TEXT") {
    return (
      <Input
        {...inputProps}
        aria-label="Value"
        value={typeof node.value === "string" ? node.value : ""}
        maxLength={QUERY_LIMITS.maxTextChars}
        placeholder="Text (not case-sensitive)"
        onChange={(e) => ctx.update(setConditionValue(ctx.root, node.id, e.target.value === "" ? undefined : e.target.value))}
      />
    );
  }
  // DATE gets the native picker; NUMBER and TIMESTAMP are typed text parsed exactly by the model.
  return (
    <div className={cn("grid gap-2", count === 2 && "sm:grid-cols-[1fr_auto_1fr] sm:items-center")}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="contents">
          {i === 1 && <span className="hidden text-center text-sm text-muted-foreground sm:block">and</span>}
          <div className="relative">
            {meta.kind === "NUMBER" && (
              <span className="money pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted-foreground">
                {currencySymbol(ctx.model.currency)}
              </span>
            )}
            <Input
              {...inputProps}
              aria-label={count === 2 ? (i === 0 ? "From" : "To") : "Value"}
              type={meta.kind === "DATE" ? "date" : "text"}
              inputMode={meta.kind === "NUMBER" ? "decimal" : undefined}
              value={raws[i] ?? ""}
              placeholder={meta.kind === "NUMBER" ? "Amount" : meta.kind === "TIMESTAMP" ? `YYYY-MM-DD HH:mm (${ctx.model.timezone})` : undefined}
              onChange={(e) => ctx.update(setConditionInput(ctx.root, node.id, i, e.target.value, ctx.model))}
              className={cn(inputProps.className, meta.kind === "NUMBER" && "money pl-8")}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ConditionEditor({ node, index, siblings, parentId, ctx }: { node: FilterConditionNode; index: number; siblings: number; parentId: string; ctx: Ctx }) {
  const meta = fieldMeta(node.field);
  const error = ctx.showErrors ? ctx.errors[node.id] : undefined;
  const errorId = error ? `${node.id}-error` : undefined;
  return (
    <div className={cn("surface space-y-3 rounded-lg p-3", error && "border-expense/60")}>
      <div className="flex items-center gap-1">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <PillSelect label="Field" value={node.field} options={FIELD_OPTIONS} onChange={(f) => f !== node.field && ctx.update(changeField(ctx.root, node.id, f))} />
          <PillSelect
            label="Operator"
            value={node.operator}
            options={meta.operators.map((op) => ({ value: op, label: operatorLabel(node.field, op) }))}
            onChange={(op) => op !== node.operator && ctx.update(changeOperator(ctx.root, node.id, op, ctx.model))}
          />
        </div>
        <IconAction label="Move condition up" icon="chevron-up" disabled={index === 0} onClick={() => ctx.update(moveChild(ctx.root, parentId, index, index - 1))} />
        <IconAction label="Move condition down" icon="chevron-down" disabled={index === siblings - 1} onClick={() => ctx.update(moveChild(ctx.root, parentId, index, index + 1))} />
        <IconAction label="Remove condition" icon="trash-outline" danger onClick={() => ctx.update(removeNode(ctx.root, node.id))} />
      </div>
      {operatorTakesValue(node.operator) && <ValueEditor node={node} ctx={ctx} errorId={errorId} />}
      {error && (
        <p id={errorId} className="text-sm text-expense">
          {error}
        </p>
      )}
    </div>
  );
}

function GroupEditor({ group, parent, index, siblings, ctx }: { group: FilterGroupNode; parent: FilterGroupNode | null; index: number; siblings: number; ctx: Ctx }) {
  const isRoot = parent === null;
  const overhead = requestOverhead(ctx.root);
  const canNest = groupLevel(ctx.root, group.id) + overhead.levels < QUERY_LIMITS.maxDepth;
  const conditionsLeft = countConditions(ctx.root) + overhead.conditions < QUERY_LIMITS.maxConditions;
  const error = ctx.showErrors ? ctx.errors[group.id] : undefined;

  return (
    <div className={cn(!isRoot && "border-l-2 border-primary/60 pl-3")}>
      <div className="mb-3 flex items-center gap-1">
        <Segmented<GroupOp>
          label="Match"
          className="flex-1"
          value={group.op}
          options={[
            { value: "AND", label: "All match" },
            { value: "OR", label: "Any matches" },
          ]}
          onChange={(op) => ctx.update(setGroupOp(ctx.root, group.id, op))}
        />
        {parent && (
          <>
            <IconAction label="Move group up" icon="chevron-up" disabled={index === 0} onClick={() => ctx.update(moveChild(ctx.root, parent.id, index, index - 1))} />
            <IconAction label="Move group down" icon="chevron-down" disabled={index === siblings - 1} onClick={() => ctx.update(moveChild(ctx.root, parent.id, index, index + 1))} />
            <IconAction label="Remove group" icon="trash-outline" danger onClick={() => ctx.update(removeNode(ctx.root, group.id))} />
          </>
        )}
      </div>
      <div className="space-y-3">
        {group.children.length === 0 && (
          <p className="text-sm text-muted-foreground">{isRoot ? "No conditions: every transaction in the date range matches." : "Empty group."}</p>
        )}
        {group.children.map((child, i) =>
          child.kind === "condition" ? (
            <ConditionEditor key={child.id} node={child} index={i} siblings={group.children.length} parentId={group.id} ctx={ctx} />
          ) : (
            <GroupEditor key={child.id} group={child} parent={group} index={i} siblings={group.children.length} ctx={ctx} />
          ),
        )}
      </div>
      {error && <p className="mt-2 text-sm text-expense">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="h-11 flex-1 rounded-full md:h-9" disabled={!conditionsLeft} onClick={() => ctx.update(addChild(ctx.root, group.id, blankCondition()))}>
          <Icon name="add" size={16} /> Condition
        </Button>
        <Button
          variant="secondary"
          className="h-11 flex-1 rounded-full md:h-9"
          disabled={!canNest || !conditionsLeft}
          onClick={() => ctx.update(addGroup(ctx.root, group.id, group.op === "AND" ? "OR" : "AND"))}
        >
          <Icon name="add" size={16} /> Group
        </Button>
      </div>
    </div>
  );
}

/**
 * Advanced AND/OR editor on a draft in the filter store. Nothing reaches the list or the totals
 * until Apply, which validates the whole tree. Cancel or dismiss drops the draft.
 */
export function AdvancedFilterSheet({
  open,
  onClose,
  scope,
  model,
  describeContext,
  categories,
  initialRoot,
  onApplied,
  limitationNotice,
}: {
  open: boolean;
  onClose: () => void;
  scope: ScopeKey;
  model: ModelContext;
  describeContext: DescribeContext;
  categories: Category[];
  /** Seeds the draft (an AI proposal opening straight into review). */
  initialRoot?: FilterRoot | null;
  /** Runs after a successful Apply only, e.g. to commit a sort staged with the proposal. */
  onApplied?: () => void;
  limitationNotice?: string | null;
}) {
  const root = useFilterStore((s) => s.drafts[scope]?.root);
  const beginDraft = useFilterStore((s) => s.beginDraft);
  const setDraft = useFilterStore((s) => s.setDraft);
  const applyDraft = useFilterStore((s) => s.applyDraft);
  const cancelDraft = useFilterStore((s) => s.cancelDraft);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!open) return;
    beginDraft(scope);
    if (initialRoot) setDraft(scope, { root: initialRoot });
    setShowErrors(false);
  }, [open, scope, beginDraft, initialRoot, setDraft]);

  const validation = useMemo(() => (root ? validateTree(root) : null), [root]);
  const cancel = () => {
    cancelDraft(scope);
    onClose();
  };
  const apply = () => {
    if (!validation?.valid) return setShowErrors(true);
    if (applyDraft(scope, "filter")) {
      onApplied?.();
      onClose();
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && cancel()}
      title={initialRoot ? "Review the proposed filter" : "Advanced filters"}
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="secondary" className="h-11 rounded-full px-5" onClick={cancel}>
            Cancel
          </Button>
          <Button className="h-11 rounded-full px-6 font-semibold" onClick={apply}>
            Apply
          </Button>
        </>
      }
    >
      {root && validation && (
        <div className="space-y-4">
          <div className="rounded-lg bg-surface-2 p-3" aria-live="polite">
            <p className="text-xs text-muted-foreground">Showing</p>
            <p className="mt-1 text-sm">
              {describeExpression(root, describeContext)}
              {readQuick(root).date ? "" : ", all dates"}
            </p>
          </div>
          {limitationNotice && (
            <div className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
              <span className="font-semibold">Note: </span>
              {limitationNotice}
            </div>
          )}
          {validation.treeErrors.map((m) => (
            <p key={m} className="text-sm text-expense">
              {m}
            </p>
          ))}
          {showErrors && !validation.valid && validation.treeErrors.length === 0 && (
            <p role="alert" className="text-sm text-expense">
              Fix the highlighted conditions to apply.
            </p>
          )}
          <GroupEditor
            group={root}
            parent={null}
            index={0}
            siblings={1}
            ctx={{ model, categories, errors: validation.nodeErrors, showErrors, root, update: (next) => setDraft(scope, { root: next }) }}
          />
          <Button variant="ghost" className="h-11 rounded-full text-muted-foreground" onClick={() => setDraft(scope, { root: clearAll() })}>
            <Icon name="close" size={16} /> Clear all conditions
          </Button>
        </div>
      )}
    </ResponsiveDialog>
  );
}
