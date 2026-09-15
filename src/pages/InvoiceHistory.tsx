import { useState } from 'react'
import { toast } from 'sonner'
import { Receipt, Download, Loader2, Eye } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge, toneForStatus } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { useInvoices, getInvoiceSignedUrl } from '@/hooks/queries'
import { formatCurrencyINR, formatDate, CURRENT_FY } from '@/lib/utils'
import type { Invoice } from '@/types/database'

export default function InvoiceHistory() {
  const { data: invoices, isLoading } = useInvoices()
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [detailsInvoice, setDetailsInvoice] = useState<Invoice | null>(null)

  const total = invoices?.reduce((sum, i) => sum + Number(i.amount), 0) ?? 0

  async function handleDownload(id: string, pdfPath: string | null) {
    if (!pdfPath) {
      toast.error('No PDF is attached to this invoice yet.')
      return
    }
    setDownloadingId(id)
    try {
      const url = await getInvoiceSignedUrl(pdfPath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('Could not generate a download link. Please try again.')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={CURRENT_FY}
        title="Invoice History"
        description="All invoices raised against your dealership for the current financial year."
      />

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-base-300">
            {invoices?.length ?? 0} invoices · Total value{' '}
            <span className="font-semibold text-base-50">{formatCurrencyINR(total)}</span>
          </p>
        </div>

        {isLoading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : !invoices || invoices.length === 0 ? (
          <EmptyState icon={Receipt} title={`No invoices for ${CURRENT_FY}`} description="Invoices raised against your account will appear here." />
        ) : (
          <>
            {/* Card list — phones */}
            <div className="space-y-3 md:hidden">
              {invoices.map((inv) => (
                <div key={inv.id} className="rounded-xl border border-base-700 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-base-400">{inv.invoice_number}</p>
                      <p className="text-xs text-base-400">{formatDate(inv.invoice_date)}</p>
                    </div>
                    <Badge tone={toneForStatus(inv.status)}>{inv.status}</Badge>
                  </div>
                  <p className="mt-2 font-display text-lg font-semibold text-base-50">
                    {formatCurrencyINR(inv.amount)}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setDetailsInvoice(inv)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-base-600 py-2 text-xs font-medium text-base-200 hover:border-orange-500/40 hover:text-orange-300"
                    >
                      <Eye className="size-3.5" />
                      View details
                    </button>
                    <button
                      onClick={() => handleDownload(inv.id, inv.pdf_path)}
                      disabled={downloadingId === inv.id}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-base-600 py-2 text-xs font-medium text-base-200 hover:border-orange-500/40 hover:text-orange-300 disabled:opacity-50"
                    >
                      {downloadingId === inv.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Download className="size-3.5" />
                      )}
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Table — tablet and up */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-base-600 text-left text-xs uppercase tracking-wide text-base-400">
                    <th className="py-3 pr-4 font-medium">Invoice #</th>
                    <th className="py-3 pr-4 font-medium">Date</th>
                    <th className="py-3 pr-4 text-right font-medium">Amount</th>
                    <th className="py-3 pr-4 font-medium">Status</th>
                    <th className="py-3 pl-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-base-700/60 transition-colors hover:bg-base-700/30">
                      <td className="py-3 pr-4 font-mono text-xs text-base-200">{inv.invoice_number}</td>
                      <td className="py-3 pr-4 text-base-300">{formatDate(inv.invoice_date)}</td>
                      <td className="py-3 pr-4 text-right font-display font-semibold text-base-50">
                        {formatCurrencyINR(inv.amount)}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={toneForStatus(inv.status)}>{inv.status}</Badge>
                      </td>
                      <td className="py-3 pl-4">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setDetailsInvoice(inv)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-base-600 px-2.5 py-1.5 text-xs font-medium text-base-200 transition-colors hover:border-orange-500/40 hover:text-orange-300"
                          >
                            <Eye className="size-3.5" />
                            View details
                          </button>
                          <button
                            onClick={() => handleDownload(inv.id, inv.pdf_path)}
                            disabled={downloadingId === inv.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-base-600 px-2.5 py-1.5 text-xs font-medium text-base-200 transition-colors hover:border-orange-500/40 hover:text-orange-300 disabled:opacity-50"
                          >
                            {downloadingId === inv.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Download className="size-3.5" />
                            )}
                            Download
                          </button>
                        </div>
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
        open={!!detailsInvoice}
        onClose={() => setDetailsInvoice(null)}
        title={detailsInvoice?.invoice_number ?? ''}
        description={detailsInvoice ? `${formatDate(detailsInvoice.invoice_date)} · ${detailsInvoice.fy}` : undefined}
      >
        {detailsInvoice && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge tone={toneForStatus(detailsInvoice.status)}>{detailsInvoice.status}</Badge>
              <button
                onClick={() => handleDownload(detailsInvoice.id, detailsInvoice.pdf_path)}
                disabled={downloadingId === detailsInvoice.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-base-600 px-2.5 py-1.5 text-xs font-medium text-base-200 hover:border-orange-500/40 hover:text-orange-300 disabled:opacity-50"
              >
                {downloadingId === detailsInvoice.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                Download PDF
              </button>
            </div>

            {!detailsInvoice.invoice_items || detailsInvoice.invoice_items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-base-600 p-4 text-center text-sm text-base-400">
                No itemized breakdown is available for this invoice.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-base-600">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-base-600 bg-base-900/60 text-left text-xs uppercase tracking-wide text-base-400">
                      <th className="py-2.5 pl-3.5 pr-2 font-medium">Item</th>
                      <th className="py-2.5 pr-2 text-right font-medium">Qty</th>
                      <th className="py-2.5 pr-3.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailsInvoice.invoice_items.map((item) => (
                      <tr key={item.id} className="border-b border-base-700/60 last:border-0">
                        <td className="py-2.5 pl-3.5 pr-2">
                          <p className="text-base-50">{item.description}</p>
                          <p className="text-xs text-base-400">{formatCurrencyINR(item.unit_price)} / unit</p>
                        </td>
                        <td className="py-2.5 pr-2 text-right text-base-300">{item.quantity}</td>
                        <td className="py-2.5 pr-3.5 text-right font-medium text-base-50">
                          {formatCurrencyINR(item.line_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-base-600 pt-3">
              <span className="font-display font-semibold text-base-50">Total</span>
              <span className="font-display text-lg font-semibold text-orange-400">
                {formatCurrencyINR(detailsInvoice.amount)}
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
