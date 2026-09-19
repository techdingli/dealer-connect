import { getDemoDataset } from '@/lib/demo/dataset'
import { DEMO_MACHINES, DEMO_PRODUCTS, DEMO_PRODUCT_SPECS } from '@/lib/demo/catalog'
import { formatCurrencyINR, formatDate } from '@/lib/utils'
import { modelNumberOf, vehicleTypeOf } from '@/lib/products'

/**
 * Demo replacement for /api/chat.
 *
 * The real assistant answers by querying Supabase with the dealer's access
 * token. In demo mode there is no token and no Supabase, so the same questions
 * are answered here from the generated dataset — keyword matching over the
 * intents the live tools cover, no model call. Replies use the same
 * Markdown-lite subset ChatMessages renders (**bold**, lists, pipe tables),
 * and deliberately read as normal answers: nothing here announces demo mode,
 * because the banners on the pages already say so.
 */

function matches(text: string, ...terms: string[]) {
  const lower = text.toLowerCase()
  return terms.some((t) => lower.includes(t))
}

// ---------------------------------------------------------------------------
// Dealer account questions
// ---------------------------------------------------------------------------

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
        : `Your account is fully settled — nothing outstanding.`)
    )
  }

  if (matches(question, 'unpaid', 'overdue', 'pending payment', 'due')) {
    const open = invoices.filter((i) => i.status !== 'paid')
    if (!open.length) return `You have no unpaid invoices — nice and clear!`

    const rows = open
      .map((i) => `| ${i.invoice_number} | ${formatDate(i.invoice_date)} | ${formatCurrencyINR(i.amount)} | ${i.status} |`)
      .join('\n')
    const total = open.reduce((sum, i) => sum + i.amount, 0)

    return (
      `You have **${open.length} open invoice(s)** totalling ${formatCurrencyINR(total)}:\n\n` +
      `| Invoice # | Date | Amount | Status |\n| --- | --- | --- | --- |\n${rows}`
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
        : '')
    )
  }

  if (matches(question, 'stock', 'inventory', 'hold', 'machines i have', 'units')) {
    if (!dealerStock.length) return `You have no stock on record yet.`

    const rows = dealerStock
      .map((s) => `| ${s.product?.name ?? 'Unknown product'} | ${s.quantity} | ${s.location ?? '—'} |`)
      .join('\n')
    const totalUnits = dealerStock.reduce((sum, s) => sum + s.quantity, 0)
    // A stock figure is only as good as its last sync, so always date it.
    const lastUpdated = dealerStock.reduce(
      (latest, s) => (s.updated_at > latest ? s.updated_at : latest),
      dealerStock[0]!.updated_at,
    )

    return (
      `You're holding **${totalUnits} units** across ${dealerStock.length} lines:\n\n` +
      `| Product | Qty | Location |\n| --- | --- | --- |\n${rows}\n\n` +
      `Stock last updated ${formatDate(lastUpdated)}.`
    )
  }

  if (matches(question, 'service', 'ticket', 'repair', 'breakdown', 'complaint')) {
    if (!serviceRequests.length) return `You have no service requests on file.`

    const open = serviceRequests.filter((r) => r.status === 'open' || r.status === 'in_progress')
    const rows = serviceRequests
      .map((r) => `| ${r.machine_model} | ${r.priority} | ${r.status.replace('_', ' ')} | ${formatDate(r.created_at)} |`)
      .join('\n')

    return (
      `You have **${serviceRequests.length} service request(s)**, ${open.length} still open:\n\n` +
      `| Machine | Priority | Status | Raised |\n| --- | --- | --- | --- |\n${rows}`
    )
  }

  return (
    `I can answer questions about your dealership account. Try asking about:\n\n` +
    `- Your **ledger balance** or outstanding amount\n` +
    `- **Unpaid or overdue invoices**\n` +
    `- The **stock** you're currently holding\n` +
    `- Your open **service requests**`
  )
}

// ---------------------------------------------------------------------------
// Product / sales questions
// ---------------------------------------------------------------------------

const MACHINES = DEMO_PRODUCTS.filter((p) => p.category !== 'Spare Parts')

const specOf = (sku: string) => DEMO_PRODUCT_SPECS.get(sku)

const TABLE_HEAD = `| Model | Working height | Use | Drive | List price |\n| --- | --- | --- | --- | --- |\n`

function productLine(product: (typeof DEMO_PRODUCTS)[number]): string {
  const spec = specOf(product.sku)
  const height = spec?.workingHeight ? `${spec.workingHeight} m` : '—'
  return `| ${modelNumberOf(product)} | ${height} | ${spec?.terrain ?? '—'} | ${vehicleTypeOf(product)} | ${formatCurrencyINR(product.price)} |`
}

function describe(product: (typeof DEMO_PRODUCTS)[number]): string {
  const spec = specOf(product.sku)
  return (
    `**${product.name}**\n\n` +
    `- Working height: ${spec?.workingHeight ? `${spec.workingHeight} m` : 'n/a'}\n` +
    `- Designed for: ${spec?.terrain ?? 'n/a'}\n` +
    `- Drive: ${vehicleTypeOf(product)}\n` +
    `- Category: ${product.category}\n` +
    `- List price: ${formatCurrencyINR(product.price)}\n\n` +
    product.description
  )
}

/** Pulls a height in metres out of "needs to reach 12m", "around 15 metres", etc. */
function heightFrom(question: string): number | null {
  const withUnit = question.match(/(\d+(?:\.\d+)?)\s*(?:m\b|mtr|meter|metre)/i)
  if (withUnit) return Number(withUnit[1])
  // A bare number only counts when the question is clearly about reach.
  if (/\b(height|reach|tall|high|storey|floor)\b/i.test(question)) {
    const bare = question.match(/\b(\d{1,2}(?:\.\d+)?)\b/)
    if (bare) return Number(bare[1])
  }
  return null
}

const CATEGORY_KEYWORDS: [string, string[]][] = [
  ['Rough Terrain Scissors', ['rough terrain', 'rt scissor']],
  ['Articulating Booms', ['articulating', 'knuckle', 'up and over', 'up-and-over']],
  ['Telescopic Booms', ['telescopic', 'stick boom', 'straight boom']],
  ['Vertical Mast Lifts', ['mast', 'amwp', 'push around', 'push-around']],
  ['Spare Parts', ['spare', 'battery', 'charger', 'tyre', 'guardrail']],
  ['Scissor Lifts', ['scissor', 'slab', 'jcpt']],
]

export function answerProductQuestion(question: string): string {
  const q = question.toLowerCase()
  const squashed = q.replace(/[\s-]/g, '')

  // 1. A specific model by name — the most precise signal, so check it first.
  const named = DEMO_PRODUCTS.find((p) => {
    const model = modelNumberOf(p).toLowerCase().replace(/[\s-]/g, '')
    return model.length > 3 && squashed.includes(model)
  })
  if (named) {
    const siblings = MACHINES.filter((p) => p.id !== named.id && p.category === named.category).slice(0, 3)
    return (
      describe(named) +
      (siblings.length ? `\n\nOthers in the same family:\n\n${TABLE_HEAD}${siblings.map(productLine).join('\n')}` : '')
    )
  }

  // 2. Height-led enquiry — the usual way a sales question arrives.
  const height = heightFrom(question)
  if (height !== null) {
    const indoor = matches(q, 'indoor', 'inside', 'warehouse', 'mall', 'factory', 'slab')
    const outdoor = matches(q, 'outdoor', 'outside', 'site', 'terrain', 'uneven', 'ground')

    let candidates = MACHINES.filter((p) => (specOf(p.sku)?.workingHeight ?? 0) >= height)
    if (indoor && !outdoor) candidates = candidates.filter((p) => specOf(p.sku)?.terrain?.includes('Indoor'))
    if (outdoor && !indoor) candidates = candidates.filter((p) => specOf(p.sku)?.terrain?.includes('Outdoor'))
    candidates.sort((a, b) => (specOf(a.sku)?.workingHeight ?? 0) - (specOf(b.sku)?.workingHeight ?? 0))

    if (!candidates.length) {
      const tallest = [...MACHINES].sort(
        (a, b) => (specOf(b.sku)?.workingHeight ?? 0) - (specOf(a.sku)?.workingHeight ?? 0),
      )[0]!
      return (
        `Nothing in the current range reaches ${height} m${indoor ? ' indoors' : outdoor ? ' on rough terrain' : ''}. ` +
        `The tallest is the **${modelNumberOf(tallest)}** at ${specOf(tallest.sku)?.workingHeight} m working height.`
      )
    }

    const picks = candidates.slice(0, 4)
    const context = indoor ? ' indoors' : outdoor ? ' outdoors on rough terrain' : ''
    return (
      `For ${height} m${context}, the closest fit is the **${modelNumberOf(picks[0]!)}** ` +
      `at ${specOf(picks[0]!.sku)?.workingHeight} m working height.\n\n` +
      `${TABLE_HEAD}${picks.map(productLine).join('\n')}\n\n` +
      `Working height already includes the operator's reach, so a ${height} m task wants a machine rated at or just above it.`
    )
  }

  // 3. A product family.
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (!matches(q, ...keywords)) continue
    const rows = DEMO_PRODUCTS.filter((p) => p.category === category)
    if (category === 'Spare Parts') {
      return (
        `**Spare parts and consumables:**\n\n| Part | Part no. | Price |\n| --- | --- | --- |\n` +
        rows.map((p) => `| ${p.name} | ${modelNumberOf(p)} | ${formatCurrencyINR(p.price)} |`).join('\n')
      )
    }
    return `**${category}** in the current range:\n\n${TABLE_HEAD}${rows.map(productLine).join('\n')}`
  }

  // 4. Drive type / duty.
  if (matches(q, 'electric', 'battery', 'indoor', 'emission', 'noise')) {
    const rows = MACHINES.filter((p) => vehicleTypeOf(p) === 'Electric')
    return (
      `**Electric machines** — no emissions, low noise and non-marking tyres, so they suit indoor and finished floors:\n\n` +
      `${TABLE_HEAD}${rows.map(productLine).join('\n')}`
    )
  }

  if (matches(q, 'diesel', '4wd', 'rough', 'terrain', 'outdoor', 'site')) {
    const rows = MACHINES.filter((p) => vehicleTypeOf(p).startsWith('Diesel'))
    return (
      `**Diesel and 4WD machines** for outdoor work and uneven ground:\n\n` +
      `${TABLE_HEAD}${rows.map(productLine).join('\n')}`
    )
  }

  if (matches(q, 'cheap', 'lowest price', 'budget', 'entry', 'affordable')) {
    const rows = [...MACHINES].sort((a, b) => a.price - b.price).slice(0, 4)
    return `**Most affordable machines** in the range:\n\n${TABLE_HEAD}${rows.map(productLine).join('\n')}`
  }

  if (matches(q, 'price', 'cost', 'rate', 'how much')) {
    const rows = [...MACHINES].sort((a, b) => a.price - b.price)
    return (
      `List prices across the range, exclusive of GST and freight:\n\n${TABLE_HEAD}${rows.map(productLine).join('\n')}`
    )
  }

  const byCategory = [...new Set(DEMO_PRODUCTS.map((p) => p.category))]
    .map((c) => `- **${c}** — ${DEMO_PRODUCTS.filter((p) => p.category === c).length} models`)
    .join('\n')

  return (
    `I can help match a machine to a job. Try asking things like:\n\n` +
    `- "Which model reaches 12 m indoors?"\n` +
    `- "What do you have for 20 m outdoor work?"\n` +
    `- "Tell me about the GTBZ20A"\n` +
    `- "Show me the electric scissor lifts"\n\n` +
    `The current range:\n\n${byCategory}`
  )
}

// ---------------------------------------------------------------------------
// Machine manual questions
// ---------------------------------------------------------------------------

const MANUAL_TOPICS: [string[], string][] = [
  [
    ['battery', 'charge', 'charging', 'power'],
    'Charge only with the on-board charger, on level ground with the platform fully lowered. A full cycle from flat takes 8–10 hours, and repeatedly interrupting it shortens pack life. Check electrolyte monthly on flooded packs.',
  ],
  [
    ['hydraulic', 'oil', 'leak', 'cylinder', 'seal'],
    'Check the hydraulic reservoir with the platform fully lowered — reading it raised gives a false low. Seepage at a cylinder rod seal means the rod seal kit is due; a wet film is normal, running drips are not.',
  ],
  [
    ['tilt', 'sensor', 'fault', 'code', 'error', 'lockout'],
    'A tilt fault on level ground is usually the sensor or its mounting bracket rather than the chassis. Recalibrate on a known-level surface; if it persists through a recalibration, replace the sensor.',
  ],
  [
    ['brake', 'drive', 'motor', 'wheel', 'creep'],
    'Drive cutting out with the platform raised is the height interlock working as designed — above the interlock height drive speed is limited and can cut entirely. Check the platform height limit switch before suspecting the motor.',
  ],
  [
    ['service', 'interval', 'maintenance', 'inspection', 'schedule'],
    'Pre-use inspection before every shift, a 250-hour service for filters and fluid checks, 500-hour for hydraulic oil, and an annual thorough examination by a competent person.',
  ],
  [
    ['emergency', 'lowering', 'descend', 'manual release'],
    'The emergency lowering valve sits at the base of the lift cylinder. Pull and hold to descend; it should move under firm hand pressure. Needing excessive force means the valve wants servicing — do not lever it.',
  ],
]

export function answerSupportQuestion(machineModel: string, question: string): string {
  const machine = DEMO_MACHINES.find((m) => m.model_name === machineModel)
  if (!machine) {
    return `I don't have the service manual for the ${machineModel} on file, so I can't answer service questions about it.`
  }

  for (const [keywords, answer] of MANUAL_TOPICS) {
    if (matches(question, ...keywords)) {
      return `**${machineModel}** — ${answer}\n\nSource: ${machineModel} service manual.`
    }
  }

  const product = DEMO_PRODUCTS.find((p) => modelNumberOf(p) === machineModel)
  return (
    `I have the service manual for the **${machineModel}**${product ? ` (${product.description})` : ''}, ` +
    `but couldn't match your question to a section.\n\n` +
    `Try asking about battery and charging, hydraulics, tilt or fault codes, drive and brakes, ` +
    `service intervals, or emergency lowering.`
  )
}
