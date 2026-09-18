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

## Demo mode

The portal currently ships in **demo mode**, driven by a single environment variable:

```
VITE_DEMO_MODE=true    # default when the variable is unset
```

With it on:

- **Login is a dealership dropdown**, not email/password. There are no accounts to
  provision and Supabase Auth is never called.
- **Every figure is generated** — stock, invoices, ledger, service tickets, feedback —
  seeded from the selected dealer's id, so each dealership gets its own distinct but
  stable account, and nothing real is ever fetched. The ledger is derived from the
  generated invoices, so the two pages reconcile.
- **Dealership name and logo are the only real data.** All 17 dealers from the Dingli
  India dealer list are in `src/config/dealers.ts`; 16 have logos in
  `src/assets/dealers/`. Contact names, phone numbers and emails from that list are
  deliberately *not* in this repo, which is public.

### Why the dealer list isn't read from Supabase

The login dropdown has to render *before* anyone signs in, and `profiles` is correctly
locked down by RLS to `id = auth.uid()` — an anonymous visitor can read nothing from it.
Populating the dropdown from the database would mean adding a new table or view readable
by the `anon` role. Supabase also holds no logos: there's no column for one and no
storage bucket, so the images have to be bundled regardless.

In **live mode** the dealer's identity does come from Supabase — `profiles.company_name`
and `dealer_name`, as it always has. `findDealerByName()` matches that against the
bundled registry (ignoring case, punctuation and legal suffixes, so "AHUJA CORPORATION
PRIVATE LIMITED" and "Ahuja Corporation Pvt. Ltd." both resolve) purely to attach the
right logo and city. It returns null when nothing matches, and the UI falls back to the
monogram — a wrong logo on an invoice would be worse than none.

If you'd rather the list came from the database, the pieces needed are: a
`dealer_directory`-style table with an `anon`-readable select policy, a `logo_path`
column, and a public storage bucket holding the logos. Worth noting that two dealers
(Maruti, Advent) have no GSTIN and so have no `dealer_directory` row today — see
`PENDING_TASKS.md` — so a database-driven dropdown would currently be missing them.
- **The assistant answers locally** from the same generated data instead of calling
  `/api/chat`, which would otherwise query Supabase with a real access token.
- "Demo Mode" is labelled on the login screen, the dashboard and the top bar.

To go live, set `VITE_DEMO_MODE=false` in the Vercel project settings (or `.env.local`)
and redeploy. Every demo branch keys off `DEMO_MODE` in `src/config/demo.ts`, so the
real Supabase paths come straight back — including credential login and `/signup`. A
demo dealer left in `localStorage` grants no access once the flag is off.

## Project structure

```
src/
  components/       Shared UI (Button, Card, Badge, Modal, Sidebar, Topbar, AppShell, ...)
  config/           demo.ts (the DEMO_MODE flag), dealers.ts (the 17 dealers + logos), nav.ts
  context/          AuthContext (Supabase session/profile, or the demo dealer) + ThemeContext
  lib/demo/         Demo-mode data: seeded RNG, shared catalog, per-dealer dataset, assistant
  hooks/queries.ts  All TanStack Query hooks (reads) + mutations (feedback, service requests)
  lib/              supabase client, cn()/formatting utils, csv export
  pages/            One file per route (Dashboard, PriceList, DingliStock, InvoiceHistory, ...)
  types/database.ts Hand-written mirror of the Supabase schema (see note in the file)
  assets/dealers/   Dealer logos, trimmed and size-capped (16 of 17 dealers)
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
