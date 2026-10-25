import { useEffect, useRef, useState } from "react";

export const TEXT_DEBOUNCE_MS = 300;

/**
 * Text that commits to the applied filter 300ms after the user stops typing.
 * `applied` is the filter's current value: when it changes from somewhere else (a
 * removed chip, Clear all) the input follows it, but the echo of our own commit
 * never overwrites what is being typed.
 */
export function useDebouncedText(applied: string, commit: (text: string) => void, delay = TEXT_DEBOUNCE_MS) {
  const [text, setTextState] = useState(applied);
  const lastCommitted = useRef(applied);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    if (applied !== lastCommitted.current) {
      lastCommitted.current = applied;
      if (timer.current) clearTimeout(timer.current);
      setTextState(applied);
    }
  }, [applied]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const setText = (next: string) => {
    setTextState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const trimmed = next.trim();
      if (trimmed === lastCommitted.current.trim()) return;
      lastCommitted.current = next;
      commitRef.current(next);
    }, delay);
  };

  return [text, setText] as const;
}
