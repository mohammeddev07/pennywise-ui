# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

PennyWise Web is a Vite + React 19 + TypeScript PWA, at feature parity with the Expo app in `../pennywise-mobile`. It
talks to the Spring Boot API in `../pennywise`, hosted on Render's free tier. Read `docs/analysis.md` (API contract,
screen map) and `docs/ui-guide.md` (design rules, shared building blocks) before building UI.

## Commands

```sh
npm run dev                  # dev server; env comes from .env.development.local (see .env.example)
npm run build                # tsc -b && vite build (also emits the service worker)
npm test                     # vitest run (node env, TZ=Asia/Tokyo, against the in-memory mock backend)
npx vitest run src/features/transactions/__tests__/filterModel.test.ts   # one file
npx vitest run -t "reverses the server default"                          # one test by name
npm run typecheck            # tsc -b
npx oxlint src               # lint (warnings in files copied from mobile are left as-is)
npm run icons                # regenerate PWA/iOS icons from public/app-icon.svg
```

`VITE_MOCK_API=true` runs the whole app against `src/shared/api/mockAdapter.ts`, with no backend needed.

## Git

- `develop` is the default branch; never commit to `main`.
- Work on `feature/<kebab-case>` branches.
- Use conventional commit prefixes (`feat`, `fix`, `docs`, `chore`, `test`, `refactor`) and explain *why* in the
  body when it isn't obvious.

## Architecture

### Domain layer copied from mobile

Most of `src/shared/{types,utils,api,session}` and `src/features/**/*.ts` are copied verbatim from pennywise-mobile:
stores, the filter model, query keys, API modules and the mock backend.

- **Storage aliases:** two aliases in `vite.config.ts` and `tsconfig.app.json` point
  `@react-native-async-storage/async-storage` and `expo-secure-store` at `src/platform/*` (a localStorage adapter),
  so the copied Zustand stores run unchanged.
- **Keep those files diffable with mobile:** fix web behavior in web files where you can, and change shared logic
  once, at the root, when you must.
- **Files rewritten for the browser:**
  - `shared/api/client.ts`
  - `features/auth/{google,enterApp}.ts`
  - `shared/ui/utils/confirm.ts` (a promise-based dialog store rendered by `ConfirmHost`)
  - `shared/utils/exportFile.ts`
  - `shared/ui/theme/appearance.ts`
  - `features/books/coordinator.ts` (`setBookNavigation` takes an `isEditing()` callback)
- **Lint config:** `noUnused*` and `erasableSyntaxOnly` are off in `tsconfig.app.json` to match mobile.

### Server data and the Render cold start

These pieces work together:

1. **Wake ping (`src/shared/api/wake.ts`):** pings `/actuator/health` with backoff and drives TanStack
   `onlineManager`. Queries use networkMode `"online"`, so they *pause* while the backend sleeps and resume when it
   answers. Do not switch queries to `networkMode: "always"`.
2. **Axios client (`src/shared/api/client.ts`):**
   - At most 3 in-flight requests, matching the backend's admission cap.
   - Retries `OVERLOADED` / `DATABASE_UNAVAILABLE` after `Retry-After`.
   - Classifies hosting-layer failures with `isWakeError()` and re-triggers the wake ping.
   - A 401 calls `logout()`; the route guards then redirect, and the client never navigates itself.
3. **Retries (`queryClient.ts`):** retries only wake errors.
4. **Writes are never blindly replayed.** Transaction creates carry an idempotency key from the draft store. Edits
   send `If-Match: "<version>"` and handle 412 with a conflict card.
5. **Persistence (`main.tsx`):** the query cache is persisted to localStorage, first pages of infinite queries only,
   so screens paint instantly. Logout clears it, via `ACCOUNT_STORAGE_KEYS` in `features/auth/store.ts`. A
   `storage` listener reloads other tabs when the token changes.
6. **Invalidation:** after any transaction write, call `invalidateTransactionData()` in
   `features/transactions/queries.ts`. It is the one place that knows what goes stale.
7. **Query keys** are scoped by account and book (`txKeys`, `["summary", bookId, month]`, `["balance", bookId]`).
   Keep new keys under these prefixes so invalidation and the book coordinator's purge reach them.

### App shell

- **Routes:** `src/app/router.tsx` lazy-loads one module per route, with named exports.
- **Guards (`src/app/guards.tsx`):**
  - `PublicOnly`: welcome, login, signup.
  - `OnboardingGate`: waits for `books.ready` before deciding.
  - `AppGate`: renders from persisted state immediately and shows `WakeScreen` only when nothing is cached.
- **Editors are overlays, not routes.** Add-transaction, category, budget and import open with
  `useOverlay.getState().show({ kind })` from `src/app/overlays.ts`. `OverlayHost` mounts them with
  `{ open, onOpenChange, ...payload }`. Book sheets use their own `useBookUIStore`.
- **Activity routes:** `/activity/:txId` is a split view on desktop and a bottom sheet on phones, and `?edit=1` opens
  edit mode.
- **Shortcuts:** global shortcuts live in `src/app/shortcuts.ts`. They and the Activity table's j/k handler must stand
  down while any `[role=dialog|alertdialog|menu]` is open or an editor is open.

### UI conventions (details in docs/ui-guide.md)

- **Tokens:** the theme lives in `src/index.css` as CSS variables on shadcn names, plus `income`, `expense`,
  `warning`, `surface-2/3` and `edge`, with light and dark both defined. Utilities: `.surface`, `.glass`, `.glow`,
  `.money`, `.shimmer`.
- **Money:** every figure renders through `Money` / `AnimatedMoney` (`src/shared/ui/Money.tsx`). That component owns
  sign, color and the Sora numerals; zero renders neutral.
- **Icons:** only through `src/shared/ui/Icon.tsx` (Phosphor). It maps the Ionicons-style names the backend persists
  for categories; never import `@phosphor-icons/react` elsewhere.
- **Overlays:** `ResponsiveDialog` is a dialog at `md`+ and a bottom sheet on phones.
- **Shared components:** shadcn components in `src/components/ui` are owned code and may be edited.
- **Ledger dates are book-local:** `occurredOn` is `YYYY-MM-DD` in `book.timezone`. Format times in the book's time
  zone, never the device's, and never derive a day from `toISOString()`.
- **Copy:** no emoji and no em-dash or en-dash characters in visible copy.

### Deploy

- **Hosts:** Cloudflare Pages or Netlify. `public/_headers` is shared by both; `netlify.toml` covers Netlify.
- **CSP coupling:** the CSP's `connect-src` hard-codes the API origin, so update it together with
  `VITE_API_BASE_URL`.
- **Service worker:** precaches only the app shell. API responses are never cached by the service worker.
- **Backend CORS:** the backend needs CORS inside Spring Security, PUT, exposed headers, and actuator CORS, all on
  branch `feature/web-cors` in `../pennywise`. `APP_CORS_ALLOWED_ORIGINS` must list the web origin.
