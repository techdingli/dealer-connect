import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { NAV_ITEMS } from '@/config/nav'
import { Logo } from '@/components/Logo'
import { cn } from '@/lib/utils'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-base-600 bg-base-900/80 backdrop-blur-xl">
      <div className="flex h-16 items-center border-b border-base-600 px-5">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item, i) => (
          <motion.div
            key={item.to}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03, duration: 0.3 }}
          >
            <NavLink
              to={item.to}
              end={item.to === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-gradient-to-r from-orange-500/15 to-green-500/5 text-base-50'
                    : 'text-base-300 hover:bg-base-700/60 hover:text-base-50',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="active-nav-pill"
                      className="absolute inset-y-1 left-0 w-1 rounded-full bg-gradient-to-b from-orange-400 to-green-500"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  <item.icon
                    className={cn('size-[18px] shrink-0', isActive ? 'text-orange-400' : 'text-base-400 group-hover:text-green-400')}
                  />
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          </motion.div>
        ))}
      </nav>

      <div className="border-t border-base-600 p-4">
        <p className="text-[11px] leading-relaxed text-base-400">
          © {new Date().getFullYear()} Dingli India · Dealer Connect Portal
        </p>
      </div>
    </aside>
  )
}
