# PennyWise Web: UI guide

The working agreement for every screen. Read this together with `docs/analysis.md` (API contract) before building.

## Design read

A personal-finance product UI for design-conscious consumers, in a premium "Ink & Signal" style. It is dark-first, with a
signal-green brand accent, and is built on customized shadcn/ui, Tailwind v4 and Motion.

Dials: variance 5, motion 6, density 6. The page layout is calm; interactions and data carry the motion.

## Hard rules

- **Copy:**
  - No emoji anywhere: no greeting emoji, no emoji empty states.
  - No em-dash or en-dash characters in visible text. Use a period, a comma, or a plain hyphen.
  - Keep copy short and concrete. One line beats a paragraph.
- **Color:**
  - One accent: `primary` (signal green).
  - Money colors come from `Money`. Never color an amount by hand.
  - Income is `text-income` and expense is `text-expense`.
  - A signed amount always prints its sign.
- **Shapes:**
  - Buttons, chips, toggles and segmented controls: `rounded-full`.
  - Cards: `rounded-xl` (22px). Hero surfaces: `rounded-2xl` (28px).
  - Inputs and small tiles: `rounded-lg` (14px).
- **Depth:**
  - Use `.surface` for cards and `.glass` for floating layers (dialogs, sheets, toasts, sticky headers).
  - No black drop shadows.
  - `.glow` only on the primary action and the active data point.
- **Typography:**
  - Words use Schibsted Grotesk (the default `font-sans`).
  - Money uses Sora with tabular figures through `.money`. `Money` and `AnimatedMoney` apply it for you.
  - Headings: `text-2xl md:text-3xl font-semibold tracking-tight`. No oversized H1s.
- **Icons:**
  - Use only `@/shared/ui/Icon`, which maps Phosphor icons to Ionicons-style names.
  - Use `CategoryIcon` for category tiles and `BookGlyph` for books.
  - Never import `@phosphor-icons/react` in feature code.
- **States:**
  - Every data view has a skeleton shaped like its content (`Skeleton`), an empty state (`EmptyState`) and an error
    state (`ErrorState` with retry).
  - Never use a bare spinner.
- **Motion:**
  - Motion should show what changed or confirm an action, never decorate.
  - Springs (`type: "spring", stiffness ~300-420, damping ~30`) for interactive elements.
  - `layoutId` for active indicators and shared elements.
  - Stagger list reveals (about 30-40 ms per item, capped at roughly the first 12 items).
  - Animate only `transform` and `opacity`.
  - Everything respects `useReducedMotion()`. The global CSS also kills durations.
- **Accessibility:**
  - Every icon-only button has an `aria-label`.
  - Focus is always visible (the global `:focus-visible` style).
  - Touch targets are 44px or larger on phones.
  - Labels sit above inputs. Errors go below the input, in `text-expense`, linked with `aria-describedby`.
  - Charts have a table or text alternative.
- **Layout:**
  - Mobile first.
  - At `lg` (1024px) and above the shell shows a sidebar, and pages use multi-panel grids and split views.
  - Below `md`, overlays become bottom sheets (`ResponsiveDialog` handles this).
  - Use `min-h-[100dvh]`, never `h-screen`.
  - Use CSS grid, not flex percentage math.

## Building blocks (import, do not re-create)

| Need | Use |
|---|---|
| Money figure | `Money`, `AnimatedMoney` from `@/shared/ui/Money` |
| Icons | `Icon`, `CategoryIcon`, `CATEGORY_ICON_NAMES`, `CATEGORY_COLORS` from `@/shared/ui/Icon` |
| Loading / empty / error | `Skeleton`, `EmptyState`, `ErrorState` from `@/shared/ui/states` |
| Dialog that becomes a bottom sheet | `ResponsiveDialog` from `@/shared/ui/ResponsiveDialog` |
| Segmented control | `Segmented` from `@/shared/ui/Segmented` |
| Breakpoints in JS | `useIsDesktop()` (lg), `useIsWide()` (md) from `@/shared/hooks/useMediaQuery` |
| Confirm / alert | `confirmDialog`, `confirmDestructive`, `alertCompat` from `@/shared/ui/utils/confirm` |
| Error toast | `useUndoToastStore.getState().showError(err, fallback)` |
| Open an editor anywhere | `useOverlay.getState().show({ kind: ... })` from `@/app/overlays` |
| shadcn primitives | `@/components/ui/*`: button, dialog, drawer, dropdown-menu, popover, tooltip, select, switch, tabs, input, label, textarea, checkbox, toggle-group, alert-dialog, command, kbd, scroll-area, sheet, separator, skeleton |

## Domain layer (ported from pennywise-mobile, reuse it)

- **Transactions:**
  - Queries and keys: `src/features/transactions/queries.ts` (`useSearchInfinite`, `useAnalysis`,
    `useActivityResults`, `useRecentTransactions`, `useWindowAnalysis`, `useTransactionDetail`,
    `invalidateTransactionData`).
  - Mutations: `actions.ts`.
- **Filters:**
  - `filterModel.ts` (the AND/OR tree, quick slots, `buildQuery`, describe, drill) and `filterStore.ts` (per
    account:book scope).
  - `useActivityFilters.ts` is the Activity hook. `sortModel.ts` holds `nextSort`, `reverseSort` and `describeSort`.
- **Books:**
  - `features/books/store.ts`, `coordinator.ts` (`selectBook`), `deleteBook.ts` and `reorder.ts`.
  - The UI open state is `features/books/ui/store.ts` (`useBookUIStore`).
- **Categories and budgets:** `features/categories/store.ts`, `features/budgets/store.ts`.
- **Home and settings:**
  - Home snapshot: `features/home-snapshot/*`.
  - Settings (appearance, display name, avatar seed): `features/settings/store.ts`.
- **Money parsing:** `parseAmountToMinor` and `formatCurrency` in `shared/utils/formatCurrency.ts`. Dates are
  book-local `YYYY-MM-DD` (`shared/utils/ledgerDate.ts`, `todayInTimeZone(book.timezone)`).

Data screens render from the persisted `selectedBookId` and the books list right away. Do not gate on `books.ready`
(it is false until the backend answers). TanStack queries pause while the backend wakes and resume on their own, so
render cached data when you have it and a skeleton when you do not.

## Routes and overlays

- **Routes:** `/` Home, `/activity` (and `/activity/:txId`, a detail split view on desktop and a sheet on phones),
  `/insights`, `/budgets`, `/settings`, `/welcome`, `/login`, `/signup`, `/onboarding`.
- **Overlays:** `src/app/OverlayHost.tsx` mounts them with `{ open, onOpenChange, ...payload }`:
  `AddTransactionDialog { type? }`, `CategoryEditorDialog { id?, type? }`, `BudgetEditorDialog { categoryId, month }`
  and `ImportDialog`.
- **Book sheets:** `<BookSheets />` reads `useBookUIStore` (switcher, menu, create, edit).
- **Shortcuts:** `N` new transaction, `/` search, `G H|A|I|B|P` navigation, Cmd/Ctrl+K palette.
