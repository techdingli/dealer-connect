// TEMPORARY Focus UAT discovery endpoint — NOT part of the app's data flow.
//
// Purpose: answer one question that can only be answered from Vercel's own
// network — can a serverless function open a SQL Server connection to the
// Focus UAT box and read the dealer/ledger tables we need? It also dumps the
// real schema so the Focus -> app mapping can be built against actual columns
// instead of guesses.
//
// This file is meant to be DELETED once discovery is done. It never touches
// Supabase and is not wired into the SPA. It is fail-closed: with no
// FOCUS_PROBE_TOKEN set in the environment it refuses every request, and it
// only ever issues read-only catalog/SELECT queries.
//
// Required env vars (set in Vercel Project Settings -> Environment Variables,
// NOT in any committed file):
//   FOCUS_DB_USERNAME, FOCUS_DB_PASSWORD, FOCUS_UAT_DB_IP,
//   FOCUS_CRM_DB, FOCUS_MAIN_DB   (the last two are just default db targets)
//   FOCUS_PROBE_TOKEN             (a long random string; callers must match it)
//
// Usage (replace TOKEN):
//   /api/focus-probe?token=TOKEN                         -> server + databases + candidate tables
//   /api/focus-probe?token=TOKEN&action=tables&db=DB     -> tables in DB with row counts
//   /api/focus-probe?token=TOKEN&action=columns&db=DB&table=T
//   /api/focus-probe?token=TOKEN&action=sample&db=DB&table=T&top=20
//   add &encrypt=false if the TLS handshake fails against an old SQL Server.
import type { IncomingMessage, ServerResponse } from 'node:http'
import sql from 'mssql'

export const config = { maxDuration: 30 }

const TOKEN = process.env.FOCUS_PROBE_TOKEN?.trim()

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body, null, 2))
}

function query(req: IncomingMessage): URLSearchParams {
  const url = new URL(req.url ?? '/', 'http://localhost')
  return url.searchParams
}

// Terms that flag a table as worth a closer look for dealer / ledger data.
const CANDIDATE_TERMS = [
  'dealer', 'customer', 'account', 'ledger', 'voucher', 'invoice', 'bill',
  'gst', 'party', 'master', 'tran', 'sales', 'outstanding', 'balance',
]

function baseConfig(encrypt: boolean): sql.config {
  return {
    user: process.env.FOCUS_DB_USERNAME,
    password: process.env.FOCUS_DB_PASSWORD,
    server: process.env.FOCUS_UAT_DB_IP ?? '',
    options: {
      encrypt,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    connectionTimeout: 15000,
    requestTimeout: 25000,
    pool: { max: 2, min: 0, idleTimeoutMillis: 5000 },
  }
}

async function connect(database: string | undefined, encrypt: boolean) {
  const cfg = baseConfig(encrypt)
  if (database) cfg.database = database
  return sql.connect(cfg)
}

// Validate a caller-supplied db name against the real list before using it,
// so nothing caller-controlled is ever interpolated into a query unchecked.
async function assertDb(pool: sql.ConnectionPool, db: string): Promise<boolean> {
  const r = await pool.request().query('SELECT name FROM sys.databases')
  return r.recordset.some((row: { name: string }) => row.name === db)
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!TOKEN) {
    return send(res, 503, {
      error: 'FOCUS_PROBE_TOKEN is not set in this environment; endpoint disabled.',
    })
  }
  const q = query(req)
  if (q.get('token') !== TOKEN) {
    return send(res, 401, { error: 'Bad or missing token.' })
  }

  const encrypt = q.get('encrypt') !== 'false'
  const action = q.get('action') ?? 'overview'
  const started = Date.now()
  let pool: sql.ConnectionPool | undefined

  try {
    if (action === 'overview') {
      pool = await connect(undefined, encrypt)
      const version = (await pool.request().query('SELECT @@VERSION AS v')).recordset[0]?.v
      const dbs = (await pool.request().query(
        'SELECT name FROM sys.databases ORDER BY name',
      )).recordset.map((r: { name: string }) => r.name)

      // For the two configured Focus DBs, surface tables whose name hints at
      // dealer/ledger data, so we know immediately what to drill into.
      const targets = [process.env.FOCUS_CRM_DB, process.env.FOCUS_MAIN_DB]
        .filter((d): d is string => typeof d === 'string' && dbs.includes(d))
      const candidates: Record<string, string[]> = {}
      for (const db of targets) {
        const like = CANDIDATE_TERMS.map((t) => `LOWER(TABLE_NAME) LIKE '%${t}%'`).join(' OR ')
        const r = await pool.request().query(
          `SELECT TABLE_SCHEMA + '.' + TABLE_NAME AS t
             FROM [${db}].INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE' AND (${like})
            ORDER BY TABLE_NAME`,
        )
        candidates[db] = r.recordset.map((row: { t: string }) => row.t)
      }
      return send(res, 200, {
        ok: true, ms: Date.now() - started, encrypt,
        server: process.env.FOCUS_UAT_DB_IP, version,
        databases: dbs, candidateTables: candidates,
      })
    }

    const db = q.get('db')
    if (!db) return send(res, 400, { error: 'db query param required for this action.' })
    pool = await connect(undefined, encrypt)
    if (!(await assertDb(pool, db))) {
      return send(res, 404, { error: `Database '${db}' not found or not visible to this login.` })
    }

    if (action === 'tables') {
      const r = await pool.request().query(
        `SELECT s.name AS [schema], t.name AS [table],
                SUM(p.rows) AS [rows]
           FROM [${db}].sys.tables t
           JOIN [${db}].sys.schemas s ON s.schema_id = t.schema_id
           JOIN [${db}].sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
          GROUP BY s.name, t.name
          ORDER BY [rows] DESC`,
      )
      return send(res, 200, { ok: true, ms: Date.now() - started, db, tables: r.recordset })
    }

    if (action === 'columns') {
      const table = q.get('table')
      if (!table) return send(res, 400, { error: 'table query param required.' })
      const r = await pool.request()
        .input('t', sql.NVarChar, table)
        .query(
          `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
             FROM [${db}].INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @t
            ORDER BY ORDINAL_POSITION`,
        )
      if (r.recordset.length === 0) {
        return send(res, 404, { error: `Table '${table}' not found in '${db}'.` })
      }
      return send(res, 200, { ok: true, ms: Date.now() - started, db, table, columns: r.recordset })
    }

    if (action === 'sample') {
      const table = q.get('table')
      if (!table) return send(res, 400, { error: 'table query param required.' })
      // Confirm the table exists (and get its validated identifier) before use.
      const meta = await pool.request()
        .input('t', sql.NVarChar, table)
        .query(
          `SELECT TOP 1 TABLE_SCHEMA AS s, TABLE_NAME AS n
             FROM [${db}].INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @t`,
        )
      const row = meta.recordset[0] as { s: string; n: string } | undefined
      if (!row) return send(res, 404, { error: `Table '${table}' not found in '${db}'.` })
      const top = Math.min(Math.max(parseInt(q.get('top') ?? '20', 10) || 20, 1), 200)
      const data = await pool.request().query(
        `SELECT TOP ${top} * FROM [${db}].[${row.s}].[${row.n}]`,
      )
      return send(res, 200, {
        ok: true, ms: Date.now() - started, db, table: `${row.s}.${row.n}`,
        rowCount: data.recordset.length, rows: data.recordset,
      })
    }

    return send(res, 400, { error: `Unknown action '${action}'.` })
  } catch (err) {
    return send(res, 502, {
      ok: false, ms: Date.now() - started, action, encrypt,
      error: err instanceof Error ? err.message : String(err),
      hint: 'If this is a TLS/handshake error, retry with &encrypt=false. '
        + 'If it is a timeout or ECONNREFUSED/ETIMEDOUT, Vercel cannot reach the '
        + 'Focus server on 1433 — the server is not exposed to Vercel\'s network, '
        + 'and the sync-into-Supabase path (run from a machine that can reach Focus) '
        + 'is the realistic route.',
    })
  } finally {
    if (pool) await pool.close().catch(() => {})
  }
}
