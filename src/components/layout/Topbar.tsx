import { useState } from 'react'
import { Menu, LogOut, ChevronDown, UserRound } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ThemeToggle } from '@/components/ThemeToggle'

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { profile, user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    toast.success('Signed out successfully')
    navigate('/login')
  }

  const displayName = profile?.dealer_name || user?.email?.split('@')[0] || 'Dealer'

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-base-600 bg-base-900/70 px-4 backdrop-blur-xl sm:px-6">
      <button
        onClick={onMenuClick}
        className="flex size-9 items-center justify-center rounded-lg text-base-200 hover:bg-base-700 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      <div className="hidden sm:block">
        <p className="text-sm text-base-300">
          Welcome back, <span className="font-medium text-base-50">{displayName}</span>
        </p>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <ThemeToggle />

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-base-600 bg-base-800/60 py-1.5 pl-1.5 pr-2 sm:pr-2.5"
          >
            <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500/25 to-green-500/25 text-orange-300">
              <UserRound className="size-4" />
            </div>
            <span className="hidden max-w-[120px] truncate text-sm font-medium text-base-100 sm:inline">
              {displayName}
            </span>
            <ChevronDown className="size-3.5 text-base-400" />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-base-600 bg-base-800 shadow-xl"
                >
                  <div className="border-b border-base-600 px-3.5 py-3">
                    <p className="truncate text-sm font-medium text-base-50">{profile?.company_name || displayName}</p>
                    <p className="truncate text-xs text-base-400">{user?.email}</p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-sm text-red-400 hover:bg-base-700"
                  >
                    <LogOut className="size-4" />
                    Sign out
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
