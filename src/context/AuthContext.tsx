import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'
import { DEMO_MODE, DEMO_DEALER_STORAGE_KEY } from '@/config/demo'
import { findDealerByName, getDealer, type Dealer } from '@/config/dealers'
import { getDemoDataset } from '@/lib/demo/dataset'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  /** True when the portal is running on generated data — see @/config/demo. */
  isDemo: boolean
  /**
   * The signed-in dealer's branding — city and logo. In demo mode this is the
   * dealership picked on the login screen; in live mode it's matched from the
   * Supabase profile by name, and is null if no bundled logo matches.
   */
  dealer: Dealer | null
  /** Demo-mode sign-in: pick a dealer, no credentials. */
  signInAsDealer: (dealerId: string) => void
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (params: {
    email: string
    password: string
    dealerName: string
    companyName: string
  }) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const DEMO_ONLY_ERROR =
  'The portal is running in demo mode — pick your dealership from the list to sign in.'

/**
 * A stand-in Session for demo mode. Nothing ever validates it (demo mode never
 * calls Supabase), it just satisfies the same shape the rest of the app reads —
 * so ProtectedRoute, Topbar and friends need no demo-specific branches.
 */
function makeDemoSession(dealer: Dealer): Session {
  const user: User = {
    id: dealer.id,
    aud: 'demo',
    role: 'authenticated',
    // .invalid is reserved by RFC 2606 and can never resolve — no chance of a
    // demo address colliding with a real mailbox.
    email: `${dealer.id}@demo.invalid`,
    app_metadata: { provider: 'demo' },
    user_metadata: { dealer_name: dealer.shortName, company_name: dealer.companyName },
    created_at: new Date().toISOString(),
  }

  return {
    access_token: `demo-${dealer.id}`,
    refresh_token: `demo-${dealer.id}`,
    token_type: 'bearer',
    expires_in: 60 * 60 * 24,
    user,
  }
}

function readStoredDemoDealer(): Dealer | null {
  try {
    return getDealer(localStorage.getItem(DEMO_DEALER_STORAGE_KEY))
  } catch {
    // Private browsing / storage disabled — just start signed out.
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Demo mode resolves synchronously from localStorage, so all three of these
  // start populated and there's nothing to wait for — no effect, no spinner.
  const [dealer, setDealer] = useState<Dealer | null>(() =>
    DEMO_MODE ? readStoredDemoDealer() : null,
  )
  const [session, setSession] = useState<Session | null>(() => {
    const stored = DEMO_MODE ? readStoredDemoDealer() : null
    return stored ? makeDemoSession(stored) : null
  })
  const [profile, setProfile] = useState<Profile | null>(() => {
    const stored = DEMO_MODE ? readStoredDemoDealer() : null
    return stored ? getDemoDataset(stored.id).profile : null
  })
  const [loading, setLoading] = useState(!DEMO_MODE)

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data ?? null)
    // Live mode: identity comes from Supabase, but logos don't live there (no
    // column, no storage bucket), so the branding is matched out of the bundled
    // registry by name. Null when nothing matches — the UI falls back cleanly.
    setDealer(findDealerByName(data?.company_name, data?.dealer_name))
  }

  useEffect(() => {
    // Demo mode has no Supabase session to restore or listen to.
    if (DEMO_MODE) return

    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session?.user) {
        void loadProfile(data.session.user.id)
      }
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        void loadProfile(nextSession.user.id)
      } else {
        setProfile(null)
        setDealer(null)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  function signInAsDealer(dealerId: string) {
    const next = getDealer(dealerId)
    if (!next) return
    try {
      localStorage.setItem(DEMO_DEALER_STORAGE_KEY, next.id)
    } catch {
      // Storage unavailable — the session just won't survive a refresh.
    }
    setDealer(next)
    setProfile(getDemoDataset(next.id).profile)
    setSession(makeDemoSession(next))
  }

  async function signInWithPassword(email: string, password: string) {
    if (DEMO_MODE) return { error: DEMO_ONLY_ERROR }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signUp({
    email,
    password,
    dealerName,
    companyName,
  }: {
    email: string
    password: string
    dealerName: string
    companyName: string
  }) {
    if (DEMO_MODE) return { error: DEMO_ONLY_ERROR }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { dealer_name: dealerName, company_name: companyName },
      },
    })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    if (DEMO_MODE) {
      try {
        localStorage.removeItem(DEMO_DEALER_STORAGE_KEY)
      } catch {
        // Storage unavailable — clearing React state below is enough.
      }
      setDealer(null)
      setProfile(null)
      setSession(null)
      return
    }
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    if (DEMO_MODE) {
      if (dealer) setProfile(getDemoDataset(dealer.id).profile)
      return
    }
    if (session?.user) {
      await loadProfile(session.user.id)
    }
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    isDemo: DEMO_MODE,
    dealer,
    signInAsDealer,
    signInWithPassword,
    signUp,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
