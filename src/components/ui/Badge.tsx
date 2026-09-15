import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'orange' | 'green' | 'success' | 'warning' | 'danger'

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-base-600/60 text-base-100 border-base-500',
  orange: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  green: 'bg-green-500/15 text-green-300 border-green-500/30',
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  danger: 'bg-red-500/15 text-red-300 border-red-500/30',
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  )
}

/** Maps common status strings across invoices/feedback/service requests to a Badge tone. */
export function toneForStatus(status: string): Tone {
  switch (status) {
    case 'paid':
    case 'resolved':
    case 'closed':
      return 'success'
    case 'overdue':
    case 'critical':
      return 'danger'
    case 'in_progress':
    case 'reviewed':
    case 'high':
      // Deliberately neutral, not 'green' — green now doubles as the brand
      // accent and as 'success' above, so reusing it here would make
      // "high priority" read as a positive/good status instead of urgent.
      return 'neutral'
    case 'unpaid':
    case 'open':
    case 'medium':
      return 'warning'
    default:
      return 'neutral'
  }
}
