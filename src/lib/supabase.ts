import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const configuredUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// A leading slash means "proxy through this origin" - see the /sb rewrite in
// vercel.json. Some ISPs redirect *.supabase.co to a dead address, so talking
// to Supabase via our own domain is what keeps the portal working for dealers
// behind them. supabase-js needs an absolute URL, so resolve it here.
const supabaseUrl = configuredUrl?.startsWith('/')
  ? new URL(configuredUrl, window.location.origin).toString().replace(/\/$/, '')
  : configuredUrl

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly in dev/build rather than silently hitting a bad endpoint at runtime.
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your Supabase project credentials.',
  )
}

export const supabase = createClient<Database>(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
