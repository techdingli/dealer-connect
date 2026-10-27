import { DatabaseZap } from 'lucide-react'
import { DEMO_MODE } from '@/config/demo'
import { cn } from '@/lib/utils'

/* Demo mode shows Dingli's Focus UAT data (see @/config/demo), so these label
 * it as such. Both render nothing when demo mode is off, so callers can drop
 * them in unconditionally and they simply disappear on the live build. */

/** Compact "UAT DATA" pill — for headers and chrome. */
export function DemoModeBadge({ className }: { className?: string }) {
  if (!DEMO_MODE) return null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-0.5',
        'text-[10px] font-semibold uppercase tracking-widest text-sky-600 dark:text-sky-300',
        className,
      )}
    >
      <DatabaseZap className="size-3" />
      UAT Data
    </span>
  )
}

/** Full-width explanation — for the login screen and the dashboard. */
export function DemoModeBanner({ className }: { className?: string }) {
  if (!DEMO_MODE) return null

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3',
        className,
      )}
    >
      <DatabaseZap className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-300" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-sky-700 dark:text-sky-200">Focus UAT data</p>
        <p className="mt-0.5 text-xs leading-relaxed text-sky-700/90 dark:text-sky-200/80">
          The ledger, invoices, purchases, product catalogue and Dingli stock in this portal come
          from Dingli&apos;s Focus UAT (test) system, synced daily — not random sample data. Details
          the UAT system doesn&apos;t hold are marked “Not in the UAT data yet”. Production figures
          replace these when the portal goes live.
        </p>
      </div>
    </div>
  )
}
