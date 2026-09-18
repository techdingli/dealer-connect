import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Forklift, ShieldCheck, Wrench, Receipt } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { DEMO_MODE } from '@/config/demo'
import { DemoModeBadge } from '@/components/DemoModeNotice'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-base-950">
      {/* Brand / marketing panel — deliberately stays dark regardless of the
          site-wide theme toggle (a fixed branded panel, same idea as the
          real dinglisaarc.com header). `dark` here re-scopes the base-*
          CSS variables for this whole subtree via the cascade. */}
      <div className="dark relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-base-900 via-base-950 to-base-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/4 top-0 size-80 animate-float rounded-full bg-orange-600/20 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 size-80 animate-float rounded-full bg-green-600/20 blur-3xl [animation-delay:-3s]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative flex items-center gap-3"
        >
          <Logo forceScheme="dark" />
          <DemoModeBadge />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <h2 className="font-display max-w-md text-4xl font-bold leading-tight tracking-tight text-base-50">
            Your entire dealership,
            <span className="brand-gradient-text"> one connected portal.</span>
          </h2>
          <p className="mt-4 max-w-md text-base-300">
            Price lists, live stock, invoices, ledgers, and service requests — everything a Dingli
            India dealer needs, in one place.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              { icon: Forklift, label: 'Live Stock' },
              { icon: Receipt, label: 'Invoices & Ledger' },
              { icon: Wrench, label: 'Service Requests' },
            ].map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="glass-panel rounded-xl p-4"
              >
                <f.icon className="mb-2 size-5 text-orange-400" />
                <p className="text-xs font-medium text-base-200">{f.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="relative flex items-center gap-2 text-xs text-base-400"
        >
          <ShieldCheck className="size-4 text-emerald-400" />
          {DEMO_MODE
            ? 'Preview build · Sample data only — nothing here is a live account'
            : 'Secured by Supabase Auth · Row-level data isolation per dealer'}
        </motion.div>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <Logo />
          <DemoModeBadge />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          <h1 className="font-display text-2xl font-semibold text-base-50">{title}</h1>
          <p className="mt-1.5 text-sm text-base-300">{subtitle}</p>

          <div className="mt-8">{children}</div>
          <div className="mt-6 text-center text-sm text-base-300">{footer}</div>
        </motion.div>
      </div>
    </div>
  )
}
