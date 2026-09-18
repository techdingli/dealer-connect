# Pending: Focus data sync

Status as of 2026-09-18. Tracks what's left after the first Focus → Supabase sync pass.

## To run

- **`focus-ledger-resync.sql`** (in this same folder, **not committed to git** — this repo
  is public and the file embeds real invoice amounts, GSTINs, and bank payment narrations,
  so it's gitignored on purpose) has not been executed against production yet. It replaces
  `dealer_ledger` rows for 7 dealers (RKS, Depaam, Futuretech, Ahuja, Ramanand Power, Deep
  Engineering, Cears) with data parsed from `Focus Ledger.xlsx` — a manual Focus export that,
  unlike the original automated pipeline, includes real Sales Invoices/Returns and a running
  balance. Run it via the Supabase SQL Editor (needs elevated/service-role access that
  Claude Code doesn't have in this session). Back up `dealer_ledger` first if you want a
  rollback path — the script does its own `delete` + `insert` inside a transaction, but only
  for the 7 GSTINs listed at the top.
- `Focus Ledger.xlsx` and `focus-sync-data-2026-09-18.zip` are likewise real financial/PII
  data and are now gitignored — keep them local, don't commit them even accidentally via
  `git add -A`. If this repo is ever made private, that restriction can be revisited.

## Known gaps

- **Two accounts have no GSTIN**: "Maruti Construction Equipment" and "Advent Infra
  Equipment" appear in `Focus Ledger.xlsx` (and in the original dealer list) but were never
  GSTIN-matched by `match-dealers.js` (see `dealer-review.csv` in
  `focus-sync-data-2026-09-18.zip` — both show "NOT FOUND" / blank GSTIN). Without a GSTIN
  they can't be linked to a `dealer_directory` row or a future login. Needs the real GSTIN
  sourced from somewhere (Focus admin, GST portal lookup, or asking the dealer directly),
  then both `dealer_directory` and `dealer_ledger` need rows added for them.
- **3 dealers untouched by this resync**: Aguatech Engineers, Krown Infrastructure, and
  Ramanand Laud are not covered by `Focus Ledger.xlsx` at all. Their `dealer_ledger` rows
  still come from the original automated pipeline (`focus-sync-data-2026-09-18.zip`), which
  is missing invoices (payments/adjustments only, no real running balance was possible).
  These 3 need either a similar manual export, or the automated extraction fixed to pull
  Sales Invoices/Returns like the manual report does.
- **Some dealers have two Focus accounts** (e.g. Ahuja has both `AC/000291350001` and
  `L1008000105042`; Maruti and Advent likewise). The resync treats both as the same GSTIN
  and merges their entries into one ledger. Worth confirming with Dingli finance that this
  merge is correct — the `L1008...` accounts might represent something distinct (e.g.
  security deposits) rather than a simple second trading account.

## Possible follow-up (not started)

- `dealer_ledger` deliberately has no `running_balance` column — see the comment in
  `supabase/migrations/0007_dealer_ledger.sql` (not yet committed to this repo's migrations
  folder, only in the zip): "Add the column when the invoice source is found." Now that
  `Focus Ledger.xlsx` proves a real, invoice-inclusive source exists, it may be worth adding
  the column back (and removing the "no running balance" caveat from `api/chat.ts`'s
  `DEALER_SYSTEM_PROMPT` and the `Ledger.tsx` UI) once the sync covers all dealers reliably.
- `dealer_stock`, `invoices`, and `service_requests` for the demo account
  (`chris@leverageaxiom.com`, aliased to Ahuja) are synthetic placeholder rows from earlier
  testing, not reconciled with real Focus data. Fine for a demo, but flag before treating
  them as real if this account is used beyond that.
- `supabase/migrations/0005_focus_staging.sql`, `0006_focus_transactions.sql`, and
  `0007_dealer_ledger.sql` exist only inside `focus-sync-data-2026-09-18.zip`, not in this
  repo's `supabase/migrations/` folder, even though the app code (`Ledger.tsx`,
  `queries.ts`, `api/chat.ts`) already depends on the `dealer_ledger`/`dealer_directory`
  tables they create. Worth committing those migration files here too so the schema history
  isn't only reconstructable from a zip on someone's machine.
