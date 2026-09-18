import { useMemo, useState } from 'react'
import { Search, Boxes, Download } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { ColumnFilter, FilterBar, FilterCount } from '@/components/ui/ColumnFilter'
import { useTableFilters, type ColumnDef } from '@/hooks/useTableFilters'
import { useDealerStock } from '@/hooks/queries'
import { formatDate } from '@/lib/utils'
import { exportToCsv } from '@/lib/csv'
import type { DealerStock as DealerStockRow } from '@/types/database'

export default function DealerStock() {
  const { data: stock, isLoading } = useDealerStock()
  const [search, setSearch] = useState('')

  const searched = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return stock ?? []
    return (stock ?? []).filter((s) => {
      const name = s.product?.name?.toLowerCase() ?? ''
      const sku = s.product?.sku?.toLowerCase() ?? ''
      return name.includes(query) || sku.includes(query)
    })
  }, [stock, search])

  const columns = useMemo<ColumnDef<DealerStockRow>[]>(
    () => [
      { id: 'product', label: 'Product', type: 'text', accessor: (s) => s.product?.name ?? '' },
      { id: 'location', label: 'Location', type: 'select', accessor: (s) => s.location },
      { id: 'quantity', label: 'Quantity', type: 'number', accessor: (s) => s.quantity },
      { id: 'updated_at', label: 'Last Updated', type: 'date', accessor: (s) => s.updated_at },
    ],
    [],
  )

  const table = useTableFilters(searched, columns)
  const filtered = table.filteredRows
  const totalUnits = filtered.reduce((sum, s) => sum + s.quantity, 0)

  const handleExport = () => {
    exportToCsv(
      'my-stock.csv',
      filtered.map((s) => ({
        Product: s.product?.name ?? 'Unknown product',
        SKU: s.product?.sku ?? '',
        Category: s.product?.category ?? '',
        Quantity: s.quantity,
        Location: s.location ?? '',
        Updated: formatDate(s.updated_at),
      })),
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Your Dealership"
        title="My Stock"
        description="Machines and units currently held at your dealership location(s)."
      />

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-base-400" />
            <Input
              placeholder="Search by product name or SKU..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4">
            <FilterCount table={table} />
            <p className="text-sm text-base-300">
              Total: <span className="font-semibold text-base-50">{totalUnits.toLocaleString('en-IN')}</span> units
            </p>
            <Button variant="secondary" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
              <Download className="size-4" />
              Export CSV
            </Button>
          </div>
        </div>

        <FilterBar columns={columns} table={table} className="mb-4 md:hidden" />

        {isLoading ? (
          <SkeletonTable rows={6} cols={4} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No stock on record"
            description="Once Dingli India dispatches machines to your dealership, they'll show up here."
          />
        ) : (
          <>
            {/* Card list — phones */}
            <div className="space-y-3 md:hidden">
              {filtered.map((s) => (
                <div key={s.id} className="rounded-xl border border-base-700 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-base-50">{s.product?.name ?? 'Unknown product'}</p>
                      <p className="font-mono text-xs text-base-400">{s.product?.sku}</p>
                    </div>
                    <Badge tone="green" className="shrink-0">
                      {s.quantity} units
                    </Badge>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs text-base-400">
                    <span>{s.location ?? '—'}</span>
                    <span>{formatDate(s.updated_at)}</span>
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
                    <th className="py-3 pr-4 font-medium"><ColumnFilter column={columns[2]!} table={table} align="right" /></th>
                    <th className="py-3 pl-4 font-medium"><ColumnFilter column={columns[3]!} table={table} align="right" /></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-b border-base-700/60 transition-colors hover:bg-base-700/30">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-base-50">{s.product?.name ?? 'Unknown product'}</p>
                        <p className="font-mono text-xs text-base-400">{s.product?.sku}</p>
                      </td>
                      <td className="py-3 pr-4 text-base-300">{s.location ?? '—'}</td>
                      <td className="py-3 pr-4 text-right">
                        <Badge tone="green">{s.quantity} units</Badge>
                      </td>
                      <td className="py-3 pl-4 text-right text-xs text-base-400">{formatDate(s.updated_at)}</td>
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
