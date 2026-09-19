import { Clock } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

/**
 * One "last updated" stamp for a whole page, sitting beside the heading —
 * replaces a Last Updated column that repeated a near-identical date on every
 * row and cost a column's worth of width to do it.
 */
export function LastUpdated({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-base-600 bg-base-900/40 px-2.5 py-1.5 text-xs text-base-300',
        className,
      )}
    >
      <Clock className="size-3.5 text-base-400" />
      Last updated {formatDate(value)}
    </span>
  )
}
