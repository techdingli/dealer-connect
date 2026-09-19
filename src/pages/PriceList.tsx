import { useMemo, useState } from 'react'
import { Search, Tags, PackageSearch, BookOpen } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { ColumnFilter, FilterBar, FilterCount } from '@/components/ui/ColumnFilter'
import { ManualViewer } from '@/components/ManualViewer'
import { useTableFilters, type ColumnDef } from '@/hooks/useTableFilters'
import { useProducts, useMachines } from '@/hooks/queries'
import { formatCurrencyINR } from '@/lib/utils'
import { modelNumberOf, vehicleTypeOf } from '@/lib/products'
import type { Product } from '@/types/database'

export default function PriceList() {
  const { data: products, isLoading: productsLoading } = useProducts()
  const { data: machines, isLoading: machinesLoading } = useMachines()
  const [search, setSearch] = useState('')
  const [manualFor, setManualFor] = useState<{ model: string; text: string } | null>(null)

  const isLoading = productsLoading || machinesLoading

  /**
   * useMachines only ever returns models with a manual on file (the live query
   * filters on manual_text), so this map is both the manual lookup and the
   * test for whether a product belongs on this page at all.
   */
  const manualsByModel = useMemo(
    () => new Map((machines ?? []).filter((m) => m.manual_text).map((m) => [m.model_name, m.manual_text!])),
    [machines],
  )

  // This page deliberately lists only models with a manual — spare parts and
  // the machine variants without one are excluded entirely.
  const withManuals = useMemo(
    () => (products ?? []).filter((p) => manualsByModel.has(modelNumberOf(p))),
    [products, manualsByModel],
  )

  const searched = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return withManuals
    return withManuals.filter(
      (p) => p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query),
    )
  }, [withManuals, search])

  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      { id: 'model', label: 'Model No.', type: 'select', accessor: (p) => modelNumberOf(p) },
      { id: 'name', label: 'Product', type: 'text', accessor: (p) => p.name },
      { id: 'category', label: 'Category', type: 'select', accessor: (p) => p.category },
      { id: 'vehicle_type', label: 'Vehicle Type', type: 'select', accessor: (p) => vehicleTypeOf(p) },
      { id: 'unit', label: 'Unit', type: 'select', accessor: (p) => p.unit },
      { id: 'price', label: 'Price', type: 'number', accessor: (p) => p.price },
    ],
    [],
  )

  const table = useTableFilters(searched, columns)
  const filtered = table.filteredRows

  const openManual = (product: Product) => {
    const model = modelNumberOf(product)
    const text = manualsByModel.get(model)
    if (text) setManualFor({ model, text })
  }

  return (
    <div>
      <PageHeader
        eyebrow="Reference Data"
        title="Price List"
        description="Current pricing for every Dingli model with a service manual on file. Prices are exclusive of GST and freight unless noted."
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

        <FilterBar columns={columns} table={table} className="mb-4 md:hidden" />

        {isLoading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title={withManuals.length === 0 ? 'No models with a manual on file' : 'No products found'}
            description={
              withManuals.length === 0
                ? 'This page lists models that have a service manual loaded. None are available yet.'
                : 'Try a different search term or filter.'
            }
          />
        ) : (
          <>
            {/* Card list — phones */}
            <div className="space-y-3 md:hidden">
              {filtered.map((p) => (
                <div key={p.id} className="rounded-xl border border-base-700 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-base-50">{p.name}</p>
                      <p className="font-mono text-xs text-base-400">{modelNumberOf(p)}</p>
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
                  <button
                    onClick={() => openManual(p)}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-base-600 py-2 text-xs font-medium text-base-200 hover:border-orange-500/40 hover:text-orange-300"
                  >
                    <BookOpen className="size-3.5" />
                    View manual
                  </button>
                </div>
              ))}
            </div>

            {/* Table — tablet and up */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-base-600 text-left">
                    {columns.map((column) => (
                      <th key={column.id} className="py-3 pr-4 font-medium">
                        <ColumnFilter column={column} table={table} align={column.type === 'number' ? 'right' : 'left'} />
                      </th>
                    ))}
                    <th className="py-3 pl-4 text-right text-xs font-medium uppercase tracking-wide text-base-400">
                      Manual
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-b border-base-700/60 transition-colors hover:bg-base-700/30">
                      <td className="whitespace-nowrap py-3 pr-4 font-mono text-xs text-base-200">{modelNumberOf(p)}</td>
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
                      <td className="whitespace-nowrap py-3 pr-4 text-base-300">{vehicleTypeOf(p) || '—'}</td>
                      <td className="py-3 pr-4 text-base-300">{p.unit}</td>
                      <td className="py-3 pr-4 text-right font-display font-semibold text-orange-300">
                        {formatCurrencyINR(p.price)}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <button
                          onClick={() => openManual(p)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-base-600 px-2.5 py-1.5 text-xs font-medium text-base-200 transition-colors hover:border-orange-500/40 hover:text-orange-300"
                        >
                          <BookOpen className="size-3.5" />
                          View
                        </button>
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
        open={!!manualFor}
        onClose={() => setManualFor(null)}
        title={manualFor ? `${manualFor.model} — Service Manual` : ''}
        description="Search the manual, or scroll the sections below."
        className="sm:max-w-3xl"
      >
        {manualFor && <ManualViewer manualText={manualFor.text} />}
      </Modal>
    </div>
  )
}
