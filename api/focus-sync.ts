// Focus ERP -> Supabase sync (Vercel serverless function + daily cron).
//
// Reads the Focus SQL Server directly (Focus8070, the ERP database) and writes
// the portal's Focus-derived tables in Supabase. The SPA never talks to Focus:
// dealers read only what this job has copied into Supabase, scoped by RLS.
//
// Scope: only dealers the portal knows about — every GSTIN in dealer_directory
// or on a profile. For each GSTIN it replaces that dealer's ledger, invoices
// and invoice lines; then it refreshes the shared product catalogue and Dingli
// warehouse stock.
//
// What Focus UAT does not hold (selling prices, invoice PDFs, a dealer's own
// holdings and onward sales, warehouse cities) is left empty here, and the UI
// shows a "not in the UAT data" notice in its place. When production Focus is
// connected, re-run discovery and fill those in.
//
// Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Manual calls
// pass ?token= matching CRON_SECRET or FOCUS_PROBE_TOKEN. Fail-closed when
// neither is set.
//
// Modes (GET):
//   (default)                         full sync into Supabase
//   ?dryRun=1&gstin=G1,G2             map everything, write nothing, return samples
//   ?action=find&q=NAME               look up Focus accounts by name (GSTIN discovery)
//   ?action=inspect&gstin=G           raw Focus postings for one dealer (mapping checks)
//
// Env: FOCUS_DB_USERNAME, FOCUS_DB_PASSWORD, FOCUS_UAT_DB_IP, FOCUS_MAIN_DB,
//      SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL (or an absolute VITE_SUPABASE_URL),
//      CRON_SECRET and/or FOCUS_PROBE_TOKEN.
import type { IncomingMessage, ServerResponse } from 'node:http'
import sql from 'mssql'
import { createClient } from '@supabase/supabase-js'

export const config = { maxDuration: 300 }

const TOKENS = [process.env.CRON_SECRET, process.env.FOCUS_PROBE_TOKEN]
  .map((t) => t?.trim())
  .filter((t): t is string => !!t)

const FOCUS_DB = process.env.FOCUS_MAIN_DB?.trim() || 'Focus8070'

// Focus numbers sales vouchers from 3328 up to the next 256 block; of those,
// only the ones that post to accounts (bUpdateFA) are real invoices — that
// drops proformas, delivery challans and bill submissions.
const SALES_VOUCHER_MIN = 3328
const SALES_VOUCHER_MAX = 3583

type Row = Record<string, unknown>

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body, null, 2))
}

/** Focus packs dates as year<<16 | month<<8 | day. */
function focusDate(v: unknown): string | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  const y = n >> 16
  const m = (n >> 8) & 0xff
  const d = n & 0xff
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** "FY 2025-26" for a date in April 2025 .. March 2026. */
function financialYear(isoDate: string | null): string {
  if (!isoDate) return ''
  const [y, m] = isoDate.split('-').map(Number)
  const start = m >= 4 ? y : y - 1
  return `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

const round2 = (n: number) => Math.round(n * 100) / 100

function normGstin(g: unknown): string {
  return String(g ?? '').trim().toUpperCase()
}

/** Integer ids are validated before being inlined into IN (...) lists. */
function idList(ids: Iterable<number>): string {
  const clean = [...new Set([...ids].filter((n) => Number.isInteger(n)))]
  return clean.length ? clean.join(',') : 'NULL'
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function focusPool(encrypt: boolean) {
  const pool = new sql.ConnectionPool({
    user: process.env.FOCUS_DB_USERNAME,
    password: process.env.FOCUS_DB_PASSWORD,
    server: process.env.FOCUS_UAT_DB_IP ?? '',
    database: FOCUS_DB,
    options: { encrypt, trustServerCertificate: true, enableArithAbort: true },
    connectionTimeout: 20000,
    requestTimeout: 120000,
    pool: { max: 4, min: 0, idleTimeoutMillis: 10000 },
  })
  return pool.connect()
}

async function q(pool: sql.ConnectionPool, text: string, params: Record<string, string> = {}): Promise<Row[]> {
  const req = pool.request()
  for (const [k, v] of Object.entries(params)) req.input(k, sql.NVarChar, v)
  return (await req.query(text)).recordset as Row[]
}

// ---------------------------------------------------------------------------
// Focus readers
// ---------------------------------------------------------------------------

type Account = { id: number; name: string; code: string; gstin: string }

async function accountsForGstins(pool: sql.ConnectionPool, gstins: string[]): Promise<Account[]> {
  if (!gstins.length) return []
  const params: Record<string, string> = {}
  const names = gstins.map((g, i) => {
    params[`g${i}`] = g
    return `@g${i}`
  })
  const rows = await q(
    pool,
    `SELECT a.iMasterId AS id, a.sName AS name, a.sCode AS code,
            UPPER(LTRIM(RTRIM(g.GSTIN))) AS gstin
       FROM mCore_Account a
       JOIN muCore_Account_GST g ON g.iMasterId = a.iMasterId
      WHERE a.bGroup = 0 AND UPPER(LTRIM(RTRIM(g.GSTIN))) IN (${names.join(',')})`,
    params,
  )
  return rows.map((r) => ({ id: Number(r.id), name: String(r.name), code: String(r.code), gstin: String(r.gstin) }))
}

type Posting = {
  bodyId: number
  headerId: number
  date: string | null
  voucherNo: string
  vtype: number
  voucherType: string
  accountId: number
  amount: number
}

/**
 * Every account posting for the given accounts. A Focus body line posts
 * mAmount1 to iBookNo and the opposite to iCode, so a line counts for an
 * account on either side, with the sign flipped when it is the iCode side.
 */
async function postingsFor(pool: sql.ConnectionPool, accountIds: number[]): Promise<Posting[]> {
  const ids = idList(accountIds)
  const rows = await q(
    pool,
    `SELECT d.iBodyId AS bodyId, h.iHeaderId AS headerId, h.iDate AS iDate,
            h.sVoucherNo AS voucherNo, h.iVoucherType AS vtype, v.sName AS voucherType,
            CASE WHEN d.iBookNo IN (${ids}) THEN d.iBookNo ELSE d.iCode END AS accountId,
            CASE WHEN d.iBookNo IN (${ids}) THEN d.mAmount1 ELSE -d.mAmount1 END AS amount
       FROM tCore_Data_0 d
       JOIN tCore_Header_0 h ON h.iHeaderId = d.iHeaderId
       JOIN cCore_Vouchers_0 v ON v.iVoucherType = h.iVoucherType
      WHERE (d.iBookNo IN (${ids}) OR d.iCode IN (${ids}))
        AND d.iBookNo <> d.iCode
        AND v.bUpdateFA = 1 AND d.bSuspendUpdateFA = 0 AND d.bVoid = 0
        AND h.bCancelled = 0 AND h.bSuspended = 0 AND h.bDraft = 0
        AND d.mAmount1 <> 0`,
  )
  return rows.map((r) => ({
    bodyId: Number(r.bodyId),
    headerId: Number(r.headerId),
    date: focusDate(r.iDate),
    voucherNo: String(r.voucherNo ?? ''),
    vtype: Number(r.vtype),
    voucherType: String(r.voucherType ?? '').trim(),
    accountId: Number(r.accountId),
    amount: Number(r.amount),
  }))
}

/** Header narrations live in a per-voucher-type table; only some have one. */
async function narrations(pool: sql.ConnectionPool, postings: Posting[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const byType = new Map<number, Set<number>>()
  for (const p of postings) {
    if (!byType.has(p.vtype)) byType.set(p.vtype, new Set())
    byType.get(p.vtype)!.add(p.headerId)
  }
  if (!byType.size) return out
  const withNarration = new Set(
    (
      await q(
        pool,
        `SELECT TABLE_NAME AS t FROM INFORMATION_SCHEMA.COLUMNS
          WHERE COLUMN_NAME = 'sNarration' AND TABLE_NAME LIKE 'tCore[_]HeaderData%[_]0'`,
      )
    ).map((r) => String(r.t)),
  )
  for (const [vtype, headers] of byType) {
    const table = `tCore_HeaderData${Math.trunc(vtype)}_0`
    if (!withNarration.has(table)) continue
    for (const part of chunks([...headers], 1000)) {
      const rows = await q(
        pool,
        `SELECT iHeaderId AS h, sNarration AS n FROM [${table}] WHERE iHeaderId IN (${idList(part)})`,
      )
      for (const r of rows) {
        const n = String(r.n ?? '').trim()
        if (n) out.set(Number(r.h), n)
      }
    }
  }
  return out
}

type InvoiceLine = {
  bodyId: number
  headerId: number
  productId: number
  sku: string
  name: string
  quantity: number
  rate: number
  gross: number
}

async function invoiceLines(pool: sql.ConnectionPool, headerIds: number[]): Promise<InvoiceLine[]> {
  const out: InvoiceLine[] = []
  for (const part of chunks(headerIds, 1000)) {
    const rows = await q(
      pool,
      `SELECT d.iBodyId AS bodyId, d.iHeaderId AS headerId, i.iProduct AS productId,
              p.sCode AS sku, p.sName AS name, i.fQuantity AS qty, i.mRate AS rate, i.mGross AS gross
         FROM tCore_Data_0 d
         JOIN tCore_Indta_0 i ON i.iBodyId = d.iBodyId
         LEFT JOIN mCore_Product p ON p.iMasterId = i.iProduct
        WHERE d.iHeaderId IN (${idList(part)}) AND i.iProduct > 0 AND d.bVoid = 0`,
    )
    for (const r of rows) {
      out.push({
        bodyId: Number(r.bodyId),
        headerId: Number(r.headerId),
        productId: Number(r.productId),
        sku: String(r.sku ?? '').trim(),
        name: String(r.name ?? '').trim(),
        quantity: Math.abs(Number(r.qty)),
        rate: Number(r.rate),
        gross: Math.abs(Number(r.gross)),
      })
    }
  }
  return out
}

/**
 * Bill-wise outstanding per invoice. A tCore_Refrn_0 row with iRefType 0 opens
 * a bill (its iRef is the bill), later rows adjust it; the bill's balance is
 * the sum of every row on that iRef for the dealer's accounts.
 */
async function billBalances(
  pool: sql.ConnectionPool,
  accountIds: number[],
): Promise<Map<number, { outstanding: number; due: string | null }>> {
  const ids = idList(accountIds)
  const rows = await q(
    pool,
    `SELECT MIN(CASE WHEN r.iRefType = 0 THEN d.iHeaderId END) AS headerId,
            MIN(CASE WHEN r.iRefType = 0 THEN r.iDueDate END) AS due,
            SUM(r.mAmount) AS outstanding
       FROM tCore_Refrn_0 r
       JOIN tCore_Data_0 d ON d.iBodyId = r.iBodyId
      WHERE r.iAccount IN (${ids})
      GROUP BY r.iRef`,
  )
  const out = new Map<number, { outstanding: number; due: string | null }>()
  for (const r of rows) {
    if (r.headerId == null) continue
    const h = Number(r.headerId)
    const prev = out.get(h)
    out.set(h, {
      outstanding: (prev?.outstanding ?? 0) + Number(r.outstanding),
      due: prev?.due ?? focusDate(r.due),
    })
  }
  return out
}

type CatalogProduct = {
  focus_product_id: number
  sku: string
  name: string
  category: string | null
  unit: string
  description: string | null
}

/** Equipment with a category, plus anything a synced dealer has been invoiced for. */
async function catalogProducts(pool: sql.ConnectionPool, extraIds: number[]): Promise<CatalogProduct[]> {
  const rows = await q(
    pool,
    `SELECT p.iMasterId AS id, p.sCode AS sku, p.sName AS name, c.sName AS category,
            un.sName AS unit, mu.sDescription AS description
       FROM mCore_Product p
       LEFT JOIN muCore_Product mu ON mu.iMasterId = p.iMasterId
       LEFT JOIN mCore_productcategory c ON c.iMasterId = mu.iCategory AND mu.iCategory > 0
       LEFT JOIN muCore_Product_Units pu ON pu.iMasterId = p.iMasterId
       LEFT JOIN mCore_Units un ON un.iMasterId = pu.iDefaultSalesUnit
      WHERE p.bGroup = 0 AND p.iMasterId > 0 AND p.sName NOT LIKE 'to be deleted%'
        AND (mu.iCategory > 0 OR p.iMasterId IN (${idList(extraIds)}))`,
  )
  return rows
    .filter((r) => String(r.sku ?? '').trim())
    .map((r) => ({
      focus_product_id: Number(r.id),
      sku: String(r.sku).trim(),
      name: String(r.name ?? '').trim() || String(r.sku).trim(),
      category: String(r.category ?? '').trim() || null,
      unit: String(r.unit ?? '').trim() || 'Nos',
      description: String(r.description ?? '').trim() || null,
    }))
}

type StockRow = { focus_product_id: number; focus_warehouse_id: number; warehouse: string; quantity: number }

/** Positive on-hand balances per product and warehouse for the catalogue products. */
async function dingliStock(pool: sql.ConnectionPool, productIds: number[]): Promise<StockRow[]> {
  const out: StockRow[] = []
  for (const part of chunks(productIds, 2000)) {
    const rows = await q(
      pool,
      `SELECT b.iProduct AS productId, b.iInvTag AS warehouseId, w.sName AS warehouse,
              SUM(b.fQrec + b.fQiss) AS qty
         FROM tCore_ibals_0 b
         JOIN mCore_Warehouse w ON w.iMasterId = b.iInvTag AND w.bGroup = 0
        WHERE b.iProduct IN (${idList(part)})
        GROUP BY b.iProduct, b.iInvTag, w.sName
       HAVING SUM(b.fQrec + b.fQiss) > 0`,
    )
    for (const r of rows) {
      out.push({
        focus_product_id: Number(r.productId),
        focus_warehouse_id: Number(r.warehouseId),
        warehouse: String(r.warehouse ?? '').trim() || `Warehouse ${r.warehouseId}`,
        quantity: Math.round(Number(r.qty)),
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Mapping into the portal's tables
// ---------------------------------------------------------------------------

type DealerPayload = {
  gstin: string
  company_name: string
  account_ids: number[]
  ledger: Row[]
  invoices: Row[]
  items: Row[]
}

async function buildDealer(pool: sql.ConnectionPool, gstin: string, accounts: Account[]): Promise<DealerPayload> {
  const ids = accounts.map((a) => a.id)
  const postings = await postingsFor(pool, ids)
  const notes = await narrations(pool, postings)

  const ledger = postings.map((p) => ({
    body_id: p.bodyId,
    gstin,
    focus_account_id: p.accountId,
    entry_date: p.date,
    voucher_no: p.voucherNo || null,
    voucher_type: p.voucherType || null,
    description: notes.get(p.headerId) ?? null,
    debit: p.amount > 0 ? round2(p.amount) : 0,
    credit: p.amount < 0 ? round2(-p.amount) : 0,
  }))

  // Invoices: sales vouchers that posted to this dealer.
  const invoiceHeaders = new Map<number, { no: string; date: string | null; type: string; total: number }>()
  for (const p of postings) {
    if (p.vtype < SALES_VOUCHER_MIN || p.vtype > SALES_VOUCHER_MAX) continue
    const cur = invoiceHeaders.get(p.headerId) ?? { no: p.voucherNo, date: p.date, type: p.voucherType, total: 0 }
    cur.total += p.amount
    invoiceHeaders.set(p.headerId, cur)
  }
  const lines = await invoiceLines(pool, [...invoiceHeaders.keys()])
  const balances = await billBalances(pool, ids)
  const today = new Date().toISOString().slice(0, 10)

  const invoices = [...invoiceHeaders].map(([headerId, h]) => {
    const bill = balances.get(headerId)
    let status: string | null = null
    if (bill) {
      if (bill.outstanding <= 1) status = 'paid'
      else if (bill.due && bill.due < today) status = 'overdue'
      else status = 'unpaid'
    }
    return {
      focus_header_id: headerId,
      gstin,
      invoice_number: h.no,
      voucher_type: h.type || null,
      fy: financialYear(h.date),
      invoice_date: h.date,
      amount: round2(Math.abs(h.total)),
      outstanding: bill ? round2(Math.max(bill.outstanding, 0)) : null,
      due_date: bill?.due ?? null,
      status,
    }
  })

  const items = lines.map((l) => ({
    body_id: l.bodyId,
    focus_header_id: l.headerId,
    gstin,
    focus_product_id: l.productId,
    sku: l.sku || null,
    description: l.name || l.sku || 'Item',
    quantity: l.quantity,
    unit_price: round2(l.rate),
    line_total: round2(l.gross),
  }))

  return {
    gstin,
    company_name: accounts[0]?.name ?? '',
    account_ids: ids,
    ledger,
    invoices,
    items,
  }
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

function supabaseAdmin() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url.startsWith('http')) throw new Error('SUPABASE_URL (absolute) is not set for the sync job.')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set for the sync job.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function dealerGstinsFromSupabase(sb: ReturnType<typeof supabaseAdmin>): Promise<string[]> {
  const [dir, prof] = await Promise.all([
    sb.from('dealer_directory').select('gstin'),
    sb.from('profiles').select('gstin').not('gstin', 'is', null),
  ])
  if (dir.error) throw new Error(`dealer_directory: ${dir.error.message}`)
  if (prof.error) throw new Error(`profiles: ${prof.error.message}`)
  return [...new Set([...(dir.data ?? []), ...(prof.data ?? [])].map((r) => normGstin(r.gstin)).filter(Boolean))]
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function authorised(req: IncomingMessage, params: URLSearchParams): boolean {
  if (!TOKENS.length) return false
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  const given = bearer || params.get('token') || ''
  return TOKENS.includes(given)
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams
  if (!TOKENS.length) return send(res, 503, { error: 'No CRON_SECRET / FOCUS_PROBE_TOKEN set; sync disabled.' })
  if (!authorised(req, params)) return send(res, 401, { error: 'Unauthorised.' })

  const action = params.get('action') ?? 'sync'
  const dryRun = params.get('dryRun') === '1'
  const encrypt = params.get('encrypt') !== 'false'
  const started = Date.now()
  let pool: sql.ConnectionPool | undefined

  try {
    pool = await focusPool(encrypt)

    if (action === 'find') {
      const term = (params.get('q') ?? '').trim()
      if (term.length < 3) return send(res, 400, { error: 'q must be at least 3 characters.' })
      const rows = await q(
        pool,
        `SELECT TOP 50 a.iMasterId AS id, a.sName AS name, a.sCode AS code,
                UPPER(LTRIM(RTRIM(g.GSTIN))) AS gstin
           FROM mCore_Account a
           LEFT JOIN muCore_Account_GST g ON g.iMasterId = a.iMasterId
          WHERE a.bGroup = 0 AND a.sName LIKE @t
          ORDER BY a.sName`,
        { t: `%${term}%` },
      )
      return send(res, 200, { ok: true, ms: Date.now() - started, accounts: rows })
    }

    if (action === 'inspect') {
      const gstin = normGstin(params.get('gstin'))
      const accounts = await accountsForGstins(pool, [gstin])
      const ids = idList(accounts.map((a) => a.id))
      const byType = await q(
        pool,
        `SELECT h.iVoucherType AS vtype, v.sName AS voucherType, v.bUpdateFA AS updatesFA,
                SUM(CASE WHEN d.iBookNo IN (${ids}) THEN 1 ELSE 0 END) AS asBook,
                SUM(CASE WHEN d.iCode IN (${ids}) THEN 1 ELSE 0 END) AS asCode,
                SUM(CASE WHEN d.iBookNo IN (${ids}) THEN d.mAmount1 ELSE -d.mAmount1 END) AS net,
                COUNT(DISTINCT h.iHeaderId) AS vouchers
           FROM tCore_Data_0 d
           JOIN tCore_Header_0 h ON h.iHeaderId = d.iHeaderId
           JOIN cCore_Vouchers_0 v ON v.iVoucherType = h.iVoucherType
          WHERE (d.iBookNo IN (${ids}) OR d.iCode IN (${ids})) AND h.bCancelled = 0
          GROUP BY h.iVoucherType, v.sName, v.bUpdateFA
          ORDER BY vouchers DESC`,
      )
      const recent = await q(
        pool,
        `SELECT TOP 40 h.iHeaderId AS headerId, h.sVoucherNo AS voucherNo, v.sName AS voucherType,
                h.iDate AS iDate, h.fNet AS fNet, d.iBodyId AS bodyId, d.iBookNo AS book, d.iCode AS code,
                d.mAmount1 AS amount1, d.mAmount2 AS amount2, d.iType AS lineType
           FROM tCore_Data_0 d
           JOIN tCore_Header_0 h ON h.iHeaderId = d.iHeaderId
           JOIN cCore_Vouchers_0 v ON v.iVoucherType = h.iVoucherType
          WHERE (d.iBookNo IN (${ids}) OR d.iCode IN (${ids})) AND h.bCancelled = 0
          ORDER BY h.iDate DESC, h.iHeaderId DESC`,
      )
      const refs = await q(
        pool,
        `SELECT TOP 60 r.iRef AS ref, r.iRefType AS refType, r.iBodyId AS bodyId, r.iAccount AS account,
                r.mAmount AS amount, r.iDueDate AS due, h.sVoucherNo AS voucherNo, v.sName AS voucherType
           FROM tCore_Refrn_0 r
           LEFT JOIN tCore_Data_0 d ON d.iBodyId = r.iBodyId
           LEFT JOIN tCore_Header_0 h ON h.iHeaderId = d.iHeaderId
           LEFT JOIN cCore_Vouchers_0 v ON v.iVoucherType = h.iVoucherType
          WHERE r.iAccount IN (${ids}) OR d.iBookNo IN (${ids}) OR d.iCode IN (${ids})
          ORDER BY r.iRef, r.iRefType`,
      )
      return send(res, 200, {
        ok: true,
        ms: Date.now() - started,
        accounts,
        byVoucherType: byType,
        recent: recent.map((r) => ({ ...r, date: focusDate(r.iDate) })),
        refs: refs.map((r) => ({ ...r, due: focusDate(r.due) })),
      })
    }

    if (action === 'inspect-catalog') {
      // Product groups (the tree Focus users file items under) with how many
      // leaf products and how much on-hand stock sit beneath each one.
      const groups = await q(
        pool,
        `SELECT g.iMasterId AS id, g.sName AS name, g.sCode AS code, t.iLevel AS level,
                pt.iMasterId AS parentId,
                (SELECT COUNT(*) FROM mCore_ProductTreeDetails c
                   JOIN mCore_Product cp ON cp.iMasterId = c.iMasterId AND cp.bGroup = 0
                  WHERE c.iParentId = g.iMasterId) AS leaves
           FROM mCore_Product g
           JOIN mCore_ProductTreeDetails t ON t.iMasterId = g.iMasterId
           LEFT JOIN mCore_ProductTreeDetails pt ON pt.iMasterId = t.iParentId AND pt.iTreeId = t.iTreeId
          WHERE g.bGroup = 1
          ORDER BY t.iLevel, g.sName`,
      )
      const warehouses = await q(
        pool,
        `SELECT TOP 80 w.sName AS warehouse, COUNT(DISTINCT b.iProduct) AS products,
                SUM(b.fQrec + b.fQiss) AS qty
           FROM tCore_ibals_0 b
           JOIN mCore_Warehouse w ON w.iMasterId = b.iInvTag
          GROUP BY w.sName
         HAVING SUM(b.fQrec + b.fQiss) > 0
          ORDER BY products DESC`,
      )
      const skuPrefixes = await q(
        pool,
        `SELECT LEFT(p.sCode, 1) AS prefix, COUNT(*) AS products,
                MIN(p.sName) AS example
           FROM mCore_Product p WHERE p.bGroup = 0
          GROUP BY LEFT(p.sCode, 1) ORDER BY products DESC`,
      )
      return send(res, 200, { ok: true, ms: Date.now() - started, groups, warehouses, skuPrefixes })
    }

    // Sync (or dry run).
    const sb = dryRun ? null : supabaseAdmin()
    const gstins = dryRun
      ? (params.get('gstin') ?? '').split(',').map(normGstin).filter(Boolean)
      : await dealerGstinsFromSupabase(sb!)
    const accounts = await accountsForGstins(pool, gstins)

    const dealers: DealerPayload[] = []
    const missing: string[] = []
    for (const gstin of gstins) {
      const own = accounts.filter((a) => a.gstin === gstin)
      if (!own.length) {
        missing.push(gstin)
        continue
      }
      dealers.push(await buildDealer(pool, gstin, own))
    }

    const invoicedProducts = dealers.flatMap((d) => d.items.map((i) => Number(i.focus_product_id)))
    const products = await catalogProducts(pool, invoicedProducts)
    const stock = await dingliStock(
      pool,
      products.filter((p) => p.category).map((p) => p.focus_product_id),
    )

    const summary = {
      dealers: dealers.map((d) => ({
        gstin: d.gstin,
        company: d.company_name,
        accounts: d.account_ids.length,
        ledger: d.ledger.length,
        invoices: d.invoices.length,
        items: d.items.length,
      })),
      gstinsWithoutFocusAccount: missing,
      products: products.length,
      stockRows: stock.length,
    }

    if (dryRun) {
      return send(res, 200, {
        ok: true,
        dryRun: true,
        ms: Date.now() - started,
        summary,
        samples: {
          ledger: dealers[0]?.ledger.slice(-15) ?? [],
          invoices: dealers[0]?.invoices.slice(-10) ?? [],
          items: dealers[0]?.items.slice(-10) ?? [],
          products: products.slice(0, 15),
          stock: stock.slice(0, 15),
        },
      })
    }

    for (const d of dealers) {
      const { error } = await sb!.rpc('focus_sync_dealer', {
        p_gstin: d.gstin,
        p_company_name: d.company_name,
        p_account_ids: d.account_ids,
        p_ledger: d.ledger,
        p_invoices: d.invoices,
        p_items: d.items,
      })
      if (error) throw new Error(`focus_sync_dealer(${d.gstin}): ${error.message}`)
    }
    const { error: catErr } = await sb!.rpc('focus_sync_catalog', { p_products: products, p_stock: stock })
    if (catErr) throw new Error(`focus_sync_catalog: ${catErr.message}`)

    const result = { ok: true, ms: Date.now() - started, ...summary }
    await sb!.from('focus_sync_runs').insert({ ok: true, ms: result.ms, summary })
    return send(res, 200, result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!dryRun && action === 'sync') {
      try {
        await supabaseAdmin().from('focus_sync_runs').insert({ ok: false, ms: Date.now() - started, error: message })
      } catch {
        // Logging the failure must never mask it.
      }
    }
    return send(res, 502, { ok: false, ms: Date.now() - started, error: message })
  } finally {
    if (pool) await pool.close().catch(() => {})
  }
}
