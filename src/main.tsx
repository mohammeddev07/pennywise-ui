import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { router } from "@/app/router";
import { PERSIST_MAX_AGE_MS, queryClient, queryPersister } from "@/shared/api/queryClient";
import { ACCESS_TOKEN_KEY } from "@/shared/api/client";
import "./index.css";

// Tabs share one token in localStorage. When another tab signs in or out, reload so this tab can never show one
// account's data under another account's token (or write it back into shared storage).
window.addEventListener("storage", (e) => {
  if (e.key === ACCESS_TOKEN_KEY || e.key === null) window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: PERSIST_MAX_AGE_MS,
        buster: "1",
        // Persist first pages only: enough to paint instantly, and it keeps localStorage (which also holds the
        // token) far from its quota no matter how far a ledger was scrolled.
        dehydrateOptions: {
          shouldDehydrateQuery: (q) =>
            q.state.status === "success" && !(((q.state.data as { pages?: unknown[] })?.pages?.length ?? 0) > 1),
        },
      }}
    >
      <TooltipProvider delayDuration={300}>
        <RouterProvider router={router} />
      </TooltipProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
