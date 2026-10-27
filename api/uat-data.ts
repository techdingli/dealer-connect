// UAT data endpoint — what the portal reads in demo mode.
//
// "Demo mode" now means the portal shows Dingli's Focus UAT data, synced into
// Supabase daily by api/focus-sync.ts, instead of generated figures. Demo mode
// has no per-dealer accounts: a visitor picks a dealership and enters one
// shared password (UAT_ACCESS_PASSWORD). The browser can't read the synced
// tables itself (RLS ties them to a signed-in profile's GSTIN), so this
// function checks the password and reads them with the service-role key.
//
// Anyone with the shared password can view any dealer — that is the intended
// access model for the UAT preview. When production Focus data is connected,
// demo mode is switched off and dealers sign in with their own accounts.
//
// GET, header `x-uat-password`:
//   ?action=session&names=Company%20Name|Short%20Name  -> the dealer's directory row
//   ?action=dealer&gstin=G       -> ledger, invoices + lines, invoiced products
//   ?action=catalog              -> active machines (no spare parts)
//   ?action=dingli-stock         -> Dingli warehouse stock with products
//   ?action=machines             -> models with a manual (for the support chat)
//   ?action=catalogs             -> brochure list
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>

const PAGE = 1000

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'private, no-store')
  res.end(JSON.stringify(body))
}

/** Constant-time compare of the shared UAT password. */
function passwordOk(given: string | undefined): boolean {
  const expected = process.env.UAT_ACCESS_PASSWORD?.trim()
  if (!expected || !given) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

function admin() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url.startsWith('http') || !key) throw new Error('Supabase service access is not configured.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

type Admin = ReturnType<typeof admin>

/** Reads every row past PostgREST's 1,000-row cap; the query needs a stable order. */
async function all(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < PAGE) return rows
  }
}

/** Same normalisation as findDealerByName in src/config/dealers.ts, plus dropped dots ("R.K.S." -> "rks"). */
function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:private|pvt|limited|ltd|llp|inc|company|corporation|corp)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Matches the portal's dealer (by its registry names) to a dealer_directory
 * row. Exact name first, then a prefix ("…Equipment" vs "…Equipments"), then
 * every word of a name appearing in exactly one directory row. Returns null
 * rather than guess between two candidates.
 */
function matchDirectory(names: string[], directory: Row[]): Row | null {
  const wanted = names.map(normaliseName).filter(Boolean)
  const rows = directory.map((r) => ({ row: r, name: normaliseName(String(r.dealer_name ?? '')) }))
  const pick = (test: (dir: string, want: string) => boolean) => {
    for (const want of wanted) {
      const hits = rows.filter((r) => r.name && test(r.name, want))
      if (hits.length === 1) return hits[0]!.row
    }
    return null
  }
  return (
    pick((dir, want) => dir === want) ??
    pick((dir, want) => dir.startsWith(want) || want.startsWith(dir)) ??
    pick((dir, want) => {
      const words = new Set(dir.split(' '))
      return want.split(' ').every((w) => words.has(w))
    })
  )
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!process.env.UAT_ACCESS_PASSWORD?.trim()) {
    return send(res, 503, { error: 'UAT access is not configured (UAT_ACCESS_PASSWORD).' })
  }
  const header = req.headers['x-uat-password']
  if (!passwordOk(Array.isArray(header) ? header[0] : header)) {
    return send(res, 401, { error: 'Incorrect password.' })
  }

  const params = new URL(req.url ?? '/', 'http://localhost').searchParams
  const action = params.get('action') ?? ''

  try {
    const sb: Admin = admin()

    if (action === 'session') {
      const names = (params.get('names') ?? '').split('|').map((n) => n.trim()).filter(Boolean)
      const { data, error } = await sb
        .from('dealer_directory')
        .select('gstin, dealer_name, city, contact_person, phone, email')
      if (error) throw new Error(error.message)
      return send(res, 200, { dealer: matchDirectory(names, (data ?? []) as Row[]) })
    }

    if (action === 'dealer') {
      const gstin = (params.get('gstin') ?? '').trim().toUpperCase()
      if (!/^[0-9A-Z]{15}$/.test(gstin)) return send(res, 400, { error: 'A valid gstin is required.' })
      const [ledger, invoices] = await Promise.all([
        all((from, to) =>
          sb.from('dealer_ledger').select('*').eq('gstin', gstin)
            .order('entry_date', { ascending: true }).order('body_id', { ascending: true }).range(from, to),
        ),
        all((from, to) =>
          sb.from('dealer_invoices').select('*, dealer_invoice_items(*)').eq('gstin', gstin)
            .order('invoice_date', { ascending: false }).order('focus_header_id', { ascending: true }).range(from, to),
        ),
      ])
      const productIds = [
        ...new Set(
          invoices.flatMap((inv) =>
            ((inv.dealer_invoice_items as Row[] | undefined) ?? [])
              .map((i) => i.focus_product_id)
              .filter((id): id is number => typeof id === 'number'),
          ),
        ),
      ]
      const products: Row[] = []
      for (let i = 0; i < productIds.length; i += 200) {
        const { data, error } = await sb.from('products').select('*').in('focus_product_id', productIds.slice(i, i + 200))
        if (error) throw new Error(error.message)
        products.push(...((data ?? []) as Row[]))
      }
      return send(res, 200, { ledger, invoices, products })
    }

    if (action === 'catalog') {
      const products = await all((from, to) =>
        sb.from('products').select('*').eq('is_active', true)
          .or('category.is.null,category.neq.Spare Parts')
          .order('category', { ascending: true }).order('name', { ascending: true }).order('id', { ascending: true })
          .range(from, to),
      )
      return send(res, 200, { products })
    }

    if (action === 'dingli-stock') {
      const stock = await all((from, to) =>
        sb.from('dingli_stock').select('*, product:products(*)')
          .order('updated_at', { ascending: false }).order('id', { ascending: true })
          .range(from, to),
      )
      return send(res, 200, { stock })
    }

    if (action === 'machines') {
      const { data, error } = await sb
        .from('machines')
        .select('model_name, category, manual_text')
        .not('manual_text', 'is', null)
        .neq('manual_text', '')
        .order('category', { ascending: true })
        .order('model_name', { ascending: true })
      if (error) throw new Error(error.message)
      return send(res, 200, { machines: data ?? [] })
    }

    if (action === 'catalogs') {
      const { data, error } = await sb.from('catalogs').select('*').order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return send(res, 200, { catalogs: data ?? [] })
    }

    return send(res, 400, { error: `Unknown action '${action}'.` })
  } catch (err) {
    console.error('uat-data error:', err)
    return send(res, 500, { error: 'Could not load the UAT data. Please try again.' })
  }
}
