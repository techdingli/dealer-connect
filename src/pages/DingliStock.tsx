import { useMemo, useState } from 'react'
import { Search, Warehouse } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { useDingliStock } from '@/hooks/queries'
import { formatDate } from '@/lib/utils'

export default function DingliStock() {
  const { data: stock, isLoading } = useDingliStock()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    return (stock ?? []).filter((s) => {
      if (!search) return true
      const name = s.product?.name?.toLowerCase() ?? ''
      const sku = s.product?.sku?.toLowerCase() ?? ''
      return name.includes(search.toLowerCase()) || sku.includes(search.toLowerCase())
    })
  }, [stock, search])

  return (
    <div>
      <PageHeader
        eyebrow="Reference Data"
        title="Dingli India Stock"
        description="Live availability across Dingli India's central warehouses. Reach out to your account manager to place a hold."
      />

      <Card className="p-4">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-base-400" />
          <Input
            placeholder="Search by product name or SKU..."
            className="max-w-sm pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <SkeletonTable rows={6} cols={4} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Warehouse} title="No stock records found" description="Try a different search term." />
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
                    <Badge tone={s.quantity > 0 ? 'success' : 'danger'} className="shrink-0">
                      {s.quantity > 0 ? `${s.quantity} in stock` : 'Out of stock'}
                    </Badge>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs text-base-400">
                    <span>{s.warehouse}</span>
                    <span>{formatDate(s.updated_at)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Table — tablet and up */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-base-600 text-left text-xs uppercase tracking-wide text-base-400">
                    <th className="py-3 pr-4 font-medium">Product</th>
                    <th className="py-3 pr-4 font-medium">Warehouse</th>
                    <th className="py-3 pr-4 text-right font-medium">Quantity</th>
                    <th className="py-3 pl-4 text-right font-medium">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-b border-base-700/60 transition-colors hover:bg-base-700/30">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-base-50">{s.product?.name ?? 'Unknown product'}</p>
                        <p className="font-mono text-xs text-base-400">{s.product?.sku}</p>
                      </td>
                      <td className="py-3 pr-4 text-base-300">{s.warehouse}</td>
                      <td className="py-3 pr-4 text-right">
                        <Badge tone={s.quantity > 0 ? 'success' : 'danger'}>
                          {s.quantity > 0 ? `${s.quantity} in stock` : 'Out of stock'}
                        </Badge>
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
