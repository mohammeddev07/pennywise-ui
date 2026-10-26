# PennyWise Web

Not-so-boring cash management in the browser: an installable PWA for desktop and phone with the same features as the
PennyWise mobile app. It talks to the PennyWise Spring Boot API.

Stack: Vite, React 19, TypeScript, Tailwind v4, shadcn/ui (Radix), React Router 7, TanStack Query (persisted),
Zustand, Motion, Recharts, vite-plugin-pwa.

## Run

```sh
npm install
cp .env.example .env.development.local   # then edit (dev-only; builds never read it)
npm run dev                  # http://localhost:5173
```

- **No backend needed:** set `VITE_MOCK_API=true` in `.env.development.local` to use the in-memory backend. It has seed data;
  export is unavailable.
- **Real backend:** set `VITE_MOCK_API=false` and `VITE_API_BASE_URL` to the API, including `/api`. The backend must
  include the CORS changes below.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check, then production build to `dist/` (includes the service worker) |
| `npm run preview` | Serve `dist/` locally (test the PWA install here) |
| `npm test` | Vitest logic suite (filter model, stores, dates, wake/backoff) |
| `npm run typecheck` | `tsc -b` only |
| `npm run icons` | Regenerate PWA/iOS icons from `public/app-icon.svg` |

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | yes | Backend base URL with `/api`, e.g. `https://<your-service>.onrender.com/api` |
| `VITE_MOCK_API` | no | `true` runs against the in-memory mock backend |
| `VITE_GOOGLE_CLIENT_ID` | no | Google OAuth web client ID. Leave empty to hide Google sign-in |
| `VITE_SUPPORT_EMAIL` | no | Shows "Contact support" in Profile as a mailto link |

Only `VITE_*` values reach the browser. Never put secrets in them.

## Deploy (free)

Both hosts read `public/_headers` (CSP and caching).

> **Note:** the Content-Security-Policy's `connect-src` must name the API origin. The build fills in the
> `__API_ORIGIN__` placeholder in `public/_headers` from `VITE_API_BASE_URL`, so there is nothing to edit by hand.

**Cloudflare Pages**

1. Connect the repository.
2. Build settings:
   - Framework preset: Vite
   - Build command: `npm run build`
   - Output directory: `dist`
3. Environment variables:
   - `NODE_VERSION=20.19.4`
   - `VITE_API_BASE_URL`
   - optionally `VITE_GOOGLE_CLIENT_ID`
4. SPA routing works automatically, because there is no `404.html`.

**Netlify**

1. Connect the repository. `netlify.toml` already sets the build command, the publish directory, Node 20 and the SPA
   redirect.
2. Add the `VITE_*` variables under Site settings > Environment variables.

**GitHub Pages** (`.github/workflows/deploy-pages.yml`, deploys on every push to `develop`)

Pages' "Deploy from a branch" mode serves the source files as-is, with no build step, so it can't run this app.
The workflow builds it and publishes `dist/` instead.

1. Settings > Pages > Build and deployment > Source: **GitHub Actions**.
2. Settings > Secrets and variables > Actions > **Variables** tab: add `VITE_API_BASE_URL`, and optionally
   `VITE_GOOGLE_CLIENT_ID` and `VITE_SUPPORT_EMAIL`. Use variables, not secrets, since they ship in the bundle anyway.
3. Push to `develop`, or run the workflow from the Actions tab. The site is served at
   `https://<user>.github.io/<repo>/`. The workflow passes that subpath as Vite's `--base`.
4. Add `https://<user>.github.io` to the backend's `APP_CORS_ALLOWED_ORIGINS` and to the Google client's
   authorized JavaScript origins.

Pages limits:
- It ignores `_headers`. The build also puts the CSP in a `<meta>` tag, but that can't carry `frame-ancestors`, so
  clickjacking protection and the cache headers only exist on Cloudflare and Netlify.
- Deep links are served through a copied `404.html`, so the first load of one returns HTTP 404 but renders normally.

## Backend changes (branch `feature/web-cors` in `pennywise`)

The browser app needs three CORS changes on the Java backend:

1. **Run CORS inside Spring Security.** Browser preflight requests carry no token, so they used to get a 401 before
   CORS ran.

   ```java
   // SecurityConfig.securityFilterChain
   http.cors(Customizer.withDefaults());
   ```

2. **Allow PUT and expose the headers the client reads.**

   ```java
   // CorsConfig.addCorsMappings
   .allowedOrigins(allowedOrigins.trim().split("\\s*,\\s*"))
   .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE")
   .allowedHeaders("Authorization", "Content-Type", "If-Match", "Idempotency-Key", "X-Request-Id")
   .exposedHeaders("ETag", "Retry-After", "X-Request-Id", "Content-Disposition")
   ```

3. **Let browsers read the health check.** The app pings it to detect a cold start.

   ```properties
   management.endpoints.web.cors.allowed-origins=${APP_CORS_ALLOWED_ORIGINS:*}
   management.endpoints.web.cors.allowed-methods=GET
   ```

Then on Render, set `APP_CORS_ALLOWED_ORIGINS` to your web origins, comma-separated. For example:
`https://pennywise.pages.dev,http://localhost:5173`.

**Google sign-in**

1. Add the site origin as an Authorized JavaScript origin of the web OAuth client in Google Cloud.
2. Make sure that client ID is listed in the backend's `GOOGLE_CLIENT_IDS`.

## Install on a phone

- **iPhone:** open the site in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open the site in Chrome, open the menu, then tap **Install app**.

It opens full-screen with the PennyWise icon. When a new version is deployed, the app shows a "Reload" prompt.

## How cold starts are handled

Render's free tier sleeps after about 15 minutes idle and takes 30-60 s to wake.

- **Waiting:** on load, the app pings `/api/actuator/health` with exponential backoff (1, 2, 4, 8, then 10 s, with
  jitter) and holds TanStack Query "offline" until it answers.
  - Queries pause instead of failing, and resume on their own.
  - Recent data is persisted locally, so screens paint instantly from cache while a small "Waking server" pill counts
    up.
  - With nothing cached yet, a full-screen branded wait screen is shown instead.
- **Retries:** requests are limited to 3 at a time, matching the backend's admission cap, and `OVERLOADED` responses
  retry after `Retry-After`.
- **No duplicates:** writes are never blindly replayed. Transaction creates carry an idempotency key.

## Docs

- `docs/analysis.md`: API contract, screens and what was reused from the mobile app.
- `docs/ui-guide.md`: design rules and the shared building blocks.
