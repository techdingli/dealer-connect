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
//   ?action=freshness                 restore history and newest vouchers (is UAT current?)
//   ?action=file-columns              tables that store files in the DB, with counts
//   ?action=companies                 invoices per group-company prefix, openable databases
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
 * a bill (its iRef is the bill) on one of the dealer's posting lines; later
 * rows (receipts, returns, advances) adjust it. iAccount on these rows is the
 * contra account, so bills are found through the dealer's own lines instead.
 * Amounts are from the contra side: a sale opens the bill negative, so the
 * dealer still owes minus the sum.
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
            -SUM(r.mAmount) AS outstanding
       FROM tCore_Refrn_0 r
       JOIN tCore_Data_0 d ON d.iBodyId = r.iBodyId
      WHERE r.iRef IN (
              SELECT r0.iRef FROM tCore_Refrn_0 r0
                JOIN tCore_Data_0 d0 ON d0.iBodyId = r0.iBodyId
               WHERE r0.iRefType = 0 AND (d0.iBookNo IN (${ids}) OR d0.iCode IN (${ids})))
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

// Product groups (top of Focus's product tree) that make up the dealer
// catalogue: the machines and their spare parts. Everything else in Focus
// (raw material, WIP, safety stock, rental service charges) stays out.
const EQUIPMENT_GROUP = 'Inventory - Equipments'
const SPARES_GROUP = 'Spare Parts'

/**
 * Machines and spare parts. Focus's own category field is mostly blank on
 * machines, so a machine's category is the Focus category name its product
 * name starts with ("Boom Lift Self-Propelled 28 Mtr" -> "Boom Lift").
 */
async function catalogProducts(pool: sql.ConnectionPool): Promise<CatalogProduct[]> {
  const rows = await q(
    pool,
    `SELECT p.iMasterId AS id, p.sCode AS sku, p.sName AS name, g.sName AS grp,
            c.sName AS category, un.sName AS unit, mu.sDescription AS description
       FROM mCore_Product p
       JOIN mCore_ProductTreeDetails t ON t.iMasterId = p.iMasterId
       JOIN mCore_Product g ON g.iMasterId = t.iParentId AND g.bGroup = 1
       LEFT JOIN muCore_Product mu ON mu.iMasterId = p.iMasterId
       LEFT JOIN mCore_productcategory c ON c.iMasterId = mu.iCategory AND mu.iCategory > 0
       LEFT JOIN muCore_Product_Units pu ON pu.iMasterId = p.iMasterId
       LEFT JOIN mCore_Units un ON un.iMasterId = pu.iDefaultSalesUnit
      WHERE p.bGroup = 0 AND g.sName IN (@equipment, @spares)
        AND p.sName NOT LIKE 'to be deleted%'`,
    { equipment: EQUIPMENT_GROUP, spares: SPARES_GROUP },
  )
  const categoryNames = (
    await q(pool, `SELECT sName AS n FROM mCore_productcategory WHERE bGroup = 0 AND iMasterId > 0`)
  )
    .map((r) => String(r.n ?? '').trim())
    .filter((n) => n.length > 3)
    // Longest first, so "Mast Boom Lift" wins over "Boom Lift".
    .sort((a, b) => b.length - a.length)

  // products.sku is unique in Supabase, so a SKU Focus reuses is kept once.
  const seen = new Set<string>()
  const out: CatalogProduct[] = []
  for (const r of rows) {
    const id = Number(r.id)
    const sku = String(r.sku ?? '').trim()
    if (!sku || seen.has(sku.toLowerCase())) continue
    seen.add(sku.toLowerCase())
    const name = String(r.name ?? '').trim() || sku
    let category: string | null
    if (String(r.grp).trim() === SPARES_GROUP) {
      category = 'Spare Parts'
    } else {
      const lower = name.toLowerCase()
      category =
        categoryNames.find((c) => lower.startsWith(c.toLowerCase())) ??
        (String(r.category ?? '').trim() || 'Equipment')
    }
    out.push({
      focus_product_id: id,
      sku,
      name,
      category,
      unit: String(r.unit ?? '').trim() || 'Nos',
      description: String(r.description ?? '').trim() || null,
    })
  }
  return out
}

type StockRow = { focus_product_id: number; focus_warehouse_id: number; warehouse: string; quantity: number }

/**
 * Positive on-hand balances per product and warehouse for the catalogue
 * products. Focus warehouses are named <company>-<branch>-<division>-<store>;
 * only the Sales division is stock a dealer can buy (Rental, Factory and
 * service stores are excluded).
 */
async function dingliStock(pool: sql.ConnectionPool, productIds: number[]): Promise<StockRow[]> {
  const out: StockRow[] = []
  for (const part of chunks(productIds, 2000)) {
    const rows = await q(
      pool,
      `SELECT b.iProduct AS productId, b.iInvTag AS warehouseId, w.sName AS warehouse,
              SUM(b.fQrec + b.fQiss) AS qty
         FROM tCore_ibals_0 b
         JOIN mCore_Warehouse w ON w.iMasterId = b.iInvTag AND w.bGroup = 0
        WHERE b.iProduct IN (${idList(part)}) AND w.sName LIKE '%-Sales-%'
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

    // How fresh the Focus copy is: restore history (a UAT refresh from
    // production shows up as a restore), database creation dates, and the
    // newest vouchers by posting and entry date. Dates and counts only.
    if (action === 'freshness') {
      const dbs = [FOCUS_DB, process.env.FOCUS_CRM_DB?.trim()].filter((d): d is string => !!d)
      const databases = await q(
        pool,
        `SELECT name, create_date AS createdOrRestored FROM sys.databases WHERE name IN (${dbs.map((_, i) => `@d${i}`).join(',')})`,
        Object.fromEntries(dbs.map((d, i) => [`d${i}`, d])),
      )
      let restores: Row[] | string
      try {
        restores = await q(
          pool,
          `SELECT TOP 10 rh.destination_database_name AS db, rh.restore_date AS restoredAt,
                  bs.backup_finish_date AS backupTakenAt, bs.server_name AS sourceServer,
                  bs.database_name AS sourceDatabase
             FROM msdb.dbo.restorehistory rh
             JOIN msdb.dbo.backupset bs ON bs.backup_set_id = rh.backup_set_id
            ORDER BY rh.restore_date DESC`,
        )
      } catch (err) {
        restores = `not readable with this login: ${err instanceof Error ? err.message : String(err)}`
      }
      const today = new Date()
      const todayPacked = (today.getFullYear() << 16) | ((today.getMonth() + 1) << 8) | today.getDate()
      const latest = await q(
        pool,
        `SELECT COUNT(*) AS vouchers,
                MAX(CASE WHEN iDate <= ${todayPacked} THEN iDate END) AS latestPostingDate,
                MAX(iCreatedDate) AS latestEntryDate
           FROM tCore_Header_0`,
      )
      const byEntryDay = await q(
        pool,
        `SELECT TOP 10 iCreatedDate AS day, COUNT(*) AS vouchers
           FROM tCore_Header_0 GROUP BY iCreatedDate ORDER BY iCreatedDate DESC`,
      )
      return send(res, 200, {
        ok: true,
        ms: Date.now() - started,
        databases,
        restores,
        vouchers: {
          total: latest[0]?.vouchers,
          latestPostingDate: focusDate(latest[0]?.latestPostingDate),
          latestEntryDate: focusDate(latest[0]?.latestEntryDate),
          byEntryDay: byEntryDay.map((r) => ({ day: focusDate(r.day), vouchers: r.vouchers })),
        },
      })
    }

    // Which tables store files inside the database (binary columns) and how
    // many rows actually hold one. Metadata only — never file contents. Row
    // counts come from SQL Server's catalog; only tables up to MEASURE_ROWS
    // are scanned for filled/bytes, so the call fits in the function timeout.
    if (action === 'file-columns') {
      const MEASURE_ROWS = 50000
      const dbs = [FOCUS_DB, process.env.FOCUS_CRM_DB?.trim()].filter((d): d is string => !!d)
      const out: Row[] = []
      for (const db of dbs) {
        const cols = await q(
          pool,
          `SELECT t.name AS t, c.name AS c, ty.name AS type,
                  (SELECT SUM(p.rows) FROM [${db}].sys.partitions p
                    WHERE p.object_id = t.object_id AND p.index_id IN (0, 1)) AS tableRows
             FROM [${db}].sys.tables t
             JOIN [${db}].sys.columns c ON c.object_id = t.object_id
             JOIN [${db}].sys.types ty ON ty.user_type_id = c.user_type_id
            WHERE ty.name IN ('varbinary', 'image', 'binary') AND SCHEMA_NAME(t.schema_id) = 'dbo'`,
        )
        for (const col of cols) {
          const rows = Number(col.tableRows) || 0
          if (rows === 0) continue
          const t = String(col.t).replace(/[^\w]/g, '')
          const c = String(col.c).replace(/[^\w]/g, '')
          if (rows > MEASURE_ROWS) {
            out.push({ db, table: t, column: c, type: col.type, tableRows: rows, filled: null, bytes: null })
            continue
          }
          const [r] = await q(
            pool,
            `SELECT COUNT(*) AS filled, SUM(CAST(DATALENGTH([${c}]) AS bigint)) AS bytes
               FROM [${db}].[dbo].[${t}] WHERE DATALENGTH([${c}]) > 0`,
          )
          if (Number(r?.filled) > 0) out.push({ db, table: t, column: c, type: col.type, tableRows: rows, filled: r!.filled, bytes: r!.bytes })
        }
      }
      out.sort((a, b) => Number(b.filled ?? b.tableRows) - Number(a.filled ?? a.tableRows))
      return send(res, 200, { ok: true, ms: Date.now() - started, columns: out })
    }

    // Which group companies' invoices this Focus copy holds. Focus8070 carries
    // several Mtandt group companies; a voucher number starts with its
    // company's code (DI… Dingli, MR… MRL). Also lists the databases this login
    // can open, in case a company lives elsewhere. Counts and dates only.
    // TEMPORARY — one-off MRL (Mtandt Rentals) export to Excel; remove after.
    // mrl-plan lists the tables in scope with MRL row counts; mrl-export pages
    // one table's MRL rows. Scope: vouchers numbered "MR…", everything hanging
    // off them, and only the masters they reference. Binary (file) columns are
    // never selected.
    if (action === 'mrl-plan' || action === 'mrl-export') {
      const H = `SELECT iHeaderId FROM tCore_Header_0 WHERE sVoucherNo LIKE 'MR%'`
      const B = `SELECT iBodyId FROM tCore_Data_0 WHERE iHeaderId IN (${H})`
      const ACCOUNTS = `SELECT iBookNo FROM tCore_Data_0 WHERE iHeaderId IN (${H}) UNION SELECT iCode FROM tCore_Data_0 WHERE iHeaderId IN (${H})`
      const PRODUCTS = `SELECT iProduct FROM tCore_Indta_0 WHERE iBodyId IN (${B})`
      const WAREHOUSES = `SELECT iMasterId FROM mCore_Warehouse WHERE sName LIKE 'MRL-%'`
      const masters: Record<string, string> = {
        mCore_Account: `iMasterId IN (${ACCOUNTS})`,
        muCore_Account_GST: `iMasterId IN (${ACCOUNTS})`,
        muCore_Account_Details: `iMasterId IN (${ACCOUNTS})`,
        mCore_Product: `iMasterId IN (${PRODUCTS})`,
        muCore_Product: `iMasterId IN (${PRODUCTS})`,
        mCore_Warehouse: `sName LIKE 'MRL-%'`,
        tCore_ibals_0: `iInvTag IN (${WAREHOUSES})`,
        cCore_Vouchers_0: `iVoucherType IN (SELECT DISTINCT iVoucherType FROM tCore_Header_0 WHERE sVoucherNo LIKE 'MR%')`,
        mCore_Units: `1 = 1`,
        cGST_EInvoiceData_0: `sVoucherNo LIKE 'MR%'`,
      }
      const vtypes = (await q(pool, `SELECT DISTINCT iVoucherType AS v FROM tCore_Header_0 WHERE sVoucherNo LIKE 'MR%'`))
        .map((r) => Math.trunc(Number(r.v)))
      const candidates = [
        'tCore_Header_0', 'tCore_Data_0', 'tCore_Indta_0', 'tCore_Refrn_0', 'tCore_Batch_0', 'tCore_Links_0',
        'tCore_Data_Tags_0', 'tCore_IndtaBodyScreenData_0', 'tCore_IndtaFooterScreenData_0',
        ...vtypes.flatMap((v) => [`tCore_HeaderData${v}_0`, `tCore_Data${v}_0`]),
        ...Object.keys(masters),
      ]
      // Non-binary columns and primary key per candidate table, in one query.
      const meta = await q(
        pool,
        `SELECT t.name AS t, c.name AS c, ty.name AS type, c.column_id AS pos,
                CASE WHEN ic.column_id IS NOT NULL THEN ic.key_ordinal END AS pk
           FROM sys.tables t
           JOIN sys.columns c ON c.object_id = t.object_id
           JOIN sys.types ty ON ty.user_type_id = c.user_type_id
           LEFT JOIN sys.indexes i ON i.object_id = t.object_id AND i.is_primary_key = 1
           LEFT JOIN sys.index_columns ic ON ic.object_id = t.object_id AND ic.index_id = i.index_id AND ic.column_id = c.column_id
          WHERE SCHEMA_NAME(t.schema_id) = 'dbo' AND t.name IN (${candidates.map((n) => `'${n.replace(/[^\w]/g, '')}'`).join(',')})`,
      )
      const tables = new Map<string, { cols: string[]; pk: string[] }>()
      for (const m of meta.sort((a, b) => Number(a.pos) - Number(b.pos))) {
        const name = String(m.t)
        if (!tables.has(name)) tables.set(name, { cols: [], pk: [] })
        const entry = tables.get(name)!
        if (['binary', 'varbinary', 'image', 'timestamp'].includes(String(m.type))) continue
        entry.cols.push(String(m.c))
      }
      for (const m of meta.filter((x) => x.pk != null).sort((a, b) => Number(a.pk) - Number(b.pk))) {
        tables.get(String(m.t))?.pk.push(String(m.c))
      }
      const spec = (name: string) => {
        const t = tables.get(name)
        if (!t) return null
        let where = masters[name]
        if (!where && t.cols.includes('iHeaderId')) where = `iHeaderId IN (${H})`
        if (!where && t.cols.includes('iBodyId')) where = `iBodyId IN (${B})`
        if (!where) return null
        const order = (t.pk.length ? t.pk : t.cols.slice(0, 3)).map((c) => `[${c}]`).join(', ')
        return { cols: t.cols, where, order }
      }

      if (action === 'mrl-plan') {
        const plan: Row[] = []
        for (const name of candidates) {
          const s = spec(name)
          if (!s) continue
          const [r] = await q(pool, `SELECT COUNT(*) AS n FROM [${name}] WHERE ${s.where}`)
          plan.push({ table: name, rows: r?.n, columns: s.cols.length })
        }
        return send(res, 200, { ok: true, ms: Date.now() - started, voucherTypes: vtypes, tables: plan })
      }

      const name = params.get('table') ?? ''
      const s = spec(name)
      if (!s) return send(res, 400, { error: `Table '${name}' is not in the MRL export plan.` })
      const offset = Math.max(Number(params.get('offset')) || 0, 0)
      const limit = Math.min(Math.max(Number(params.get('limit')) || 2000, 1), 20000)
      const rows = await q(
        pool,
        `SELECT ${s.cols.map((c) => `[${c}]`).join(', ')} FROM [${name}] WHERE ${s.where}
          ORDER BY ${s.order} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`,
      )
      return send(res, 200, { ok: true, table: name, columns: s.cols, offset, rows })
    }

    if (action === 'companies') {
      const databases = await q(
        pool,
        `SELECT name, CAST(HAS_DBACCESS(name) AS int) AS canOpen FROM sys.databases WHERE database_id > 4 ORDER BY name`,
      )
      const invoices = await q(
        pool,
        `SELECT LEFT(h.sVoucherNo, 2) AS prefix, v.sName AS voucherType, COUNT(*) AS invoices,
                MIN(h.iDate) AS earliest, MAX(h.iDate) AS latest, SUM(ABS(h.fNet)) AS value,
                MAX(h.sVoucherNo) AS exampleNo
           FROM tCore_Header_0 h
           JOIN cCore_Vouchers_0 v ON v.iVoucherType = h.iVoucherType
          WHERE h.iVoucherType BETWEEN ${SALES_VOUCHER_MIN} AND ${SALES_VOUCHER_MAX}
            AND v.bUpdateFA = 1 AND h.bCancelled = 0 AND h.bDraft = 0
          GROUP BY LEFT(h.sVoucherNo, 2), v.sName
          ORDER BY invoices DESC`,
      )
      return send(res, 200, {
        ok: true,
        ms: Date.now() - started,
        databases,
        invoicesByCompanyPrefix: invoices.map((r) => ({
          ...r,
          earliest: focusDate(r.earliest),
          latest: focusDate(r.latest),
        })),
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

    const products = await catalogProducts(pool)
    const stock = await dingliStock(
      pool,
      products.map((p) => p.focus_product_id),
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
    // Drop rows for GSTINs that have left the scope (e.g. a corrected directory
    // entry), so a dealer's data never outlives their place in the portal.
    // Skipped when the scope is empty, so a failed read can't wipe everything.
    if (gstins.length) {
      const keep = `(${gstins.map((g) => g.replace(/[^A-Z0-9]/g, '')).join(',')})`
      for (const table of ['dealer_ledger', 'dealer_invoices'] as const) {
        const { error } = await sb!.from(table).delete().not('gstin', 'in', keep)
        if (error) throw new Error(`${table} cleanup: ${error.message}`)
      }
    }

    // Batched: the catalogue is ~10k rows, too much for one request body.
    for (const batch of chunks(products, 1500)) {
      const { error } = await sb!.rpc('focus_upsert_products', { p_products: batch })
      if (error) throw new Error(`focus_upsert_products: ${error.message}`)
    }
    const { error: stockErr } = await sb!.rpc('focus_replace_stock', {
      p_active_product_ids: products.map((p) => p.focus_product_id),
      p_stock: stock,
    })
    if (stockErr) throw new Error(`focus_replace_stock: ${stockErr.message}`)

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
