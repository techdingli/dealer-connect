import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-base-500 px-6 py-16 text-center"
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/15 to-green-500/15 text-orange-400">
        <Icon className="size-7" />
      </div>
      <h3 className="font-display text-base font-semibold text-base-50">{title}</h3>
      {description && <p className="max-w-sm text-sm text-base-300">{description}</p>}
      {action}
    </motion.div>
  )
}
