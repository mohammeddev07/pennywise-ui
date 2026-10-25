/**
 * The one filter model behind Activity.
 *
 * A single expression tree (`FilterRoot`) is the only source of truth. The quick
 * filters (date, type, categories, amount, payment, description) are *views over
 * specific top-level nodes of that tree*, recognised by shape - they are never a
 * second copy that could disagree with the Advanced editor. Everything the user
 * builds - chips, preview, request body, cache key, export - derives from it.
 *
 * Client-only bookkeeping on nodes (`id`, `raw`, `preset`) is stripped by `toWire`.
 */
import type {
  FieldKind,
  FilterCondition,
  FilterGroup,
  FilterNode,
  FilterOperator,
  GroupOp,
  PaymentMethod,
  QueryField,
  SortKey,
  TransactionType,
} from "@/shared/types/transactionQuery";
import { FIELD_CAPABILITIES, QUERY_LIMITS } from "@/shared/types/transactionQuery";
import {
  addDaysYmd,
  addMonthsYmd,
  compareYmd,
  diffDaysYmd,
  endOfMonthYmd,
  formatMonthYmd,
  formatYmd,
  isValidYmd,
  startOfMonthYmd,
  type Ymd,
} from "@/shared/utils/ledgerDate";
import {
  MAX_TRANSACTION_AMOUNT_MINOR,
  currencyMinorUnitDigits,
  formatCurrency,
  parseAmountToMinor,
} from "@/shared/utils/formatCurrency";

// ------------------------------------------------------------------ types

export type DatePreset = "today" | "7d" | "month" | "all";

export type FilterValue = string | number | Array<string | number>;

export type FilterConditionNode = {
  id: string;
  kind: "condition";
  field: QueryField;
  operator: FilterOperator;
  value?: FilterValue;
  /** Editor text for NUMBER/DATE/TIMESTAMP inputs (one entry per input). Never sent. */
  raw?: string[];
  /** Rolling date preset that produced this `occurredOn` range. Never sent. */
  preset?: DatePreset;
};

export type FilterGroupNode = {
  id: string;
  kind: "group";
  op: GroupOp;
  children: FilterNodeLocal[];
};

export type FilterNodeLocal = FilterConditionNode | FilterGroupNode;

/** Root of every expression: a top-level AND group. */
export type FilterRoot = FilterGroupNode;

export type SortState = SortKey[];

export type ModelContext = {
  currency: string;
  /** Book IANA time zone; used for timestamp inputs and "today". */
  timezone: string;
};

// ------------------------------------------------------------------ fields

export type FieldMeta = {
  field: QueryField;
  label: string;
  kind: FieldKind;
  nullable: boolean;
  operators: readonly FilterOperator[];
  /** Read-only record metadata is grouped separately in the picker. */
  metadata: boolean;
};

const FIELD_LABELS: Record<QueryField, string> = {
  id: "Transaction ID",
  type: "Type",
  amountMinor: "Amount",
  occurredOn: "Date",
  occurredAt: "Time of event",
  categoryId: "Category",
  categoryName: "Category name",
  paymentMethod: "Payment method",
  title: "Title",
  note: "Note",
  description: "Description (title or note)",
  createdAt: "Created",
  updatedAt: "Updated",
  externalId: "Import ID",
};

const METADATA_FIELDS = new Set<QueryField>(["id", "createdAt", "updatedAt", "externalId"]);

export const FIELD_ORDER: QueryField[] = [
  "description",
  "title",
  "note",
  "amountMinor",
  "occurredOn",
  "type",
  "categoryId",
  "categoryName",
  "paymentMethod",
  "occurredAt",
  "id",
  "createdAt",
  "updatedAt",
  "externalId",
];

export const FIELDS: FieldMeta[] = FIELD_ORDER.map((field) => ({
  field,
  label: FIELD_LABELS[field],
  kind: FIELD_CAPABILITIES[field].kind,
  nullable: FIELD_CAPABILITIES[field].nullable,
  operators: FIELD_CAPABILITIES[field].operators,
  metadata: METADATA_FIELDS.has(field),
}));

export function fieldMeta(field: QueryField): FieldMeta {
  return FIELDS.find((f) => f.field === field) as FieldMeta;
}

export const TYPE_OPTIONS: Array<{ value: TransactionType; label: string }> = [
  { value: "EXPENSE", label: "Expense" },
  { value: "INCOME", label: "Income" },
];

export const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "WALLET", label: "Wallet" },
  { value: "OTHER", label: "Other" },
];

export const SORT_FIELD_LABELS: Record<QueryField, string> = {
  ...FIELD_LABELS,
  occurredOn: "Date",
  amountMinor: "Amount",
  description: "Description",
  createdAt: "Created",
  updatedAt: "Updated",
  categoryId: "Category ID",
  categoryName: "Category",
  id: "Transaction ID",
  externalId: "Import ID",
};

function operatorLabelFor(op: FilterOperator, kind: FieldKind) {
  const ordered = kind === "NUMBER";
  switch (op) {
    case "EQ":
      return "is";
    case "NE":
      return "is not";
    case "IN":
      return "is any of";
    case "NOT_IN":
      return "is none of";
    case "GT":
      return ordered ? "is greater than" : "is after";
    case "GTE":
      return ordered ? "is at least" : "is on or after";
    case "LT":
      return ordered ? "is less than" : "is before";
    case "LTE":
      return ordered ? "is at most" : "is on or before";
    case "BETWEEN":
      return "is between";
    case "CONTAINS":
      return "contains";
    case "NOT_CONTAINS":
      return "does not contain";
    case "STARTS_WITH":
      return "starts with";
    case "ENDS_WITH":
      return "ends with";
    case "IS_NULL":
      return "is empty";
    case "IS_NOT_NULL":
      return "has a value";
  }
}

export function operatorLabel(field: QueryField, op: FilterOperator) {
  if (field === "paymentMethod" && op === "IS_NULL") return "is not specified";
  return operatorLabelFor(op, fieldMeta(field).kind);
}

const NO_VALUE_OPS: FilterOperator[] = ["IS_NULL", "IS_NOT_NULL"];
const LIST_OPS: FilterOperator[] = ["IN", "NOT_IN"];

export function operatorTakesValue(op: FilterOperator) {
  return !NO_VALUE_OPS.includes(op);
}
export function operatorIsList(op: FilterOperator) {
  return LIST_OPS.includes(op);
}
/** Number of text inputs an operator needs for typed (NUMBER/DATE/TIMESTAMP) values. */
export function inputCount(op: FilterOperator) {
  return op === "BETWEEN" ? 2 : operatorTakesValue(op) && !operatorIsList(op) ? 1 : 0;
}

// ------------------------------------------------------------------ construction

let idCounter = 0;
export function nodeId(prefix = "n") {
  idCounter += 1;
  return `${prefix}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function makeCondition(
  field: QueryField,
  operator: FilterOperator,
  value?: FilterValue,
  extra: Partial<Pick<FilterConditionNode, "raw" | "preset">> = {}
): FilterConditionNode {
  const node: FilterConditionNode = { id: nodeId("c"), kind: "condition", field, operator };
  if (value !== undefined) node.value = value;
  if (extra.raw) node.raw = extra.raw;
  if (extra.preset) node.preset = extra.preset;
  return node;
}

export function makeGroup(op: GroupOp, children: FilterNodeLocal[] = []): FilterGroupNode {
  return { id: nodeId("g"), kind: "group", op, children };
}

export function emptyRoot(): FilterRoot {
  return makeGroup("AND");
}

/** A fresh, blank condition for the Advanced editor's "Add condition". */
export function blankCondition(): FilterConditionNode {
  return makeCondition("description", "CONTAINS");
}

/** A field switch resets operator + value, since the two are not portable across kinds. */
export function conditionForField(field: QueryField): FilterConditionNode {
  const meta = fieldMeta(field);
  return makeCondition(field, meta.operators[0]);
}

// ------------------------------------------------------------------ tree operations (immutable)

export function mapTree(node: FilterNodeLocal, fn: (n: FilterNodeLocal) => FilterNodeLocal | null): FilterNodeLocal | null {
  const mapped = fn(node);
  if (!mapped) return null;
  if (mapped.kind === "group") {
    return {
      ...mapped,
      children: mapped.children.map((c) => mapTree(c, fn)).filter((c): c is FilterNodeLocal => c !== null),
    };
  }
  return mapped;
}

export function findNode(root: FilterNodeLocal, id: string): FilterNodeLocal | null {
  if (root.id === id) return root;
  if (root.kind === "group") {
    for (const child of root.children) {
      const hit = findNode(child, id);
      if (hit) return hit;
    }
  }
  return null;
}

function replaceNode(root: FilterRoot, id: string, fn: (n: FilterNodeLocal) => FilterNodeLocal | null): FilterRoot {
  const next = mapTree(root, (n) => (n.id === id ? fn(n) : n));
  return (next as FilterRoot) ?? root;
}

export function updateCondition(
  root: FilterRoot,
  id: string,
  patch: Partial<Omit<FilterConditionNode, "id" | "kind">>
): FilterRoot {
  return replaceNode(root, id, (n) => (n.kind === "condition" ? { ...n, ...patch } : n));
}

export function removeNode(root: FilterRoot, id: string): FilterRoot {
  if (root.id === id) return { ...root, children: [] };
  return replaceNode(root, id, () => null);
}

export function setGroupOp(root: FilterRoot, id: string, op: GroupOp): FilterRoot {
  return replaceNode(root, id, (n) => (n.kind === "group" ? { ...n, op } : n));
}

export function addChild(root: FilterRoot, groupId: string, child: FilterNodeLocal): FilterRoot {
  return replaceNode(root, groupId, (n) => (n.kind === "group" ? { ...n, children: [...n.children, child] } : n));
}

/** "Add group": a nested group is never left empty (the server rejects those), so it starts with one blank condition. */
export function addGroup(root: FilterRoot, parentId: string, op: GroupOp = "OR"): FilterRoot {
  return addChild(root, parentId, makeGroup(op, [blankCondition()]));
}

export function moveChild(root: FilterRoot, groupId: string, from: number, to: number): FilterRoot {
  return replaceNode(root, groupId, (n) => {
    if (n.kind !== "group") return n;
    if (from < 0 || from >= n.children.length || to < 0 || to >= n.children.length || from === to) return n;
    const children = [...n.children];
    const [item] = children.splice(from, 1);
    children.splice(to, 0, item);
    return { ...n, children };
  });
}

export function clearAll(): FilterRoot {
  return emptyRoot();
}

export function depthOf(node: FilterNodeLocal): number {
  if (node.kind === "condition") return 0;
  return 1 + Math.max(0, ...node.children.map(depthOf));
}

export function countConditions(node: FilterNodeLocal): number {
  if (node.kind === "condition") return 1;
  return node.children.reduce((n, c) => n + countConditions(c), 0);
}

// ------------------------------------------------------------------ typed input parsing

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const TIME = /^(\d{2}):(\d{2})$/;

export function isUuid(value: string) {
  return UUID.test(value.trim());
}

/** UTC offset (minutes) of `timeZone` at the instant `utcMs`. */
function zoneOffsetMinutes(timeZone: string, utcMs: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - utcMs) / 60_000);
}

/** Wall-clock `ymd hh:mm` in `timeZone` to an ISO instant. `endOfDay` gives 23:59:59.999999. */
export function zonedToIso(ymd: Ymd, hhmm: string | null, timeZone: string, endOfDay: boolean): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hhmm ? hhmm.split(":").map(Number) : endOfDay ? [23, 59] : [0, 0];
  const wall = Date.UTC(y, m - 1, d, hh, mm, endOfDay && !hhmm ? 59 : 0);
  let utc = wall - zoneOffsetMinutes(timeZone, wall) * 60_000;
  // The offset can differ at the corrected instant (DST edge); one more pass settles it.
  utc = wall - zoneOffsetMinutes(timeZone, utc) * 60_000;
  const iso = new Date(utc).toISOString();
  return endOfDay && !hhmm ? iso.replace(".000Z", ".999999Z") : iso.replace(".000Z", "Z");
}

type ParsedInput = { value: string | number } | { error: string };

/**
 * Parses one typed input. NUMBER uses exact minor-unit parsing (no float maths, no
 * silent rounding); DATE must be a real calendar day; TIMESTAMP takes `YYYY-MM-DD`
 * or `YYYY-MM-DD HH:mm` in the book's time zone.
 */
export function parseTypedInput(
  field: QueryField,
  operator: FilterOperator,
  index: number,
  text: string,
  ctx: ModelContext
): ParsedInput {
  const kind = fieldMeta(field).kind;
  const trimmed = text.trim();
  if (trimmed === "") return { error: "Enter a value." };

  if (kind === "NUMBER") {
    const minor = parseAmountToMinor(trimmed, ctx.currency);
    if (minor === null) {
      const digits = currencyMinorUnitDigits(ctx.currency);
      return {
        error: `Enter a non-negative amount${digits > 0 ? ` with at most ${digits} decimals` : " without decimals"}, up to ${MAX_TRANSACTION_AMOUNT_MINOR.toLocaleString("en-US")} minor units.`,
      };
    }
    return { value: minor };
  }

  if (kind === "DATE") {
    return isValidYmd(trimmed) ? { value: trimmed } : { error: "Use a real date as YYYY-MM-DD." };
  }

  if (kind === "TIMESTAMP") {
    const [datePart, timePart, ...rest] = trimmed.split(/[ T]/);
    if (rest.length > 0 || !isValidYmd(datePart)) return { error: "Use YYYY-MM-DD or YYYY-MM-DD HH:mm." };
    let hhmm: string | null = null;
    if (timePart !== undefined) {
      const t = TIME.exec(timePart);
      if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) return { error: "Time must be HH:mm (24-hour)." };
      hhmm = timePart;
    }
    // A bare date reads as the whole day: "after" / "on or before" / the upper end of a range
    // mean the end of that day, everything else its start.
    const endOfDay = operator === "GT" || operator === "LTE" || (operator === "BETWEEN" && index === 1);
    try {
      return { value: zonedToIso(datePart, hhmm, ctx.timezone, endOfDay) };
    } catch {
      return { error: "Unknown time zone for this book." };
    }
  }

  return { value: trimmed };
}

export function minorToDecimalText(minor: number, currency: string) {
  const digits = currencyMinorUnitDigits(currency);
  const text = String(minor).padStart(digits + 1, "0");
  return digits === 0 ? text : `${text.slice(0, -digits)}.${text.slice(-digits)}`;
}

/**
 * The text an editor should show for a condition's typed input(s). Conditions made by the
 * quick filters carry a value but no editor text, so it is derived from the value.
 */
export function nodeRaw(n: FilterConditionNode, ctx: ModelContext): string[] {
  const count = Math.max(1, inputCount(n.operator));
  const kind = fieldMeta(n.field).kind;
  const values = Array.isArray(n.value) ? n.value : n.value !== undefined ? [n.value] : [];
  return Array.from({ length: count }, (_, i) => {
    const typed = n.raw?.[i];
    if (typed !== undefined) return typed;
    const v = values[i];
    if (v === undefined) return "";
    return kind === "NUMBER" && typeof v === "number" ? minorToDecimalText(v, ctx.currency) : String(v);
  });
}

/** Recomputes `value` from the editor text; an invalid input leaves `value` unset so validation flags it. */
export function setConditionInput(
  root: FilterRoot,
  id: string,
  index: number,
  text: string,
  ctx: ModelContext
): FilterRoot {
  return replaceNode(root, id, (n) => {
    if (n.kind !== "condition") return n;
    const raw = nodeRaw(n, ctx);
    raw[index] = text;
    return { ...n, raw, value: valueFromRaw(n.field, n.operator, raw, ctx) };
  });
}

function valueFromRaw(field: QueryField, op: FilterOperator, raw: string[], ctx: ModelContext): FilterValue | undefined {
  const parsed = raw.map((text, i) => parseTypedInput(field, op, i, text, ctx));
  if (parsed.some((p) => "error" in p)) return undefined;
  const values = parsed.map((p) => (p as { value: string | number }).value);
  return op === "BETWEEN" ? values : values[0];
}

/** Free-text list input (IN / NOT_IN on a UUID field): IDs separated by commas or whitespace. */
export function setConditionListText(root: FilterRoot, id: string, text: string): FilterRoot {
  return replaceNode(root, id, (n) => {
    if (n.kind !== "condition") return n;
    const tokens = text.split(/[\s,]+/).filter(Boolean);
    const next: FilterConditionNode = { ...n, raw: [text] };
    if (tokens.length > 0) next.value = tokens;
    else delete next.value;
    return next;
  });
}

export function changeField(root: FilterRoot, id: string, field: QueryField): FilterRoot {
  return replaceNode(root, id, (n) => (n.kind === "condition" ? { ...conditionForField(field), id: n.id } : n));
}

export function changeOperator(
  root: FilterRoot,
  id: string,
  operator: FilterOperator,
  ctx: ModelContext
): FilterRoot {
  return replaceNode(root, id, (n) => {
    if (n.kind !== "condition") return n;
    const next: FilterConditionNode = { ...n, operator };
    const wasList = operatorIsList(n.operator);
    const isList = operatorIsList(operator);
    const wasTyped = inputCount(n.operator);
    const isTyped = inputCount(operator);
    const kind = fieldMeta(n.field).kind;

    if (!operatorTakesValue(operator)) {
      delete next.value;
      delete next.raw;
    } else if (wasList !== isList) {
      // Single <-> list: keep the picked members where they carry over.
      const current = Array.isArray(n.value) ? n.value : n.value !== undefined ? [n.value] : [];
      if (isList) next.value = current.length > 0 ? current : undefined;
      else next.value = current[0];
      if (next.value === undefined) delete next.value;
      delete next.raw;
    } else if (wasTyped !== isTyped || (kind === "TIMESTAMP" && wasTyped)) {
      // Typed inputs change count (or their day-boundary meaning): re-derive from what was typed.
      const previous = nodeRaw(n, ctx);
      const raw = Array.from({ length: Math.max(1, isTyped) }, (_, i) => previous[i] ?? previous[0] ?? "");
      if (previous.some((t) => t.trim())) {
        next.raw = raw;
        const v = valueFromRaw(n.field, operator, raw, ctx);
        if (v === undefined) delete next.value;
        else next.value = v;
      } else {
        delete next.value;
        delete next.raw;
      }
    } else if (!operatorTakesValue(n.operator)) {
      delete next.value;
      delete next.raw;
    }
    return next;
  });
}

export function setConditionValue(root: FilterRoot, id: string, value: FilterValue | undefined): FilterRoot {
  return replaceNode(root, id, (n) => {
    if (n.kind !== "condition") return n;
    const next = { ...n };
    if (value === undefined || (Array.isArray(value) && value.length === 0)) delete next.value;
    else next.value = value;
    return next;
  });
}

// ------------------------------------------------------------------ validation

export type ValidationResult = {
  valid: boolean;
  /** Per-node messages, keyed by node id. */
  nodeErrors: Record<string, string>;
  /** Tree-wide limit violations. */
  treeErrors: string[];
};

function codePoints(s: string) {
  return Array.from(s).length;
}

function validateCondition(c: FilterConditionNode): string | null {
  const meta = fieldMeta(c.field);
  if (!meta.operators.includes(c.operator)) return "This operator is not supported for the field.";
  if (!operatorTakesValue(c.operator)) return null;

  const v = c.value;
  if (v === undefined || v === null) {
    if (c.raw && c.raw.some((t) => t.trim())) return "Fix the highlighted value.";
    return "Enter a value.";
  }

  if (operatorIsList(c.operator)) {
    if (!Array.isArray(v) || v.length === 0) return "Pick at least one value.";
    if (v.length > QUERY_LIMITS.maxInValues) return `Pick at most ${QUERY_LIMITS.maxInValues} values.`;
    if (meta.kind === "UUID" && v.some((x) => typeof x !== "string" || !isUuid(x))) return "Invalid ID.";
    return null;
  }

  if (c.operator === "BETWEEN") {
    if (!Array.isArray(v) || v.length !== 2) return "Enter both ends of the range.";
    if (v[0] > v[1]) return "The range start must not be after its end.";
    return null;
  }

  if (Array.isArray(v)) return "Enter a single value.";
  if (meta.kind === "TEXT") {
    const text = String(v).trim();
    if (!text) return "Enter some text.";
    if (codePoints(text) > QUERY_LIMITS.maxTextChars) return `At most ${QUERY_LIMITS.maxTextChars} characters.`;
    if (text.includes("\u0000")) return "Text cannot contain a NUL character.";
  }
  if (meta.kind === "UUID" && !isUuid(String(v))) return "Enter a valid transaction ID (UUID).";
  if (meta.kind === "ENUM" && typeof v !== "string") return "Pick a value.";
  return null;
}

/**
 * What the request adds to the tree on screen. The server enforces its depth/condition limits on the
 * request: an OR root is wrapped in an AND (one more level), and a tree without a date range gets the
 * analysis window appended (one more condition). Counting only the tree let a "valid" filter come back
 * as a 400.
 */
export function requestOverhead(root: FilterRoot): { levels: number; conditions: number } {
  return { levels: root.op === "OR" ? 1 : 0, conditions: slotNodes(root).date ? 0 : 1 };
}

export function validateTree(root: FilterRoot): ValidationResult {
  const nodeErrors: Record<string, string> = {};
  const treeErrors: string[] = [];

  const walk = (node: FilterNodeLocal, isRoot: boolean) => {
    if (node.kind === "condition") {
      const message = validateCondition(node);
      if (message) nodeErrors[node.id] = message;
      return;
    }
    if (node.children.length === 0 && !isRoot) nodeErrors[node.id] = "A group needs at least one condition.";
    if (node.children.length === 0 && isRoot && node.op === "OR") nodeErrors[node.id] = "An OR needs at least one condition.";
    node.children.forEach((c) => walk(c, false));
  };
  walk(root, true);

  const overhead = requestOverhead(root);
  if (depthOf(root) + overhead.levels > QUERY_LIMITS.maxDepth)
    treeErrors.push(
      `Groups can nest at most ${QUERY_LIMITS.maxDepth} levels deep${overhead.levels ? " (an OR at the top counts as an extra level)" : ""}.`
    );
  if (countConditions(root) + overhead.conditions > QUERY_LIMITS.maxConditions)
    treeErrors.push(
      `At most ${QUERY_LIMITS.maxConditions} conditions are allowed${overhead.conditions ? " (a date range is added when you set none)" : ""}.`
    );

  return { valid: Object.keys(nodeErrors).length === 0 && treeErrors.length === 0, nodeErrors, treeErrors };
}

/** Depth the group *at* `groupId` sits at, top-level = 1. Used to disable "Add group" past the limit. */
export function groupLevel(root: FilterRoot, groupId: string): number {
  const walk = (n: FilterNodeLocal, level: number): number => {
    if (n.id === groupId) return level;
    if (n.kind === "group") {
      for (const c of n.children) {
        const hit = walk(c, level + 1);
        if (hit) return hit;
      }
    }
    return 0;
  };
  return walk(root, 1);
}

// ------------------------------------------------------------------ wire form + canonical key

function wireValue(c: FilterConditionNode): FilterCondition["value"] {
  const v = c.value;
  if (v === undefined) return undefined;
  if (fieldMeta(c.field).kind === "TEXT" && typeof v === "string") return v.trim();
  return v;
}

/** Drops client-only fields; key order is fixed so equal expressions serialise identically. */
export function toWire(node: FilterNodeLocal): FilterNode {
  if (node.kind === "group") {
    return { kind: "group", op: node.op, children: node.children.map(toWire) };
  }
  const value = operatorTakesValue(node.operator) ? wireValue(node) : undefined;
  return value === undefined
    ? { kind: "condition", field: node.field, operator: node.operator }
    : { kind: "condition", field: node.field, operator: node.operator, value };
}

/** Order-insensitive within a group: reordering conditions does not change the query, so it must not change the key. */
export function canonicalKey(node: FilterNode): string {
  if (node.kind === "group") {
    const kids = node.children.map(canonicalKey).sort();
    return `${node.op}(${kids.join(",")})`;
  }
  const v = node.value === undefined ? "" : JSON.stringify(node.value);
  return `${node.field}.${node.operator}:${v}`;
}

export function sortKey(sort: SortState) {
  return sort.map((s) => `${s.field}:${s.direction}`).join(",");
}

export const DEFAULT_SORT: SortState = [
  { field: "occurredOn", direction: "DESC" },
  { field: "createdAt", direction: "DESC" },
  { field: "id", direction: "DESC" },
];

/** At most 3 keys, no repeated field. Empty means "server default". */
export function sanitizeSort(sort: SortState): SortState {
  const seen = new Set<QueryField>();
  const out: SortState = [];
  for (const key of sort) {
    if (seen.has(key.field)) continue;
    seen.add(key.field);
    out.push({ field: key.field, direction: key.direction === "ASC" ? "ASC" : "DESC" });
    if (out.length === QUERY_LIMITS.maxSortKeys) break;
  }
  return out;
}

/** Day headers are only honest when the list is ordered by date first. */
export function isDatePrimarySort(sort: SortState) {
  return sort.length === 0 || sort[0].field === "occurredOn";
}

// ------------------------------------------------------------------ date presets

export const ALL_WINDOW_YEARS_BACK = 5;

/**
 * "All dates" still needs a concrete window (analyze requires one, at most 5 years).
 * It is the last ~4 years plus the next year, and the UI says so - it is never a
 * silent cut-off.
 */
export function allDatesWindow(today: Ymd): { startDate: Ymd; endDate: Ymd } {
  const endDate = addMonthsYmd(today, 12);
  const startDate = addDaysYmd(addMonthsYmd(endDate, -12 * ALL_WINDOW_YEARS_BACK), 2);
  return { startDate, endDate };
}

export function resolveDatePreset(preset: DatePreset, today: Ymd): { startDate: Ymd; endDate: Ymd } {
  switch (preset) {
    case "today":
      return { startDate: today, endDate: today };
    case "7d":
      return { startDate: addDaysYmd(today, -6), endDate: today };
    case "month":
      return { startDate: startOfMonthYmd(today), endDate: endOfMonthYmd(today) };
    case "all":
      return allDatesWindow(today);
  }
}

// ------------------------------------------------------------------ quick filters (views over the tree)

export type QuickState = {
  date: { startDate: Ymd; endDate: Ymd; preset?: DatePreset } | null;
  type: TransactionType | null;
  categoryIds: string[];
  amountMinMinor: number | null;
  amountMaxMinor: number | null;
  paymentMethods: PaymentMethod[];
  paymentUnspecified: boolean;
  description: string;
};

const isCond = (n: FilterNodeLocal, field: QueryField, op: FilterOperator): n is FilterConditionNode =>
  n.kind === "condition" && n.field === field && n.operator === op;

function isPaymentNode(n: FilterNodeLocal): boolean {
  if (isCond(n, "paymentMethod", "IN") || isCond(n, "paymentMethod", "IS_NULL")) return true;
  return (
    n.kind === "group" &&
    n.op === "OR" &&
    n.children.length === 2 &&
    n.children.some((c) => isCond(c, "paymentMethod", "IN")) &&
    n.children.some((c) => isCond(c, "paymentMethod", "IS_NULL"))
  );
}

type Slot = "date" | "type" | "category" | "amountMin" | "amountMax" | "payment" | "description";

function slotOf(n: FilterNodeLocal): Slot | null {
  if (isCond(n, "occurredOn", "BETWEEN")) return "date";
  if (isCond(n, "type", "EQ")) return "type";
  if (isCond(n, "categoryId", "IN")) return "category";
  if (isCond(n, "amountMinor", "GTE")) return "amountMin";
  if (isCond(n, "amountMinor", "LTE")) return "amountMax";
  if (isCond(n, "description", "CONTAINS")) return "description";
  if (isPaymentNode(n)) return "payment";
  return null;
}

/** The first top-level node of each slot is the quick filter; later duplicates stay Advanced-only. */
function slotNodes(root: FilterRoot): Partial<Record<Slot, FilterNodeLocal>> {
  if (root.op !== "AND") return {};
  const found: Partial<Record<Slot, FilterNodeLocal>> = {};
  for (const child of root.children) {
    const slot = slotOf(child);
    if (slot && !found[slot]) found[slot] = child;
  }
  return found;
}

export function readQuick(root: FilterRoot): QuickState {
  const s = slotNodes(root);
  const date = s.date as FilterConditionNode | undefined;
  const dateValue = date?.value;
  const payment = s.payment;
  let paymentMethods: PaymentMethod[] = [];
  let paymentUnspecified = false;
  if (payment) {
    const parts = payment.kind === "group" ? payment.children : [payment];
    for (const p of parts) {
      if (p.kind !== "condition") continue;
      if (p.operator === "IS_NULL") paymentUnspecified = true;
      else if (Array.isArray(p.value)) paymentMethods = p.value as PaymentMethod[];
    }
  }
  const amountMin = s.amountMin as FilterConditionNode | undefined;
  const amountMax = s.amountMax as FilterConditionNode | undefined;
  return {
    date:
      date && Array.isArray(dateValue) && typeof dateValue[0] === "string" && typeof dateValue[1] === "string"
        ? { startDate: dateValue[0], endDate: dateValue[1], preset: date.preset }
        : null,
    type: ((s.type as FilterConditionNode | undefined)?.value as TransactionType | undefined) ?? null,
    categoryIds: (Array.isArray((s.category as FilterConditionNode | undefined)?.value)
      ? ((s.category as FilterConditionNode).value as string[])
      : []) as string[],
    amountMinMinor: typeof amountMin?.value === "number" ? amountMin.value : null,
    amountMaxMinor: typeof amountMax?.value === "number" ? amountMax.value : null,
    paymentMethods,
    paymentUnspecified,
    description: typeof (s.description as FilterConditionNode | undefined)?.value === "string" ? ((s.description as FilterConditionNode).value as string) : "",
  };
}

function setSlot(root: FilterRoot, slot: Slot, node: FilterNodeLocal | null): FilterRoot {
  const existing = slotNodes(root)[slot];
  if (existing) {
    const children = node
      ? root.children.map((c) => (c.id === existing.id ? node : c))
      : root.children.filter((c) => c.id !== existing.id);
    return { ...root, children };
  }
  return node ? { ...root, children: [...root.children, node] } : root;
}

/** Quick filters only exist on an AND root; an OR root is wrapped so nothing is silently rewritten. */
function ensureAndRoot(root: FilterRoot): FilterRoot {
  return root.op === "AND" ? root : makeGroup("AND", [root]);
}

export function setQuickDate(
  root: FilterRoot,
  range: { startDate: Ymd; endDate: Ymd; preset?: DatePreset } | null
): FilterRoot {
  const base = ensureAndRoot(root);
  if (!range) return setSlot(base, "date", null);
  const [startDate, endDate] =
    compareYmd(range.startDate, range.endDate) <= 0 ? [range.startDate, range.endDate] : [range.endDate, range.startDate];
  const existing = slotNodes(base).date;
  const node = makeCondition("occurredOn", "BETWEEN", [startDate, endDate], range.preset ? { preset: range.preset } : {});
  if (existing) node.id = existing.id;
  return setSlot(base, "date", node);
}

export function setQuickType(root: FilterRoot, type: TransactionType | null): FilterRoot {
  const base = ensureAndRoot(root);
  return setSlot(base, "type", type ? makeCondition("type", "EQ", type) : null);
}

export function setQuickCategories(root: FilterRoot, ids: string[]): FilterRoot {
  const base = ensureAndRoot(root);
  return setSlot(base, "category", ids.length > 0 ? makeCondition("categoryId", "IN", [...ids]) : null);
}

export function setQuickAmount(root: FilterRoot, min: number | null, max: number | null): FilterRoot {
  let next = ensureAndRoot(root);
  next = setSlot(next, "amountMin", min === null ? null : makeCondition("amountMinor", "GTE", min));
  next = setSlot(next, "amountMax", max === null ? null : makeCondition("amountMinor", "LTE", max));
  return next;
}

export function setQuickPayment(root: FilterRoot, methods: PaymentMethod[], unspecified: boolean): FilterRoot {
  const base = ensureAndRoot(root);
  let node: FilterNodeLocal | null = null;
  const inCond = methods.length > 0 ? makeCondition("paymentMethod", "IN", [...methods]) : null;
  const nullCond = unspecified ? makeCondition("paymentMethod", "IS_NULL") : null;
  if (inCond && nullCond) node = makeGroup("OR", [inCond, nullCond]);
  else node = inCond ?? nullCond;
  return setSlot(base, "payment", node);
}

export function setQuickDescription(root: FilterRoot, text: string): FilterRoot {
  const base = ensureAndRoot(root);
  const trimmed = text.trim();
  return setSlot(base, "description", trimmed ? makeCondition("description", "CONTAINS", trimmed) : null);
}

/** Re-resolves rolling presets (Today / 7 days / This month / All) against `today`; custom ranges are untouched. */
export function refreshPresets(root: FilterRoot, today: Ymd): FilterRoot {
  let changed = false;
  const next = mapTree(root, (n) => {
    if (n.kind !== "condition" || !n.preset) return n;
    const { startDate, endDate } = resolveDatePreset(n.preset, today);
    const cur = n.value;
    if (Array.isArray(cur) && cur[0] === startDate && cur[1] === endDate) return n;
    changed = true;
    return { ...n, value: [startDate, endDate] };
  });
  return changed ? (next as FilterRoot) : root;
}

export function defaultRoot(today: Ymd): FilterRoot {
  return setQuickDate(emptyRoot(), { ...resolveDatePreset("today", today), preset: "today" });
}

// ------------------------------------------------------------------ drill-down (Insights -> Activity)

/**
 * `AND(parentExpression, occurredOn within window, categoryId = id, type = t)`.
 *
 * The parent's own date slot is replaced by the analysed window/bucket, so the rows shown are
 * exactly the rows the figure counted. Restrictions are appended to a top-level AND, never
 * inside a nested OR; an OR root is wrapped first (`setQuickDate` does that). Returns null when
 * the result would exceed the depth/condition limits, so the caller can say so instead of sending a
 * request the server rejects.
 */
export function drillRoot(
  root: FilterRoot,
  target: { window: { startDate: Ymd; endDate: Ymd }; categoryId?: string | null; type?: TransactionType | null }
): FilterRoot | null {
  const dated = setQuickDate(root, target.window);
  const extra: FilterNodeLocal[] = [];
  if (target.categoryId) extra.push(makeCondition("categoryId", "EQ", target.categoryId));
  if (target.type && readQuick(dated).type !== target.type) extra.push(makeCondition("type", "EQ", target.type));
  const next: FilterRoot = { ...dated, children: [...dated.children, ...extra] };
  // Structural limits only: ids come from the server's own analysis, so they are known-good values.
  return depthOf(next) > QUERY_LIMITS.maxDepth || countConditions(next) > QUERY_LIMITS.maxConditions ? null : next;
}

// ------------------------------------------------------------------ request building

export type BuiltQuery = {
  /** Filter sent to search and export (the effective window included). */
  filter: FilterNode;
  /** Filter sent to analyze: the same tree minus the date-slot condition, which the window carries. */
  analyzeFilter: FilterNode;
  window: { startDate: Ymd; endDate: Ymd };
  sort: SortState;
  /** Stable key for the filter + window (no sort, no paging). */
  filterHash: string;
  /** Stable key for filter + window + sort (no paging). */
  queryHash: string;
};

/**
 * Turns the canonical tree into request bodies. If the tree carries no date range the
 * "all dates" window is added explicitly to search *and* analyze so the rows and the
 * totals always describe the same set; the date chip says so.
 */
export function buildQuery(root: FilterRoot, sort: SortState, today: Ymd): BuiltQuery {
  const slots = slotNodes(root);
  const dateNode = slots.date as FilterConditionNode | undefined;
  const quickDate = readQuick(root).date;
  const window = quickDate
    ? { startDate: quickDate.startDate, endDate: quickDate.endDate }
    : allDatesWindow(today);

  const wireChildren = root.children.map(toWire);
  const analyzeChildren = root.children.filter((c) => c.id !== dateNode?.id).map(toWire);
  const windowCondition: FilterCondition = {
    kind: "condition",
    field: "occurredOn",
    operator: "BETWEEN",
    value: [window.startDate, window.endDate],
  };

  const filter: FilterNode = {
    kind: "group",
    op: root.op,
    children: dateNode ? wireChildren : root.op === "AND" ? [...wireChildren, windowCondition] : wireChildren,
  };
  // An OR root cannot take an extra AND sibling without changing meaning; wrap instead.
  const searchFilter: FilterNode =
    !dateNode && root.op === "OR" ? { kind: "group", op: "AND", children: [filter, windowCondition] } : filter;
  const analyzeFilter: FilterNode =
    root.op === "AND"
      ? { kind: "group", op: "AND", children: analyzeChildren }
      : { kind: "group", op: "OR", children: analyzeChildren };

  const cleanSort = sanitizeSort(sort);
  const filterHash = `${canonicalKey(searchFilter)}|${window.startDate}|${window.endDate}`;
  return {
    filter: searchFilter,
    analyzeFilter,
    window,
    sort: cleanSort,
    filterHash,
    queryHash: `${filterHash}|${sortKey(cleanSort)}`,
  };
}

// ------------------------------------------------------------------ readable text

export type DescribeContext = ModelContext & {
  categoryName: (id: string) => string;
  today: Ymd;
};

function formatValue(field: QueryField, v: string | number, ctx: DescribeContext, raw?: string): string {
  const meta = fieldMeta(field);
  if (meta.kind === "NUMBER" && typeof v === "number") return formatCurrency(v, ctx.currency);
  if (meta.kind === "DATE" && typeof v === "string") return formatYmd(v);
  if (meta.kind === "TIMESTAMP") return raw?.trim() || String(v);
  if (field === "categoryId" && typeof v === "string") return ctx.categoryName(v);
  if (field === "type") return TYPE_OPTIONS.find((o) => o.value === v)?.label ?? String(v);
  if (field === "paymentMethod") return PAYMENT_OPTIONS.find((o) => o.value === v)?.label ?? String(v);
  if (meta.kind === "TEXT") return `“${String(v)}”`;
  return String(v);
}

export function describeCondition(c: FilterConditionNode, ctx: DescribeContext): string {
  const label = FIELD_LABELS[c.field];
  const op = operatorLabel(c.field, c.operator);
  if (!operatorTakesValue(c.operator)) return `${label} ${op}`;
  const v = c.value;
  if (v === undefined) return `${label} ${op} …`;
  if (Array.isArray(v)) {
    if (c.operator === "BETWEEN") {
      return `${label} ${op} ${formatValue(c.field, v[0], ctx, c.raw?.[0])} and ${formatValue(c.field, v[1], ctx, c.raw?.[1])}`;
    }
    return `${label} ${op} ${v.map((x) => formatValue(c.field, x, ctx)).join(", ")}`;
  }
  return `${label} ${op} ${formatValue(c.field, v, ctx, c.raw?.[0])}`;
}

/** Full readable expression, e.g. `Type is Expense AND (Description contains “coffee” OR Amount is at least $100.00)`. */
export function describeExpression(node: FilterNodeLocal, ctx: DescribeContext, top = true): string {
  if (node.kind === "condition") return describeCondition(node, ctx);
  if (node.children.length === 0) return top ? "All transactions" : "(empty)";
  const parts = node.children.map((c) => describeExpression(c, ctx, false));
  if (parts.length === 1 && top) return parts[0];
  const joined = parts.join(` ${node.op} `);
  return top ? joined : `(${joined})`;
}

export function dateRangeLabel(range: { startDate: Ymd; endDate: Ymd; preset?: DatePreset }, ctx: DescribeContext) {
  const { startDate, endDate, preset } = range;
  if (preset === "today") return "Today";
  if (preset === "7d") return "Last 7 days";
  if (preset === "month") return formatMonthYmd(startDate);
  if (preset === "all") return "All dates";
  if (startDate === endDate) return formatYmd(startDate);
  const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4);
  if (startDate === startOfMonthYmd(startDate) && endDate === endOfMonthYmd(startDate) && startDate.slice(0, 7) === endDate.slice(0, 7)) {
    return formatMonthYmd(startDate);
  }
  return `${formatYmd(startDate, !sameYear)} – ${formatYmd(endDate)}`;
}

export type FilterChipModel = { id: string; label: string };

/** One chip per top-level node - quick or advanced - so every predicate that is applied is visible and removable. */
export function activeChips(root: FilterRoot, ctx: DescribeContext): FilterChipModel[] {
  const slots = slotNodes(root);
  const isSlot = (n: FilterNodeLocal, slot: Slot) => slots[slot]?.id === n.id;
  return root.children.map((n) => {
    if (n.kind === "condition") {
      if (isSlot(n, "date") && Array.isArray(n.value)) {
        return { id: n.id, label: dateRangeLabel({ startDate: String(n.value[0]), endDate: String(n.value[1]), preset: n.preset }, ctx) };
      }
      if (isSlot(n, "type")) return { id: n.id, label: n.value === "INCOME" ? "Income" : "Expenses" };
      if (isSlot(n, "category") && Array.isArray(n.value)) {
        const names = n.value.map((id) => ctx.categoryName(String(id)));
        return { id: n.id, label: names.length <= 2 ? names.join(", ") : `${names[0]} +${names.length - 1}` };
      }
      if (isSlot(n, "description")) return { id: n.id, label: `“${String(n.value)}”` };
    }
    if (isSlot(n, "payment")) {
      const q = readQuick({ ...root, children: [n] });
      const names = [
        ...q.paymentMethods.map((m) => PAYMENT_OPTIONS.find((o) => o.value === m)?.label ?? m),
        ...(q.paymentUnspecified ? ["Not specified"] : []),
      ];
      return { id: n.id, label: names.length <= 2 ? names.join(", ") : `${names[0]} +${names.length - 1}` };
    }
    return { id: n.id, label: describeExpression(n, ctx, false).replace(/^\((.*)\)$/, "$1") };
  });
}

/** True when the filter differs from "everything in the default window" - drives the Clear-all affordance. */
export function hasAdvancedNodes(root: FilterRoot): boolean {
  const slots = slotNodes(root);
  const slotIds = new Set(Object.values(slots).map((n) => n?.id));
  return root.op !== "AND" || root.children.some((c) => !slotIds.has(c.id));
}

/** Days between two ledger dates, inclusive - used for the analyze window guard message. */
export function windowDays(startDate: Ymd, endDate: Ymd) {
  return diffDaysYmd(startDate, endDate) + 1;
}
