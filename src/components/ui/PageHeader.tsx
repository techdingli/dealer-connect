import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="mb-6 flex flex-wrap items-end justify-between gap-4"
    >
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-orange-400">{eyebrow}</p>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-base-50 sm:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-base-300">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </motion.div>
  )
}
