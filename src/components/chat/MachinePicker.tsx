import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Search, Wrench } from 'lucide-react'
import { useMachines } from '@/hooks/queries'
import { Skeleton } from '@/components/ui/Skeleton'

export function MachinePicker({ onSelect }: { onSelect: (modelName: string) => void }) {
  const { data: machines, isLoading } = useMachines()
  const [category, setCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of machines ?? []) counts.set(m.category, (counts.get(m.category) ?? 0) + 1)
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [machines])

  const modelsInCategory = useMemo(() => {
    if (!category) return []
    return (machines ?? [])
      .filter((m) => m.category === category)
      .filter((m) => !search || m.model_name.toLowerCase().includes(search.toLowerCase()))
  }, [machines, category, search])

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    )
  }

  // Step 2: models within the chosen category
  if (category) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-base-600 p-3">
          <button
            onClick={() => {
              setCategory(null)
              setSearch('')
            }}
            className="flex size-8 items-center justify-center rounded-lg text-base-300 hover:bg-base-700"
          >
            <ChevronLeft className="size-4" />
          </button>
          <p className="text-sm font-medium text-base-50">{category}</p>
        </div>
        <div className="border-b border-base-600 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-base-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search model..."
              className="w-full rounded-lg border border-base-500 bg-base-900/60 py-2 pl-8 pr-3 text-sm text-base-50 outline-none placeholder:text-base-400 focus:border-orange-500"
              autoFocus
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {modelsInCategory.length === 0 ? (
            <p className="p-4 text-center text-sm text-base-400">No models match "{search}".</p>
          ) : (
            modelsInCategory.map((m) => (
              <button
                key={m.model_name}
                onClick={() => onSelect(m.model_name)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-base-100 transition-colors hover:bg-base-700/60"
              >
                <span className="font-medium">{m.model_name}</span>
                {m.manual_text ? (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-green-400">Manual ready</span>
                ) : (
                  <ChevronRight className="size-3.5 text-base-500" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    )
  }

  // Step 1: category chips
  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <Wrench className="size-4 text-orange-400" />
        <p className="text-sm font-medium text-base-50">Which machine is this about?</p>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {categories.map(([name, count], i) => (
          <motion.button
            key={name}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => setCategory(name)}
            className="flex w-full items-center justify-between rounded-lg border border-base-600 px-3.5 py-2.5 text-left text-sm text-base-100 transition-colors hover:border-orange-500/40 hover:bg-base-700/40"
          >
            <span>{name}</span>
            <span className="flex items-center gap-1.5 text-xs text-base-400">
              {count} models <ChevronRight className="size-3.5" />
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
