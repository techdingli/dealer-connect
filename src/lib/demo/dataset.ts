import type {
  DealerLedgerEntry,
  DealerStock,
  Feedback,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  Profile,
  ServiceRequest,
  ServiceStatus,
  StockMovement,
} from '@/types/database'
import type { Dealer } from '@/config/dealers'
import { getDealer } from '@/config/dealers'
import { DEMO_PRODUCTS } from '@/lib/demo/catalog'
import { createRng, isoTimestampDaysAgo, toIsoDate, type Rng } from '@/lib/demo/random'
import { CURRENT_FY } from '@/lib/utils'

/**
 * Per-dealer demo data. Everything here is generated from the dealer's id, so
 * each dealer gets a distinct-but-stable account: the same invoices, ledger and
 * stock on every page load, different numbers from every other dealer.
 *
 * The ledger is derived from the invoices rather than generated separately, so
 * the outstanding balance on the Ledger page actually reconciles with the
 * unpaid invoices on the Invoice History page — a demo where those two
 * disagree is the first thing anyone notices.
 */

export interface DemoDataset {
  profile: Profile
  dealerStock: DealerStock[]
  invoices: Invoice[]
  ledger: DealerLedgerEntry[]
  serviceRequests: ServiceRequest[]
  feedback: Feedback[]
}

/** Date window for the financial year named by CURRENT_FY ("FY 2025-26"). */
function financialYearWindow(label: string) {
  const startYear = Number(label.match(/(\d{4})/)?.[1] ?? new Date().getFullYear())
  return { start: new Date(startYear, 3, 1), end: new Date(startYear + 1, 2, 31) }
}

const FY_WINDOW = financialYearWindow(CURRENT_FY)
const FY_DAYS = Math.round((FY_WINDOW.end.getTime() - FY_WINDOW.start.getTime()) / 86_400_000)

/** ISO date `dayOffset` days into the current financial year. */
function fyDate(dayOffset: number): string {
  const d = new Date(FY_WINDOW.start)
  d.setDate(d.getDate() + Math.min(Math.max(dayOffset, 0), FY_DAYS))
  return toIsoDate(d)
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * A format-valid but entirely fictional GSTIN: state code + PAN-shaped block +
 * entity digit + 'Z' + check character. Real dealer GSTINs are never bundled
 * into this repo — see PENDING_TASKS.md.
 */
function demoGstin(dealer: Dealer, rng: Rng): string {
  const letters = dealer.companyName
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .padEnd(3, 'X')
    .slice(0, 3)
  const pan = `${letters}C${dealer.companyName[0]!.toUpperCase()}`
  const digits = String(rng.int(1000, 9999))
  return `${dealer.stateCode}${pan}${digits}${rng.pick(LETTERS.split(''))}${rng.int(1, 9)}Z${rng.pick(LETTERS.split(''))}`
}

function buildProfile(dealer: Dealer, rng: Rng): Profile {
  return {
    id: dealer.id,
    dealer_name: dealer.shortName,
    company_name: dealer.companyName,
    phone: `+91 ${rng.int(70, 99)}${rng.int(100, 999)} ${rng.int(10000, 99999)}`,
    gstin: demoGstin(dealer, rng),
    role: 'dealer',
    created_at: isoTimestampDaysAgo(rng.int(400, 1200)),
  }
}

/**
 * Cities a dealership might hold stock in beyond its home base. Every dealer
 * gets their home city plus a few of these, so the Location column has enough
 * variety to be worth filtering on.
 */
const CITY_POOL = [
  'Mumbai', 'Pune', 'Nashik', 'Nagpur', 'Ahmedabad', 'Surat', 'Vadodara',
  'Delhi', 'Gurugram', 'Noida', 'Jaipur', 'Lucknow', 'Chandigarh', 'Ludhiana',
  'Chennai', 'Coimbatore', 'Madurai', 'Bengaluru', 'Hyderabad', 'Vijayawada',
  'Kochi', 'Thiruvananthapuram', 'Kolkata', 'Bhubaneswar', 'Jamshedpur',
  'Ranchi', 'Indore', 'Raipur', 'Visakhapatnam', 'Goa',
]

const FACILITY_KINDS = ['Yard', 'Warehouse', 'Service Centre', 'Depot']

const CUSTOMERS = [
  'Sterling Infra Projects', 'Vardhman Construction Co.', 'Meridian Facility Services',
  'Trident Erectors Pvt Ltd', 'Anand Industrial Services', 'Blue Harbour Logistics',
  'Sunrise Warehousing LLP', 'Keystone Builders', 'Orbit Maintenance Group',
  'Greenfield Estates Pvt Ltd',
]

/** Every dealer's stock sites: home city first, then a few others. */
function dealerCities(dealer: Dealer, rng: Rng): string[] {
  const others = rng.sample(
    CITY_POOL.filter((c) => c !== dealer.city),
    rng.int(2, 4),
  )
  return [dealer.city, ...others]
}

/** What the dealer paid for a line, and what they've sold out of it since. */
function buildMovement(
  rng: Rng,
  product: (typeof DEMO_PRODUCTS)[number],
  onHand: number,
  stockId: string,
): StockMovement {
  const soldQty = product.category === 'Spare Parts' ? rng.int(0, 10) : rng.int(0, 3)
  const purchasedQty = onHand + soldQty

  // Dealers buy under list and sell above what they paid — that spread is the
  // whole point of the purchase/sale view.
  const unitCost = Math.round((product.price * (1 - rng.int(8, 20) / 100)) / 100) * 100
  const purchaseDaysAgo = rng.int(60, 540)

  let remainingToSell = soldQty
  const sales = []
  let saleIndex = 0
  while (remainingToSell > 0) {
    const quantity = Math.min(remainingToSell, rng.int(1, 3))
    remainingToSell -= quantity
    const unitPrice = Math.round((unitCost * (1 + rng.int(6, 24) / 100)) / 100) * 100
    sales.push({
      id: `${stockId}-sale-${++saleIndex}`,
      date: isoTimestampDaysAgo(rng.int(1, Math.max(2, purchaseDaysAgo - 15))).slice(0, 10),
      customer: rng.pick(CUSTOMERS),
      quantity,
      unit_price: unitPrice,
      total: unitPrice * quantity,
    })
  }
  sales.sort((a, b) => b.date.localeCompare(a.date))

  return {
    purchase: {
      invoice_number: `DIN/25-26/${rng.int(1000, 9999)}`,
      date: isoTimestampDaysAgo(purchaseDaysAgo).slice(0, 10),
      quantity: purchasedQty,
      unit_cost: unitCost,
      total_cost: unitCost * purchasedQty,
      supplier: 'Dingli India AWP Pvt. Ltd.',
    },
    sales,
  }
}

function buildDealerStock(dealer: Dealer, rng: Rng): DealerStock[] {
  const machines = DEMO_PRODUCTS.filter((p) => p.category !== 'Spare Parts')
  const spares = DEMO_PRODUCTS.filter((p) => p.category === 'Spare Parts')
  const cities = dealerCities(dealer, rng)

  // Enough lines that filtering by city or category actually narrows something.
  const held = [...rng.sample(machines, rng.int(8, 14)), ...rng.sample(spares, rng.int(3, 6))]

  return held
    .map((product, i) => {
      const id = `demo-dealer-stock-${dealer.id}-${i}`
      const quantity = product.category === 'Spare Parts' ? rng.int(2, 24) : rng.int(1, 5)
      const city = rng.pick(cities)
      return {
        id,
        dealer_id: dealer.id,
        product_id: product.id,
        quantity,
        location: city,
        warehouse: `${city} ${rng.pick(FACILITY_KINDS)}`,
        movement: buildMovement(rng, product, quantity, id),
        updated_at: isoTimestampDaysAgo(rng.int(0, 60)),
        product,
      }
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

function buildInvoices(dealer: Dealer, rng: Rng): Invoice[] {
  const count = rng.int(6, 14)
  const invoices: Invoice[] = []

  for (let i = 0; i < count; i++) {
    // Spread invoices across the FY, oldest first, with a little jitter.
    const dayOffset = Math.round(((i + 0.5) / count) * FY_DAYS) + rng.int(-8, 8)
    const invoiceDate = fyDate(dayOffset)
    const invoiceId = `demo-invoice-${dealer.id}-${i + 1}`
    const invoiceNumber = `DIN/${CURRENT_FY.slice(3).replace('20', '')}/${String(rng.int(100, 999))}${i}`

    const lineProducts = rng.sample(DEMO_PRODUCTS, rng.int(1, 4))
    const invoice_items: InvoiceItem[] = lineProducts.map((product, j) => {
      const quantity = product.category === 'Spare Parts' ? rng.int(1, 12) : rng.int(1, 3)
      // Dealer pricing sits a little under list — vary the discount per line.
      const unit_price = Math.round((product.price * (1 - rng.int(4, 14) / 100)) / 100) * 100
      return {
        id: `${invoiceId}-item-${j + 1}`,
        invoice_id: invoiceId,
        product_id: product.id,
        description: `${product.name} (${product.sku})`,
        quantity,
        unit_price,
        line_total: unit_price * quantity,
        created_at: `${invoiceDate}T00:00:00.000Z`,
      }
    })

    const amount = invoice_items.reduce((sum, item) => sum + item.line_total, 0)

    // Older invoices are mostly settled; the newest few are still open, and a
    // couple of mid-year ones have slipped past their due date.
    const ageFraction = 1 - (i + 1) / count
    const status: InvoiceStatus = rng.next() < ageFraction * 0.9 ? 'paid' : rng.chance(0.3) ? 'overdue' : 'unpaid'

    invoices.push({
      id: invoiceId,
      dealer_id: dealer.id,
      invoice_number: invoiceNumber,
      fy: CURRENT_FY,
      invoice_date: invoiceDate,
      amount,
      status,
      // No PDFs exist in demo mode — the in-app invoice view prints instead.
      pdf_path: null,
      created_at: `${invoiceDate}T00:00:00.000Z`,
      invoice_items,
    })
  }

  return invoices.sort((a, b) => b.invoice_date.localeCompare(a.invoice_date))
}

function buildLedger(rng: Rng, invoices: Invoice[], gstin: string): DealerLedgerEntry[] {
  const entries: Omit<DealerLedgerEntry, 'body_id'>[] = []
  const focusAccountId = rng.int(100000, 999999)
  const synced_at = isoTimestampDaysAgo(1)

  const push = (e: Omit<DealerLedgerEntry, 'body_id' | 'gstin' | 'focus_account_id' | 'synced_at'>) =>
    entries.push({ ...e, gstin, focus_account_id: focusAccountId, synced_at })

  // Opening balance carried forward from the previous financial year.
  push({
    entry_date: fyDate(0),
    voucher_no: null,
    voucher_type: 'Opening Balance',
    description: 'Opening balance brought forward',
    debit: rng.amount(0, 1_800_000, 1000),
    credit: 0,
  })

  for (const invoice of invoices) {
    push({
      entry_date: invoice.invoice_date,
      voucher_no: invoice.invoice_number,
      voucher_type: 'Sales Invoice',
      description: `Sales Invoice ${invoice.invoice_number}`,
      debit: invoice.amount,
      credit: 0,
    })

    // A settled invoice gets a matching receipt; an overdue one gets a part
    // payment, so the closing balance lines up with what's still outstanding.
    if (invoice.status === 'paid') {
      const paidOn = new Date(invoice.invoice_date)
      paidOn.setDate(paidOn.getDate() + rng.int(12, 55))
      const paidDate = paidOn <= FY_WINDOW.end ? toIsoDate(paidOn) : fyDate(FY_DAYS)
      push({
        entry_date: paidDate,
        voucher_no: `RCT/${rng.int(10000, 99999)}`,
        voucher_type: 'Receipt',
        description: `Receipt against ${invoice.invoice_number} — NEFT`,
        debit: 0,
        credit: invoice.amount,
      })
    } else if (invoice.status === 'overdue' && rng.chance(0.5)) {
      const paidOn = new Date(invoice.invoice_date)
      paidOn.setDate(paidOn.getDate() + rng.int(20, 60))
      const paidDate = paidOn <= FY_WINDOW.end ? toIsoDate(paidOn) : fyDate(FY_DAYS)
      push({
        entry_date: paidDate,
        voucher_no: `RCT/${rng.int(10000, 99999)}`,
        voucher_type: 'Receipt',
        description: `Part payment against ${invoice.invoice_number}`,
        debit: 0,
        credit: Math.round((invoice.amount * rng.int(30, 70)) / 100 / 1000) * 1000,
      })
    }
  }

  // A couple of adjustments, the way a real Focus ledger always has a few.
  for (let i = 0; i < rng.int(1, 3); i++) {
    push({
      entry_date: fyDate(rng.int(30, FY_DAYS)),
      voucher_no: `CN/${rng.int(1000, 9999)}`,
      voucher_type: 'Credit Note',
      description: rng.pick([
        'Credit note — freight reimbursement',
        'Credit note — warranty parts adjustment',
        'Credit note — quarterly volume rebate',
      ]),
      debit: 0,
      credit: rng.amount(15_000, 180_000, 500),
    })
  }

  return entries
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
    .map((entry, i) => ({ ...entry, body_id: i + 1 }))
}

function buildServiceRequests(dealer: Dealer, rng: Rng): ServiceRequest[] {
  const ISSUES = [
    'Platform will not elevate past mid-height; hydraulic whine at the pump.',
    'Tilt sensor throwing a fault code on level ground — machine locks out.',
    'Battery pack not holding charge beyond four hours of light duty.',
    'Drive motor cuts out intermittently when the platform is raised.',
    'Oil seepage at the lift cylinder rod seal after ~300 hours.',
    'Emergency lowering valve stiff, needs excessive force to operate.',
    'Joystick drifts — machine creeps forward with the control centred.',
    'Outrigger auto-levelling times out on a slight cross-slope.',
  ]
  const STATUSES: ServiceStatus[] = ['open', 'in_progress', 'resolved', 'closed']
  const machines = DEMO_PRODUCTS.filter((p) => p.category !== 'Spare Parts')

  return Array.from({ length: rng.int(2, 6) }, (_, i) => {
    const createdDaysAgo = rng.int(2, 150)
    const status = rng.pick(STATUSES)
    return {
      id: `demo-service-${dealer.id}-${i + 1}`,
      dealer_id: dealer.id,
      machine_model: rng.pick(machines).name,
      serial_number: rng.chance(0.75) ? `DGL-${rng.int(2023, 2026)}-${String(rng.int(1, 99999)).padStart(5, '0')}` : null,
      issue_description: rng.pick(ISSUES),
      priority: rng.pick(['low', 'medium', 'high', 'critical'] as const),
      status,
      created_at: isoTimestampDaysAgo(createdDaysAgo),
      resolved_at:
        status === 'resolved' || status === 'closed'
          ? isoTimestampDaysAgo(Math.max(0, createdDaysAgo - rng.int(2, 20)))
          : null,
    }
  }).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

function buildFeedback(dealer: Dealer, rng: Rng): Feedback[] {
  const ENTRIES = [
    { category: 'suggestion' as const, subject: 'Spare parts ETA in the portal', message: 'It would help to see a dispatch date against spare part orders instead of calling the branch each time.' },
    { category: 'compliment' as const, subject: 'Quick turnaround on warranty claim', message: 'The warranty replacement for the platform controller reached us in four days. Our customer noticed.' },
    { category: 'complaint' as const, subject: 'Delay on boom lift delivery', message: 'The GTBZ20A we booked last quarter slipped twice. We had to rework the handover date with the site.' },
    { category: 'general' as const, subject: 'Training for new service engineers', message: 'Any plan for a hands-on service training batch this quarter? We have two new engineers joining.' },
  ]

  return rng
    .sample(ENTRIES, rng.int(0, 3))
    .map((entry, i) => ({
      id: `demo-feedback-${dealer.id}-${i + 1}`,
      dealer_id: dealer.id,
      category: entry.category,
      subject: entry.subject,
      message: entry.message,
      status: rng.pick(['open', 'reviewed', 'resolved'] as const),
      created_at: isoTimestampDaysAgo(rng.int(5, 200)),
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

// Generated once per dealer, then reused — regenerating on every render would
// reshuffle the numbers under the user mid-session.
const cache = new Map<string, DemoDataset>()

export function getDemoDataset(dealerId: string): DemoDataset {
  const cached = cache.get(dealerId)
  if (cached) return cached

  const dealer = getDealer(dealerId)
  if (!dealer) throw new Error(`Unknown demo dealer: ${dealerId}`)

  const rng = createRng(`dingli-demo:${dealer.id}`)
  const profile = buildProfile(dealer, rng)
  const invoices = buildInvoices(dealer, rng)

  const dataset: DemoDataset = {
    profile,
    dealerStock: buildDealerStock(dealer, rng),
    invoices,
    ledger: buildLedger(rng, invoices, profile.gstin!),
    serviceRequests: buildServiceRequests(dealer, rng),
    feedback: buildFeedback(dealer, rng),
  }

  cache.set(dealerId, dataset)
  return dataset
}

/** Records a feedback submission for the session (demo mode has no backend). */
export function addDemoFeedback(dealerId: string, entry: Pick<Feedback, 'category' | 'subject' | 'message'>) {
  const dataset = getDemoDataset(dealerId)
  dataset.feedback = [
    {
      id: `demo-feedback-${dealerId}-${Date.now()}`,
      dealer_id: dealerId,
      status: 'open',
      created_at: new Date().toISOString(),
      ...entry,
    },
    ...dataset.feedback,
  ]
}

/** Records a service request for the session (demo mode has no backend). */
export function addDemoServiceRequest(
  dealerId: string,
  entry: Pick<ServiceRequest, 'machine_model' | 'serial_number' | 'issue_description' | 'priority'>,
) {
  const dataset = getDemoDataset(dealerId)
  dataset.serviceRequests = [
    {
      id: `demo-service-${dealerId}-${Date.now()}`,
      dealer_id: dealerId,
      status: 'open',
      created_at: new Date().toISOString(),
      resolved_at: null,
      ...entry,
    },
    ...dataset.serviceRequests,
  ]
}
