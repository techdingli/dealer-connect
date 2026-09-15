import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'orange',
  delay = 0,
}: {
  icon: LucideIcon
  label: string
  value: string
  tone?: 'orange' | 'green'
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3 }}
    >
      <Card className="group relative overflow-hidden p-5 transition-colors hover:border-base-400">
        <div
          className={cn(
            'absolute -right-6 -top-6 size-24 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-100 opacity-60',
            tone === 'orange' ? 'bg-orange-500/30' : 'bg-green-500/30',
          )}
        />
        <div className="relative flex items-center gap-4">
          <div
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl',
              tone === 'orange'
                ? 'bg-orange-500/15 text-orange-400'
                : 'bg-green-500/15 text-green-400',
            )}
          >
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-base-300">{label}</p>
            <p className="mt-0.5 truncate font-display text-xl font-semibold text-base-50">{value}</p>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}
