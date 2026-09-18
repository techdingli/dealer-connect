import { useMemo } from 'react'
import { ScrollText, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { ColumnFilter, FilterBar, FilterCount } from '@/components/ui/ColumnFilter'
import { useTableFilters, type ColumnDef } from '@/hooks/useTableFilters'
import { useLedger } from '@/hooks/queries'
import { formatCurrencyINR, formatCurrencyShortINR, formatDate, CURRENT_FY } from '@/lib/utils'
import type { DealerLedgerEntry } from '@/types/database'

type LedgerRow = DealerLedgerEntry & { balance: number }

export default function Ledger() {
  const { data: entries, isLoading } = useLedger()

  const totalDebit = entries?.reduce((sum, e) => sum + Number(e.debit), 0) ?? 0
  const totalCredit = entries?.reduce((sum, e) => sum + Number(e.credit), 0) ?? 0

  // dealer_ledger has no running_balance column (see supabase/migrations/0007_dealer_ledger.sql),
  // so it's computed here from the entries as fetched — already ordered by entry_date
  // ascending — as a cumulative sum of (debit - credit). Debits (e.g. Sales Invoices)
  // increase what the dealer owes; credits (e.g. Receipts/Payments) reduce it.
  const entriesWithBalance = useMemo(() => {
    let runningTotal = 0
    return entries?.map((e) => {
      runningTotal += Number(e.debit) - Number(e.credit)
      return { ...e, balance: runningTotal }
    })
  }, [entries])

  const closingBalance =
    entriesWithBalance && entriesWithBalance.length > 0
      ? entriesWithBalance[entriesWithBalance.length - 1].balance
      : 0

  const columns = useMemo<ColumnDef<LedgerRow>[]>(
    () => [
      { id: 'entry_date', label: 'Date', type: 'date', accessor: (e) => e.entry_date },
      { id: 'description', label: 'Description', type: 'text', accessor: (e) => e.description },
      { id: 'voucher_type', label: 'Type', type: 'select', accessor: (e) => e.voucher_type },
      { id: 'debit', label: 'Debit', type: 'number', accessor: (e) => e.debit },
      { id: 'credit', label: 'Credit', type: 'number', accessor: (e) => e.credit },
      { id: 'balance', label: 'Balance', type: 'number', accessor: (e) => e.balance },
      { id: 'voucher_no', label: 'Voucher', type: 'text', accessor: (e) => e.voucher_no },
    ],
    [],
  )

  // The running balance is worked out above on the full, date-ordered list, so
  // each row keeps the true balance of the account at that moment. Filtering or
  // re-sorting afterwards hides or reorders rows but never recomputes it — the
  // figure against an entry stays correct whatever else is on screen.
  const table = useTableFilters(entriesWithBalance, columns)
  const visible = table.filteredRows

  return (
    <div>
      <PageHeader
        eyebrow={CURRENT_FY}
        title="Ledger"
        description="Payments, receipts, invoices and adjustments recorded against your account, as synced from Focus."
      />

      <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ScrollText} label="Total Debit" value={formatCurrencyShortINR(totalDebit)} tone="orange" />
        <StatCard icon={ScrollText} label="Total Credit" value={formatCurrencyShortINR(totalCredit)} tone="green" delay={0.05} />
        <StatCard icon={Wallet} label="Closing Balance" value={formatCurrencyShortINR(closingBalance)} tone="orange" delay={0.1} />
        <StatCard icon={ScrollText} label="Entries" value={String(entries?.length ?? 0)} tone="green" delay={0.15} />
      </div>

      {/* Chips only on phones, where the table header isn't rendered — the
          desktop equivalent lives in the column headers below. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterBar columns={columns} table={table} className="md:hidden" />
        <FilterCount table={table} />
      </div>

      <p className="mb-6 text-xs text-base-400">
        Balance is computed from the entries shown below and may not reflect your full statement of account — some
        invoices may not yet be consistently included in what's synced from Focus.
      </p>

      <Card className="p-4">
        {isLoading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={table.activeFilterCount ? 'No entries match those filters' : `No ledger entries for ${CURRENT_FY}`}
            description={
              table.activeFilterCount
                ? 'Try clearing a column filter.'
                : 'Your account statement will appear here once transactions are posted.'
            }
          />
        ) : (
          <>
            {/* Card list — phones */}
            <div className="space-y-3 md:hidden">
              {visible.map((e) => (
                <div key={e.body_id} className="rounded-xl border border-base-700 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-base-50">{e.description}</p>
                      {e.voucher_no ? <p className="mt-0.5 text-xs text-base-400">{e.voucher_no}</p> : null}
                    </div>
                    <p className="shrink-0 text-xs text-base-400">{formatDate(e.entry_date)}</p>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-sm">
                    <span className="text-orange-300">{e.debit > 0 ? `Dr ${formatCurrencyINR(e.debit)}` : ''}</span>
                    <span className="text-green-400">{e.credit > 0 ? `Cr ${formatCurrencyINR(e.credit)}` : ''}</span>
                  </div>
                  <p className="mt-1.5 text-right font-display text-sm font-semibold text-base-50">
                    Balance: {formatCurrencyINR(e.balance)}
                  </p>
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
                    <th className="py-3 pr-4 font-medium"><ColumnFilter column={columns[3]!} table={table} align="right" /></th>
                    <th className="py-3 pr-4 font-medium"><ColumnFilter column={columns[4]!} table={table} align="right" /></th>
                    <th className="py-3 pr-4 font-medium"><ColumnFilter column={columns[5]!} table={table} align="right" /></th>
                    <th className="py-3 pl-4 font-medium"><ColumnFilter column={columns[6]!} table={table} align="right" /></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => (
                    <tr key={e.body_id} className="border-b border-base-700/60 transition-colors hover:bg-base-700/30">
                      <td className="py-3 pr-4 text-base-300">{formatDate(e.entry_date)}</td>
                      <td className="py-3 pr-4 text-base-50">{e.description}</td>
                      <td className="py-3 pr-4 text-base-300">{e.voucher_type ?? '—'}</td>
                      <td className="py-3 pr-4 text-right text-orange-300">{e.debit > 0 ? formatCurrencyINR(e.debit) : '—'}</td>
                      <td className="py-3 pr-4 text-right text-green-400">{e.credit > 0 ? formatCurrencyINR(e.credit) : '—'}</td>
                      <td className="py-3 pr-4 text-right font-display font-semibold text-base-50">
                        {formatCurrencyINR(e.balance)}
                      </td>
                      <td className="py-3 pl-4 text-right text-base-400">{e.voucher_no ?? '—'}</td>
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
