/**
 * Demo mode — the switch between the UAT preview and the live portal.
 *
 * When ON (the default), the portal shows Dingli's Focus UAT data:
 *   - Login is a dealer dropdown plus one shared password, checked by
 *     /api/uat-data. No Supabase Auth, no per-dealer accounts.
 *   - Ledger, invoices, purchases, the product catalogue and Dingli stock come
 *     from Focus UAT, synced into Supabase daily by /api/focus-sync and read
 *     through /api/uat-data. Nothing is generated or randomised.
 *   - The assistant answers from the same UAT data through /api/chat.
 *   - Whatever Focus UAT doesn't hold (selling prices, invoice PDFs, a dealer's
 *     own stock and sales, warehouse cities) is marked as missing, not faked.
 *
 * When production Focus data is connected: point the sync at production, set
 * VITE_DEMO_MODE=false and redeploy. Dealers then sign in with their own
 * Supabase accounts and RLS scopes their data by profile GSTIN.
 */
export const DEMO_MODE = (import.meta.env.VITE_DEMO_MODE as string | undefined) !== 'false'
