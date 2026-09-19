import { useMemo, useState } from 'react'
import { Search, Warehouse, Download } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { ColumnFilter, FilterBar, FilterCount } from '@/components/ui/ColumnFilter'
import { LastUpdated } from '@/components/ui/LastUpdated'
import { useTableFilters, type ColumnDef } from '@/hooks/useTableFilters'
import { useDingliStock } from '@/hooks/queries'
import { formatDate } from '@/lib/utils'
import { modelNumberOf, vehicleTypeOf } from '@/lib/products'
import { exportToCsv } from '@/lib/csv'
import type { DingliStock as DingliStockRow } from '@/types/database'

export default function DingliStock() {
  const { data: stock, isLoading } = useDingliStock()
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

  const columns = useMemo<ColumnDef<DingliStockRow>[]>(
    () => [
      { id: 'model', label: 'Model No.', type: 'select', accessor: (s) => modelNumberOf(s.product) },
      { id: 'product', label: 'Product', type: 'text', accessor: (s) => s.product?.name ?? '' },
      { id: 'category', label: 'Category', type: 'select', accessor: (s) => s.product?.category },
      { id: 'vehicle_type', label: 'Vehicle Type', type: 'select', accessor: (s) => vehicleTypeOf(s.product) },
      { id: 'warehouse', label: 'Warehouse', type: 'select', accessor: (s) => s.warehouse },
      { id: 'location', label: 'Location', type: 'select', accessor: (s) => s.location },
      { id: 'quantity', label: 'Quantity', type: 'number', accessor: (s) => s.quantity },
    ],
    [],
  )

  const table = useTableFilters(searched, columns)
  const filtered = table.filteredRows

  // One date for the whole page rather than a column repeating it on every row.
  const lastUpdated = useMemo(
    () => (stock ?? []).reduce<string | null>((latest, s) => (!latest || s.updated_at > latest ? s.updated_at : latest), null),
    [stock],
  )

  const handleExport = () => {
    exportToCsv(
      'dingli-stock.csv',
      filtered.map((s) => ({
        'Model No.': modelNumberOf(s.product),
        Product: s.product?.name ?? 'Unknown product',
        SKU: s.product?.sku ?? '',
        Category: s.product?.category ?? '',
        'Vehicle Type': vehicleTypeOf(s.product),
        Warehouse: s.warehouse ?? '',
        Location: s.location ?? '',
        Quantity: s.quantity,
        Updated: formatDate(s.updated_at),
      })),
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Reference Data"
        title="Dingli India Stock"
        description="Live availability across Dingli India's central warehouses. Reach out to your account manager to place a hold."
        action={<LastUpdated value={lastUpdated} />}
      />

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative max-w-sm flex-1">
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
          <Button variant="secondary" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>

        <FilterBar columns={columns} table={table} className="mb-4 md:hidden" />

        {isLoading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Warehouse} title="No stock records found" description="Try a different search term or filter." />
        ) : (
          <>
            {/* Card list — phones */}
            <div className="space-y-3 md:hidden">
              {filtered.map((s) => (
                <div key={s.id} className="rounded-xl border border-base-700 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-base-50">{s.product?.name ?? 'Unknown product'}</p>
                      <p className="font-mono text-xs text-base-400">{modelNumberOf(s.product)}</p>
                    </div>
                    <Badge tone={s.quantity > 0 ? 'success' : 'danger'} className="shrink-0">
                      {s.quantity > 0 ? `${s.quantity} in stock` : 'Out of stock'}
                    </Badge>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {s.product?.category && <Badge tone="green">{s.product.category}</Badge>}
                    <Badge>{vehicleTypeOf(s.product)}</Badge>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs text-base-400">
                    <span>{s.warehouse}</span>
                    <span>{s.location}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Table — tablet and up */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-base-600 text-left">
                    {columns.map((column, i) => (
                      <th key={column.id} className={i === columns.length - 1 ? 'py-3 pl-4 font-medium' : 'py-3 pr-4 font-medium'}>
                        <ColumnFilter column={column} table={table} align={column.type === 'number' ? 'right' : 'left'} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-b border-base-700/60 transition-colors hover:bg-base-700/30">
                      <td className="whitespace-nowrap py-3 pr-4 font-mono text-xs text-base-200">{modelNumberOf(s.product)}</td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-base-50">{s.product?.name ?? 'Unknown product'}</p>
                        <p className="font-mono text-xs text-base-400">{s.product?.sku}</p>
                      </td>
                      <td className="py-3 pr-4 text-base-300">{s.product?.category ?? '—'}</td>
                      <td className="whitespace-nowrap py-3 pr-4 text-base-300">{vehicleTypeOf(s.product) || '—'}</td>
                      <td className="whitespace-nowrap py-3 pr-4 text-base-300">{s.warehouse}</td>
                      <td className="whitespace-nowrap py-3 pr-4 text-base-300">{s.location ?? '—'}</td>
                      <td className="py-3 pl-4 text-right">
                        <Badge tone={s.quantity > 0 ? 'success' : 'danger'}>
                          {s.quantity > 0 ? `${s.quantity} in stock` : 'Out of stock'}
                        </Badge>
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
