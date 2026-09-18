import { FlaskConical } from 'lucide-react'
import { DEMO_MODE } from '@/config/demo'
import { cn } from '@/lib/utils'

/* Both components render nothing when demo mode is off, so callers can drop
 * them in unconditionally and they simply disappear on the live build. */

/** Compact "DEMO MODE" pill — for headers and chrome. */
export function DemoModeBadge({ className }: { className?: string }) {
  if (!DEMO_MODE) return null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5',
        'text-[10px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-300',
        className,
      )}
    >
      <FlaskConical className="size-3" />
      Demo Mode
    </span>
  )
}

/** Full-width explanation — for the login screen and the dashboard. */
export function DemoModeBanner({ className }: { className?: string }) {
  if (!DEMO_MODE) return null

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3',
        className,
      )}
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-200">Demo Mode</p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-700/90 dark:text-amber-200/80">
          Every figure in this portal — stock, invoices, ledger balances and service tickets — is
          randomly generated sample data, not your real account. Only your dealership name and logo
          are real.
        </p>
      </div>
    </div>
  )
}
