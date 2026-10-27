import type { ReactNode } from 'react'
import { DatabaseZap } from 'lucide-react'
import { cn } from '@/lib/utils'

/* The portal's Focus data comes from the Focus UAT (test) database, which
 * doesn't carry everything the portal can show — selling prices, invoice PDFs,
 * a dealer's own holdings and sales, warehouse cities. Where a page relies on
 * one of those, it says so with these instead of showing a blank or a ₹0.
 * Remove them once the sync reads production Focus and the gaps are filled. */

/** Banner explaining what this page is missing from the UAT data. */
export function UatDataNotice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3',
        className,
      )}
    >
      <DatabaseZap className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-300" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-sky-700 dark:text-sky-200">Not in the UAT data yet</p>
        <p className="mt-0.5 text-xs leading-relaxed text-sky-700/90 dark:text-sky-200/80">{children}</p>
      </div>
    </div>
  )
}

/** Inline stand-in for a single value the UAT data doesn't have. */
export function NotInUat({ className }: { className?: string }) {
  return (
    <span
      className={cn('text-xs italic text-base-400', className)}
      title="The Focus UAT database doesn't hold this yet; it will fill in once production Focus is connected."
    >
      Not in UAT data
    </span>
  )
}
