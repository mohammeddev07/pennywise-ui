import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { proposeFilter } from "@/shared/api/aiFilter";
import { getApiErrorCode, getApiErrorMessage } from "@/shared/api/errors";
import { Icon } from "@/shared/ui/Icon";
import { ResponsiveDialog } from "@/shared/ui/ResponsiveDialog";
import { useDelayedFlag } from "@/shared/ui/utils/useDelayedFlag";
import { currencySymbol } from "@/shared/utils/formatCurrency";
import { fromWireFilter, fromWireSort } from "../aiFilterProposal";
import type { FilterRoot, SortState } from "../filterModel";
import { Chip } from "./Chip";

const MAX_CHARS = 500;

const examples = (currency: string) => [
  `Groceries over ${currencySymbol(currency)}50 last month`,
  "Biggest expenses this month",
  "Coffee purchases this month",
  "Uncategorized expenses",
];

/**
 * "Describe your filter": free text in, a complete replacement filter proposal out. Nothing is
 * applied here; a PROPOSAL is handed to the caller, which opens it in the Advanced editor for review.
 */
export function DescribeFilterSheet({
  open,
  onClose,
  bookId,
  currency,
  onProposal,
}: {
  open: boolean;
  onClose: () => void;
  bookId: string;
  currency: string;
  onProposal: (root: FilterRoot, sort: SortState, limitation: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const slow = useDelayedFlag(loading, 4000);
  const id = useId();

  // Closing or switching books drops whatever is in flight.
  useEffect(() => {
    if (open) return;
    controller.current?.abort();
    setText("");
    setLoading(false);
    setMessage(null);
  }, [open]);
  useEffect(() => () => controller.current?.abort(), [bookId]);

  const generate = async () => {
    const question = text.trim();
    if (!bookId || !question || loading) return;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setLoading(true);
    setMessage(null);
    try {
      const res = await proposeFilter(bookId, question, c.signal);
      if (c.signal.aborted) return;
      if (res.status === "PROPOSAL" && res.filter) {
        onProposal(fromWireFilter(res.filter), fromWireSort(res.sort), res.limitation ?? null);
        return;
      }
      setMessage(res.clarification ?? res.limitation ?? "Couldn't turn that into a filter. Try rephrasing, or use Advanced.");
    } catch (error) {
      if (c.signal.aborted) return;
      setMessage(
        getApiErrorCode(error) === "AI_FILTERS_DISABLED"
          ? "AI filters are turned off on this server. Use Advanced to build the filter by hand."
          : getApiErrorMessage(error, "Couldn't reach the AI provider. Try again, or use Advanced."),
      );
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Describe your filter"
      footer={
        <>
          {loading && (
            <Button
              variant="secondary"
              className="h-11 rounded-full px-5"
              onClick={() => {
                controller.current?.abort();
                setLoading(false);
              }}
            >
              Stop
            </Button>
          )}
          <Button className="glow h-11 rounded-full px-6 font-semibold" disabled={!text.trim() || loading} onClick={generate}>
            <Icon name="sparkles-outline" size={16} />
            {loading ? (slow ? "Still thinking" : "Generating") : "Generate"}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
        <Label htmlFor={id}>What do you want to see?</Label>
        <Textarea
          id={id}
          value={text}
          maxLength={MAX_CHARS}
          disabled={loading}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void generate();
          }}
          placeholder={examples(currency)[0]}
          aria-describedby={`${id}-hint`}
          className="min-h-24 rounded-lg"
        />
        <div id={`${id}-hint`} className="flex justify-between gap-3 text-xs text-muted-foreground">
          <span>Sent to our AI provider with this book's category names. You review it before anything changes.</span>
          <span className="money shrink-0">
            {text.length}/{MAX_CHARS}
          </span>
        </div>
      </form>

      {!text && !loading && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Examples">
          {examples(currency).map((ex) => (
            <Chip key={ex} onClick={() => setText(ex)}>
              {ex}
            </Chip>
          ))}
        </div>
      )}

      {loading && (
        <div aria-hidden className="mt-4 space-y-2">
          <div className="shimmer h-3 w-3/4 rounded-full" />
          <div className="shimmer h-3 w-1/2 rounded-full" />
        </div>
      )}

      {message && (
        <p role="alert" className="surface mt-4 rounded-lg p-3 text-sm">
          {message}
        </p>
      )}
    </ResponsiveDialog>
  );
}
