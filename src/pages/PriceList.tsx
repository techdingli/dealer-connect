import { useMemo, useState } from 'react'
import { Search, Tags, PackageSearch } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { useProducts } from '@/hooks/queries'
import { formatCurrencyINR } from '@/lib/utils'

export default function PriceList() {
  const { data: products, isLoading } = useProducts()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('all')

  const categories = useMemo(() => {
    const set = new Set((products ?? []).map((p) => p.category).filter(Boolean) as string[])
    return ['all', ...Array.from(set)]
  }, [products])

  const filtered = useMemo(() => {
    return (products ?? []).filter((p) => {
      const matchesCategory = category === 'all' || p.category === category
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [products, search, category])

  return (
    <div>
      <PageHeader
        eyebrow="Reference Data"
        title="Price List"
        description="Current pricing across the full Dingli product range. Prices are exclusive of GST and freight unless noted."
      />

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-base-400" />
            <Input
              placeholder="Search by product name or SKU..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={
                  'rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ' +
                  (category === c
                    ? 'border-orange-500/40 bg-orange-500/15 text-orange-300'
                    : 'border-base-600 text-base-300 hover:border-base-400')
                }
              >
                {c === 'all' ? 'All categories' : c}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={PackageSearch} title="No products found" description="Try a different search term or category." />
        ) : (
          <>
            {/* Card list — phones */}
            <div className="space-y-3 md:hidden">
              {filtered.map((p) => (
                <div key={p.id} className="rounded-xl border border-base-700 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-base-50">{p.name}</p>
                      <p className="font-mono text-xs text-base-400">{p.sku}</p>
                    </div>
                    <p className="shrink-0 font-display font-semibold text-orange-400">
                      {formatCurrencyINR(p.price)}
                    </p>
                  </div>
                  {p.description && <p className="mt-2 text-xs text-base-400">{p.description}</p>}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {p.category && (
                      <Badge tone="green">
                        <Tags className="size-3" /> {p.category}
                      </Badge>
                    )}
                    <span className="text-xs text-base-400">per {p.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Table — tablet and up */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-base-600 text-left text-xs uppercase tracking-wide text-base-400">
                    <th className="py-3 pr-4 font-medium">SKU</th>
                    <th className="py-3 pr-4 font-medium">Product</th>
                    <th className="py-3 pr-4 font-medium">Category</th>
                    <th className="py-3 pr-4 font-medium">Unit</th>
                    <th className="py-3 pl-4 text-right font-medium">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-b border-base-700/60 transition-colors hover:bg-base-700/30">
                      <td className="py-3 pr-4 font-mono text-xs text-base-300">{p.sku}</td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-base-50">{p.name}</p>
                        {p.description && <p className="mt-0.5 line-clamp-1 text-xs text-base-400">{p.description}</p>}
                      </td>
                      <td className="py-3 pr-4">
                        {p.category && (
                          <Badge tone="green">
                            <Tags className="size-3" /> {p.category}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-base-300">{p.unit}</td>
                      <td className="py-3 pl-4 text-right font-display font-semibold text-orange-300">
                        {formatCurrencyINR(p.price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
