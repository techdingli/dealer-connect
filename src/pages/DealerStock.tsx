import { useMemo, useState } from 'react'
import { Search, Boxes, Download, ShoppingCart, TrendingUp, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { ColumnFilter, FilterBar, FilterCount } from '@/components/ui/ColumnFilter'
import { LastUpdated } from '@/components/ui/LastUpdated'
import { useTableFilters, type ColumnDef } from '@/hooks/useTableFilters'
import { useDealerStock } from '@/hooks/queries'
import { formatCurrencyINR, formatDate } from '@/lib/utils'
import { modelNumberOf, vehicleTypeOf } from '@/lib/products'
import { exportToCsv } from '@/lib/csv'
import type { DealerStock as DealerStockRow } from '@/types/database'

/** Purchase cost, sales to date and the margin between them for one line. */
function StockDetail({ row }: { row: DealerStockRow }) {
  const movement = row.movement
  if (!movement) {
    return <p className="text-sm text-base-400">No purchase or sales history is recorded for this line.</p>
  }

  const { purchase, sales } = movement
  const unitsSold = sales.reduce((sum, s) => sum + s.quantity, 0)
  const revenue = sales.reduce((sum, s) => sum + s.total, 0)
  const costOfSold = unitsSold * purchase.unit_cost
  const margin = revenue - costOfSold

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'On hand', value: `${row.quantity} ${row.quantity === 1 ? 'unit' : 'units'}` },
          { label: 'Purchased', value: `${purchase.quantity} ${purchase.quantity === 1 ? 'unit' : 'units'}` },
          { label: 'Sold', value: `${unitsSold} ${unitsSold === 1 ? 'unit' : 'units'}` },
          { label: 'Margin to date', value: formatCurrencyINR(margin) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-base-600 p-3">
            <p className="text-[11px] uppercase tracking-wide text-base-400">{stat.label}</p>
            <p className="mt-1 font-display text-sm font-semibold text-base-50">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Purchase */}
      <section>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-base-50">
          <ShoppingCart className="size-4 text-orange-400" />
          Purchase
        </h4>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-base-600 p-3.5 text-sm sm:grid-cols-2">
          {[
            ['Supplier', purchase.supplier],
            ['Invoice', purchase.invoice_number],
            ['Purchased on', formatDate(purchase.date)],
            ['Quantity', String(purchase.quantity)],
            ['Unit cost', formatCurrencyINR(purchase.unit_cost)],
            ['Total cost', formatCurrencyINR(purchase.total_cost)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-base-400">{label}</dt>
              <dd className="text-right font-medium text-base-100">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Sales */}
      <section>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-base-50">
          <TrendingUp className="size-4 text-green-400" />
          Sales
        </h4>
        {sales.length === 0 ? (
          <p className="rounded-xl border border-dashed border-base-600 p-4 text-center text-sm text-base-400">
            Nothing sold from this line yet — all {row.quantity} still on hand.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-base-600">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-base-600 bg-base-900/40 text-left text-xs uppercase tracking-wide text-base-400">
                  <th className="py-2.5 pl-3.5 pr-2 font-medium">Date</th>
                  <th className="py-2.5 pr-2 font-medium">Customer</th>
                  <th className="py-2.5 pr-2 text-right font-medium">Qty</th>
                  <th className="py-2.5 pr-2 text-right font-medium">Unit Price</th>
                  <th className="py-2.5 pr-3.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-b border-base-700/60 last:border-0">
                    <td className="whitespace-nowrap py-2.5 pl-3.5 pr-2 text-base-300">{formatDate(sale.date)}</td>
                    <td className="py-2.5 pr-2 text-base-50">{sale.customer}</td>
                    <td className="py-2.5 pr-2 text-right text-base-300">{sale.quantity}</td>
                    <td className="py-2.5 pr-2 text-right text-base-300">{formatCurrencyINR(sale.unit_price)}</td>
                    <td className="py-2.5 pr-3.5 text-right font-medium text-base-50">{formatCurrencyINR(sale.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default function DealerStock() {
  const { data: stock, isLoading } = useDealerStock()
  const [search, setSearch] = useState('')
  const [detailRow, setDetailRow] = useState<DealerStockRow | null>(null)

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
  const totalUnits = filtered.reduce((sum, s) => sum + s.quantity, 0)

  const lastUpdated = useMemo(
    () => (stock ?? []).reduce<string | null>((latest, s) => (!latest || s.updated_at > latest ? s.updated_at : latest), null),
    [stock],
  )

  const handleExport = () => {
    exportToCsv(
      'my-stock.csv',
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
        eyebrow="Your Dealership"
        title="My Stock"
        description="Machines and units currently held at your dealership location(s). Select a line to see what it cost and what's sold."
        action={<LastUpdated value={lastUpdated} />}
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
          <SkeletonTable rows={6} cols={6} />
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
                <button
                  key={s.id}
                  onClick={() => setDetailRow(s)}
                  className="w-full rounded-xl border border-base-700 p-3.5 text-left transition-colors hover:border-orange-500/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-base-50">{s.product?.name ?? 'Unknown product'}</p>
                      <p className="font-mono text-xs text-base-400">{modelNumberOf(s.product)}</p>
                    </div>
                    <Badge tone="green" className="shrink-0">
                      {s.quantity} {s.quantity === 1 ? 'unit' : 'units'}
                    </Badge>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {s.product?.category && <Badge tone="green">{s.product.category}</Badge>}
                    <Badge>{vehicleTypeOf(s.product)}</Badge>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs text-base-400">
                    <span>{s.warehouse ?? s.location ?? '—'}</span>
                    <span className="inline-flex items-center gap-0.5 text-orange-400">
                      Details <ChevronRight className="size-3" />
                    </span>
                  </div>
                </button>
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
                    <tr
                      key={s.id}
                      onClick={() => setDetailRow(s)}
                      className="cursor-pointer border-b border-base-700/60 transition-colors hover:bg-base-700/30"
                    >
                      <td className="whitespace-nowrap py-3 pr-4 font-mono text-xs text-base-200">{modelNumberOf(s.product)}</td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-base-50">{s.product?.name ?? 'Unknown product'}</p>
                        <p className="font-mono text-xs text-base-400">{s.product?.sku}</p>
                      </td>
                      <td className="py-3 pr-4 text-base-300">{s.product?.category ?? '—'}</td>
                      <td className="whitespace-nowrap py-3 pr-4 text-base-300">{vehicleTypeOf(s.product) || '—'}</td>
                      <td className="whitespace-nowrap py-3 pr-4 text-base-300">{s.warehouse ?? '—'}</td>
                      <td className="whitespace-nowrap py-3 pr-4 text-base-300">{s.location ?? '—'}</td>
                      <td className="py-3 pl-4 text-right">
                        <Badge tone="green">{s.quantity} {s.quantity === 1 ? 'unit' : 'units'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={!!detailRow}
        onClose={() => setDetailRow(null)}
        title={detailRow?.product?.name ?? ''}
        description={
          detailRow
            ? `${modelNumberOf(detailRow.product)} · ${detailRow.warehouse ?? detailRow.location ?? ''}`
            : undefined
        }
        className="sm:max-w-2xl"
      >
        {detailRow && <StockDetail row={detailRow} />}
      </Modal>
    </div>
  )
}
