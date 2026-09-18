import { useMemo, useState } from 'react'
import { Search, Tags, PackageSearch } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { ColumnFilter, FilterBar, FilterCount } from '@/components/ui/ColumnFilter'
import { useTableFilters, type ColumnDef } from '@/hooks/useTableFilters'
import { useProducts } from '@/hooks/queries'
import { formatCurrencyINR } from '@/lib/utils'
import type { Product } from '@/types/database'

export default function PriceList() {
  const { data: products, isLoading } = useProducts()
  const [search, setSearch] = useState('')

  // The search box spans several columns at once, which a per-column filter
  // can't do — so it runs first, and the column filters narrow what it returns.
  const searched = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return products ?? []
    return (products ?? []).filter(
      (p) => p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query),
    )
  }, [products, search])

  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      { id: 'sku', label: 'SKU', type: 'text', accessor: (p) => p.sku },
      { id: 'name', label: 'Product', type: 'text', accessor: (p) => p.name },
      { id: 'category', label: 'Category', type: 'select', accessor: (p) => p.category },
      { id: 'unit', label: 'Unit', type: 'select', accessor: (p) => p.unit },
      { id: 'price', label: 'Price', type: 'number', accessor: (p) => p.price },
    ],
    [],
  )

  const table = useTableFilters(searched, columns)
  const filtered = table.filteredRows

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
          <FilterCount table={table} />
        </div>

        {/* Phones don't render the table header, so the same filters appear as chips. */}
        <FilterBar columns={columns} table={table} className="mb-4 md:hidden" />

        {isLoading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={PackageSearch} title="No products found" description="Try a different search term or filter." />
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
                  <tr className="border-b border-base-600 text-left">
                    <th className="py-3 pr-4 font-medium"><ColumnFilter column={columns[0]!} table={table} /></th>
                    <th className="py-3 pr-4 font-medium"><ColumnFilter column={columns[1]!} table={table} /></th>
                    <th className="py-3 pr-4 font-medium"><ColumnFilter column={columns[2]!} table={table} /></th>
                    <th className="py-3 pr-4 font-medium"><ColumnFilter column={columns[3]!} table={table} /></th>
                    <th className="py-3 pl-4 font-medium"><ColumnFilter column={columns[4]!} table={table} align="right" /></th>
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
