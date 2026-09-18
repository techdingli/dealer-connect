import { useState } from 'react'
import { toast } from 'sonner'
import { Receipt, Download, Loader2, Eye, Printer } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge, toneForStatus } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { Logo } from '@/components/Logo'
import { DealerLogo } from '@/components/DealerLogo'
import { useAuth } from '@/context/AuthContext'
import { useInvoices, useInvoiceDetail, getInvoiceSignedUrl } from '@/hooks/queries'
import { formatCurrencyINR, formatDate, CURRENT_FY } from '@/lib/utils'
import type { Invoice } from '@/types/database'

export default function InvoiceHistory() {
  const { profile, dealer, isDemo } = useAuth()
  const { data: invoices, isLoading } = useInvoices()
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [detailsInvoice, setDetailsInvoice] = useState<Invoice | null>(null)
  // The invoice list already carries invoice_items, but we re-fetch the single
  // record here so the detail view always shows the authoritative row (and so
  // this follows the same per-record query pattern as the rest of the app).
  // Falls back to the row from the list while the dedicated fetch is in flight.
  const { data: invoiceDetail } = useInvoiceDetail(detailsInvoice?.id ?? null)
  const activeInvoice = invoiceDetail ?? detailsInvoice

  const total = invoices?.reduce((sum, i) => sum + Number(i.amount), 0) ?? 0

  async function handleDownload(id: string, pdfPath: string | null) {
    if (!pdfPath) {
      toast.info(
        isDemo
          ? 'PDF downloads are switched off in demo mode — use Print to save this invoice.'
          : 'No PDF is attached to this invoice yet.',
      )
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
        title={activeInvoice?.invoice_number ?? ''}
        description={activeInvoice ? `${formatDate(activeInvoice.invoice_date)} · ${activeInvoice.fy}` : undefined}
        className="sm:max-w-2xl"
      >
        {activeInvoice && (
          <div className="space-y-4">
            {/* Print rule: hide everything on the page except the invoice document itself. */}
            <style>{`
              @media print {
                body * { visibility: hidden; }
                #invoice-print-area, #invoice-print-area * { visibility: visible; }
                #invoice-print-area { position: absolute; inset: 0; width: 100%; padding: 0; }
              }
            `}</style>

            <div className="flex items-center justify-between print:hidden">
              <Badge tone={toneForStatus(activeInvoice.status)}>{activeInvoice.status}</Badge>
              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-base-600 px-2.5 py-1.5 text-xs font-medium text-base-200 hover:border-orange-500/40 hover:text-orange-300"
                >
                  <Printer className="size-3.5" />
                  Print
                </button>
                <button
                  onClick={() => handleDownload(activeInvoice.id, activeInvoice.pdf_path)}
                  disabled={downloadingId === activeInvoice.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-base-600 px-2.5 py-1.5 text-xs font-medium text-base-200 hover:border-orange-500/40 hover:text-orange-300 disabled:opacity-50"
                >
                  {downloadingId === activeInvoice.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  Download PDF
                </button>
              </div>
            </div>

            {/* The invoice document itself — kept visually self-contained (its own
                letterhead, bill-to, line items and total) so it reads like a real
                invoice a business would send, on screen and on the printed page. */}
            <div
              id="invoice-print-area"
              className="rounded-2xl border border-base-600 bg-base-900/60 p-5 print:rounded-none print:border-0 print:bg-white print:p-8 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-base-600 pb-4 print:border-black/20">
                <div>
                  <Logo compact forceScheme="light" />
                  <p className="mt-2 text-xs text-base-400 print:text-black/60">Dingli India · Dealer Connect Portal</p>
                </div>
                <div className="text-right">
                  <h3 className="font-display text-base font-semibold uppercase tracking-wide text-base-50 print:text-black">
                    Tax Invoice
                  </h3>
                  <p className="mt-1 font-mono text-sm text-base-200 print:text-black">{activeInvoice.invoice_number}</p>
                  <p className="text-xs text-base-400 print:text-black/60">{activeInvoice.fy}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-base-400 print:text-black/60">
                    Billed to
                  </p>
                  {dealer && <DealerLogo dealer={dealer} size="md" className="mt-2" />}
                  <p className="mt-1.5 font-medium text-base-50 print:text-black">
                    {profile?.company_name || profile?.dealer_name || 'Your dealership'}
                  </p>
                  {profile?.company_name && profile?.dealer_name && (
                    <p className="text-sm text-base-300 print:text-black/70">{profile.dealer_name}</p>
                  )}
                  {profile?.gstin && <p className="text-sm text-base-300 print:text-black/70">GSTIN: {profile.gstin}</p>}
                  {profile?.phone && <p className="text-sm text-base-300 print:text-black/70">{profile.phone}</p>}
                </div>
                <div className="sm:text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-base-400 print:text-black/60">
                    Invoice date
                  </p>
                  <p className="mt-1 text-base-50 print:text-black">{formatDate(activeInvoice.invoice_date)}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-base-400 print:text-black/60">
                    Status
                  </p>
                  <Badge tone={toneForStatus(activeInvoice.status)} className="mt-1 print:border-black/30 print:bg-transparent print:text-black">
                    {activeInvoice.status}
                  </Badge>
                </div>
              </div>

              {!activeInvoice.invoice_items || activeInvoice.invoice_items.length === 0 ? (
                <p className="mt-6 rounded-lg border border-dashed border-base-600 p-4 text-center text-sm text-base-400 print:border-black/20 print:text-black/60">
                  No itemized breakdown is available for this invoice.
                </p>
              ) : (
                <div className="mt-6 overflow-hidden rounded-xl border border-base-600 print:rounded-none print:border-black/20">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-base-600 bg-base-900/60 text-left text-xs uppercase tracking-wide text-base-400 print:border-black/20 print:bg-transparent print:text-black/60">
                        <th className="py-2.5 pl-3.5 pr-2 font-medium">Description</th>
                        <th className="py-2.5 pr-2 text-right font-medium">Qty</th>
                        <th className="py-2.5 pr-2 text-right font-medium">Unit Price</th>
                        <th className="py-2.5 pr-3.5 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeInvoice.invoice_items.map((item) => (
                        <tr key={item.id} className="border-b border-base-700/60 last:border-0 print:border-black/10">
                          <td className="py-2.5 pl-3.5 pr-2 text-base-50 print:text-black">{item.description}</td>
                          <td className="py-2.5 pr-2 text-right text-base-300 print:text-black/80">{item.quantity}</td>
                          <td className="py-2.5 pr-2 text-right text-base-300 print:text-black/80">
                            {formatCurrencyINR(item.unit_price)}
                          </td>
                          <td className="py-2.5 pr-3.5 text-right font-medium text-base-50 print:text-black">
                            {formatCurrencyINR(item.line_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <div className="w-full max-w-xs space-y-1.5">
                  {activeInvoice.invoice_items && activeInvoice.invoice_items.length > 0 && (
                    <div className="flex items-center justify-between text-sm text-base-300 print:text-black/70">
                      <span>Subtotal</span>
                      <span>
                        {formatCurrencyINR(activeInvoice.invoice_items.reduce((sum, item) => sum + Number(item.line_total), 0))}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-base-600 pt-1.5 print:border-black/20">
                    <span className="font-display font-semibold text-base-50 print:text-black">Total</span>
                    <span className="font-display text-lg font-semibold text-orange-400 print:text-black">
                      {formatCurrencyINR(activeInvoice.amount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
