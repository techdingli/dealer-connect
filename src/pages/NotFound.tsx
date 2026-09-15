import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CompassIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-base-950 px-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/15 to-green-500/15 text-orange-400"
      >
        <CompassIcon className="size-8" />
      </motion.div>
      <h1 className="font-display text-4xl font-bold text-base-50">404</h1>
      <p className="max-w-sm text-base-300">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link to="/">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  )
}
