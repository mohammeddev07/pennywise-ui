# PennyWise Web: Analysis (Step 1)

Source of truth:
- Backend: `../pennywise` (Spring Boot 3.5 / Java 21, Render free tier, Supabase Postgres)
- Mobile: `../pennywise-mobile` (Expo 57 / RN 0.86, expo-router)

The repo's own contract docs are worth reading first:
- `pennywise/src/main/resources/openapi/pennywise-v1.yaml`
- `pennywise/docs/transaction-query.md` (filter AST and TS types)

## Screens and navigation (mobile, live routes only)

Auth gate: unauthenticated → `(auth)`; authenticated without onboarding → `(onboarding)`; otherwise → `(tabs)` + `modals`.

| Route | Purpose | Data |
|---|---|---|
| welcome | Landing: hero, 3 features, Log in / Create account | none |
| login / signup | Email + password (8–128 chars). Shows "Waking up the server…" after 12 s | `POST /v1/auth/login`, `POST /v1/auth/signup` |
| onboarding/currency | Pick USD/EUR/GBP/JPY/INR plus optional opening balance; creates the "Personal" book | `POST /v1/books`, `PATCH /v1/me` |
| home | Balance hero (count-up), month income and spent, spend-share bar, 7-day area chart, top 4 categories, 4 recent transactions, budget tiles | `/balance`, `/summary/monthly`, `analyze` (DAY, 7 days), `search` (limit 4) |
| activity | Ledger explorer: search, date chips (Today/7d/Month±/All/Custom), filter chips (type, category, amount, payment, advanced AND/OR tree, AI describe), sort (≤3 keys), totals, infinite list grouped by day, table at ≥600 px, xlsx export of the exact query | `search` (offset paging, 50), `analyze`, `export/query`, `filter-proposals` |
| insights | Months (12) / Years (4) × Spending / Income; bar chart with tooltip, partial periods, table toggle; category donut and list; largest expense; drill-down into Activity with a back breadcrumb | `analyze` (MONTH/YEAR) |
| categories (from Profile) | Total budget ring, category grid with spent / budget / progress | `/summary/monthly`, categories, budgets |
| settings (Profile) | Account, books (switch, drag reorder, add/edit/delete, max 10), display name (local), appearance, import, export, sign out | books API, `GET /transactions/export` |
| modal add-transaction | Step 1: amount keypad + type toggle. Step 2: title, category, payment, date/time, note. Category browser. Success screen | `POST /transactions` + `Idempotency-Key` |
| modal transaction-details | Receipt view; Edit, Duplicate, Delete | `GET`/`DELETE` (If-Match), `POST` |
| modal edit-transaction | Edit with 412 conflict card ("Reload latest" / "Keep my changes"); sends only changed fields | `PATCH` + If-Match |
| modal category-editor | Type (fixed after create), name ≤60, 14 icons, 8 colours | categories CRUD |
| modal budget-editor | Monthly budget for an expense category | `PUT`/`DELETE /budgets/{cat}?month=` |
| modal import + results | .xlsx upload and result report | `POST /transactions/import` (multipart `file`) |
| modal contact-support | Calls `POST /v1/support/contact`. **This endpoint does not exist in the backend**, so it 404s | none |
| Book sheets | Switcher, menu, create/edit (name ≤80, 18 currencies, opening balance, 9 icons, 6 colours) | books API |

Dead routes, not ported: pin, onboarding/books, onboarding/start-tracking, modals/book-switcher.

Not in the app: recurring transactions, notifications, offline writes.

## API contract (base = `${API}/api`)

Conventions:
- Bearer JWT (HS256, default 60 min). There is no refresh token and no logout endpoint, so a 401 means log out.
- Money is integer minor units. `occurredOn` is a book-local `YYYY-MM-DD`. Timestamps are ISO-8601 UTC.
- Lists are `{items}`.
- Errors are `{error:{code,message,details[],requestId}}`.
- Versioned resources (book, category, transaction, budget) carry a `version` field and an `ETag`. PATCH/DELETE require `If-Match: "<version>"`. A stale version gives 412 `ETAG_MISMATCH`.
- Transaction create requires an `Idempotency-Key` (UUID per attempt, reused on retry).
- Transaction create and patch bodies reject unknown fields.

| Area | Endpoints |
|---|---|
| Auth (public) | `POST /v1/auth/signup` (201), `/login`, `/google`, `/google/link` (bearer) → `AuthResponse{accessToken, tokenType, expiresInSeconds, user: Me}` |
| Me | `GET /v1/me`, `PATCH /v1/me {defaultCurrencyCode?, displayName?}` |
| Books | `GET/POST /v1/books`, `GET/PATCH/DELETE /v1/books/{id}`, `PUT /v1/books/order {bookIds}` (all active books). Limit 10 (`BOOK_LIMIT_REACHED`). The last book can't be deleted (`LAST_BOOK_REQUIRED`) |
| Categories | `GET/POST /v1/books/{b}/categories`, `PATCH/DELETE …/{c}`. Delete is blocked when in use (`CATEGORY_IN_USE`) |
| Transactions | `POST …/transactions`, `GET/PATCH/DELETE …/{id}`, `POST …/search {filter,sort,page:{offset,limit}}`, `POST …/analyze {filter,bucket,window}`, `POST …/export/query`, `GET …/export`, `POST …/import` |
| Summary | `GET …/balance`, `GET …/summary/monthly?month=YYYY-MM`, `GET …/summary/range?startDate&endDate` |
| Budgets | `GET …/budgets?month=`, `PUT/DELETE …/budgets/{categoryId}?month=` (If-Match optional) |
| AI | `POST …/filter-proposals {text}`. Off unless the Gemini key is set (503 `AI_FILTERS_DISABLED`) |
| Health | `GET /actuator/health` (public). `/health` requires auth, so don't use it for pings |

Enums:
- Transaction/category type: `INCOME | EXPENSE`
- PaymentMethod: `CASH | CARD | BANK_TRANSFER | WALLET | OTHER | null`
- Book icon keys: book, briefcase, airplane, home, car, heart, family, education, cart
- Book colours: green, purple, orange, blue, red, pink

Limits:
- Admission cap: **3 concurrent requests**. Beyond that, 503 `OVERLOADED` with `Retry-After: 1`.
- Per-user token bucket: 60 tokens, refill 2/s. Costs: search 3, analyze 5, export 25.
- Query AST: depth ≤3, ≤30 conditions, page limit ≤200, offset ≤100000, window ≤5 years.

## Blockers for a cross-origin browser client

1. CORS is configured only in `CorsConfig` (MVC). `SecurityConfig` has no `http.cors()`, so authenticated preflights get a 401.
2. `PUT` is missing from the allowed methods (book reorder and budgets).
3. There are no `exposedHeaders` (ETag, Retry-After, X-Request-Id, Content-Disposition). The version can be read from the body instead.
4. Render cold start takes 30–60 s. During it the proxy returns an HTML 502/503 or a timeout, not the JSON envelope.

## Reusable from mobile (pure TS, copied and adapted, not imported, so mobile stays untouched)

- **Types:** `shared/types/{api,models,transactionQuery,aiFilter}.ts`
- **Utilities:** `shared/utils/{formatCurrency,ledgerDate}.ts`, `features/auth/token.ts`, `shared/session/accountEpoch.ts`
- **Transaction logic:** `features/transactions/{filterModel,activityRows,insights,editPatch,aiFilterProposal,model,queries}.ts`
- **Book logic:** `features/books/{constants,openingBalance,reorder,operations}.ts`
- **Zustand stores:** swap AsyncStorage for localStorage
- **API modules:** `shared/api/*` (axios) and `errors.ts`, plus `mockAdapter.ts`/`mockQuery.ts` as an offline dev backend
- **Tests to port (Vitest, `TZ=Asia/Tokyo`):** filterModel, filterStore, mockQuery, activityRows, editPatch, ledgerDate, token, snapshot

RN-only, so rewrite: every screen and component, plus the SecureStore, Haptics, DocumentPicker, FileSystem, datetimepicker, reanimated, gesture-handler and expo-updates integrations.

## Design tokens (mobile)

- Fonts: Schibsted Grotesk for words, Sora (tabular figures) for amounts.
- Dark: app `#0B0D0F`, surface `#121518`, surfaceAlt `#181C20`, text `#F5F7F8`, muted `#98A2AD`, accent `#00C805`, income `#51D99B`, danger `#FF6B67`, warning `#F5A524`.
- Light: app `#F4F6F5`, surface `#FFF`, text `#17251D`, accent `#087A30`, danger `#B92E35`.
- Radii 14 / 22 / 28 / 32. 8-pt spacing. No black shadows (depth comes from layers and a 1 px top highlight). Signed amounts always carry a +/− sign.
