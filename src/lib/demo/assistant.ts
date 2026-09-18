import { getDemoDataset } from '@/lib/demo/dataset'
import { DEMO_MACHINES } from '@/lib/demo/catalog'
import { formatCurrencyINR, formatDate } from '@/lib/utils'

/**
 * Demo replacement for /api/chat.
 *
 * The real assistant answers by querying Supabase with the dealer's access
 * token. In demo mode there is no token and no Supabase, so the same questions
 * are answered here from the generated dataset — keyword matching over the
 * handful of intents the live tools cover, no model call. Replies use the same
 * Markdown-lite subset ChatMessages already renders.
 */

// ChatMessages' Markdown subset renders **bold** and `code` only — no italics,
// so underscores would show up literally in the bubble.
const DEMO_NOTICE = '\n\n**Demo mode** — generated sample data, not your real account.'

function matches(text: string, ...terms: string[]) {
  const lower = text.toLowerCase()
  return terms.some((t) => lower.includes(t))
}

export function answerDealerQuestion(dealerId: string, question: string): string {
  const { invoices, ledger, dealerStock, serviceRequests } = getDemoDataset(dealerId)

  if (matches(question, 'ledger', 'balance', 'outstanding', 'owe', 'statement', 'account')) {
    const totalDebit = ledger.reduce((sum, e) => sum + e.debit, 0)
    const totalCredit = ledger.reduce((sum, e) => sum + e.credit, 0)
    const closing = totalDebit - totalCredit
    const first = ledger[0]
    const last = ledger[ledger.length - 1]
    const range = first && last ? ` between ${formatDate(first.entry_date)} and ${formatDate(last.entry_date)}` : ''

    return (
      `Your ledger has **${ledger.length} entries**${range}.\n\n` +
      `| | Amount |\n| --- | --- |\n` +
      `| Total debit | ${formatCurrencyINR(totalDebit)} |\n` +
      `| Total credit | ${formatCurrencyINR(totalCredit)} |\n` +
      `| Closing balance | ${formatCurrencyINR(closing)} |\n\n` +
      (closing > 0
        ? `That leaves **${formatCurrencyINR(closing)}** outstanding against your account.`
        : `Your account is fully settled — nothing outstanding.`) +
      DEMO_NOTICE
    )
  }

  if (matches(question, 'unpaid', 'overdue', 'pending payment', 'due')) {
    const open = invoices.filter((i) => i.status !== 'paid')
    if (!open.length) return `You have no unpaid invoices — nice and clear!${DEMO_NOTICE}`

    const rows = open
      .map((i) => `| ${i.invoice_number} | ${formatDate(i.invoice_date)} | ${formatCurrencyINR(i.amount)} | ${i.status} |`)
      .join('\n')
    const total = open.reduce((sum, i) => sum + i.amount, 0)

    return (
      `You have **${open.length} open invoice(s)** totalling ${formatCurrencyINR(total)}:\n\n` +
      `| Invoice # | Date | Amount | Status |\n| --- | --- | --- | --- |\n${rows}` +
      DEMO_NOTICE
    )
  }

  if (matches(question, 'invoice', 'billed', 'purchase')) {
    const total = invoices.reduce((sum, i) => sum + i.amount, 0)
    const byStatus = (['paid', 'unpaid', 'overdue'] as const)
      .map((s) => `${invoices.filter((i) => i.status === s).length} ${s}`)
      .join(', ')
    const recent = invoices[0]

    return (
      `You have **${invoices.length} invoices** on file totalling ${formatCurrencyINR(total)} (${byStatus}).\n\n` +
      (recent
        ? `Your most recent is **${recent.invoice_number}** for ${formatCurrencyINR(recent.amount)}, raised on ${formatDate(recent.invoice_date)}.`
        : '') +
      DEMO_NOTICE
    )
  }

  if (matches(question, 'stock', 'inventory', 'hold', 'machines i have', 'units')) {
    if (!dealerStock.length) return `You have no stock on record yet.${DEMO_NOTICE}`

    const rows = dealerStock
      .map((s) => `| ${s.product?.name ?? 'Unknown product'} | ${s.quantity} | ${s.location ?? '—'} |`)
      .join('\n')
    const totalUnits = dealerStock.reduce((sum, s) => sum + s.quantity, 0)

    return (
      `You're holding **${totalUnits} units** across ${dealerStock.length} lines:\n\n` +
      `| Product | Qty | Location |\n| --- | --- | --- |\n${rows}` +
      DEMO_NOTICE
    )
  }

  if (matches(question, 'service', 'ticket', 'repair', 'breakdown', 'complaint')) {
    if (!serviceRequests.length) return `You have no service requests on file.${DEMO_NOTICE}`

    const open = serviceRequests.filter((r) => r.status === 'open' || r.status === 'in_progress')
    const rows = serviceRequests
      .map((r) => `| ${r.machine_model} | ${r.priority} | ${r.status.replace('_', ' ')} | ${formatDate(r.created_at)} |`)
      .join('\n')

    return (
      `You have **${serviceRequests.length} service request(s)**, ${open.length} still open:\n\n` +
      `| Machine | Priority | Status | Raised |\n| --- | --- | --- | --- |\n${rows}` +
      DEMO_NOTICE
    )
  }

  return (
    `I can answer questions about your dealership account. Try asking about:\n\n` +
    `- Your **ledger balance** or outstanding amount\n` +
    `- **Unpaid or overdue invoices**\n` +
    `- The **stock** you're currently holding\n` +
    `- Your open **service requests**` +
    DEMO_NOTICE
  )
}

export function answerSupportQuestion(machineModel: string, question: string): string {
  const machine = DEMO_MACHINES.find((m) => m.model_name === machineModel)

  return (
    `Manual lookup for the **${machineModel}** isn't available in demo mode — the real assistant ` +
    `searches the machine's service manual and cites the section it used, but no manuals are ` +
    `loaded in this preview build.\n\n` +
    (machine ? `What I can tell you: ${machine.manual_text}\n\n` : '') +
    `Your question was: "${question.trim()}" — on the live portal this would come back with the ` +
    `relevant manual section.` +
    DEMO_NOTICE
  )
}
