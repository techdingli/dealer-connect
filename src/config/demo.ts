/**
 * Demo mode — the single switch that decides whether this portal talks to
 * Supabase at all.
 *
 * When ON (the default):
 *   - Login is a dealer dropdown, not email/password. No Supabase Auth, no
 *     passwords, no accounts to provision.
 *   - Every page renders generated data seeded from the selected dealer's id,
 *     so nothing real is ever fetched or displayed.
 *   - The assistant answers from that same generated data instead of calling
 *     /api/chat (which would otherwise hit Supabase with a real access token).
 *
 * To go live: set VITE_DEMO_MODE=false in the environment (Vercel project
 * settings, or .env.local for dev) and redeploy. Nothing else needs changing —
 * every demo branch in the codebase keys off this one constant, so the real
 * Supabase paths come straight back.
 */
export const DEMO_MODE = (import.meta.env.VITE_DEMO_MODE as string | undefined) !== 'false'

/** localStorage key holding the dealer id picked on the demo login screen. */
export const DEMO_DEALER_STORAGE_KEY = 'dingli-demo-dealer'
