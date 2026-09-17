# Dingli Dealer Connect

A dealer portal for **Dingli India** dealers — price list, live stock (both Dingli India's
and your own dealership's), invoice history & ledger for FY 2025-26, service requests,
feedback, and catalog downloads.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite | Fast dev server, tiny static build. |
| Styling | Tailwind CSS v4 | CSS-first theme (`src/index.css`), no config file needed. Light/dark toggle, Dingli's real orange/green brand colors. |
| Backend / DB / Auth | Supabase (Postgres + Auth + Storage) | The frontend talks to Supabase directly — no server to host for the core app. |
| Animation | Framer Motion | Page transitions, staggered lists, hover/press micro-interactions. |
| Forms | react-hook-form + zod | Typed, validated forms with minimal boilerplate. |
| Data fetching | TanStack Query | Caching, loading/error states, cache invalidation on mutation. |
| Hosting | Vercel | Static build + SPA rewrites (`vercel.json`), auto-deploys on push to `main`. |

### Architecture note: why no Python backend yet

The React app talks **directly to Supabase** (Postgres via its auto-generated REST API,
Auth, and Storage), with Row Level Security enforcing that each dealer only ever sees their
own stock/invoices/ledger/feedback/tickets. This is a complete, production-viable pattern
on its own — no custom backend required for anything currently in the app.

A Python (FastAPI) backend is the natural next addition when you need something Supabase
can't do on its own: generating invoice PDFs, bulk-importing price lists/stock from an ERP
export, cron jobs, or business-rule automation. It would sit *alongside* Supabase, not
replace it — deployed separately (Render/Railway/Fly.io/etc., not Vercel, since Vercel runs
Python as short-lived serverless functions rather than a persistent process), called by the
frontend only for those specific operations.

## Project structure

```
src/
  components/       Shared UI (Button, Card, Badge, Modal, Sidebar, Topbar, AppShell, ...)
  context/          AuthContext (Supabase session/profile) + ThemeContext (light/dark)
  hooks/queries.ts  All TanStack Query hooks (reads) + mutations (feedback, service requests)
  lib/              supabase client, cn()/formatting utils
  pages/            One file per route (Dashboard, PriceList, DingliStock, InvoiceHistory, ...)
  types/database.ts Hand-written mirror of the Supabase schema (see note in the file)
supabase/
  migrations/0001_init.sql        Core schema + RLS policies + storage buckets
  migrations/0002_invoice_items.sql  Invoice line-item breakdown (powers "View Details")
  seed.sql                        Optional sample reference data (products, stock, catalogs)
vercel.json                       SPA rewrite so client-side routes don't 404 on refresh
```

## Local setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. In the SQL Editor, run `supabase/migrations/0001_init.sql`, then
   `supabase/migrations/0002_invoice_items.sql`, then optionally `supabase/seed.sql` for
   sample reference data.
3. Under **Storage**, confirm the `catalogs` (public) and `invoices` (private) buckets
   were created by the migration. Upload a few PDFs to `catalogs` matching the `file_path`
   values in your `catalogs` table rows (or update the rows to match what you upload).
4. Under **Project Settings → API**, copy the **Project URL** and **publishable (anon)
   key** — never the secret/service-role key, which must never reach the frontend.

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from step 1.

### 3. Install & run

```bash
npm install
npm run dev
```

Visit the printed local URL, click **Create one** to sign up a dealer account (confirm the
email Supabase sends, unless you disabled email confirmation in Auth settings), then sign in.

### 4. Build

```bash
npm run build   # runs tsc -b, then vite build → dist/
npm run preview # serve the production build locally
```

## Deploying to Vercel

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. In the [Vercel dashboard](https://vercel.com), **Add New → Project → Import** this repo.
   It auto-detects Vite (build command `npm run build`, output directory `dist`) — no
   changes needed.
3. Under **Project Settings → Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Every push to `main` redeploys automatically; every other branch/PR gets its own
   preview URL.
5. **Custom domain**: Project Settings → Domains → add your domain, then point its DNS at
   Vercel as instructed there. SSL is issued automatically.

Routing uses `BrowserRouter` for clean URLs (no `/#/` prefix) — `vercel.json`'s rewrite
sends every path to `index.html` so client-side routes don't 404 on a hard refresh or
direct link.

### Why Supabase is proxied through `/sb`

Set `VITE_SUPABASE_URL` to `/sb`, not to the project's `.supabase.co` URL.

Indian ISPs have twice been ordered by MeitY to block DNS resolution for `*.supabase.co`
under the IT Act — nationally for eight days in February 2026, and again from
17 September 2026. Jio, Airtel and ACT redirect the whole domain to a block server that
resets TLS, so `supabase-js` fails with a bare `NetworkError` and dealers behind those
ISPs just see a broken portal. `vercel.json` rewrites `/sb/*` to the project so the
blocked hostname never enters the browser's DNS; Vercel's own network reaches Supabase
normally. That rewrite must stay **above** the `index.html` catch-all, which matches
everything, and `vercel.json` takes no comment keys — Vercel rejects unknown properties
and the deploy fails validation.

A leading slash resolves against the page origin (`src/lib/supabase.ts`). Vite inlines
the value at build time, so changing it needs a rebuild, not just an env change. For
local `npm run dev` on a blocked network, point `.env.local` at the deployed proxy
instead — `https://<your-app>.vercel.app/sb` — since the dev server has no rewrite and
can't reach Supabase directly either. Vercel rewrites don't carry WebSockets, so
Supabase Realtime would need a different route; nothing here uses it.

## Data model & security

Every table has Row Level Security enabled (see `supabase/migrations/`):

- **Shared reference data** (`products`, `dingli_stock`, `catalogs`) — readable by any
  signed-in dealer, writable only by admins.
- **Per-dealer data** (`dealer_stock`, `invoices`, `invoice_items`, `ledger_entries`,
  `feedback`, `service_requests`) — a dealer can only ever read/write rows tied to their own
  `dealer_id` (items are scoped via a join back to their parent invoice).
- `profiles.role` (`dealer` | `admin`) drives an `is_admin()` helper used across policies.
  New sign-ups default to `dealer`; promote a user to `admin` manually in the `profiles`
  table when you need back-office access. **Known gap:** the `profiles_update_own` policy
  currently lets a user update any column on their own row, including `role` — tighten this
  (e.g. a trigger blocking non-admin role changes) before onboarding real dealers.
- Invoice PDFs live in the private `invoices` storage bucket under
  `<dealer_id>/<filename>` — dealers only get a short-lived signed URL to their own files.
  Catalogs live in the public `catalogs` bucket.

## Theming

Light and dark mode are both supported, toggled from the sun/moon button in the top-right
of the topbar (persisted to `localStorage`, defaults to system preference on first visit).
Brand colors — Dingli's real orange (`--color-orange-*`, `#F26302`) and green
(`--color-green-*`, `#009944`), pulled from dinglisaarc.com — are theme-independent and
defined in the `@theme` block in `src/index.css`. The neutral `--color-base-*` scale is
theme-*dependent*: light values live under `:root`, dark values under `.dark`, exposed to
Tailwind via `@theme inline` — change them there to re-theme the whole app. The login/signup
marketing panel (`AuthLayout`) deliberately stays dark regardless of the toggle, scoped via
a local `.dark` class independent of the site-wide setting.
