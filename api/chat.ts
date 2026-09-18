// Vercel serverless function (Node.js runtime) — the one place this app's
// Anthropic API key lives. Everything else in the repo is a static SPA that
// never sees this key. Deployed automatically by Vercel from this /api
// directory; no framework-specific config needed.
//
// Two chat "categories" share this endpoint:
//   - dealer:  tool-use — Claude calls read-only tools backed by the signed-in
//              dealer's own Supabase session, so Row Level Security scopes
//              every query exactly like the rest of the app. The ledger/
//              invoice tools return compact summaries by default and only
//              fetch raw rows through a separate "detail" tool when asked
//              (see the comment above DEALER_TOOLS) — this keeps both the
//              input and output token cost down.
//   - support: context-stuffing, but of a *retrieved excerpt* rather than the
//              whole manual — the manual is pre-split into sections
//              (splitManualIntoSections) and only the sections that keyword-
//              match the question (scoreSection/selectRelevantSections) are
//              handed to Claude as system context, with prompt caching since
//              it's reused turn-to-turn. No tools needed either way.
//
// MOCK MODE: when ANTHROPIC_API_KEY isn't set, both flows fall back to a
// rule-based responder that still runs the real Supabase queries / real
// manual text (no AI, no cost) instead of calling Claude, so the full app
// works end-to-end before you've added a key. Nothing else changes when you
// do add one — same request shape, same UI, just smarter answers.
import type { IncomingMessage, ServerResponse } from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const HAS_API_KEY = Boolean(process.env.ANTHROPIC_API_KEY?.trim())
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!

const MODEL = 'claude-opus-5'
const MAX_TOKENS = 4096
const MAX_TOOL_ITERATIONS = 6

const MOCK_NOTICE =
  '\n\n_(Demo mode — no live AI key connected yet. This answer used real data with simple keyword matching; connecting `ANTHROPIC_API_KEY` switches this to full natural-language understanding, no other changes needed.)_'

type ChatBody = {
  category: 'dealer' | 'support'
  messages: Anthropic.MessageParam[]
  accessToken?: string
  machineModel?: string
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function lastText(content: Anthropic.ContentBlock[]): string {
  const block = content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  return block?.text ?? ''
}

function extractUserText(content: Anthropic.MessageParam['content']): string {
  if (typeof content === 'string') return content
  return content.map((b) => (b.type === 'text' ? b.text : '')).join(' ')
}

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

// ---------------------------------------------------------------------------
// Category 1: Dealer Site Inquiry (tool-use over RLS-scoped Supabase data)
// ---------------------------------------------------------------------------

// get_invoices/get_ledger used to return every row unfiltered, every time.
// In production an admin-scoped account pulled all 260 rows across every
// dealer in a single call, blew past the model's output token budget, and
// came back as an empty reply. Rather than just capping row counts, split
// each into a SUMMARY tool (aggregate totals — this is what most questions
// actually need) and a DETAIL tool that takes an optional filter and only
// returns raw rows for the scope asked about. Claude is steered by
// DEALER_SYSTEM_PROMPT to reach for the detail tools only when a question
// genuinely needs line-level data.
const DEALER_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_invoices',
    description:
      "Get a SUMMARY of the signed-in dealer's invoices for the current financial year: total invoiced amount, invoice count by status (paid/unpaid/overdue), and the most recent invoice. Does not include line items or the full invoice list — call get_invoice_detail for that.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_invoice_detail',
    description:
      "Get the signed-in dealer's individual invoices, including each invoice's line-item breakdown, optionally filtered by status or a specific invoice number. Use this after get_invoices, only when the dealer needs the itemized list or a specific invoice — it can return many rows.",
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['paid', 'unpaid', 'overdue'],
          description: 'Only return invoices with this status.',
        },
        invoice_number: {
          type: 'string',
          description: 'Only return the invoice with this exact invoice number.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_ledger',
    description:
      "Get a SUMMARY of the signed-in dealer's ledger as recorded in Focus: total debit, total credit, entry count, the date range covered, and a breakdown by voucher type with subtotals. Payments and adjustments only — invoices are not consistently included, and there is no running balance. Does not include individual entries — call get_ledger_detail for that.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_ledger_detail',
    description:
      "Get the signed-in dealer's individual ledger entries (date, voucher, description, debit, credit), optionally filtered by a date range and/or voucher type. Use this after get_ledger, only when the dealer asks about a specific period or voucher type — it can return many rows.",
    input_schema: {
      type: 'object',
      properties: {
        from_date: {
          type: 'string',
          description: 'ISO date (YYYY-MM-DD). Only include entries on or after this date.',
        },
        to_date: {
          type: 'string',
          description: 'ISO date (YYYY-MM-DD). Only include entries on or before this date.',
        },
        voucher_type: {
          type: 'string',
          description: 'Only include entries with this exact voucher type, e.g. "Payment" or "Journal".',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_service_requests',
    description: "Get the signed-in dealer's service request tickets, their priority and status.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_dealer_stock',
    description: "Get the machines/units currently held at the signed-in dealer's own location(s).",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
]

type LedgerSummary = {
  entry_count: number
  total_debit: number
  total_credit: number
  date_range: { from: string; to: string } | null
  by_voucher_type: { voucher_type: string; count: number; debit: number; credit: number }[]
}

type InvoiceSummary = {
  invoice_count: number
  total_amount: number
  by_status: { status: string; count: number }[]
  most_recent_invoice: { invoice_number: string; invoice_date: string; amount: number; status: string } | null
}

function summarizeLedger(entries: { entry_date: string; voucher_type: string | null; debit: number; credit: number }[]): LedgerSummary {
  const byType = new Map<string, { count: number; debit: number; credit: number }>()
  let totalDebit = 0
  let totalCredit = 0
  let minDate: string | null = null
  let maxDate: string | null = null

  for (const e of entries) {
    totalDebit += Number(e.debit)
    totalCredit += Number(e.credit)
    if (!minDate || e.entry_date < minDate) minDate = e.entry_date
    if (!maxDate || e.entry_date > maxDate) maxDate = e.entry_date

    const key = e.voucher_type ?? 'Unspecified'
    const bucket = byType.get(key) ?? { count: 0, debit: 0, credit: 0 }
    bucket.count += 1
    bucket.debit += Number(e.debit)
    bucket.credit += Number(e.credit)
    byType.set(key, bucket)
  }

  return {
    entry_count: entries.length,
    total_debit: totalDebit,
    total_credit: totalCredit,
    date_range: minDate && maxDate ? { from: minDate, to: maxDate } : null,
    by_voucher_type: Array.from(byType.entries()).map(([voucher_type, v]) => ({ voucher_type, ...v })),
  }
}

function summarizeInvoices(invoices: { invoice_number: string; invoice_date: string; amount: number; status: string }[]): InvoiceSummary {
  const byStatus = new Map<string, number>()
  let totalAmount = 0
  for (const inv of invoices) {
    totalAmount += Number(inv.amount)
    byStatus.set(inv.status, (byStatus.get(inv.status) ?? 0) + 1)
  }
  // Already ordered by invoice_date descending by the caller's query.
  const mostRecent = invoices[0] ?? null

  return {
    invoice_count: invoices.length,
    total_amount: totalAmount,
    by_status: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
    most_recent_invoice: mostRecent
      ? {
          invoice_number: mostRecent.invoice_number,
          invoice_date: mostRecent.invoice_date,
          amount: mostRecent.amount,
          status: mostRecent.status,
        }
      : null,
  }
}

async function runDealerTool(name: string, supabase: SupabaseClient, input: Record<string, unknown> = {}): Promise<unknown> {
  switch (name) {
    case 'get_invoices': {
      const { data, error } = await supabase
        .from('invoices')
        .select('invoice_number, invoice_date, amount, status')
        .order('invoice_date', { ascending: false })
      if (error) throw error
      return summarizeInvoices(data ?? [])
    }
    case 'get_invoice_detail': {
      let query = supabase
        .from('invoices')
        .select('invoice_number, fy, invoice_date, amount, status, invoice_items(description, quantity, unit_price, line_total)')
      if (typeof input.status === 'string') query = query.eq('status', input.status)
      if (typeof input.invoice_number === 'string') query = query.eq('invoice_number', input.invoice_number)
      const { data, error } = await query.order('invoice_date', { ascending: false })
      if (error) throw error
      return data
    }
    case 'get_ledger': {
      const { data, error } = await supabase
        .from('dealer_ledger')
        .select('entry_date, voucher_type, debit, credit')
        .order('entry_date', { ascending: true })
      if (error) throw error
      return summarizeLedger(data ?? [])
    }
    case 'get_ledger_detail': {
      let query = supabase
        .from('dealer_ledger')
        .select('entry_date, voucher_no, voucher_type, description, debit, credit')
      if (typeof input.from_date === 'string') query = query.gte('entry_date', input.from_date)
      if (typeof input.to_date === 'string') query = query.lte('entry_date', input.to_date)
      if (typeof input.voucher_type === 'string') query = query.eq('voucher_type', input.voucher_type)
      const { data, error } = await query.order('entry_date', { ascending: true })
      if (error) throw error
      return data
    }
    case 'get_service_requests': {
      const { data, error } = await supabase
        .from('service_requests')
        .select('machine_model, serial_number, issue_description, priority, status, created_at, resolved_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    }
    case 'get_dealer_stock': {
      const { data, error } = await supabase
        .from('dealer_stock')
        .select('quantity, location, updated_at, product:products(name, sku, category)')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

const DEALER_SYSTEM_PROMPT = `You are the Dingli Dealer Connect assistant, helping a signed-in dealer with questions about their own account: invoices, ledger balance, service requests, and stock held at their dealership.

Rules:
- Always call the relevant tool(s) to fetch real data before answering. Never guess or estimate numbers.
- get_invoices and get_ledger return SUMMARIES (totals, counts, breakdowns) — start with these for any general question ("what do I owe", "how many invoices"). Only call get_invoice_detail or get_ledger_detail when the dealer's question needs line-level data (a specific date range, voucher type, invoice status, or invoice number) — these can return many rows, so don't call them speculatively.
- You can only ever see the signed-in dealer's own data — if asked about another dealer, explain that politely.
- The ledger has no running balance and may not include every invoice — present it as a record of payments and adjustments, not a full statement of account.
- Format money as Indian Rupees, e.g. ₹8,75,000.
- Be concise and direct. When presenting more than 2-3 records (invoices, ledger entries, stock items, etc.), format them as a GitHub-flavored Markdown table with clear column headers — not a bullet list. For a single record or a short narrative answer, plain prose is fine.
- If a tool returns no rows, say so plainly rather than inventing an answer.`

async function runDealerChatMock(messages: Anthropic.MessageParam[], supabase: SupabaseClient): Promise<string> {
  const question = extractUserText(messages[messages.length - 1]?.content ?? '').toLowerCase()

  if (/(ledger|balance|owe|outstanding)/.test(question)) {
    // Mock mode calls the same summary tool the real Claude path is steered
    // towards by default — no need to reimplement the aggregation twice.
    const summary = (await runDealerTool('get_ledger', supabase)) as LedgerSummary
    if (!summary.entry_count) return `You have no ledger entries on file yet.${MOCK_NOTICE}`
    const range = summary.date_range ? ` from ${summary.date_range.from} to ${summary.date_range.to}` : ''
    return `Your ledger (payments and adjustments only, no running balance): ${summary.entry_count} entries${range}, total debit ${formatINR(summary.total_debit)}, total credit ${formatINR(summary.total_credit)}.${MOCK_NOTICE}`
  }

  if (/(invoice|bill)/.test(question)) {
    const wantsUnpaid = /(unpaid|due|overdue|pending)/.test(question)

    if (wantsUnpaid) {
      // A listing needs the itemized rows, not the summary — that's what
      // get_invoice_detail is for. No status filter here because "unpaid" in
      // this UI means "anything other than paid" (unpaid or overdue), which
      // is a broader match than the tool's single-status filter supports.
      const invoices = (await runDealerTool('get_invoice_detail', supabase)) as Array<{
        invoice_number: string
        amount: number
        status: string
      }>
      const filtered = invoices.filter((i) => i.status !== 'paid')
      if (!filtered.length) return `You have no unpaid invoices — nice and clear!${MOCK_NOTICE}`
      const rows = filtered.map((i) => `| ${i.invoice_number} | ${formatINR(i.amount)} | ${i.status} |`).join('\n')
      return `Unpaid invoices:\n\n| Invoice # | Amount | Status |\n| --- | --- | --- |\n${rows}${MOCK_NOTICE}`
    }

    const summary = (await runDealerTool('get_invoices', supabase)) as InvoiceSummary
    if (!summary.invoice_count) return `You have no invoices on file yet.${MOCK_NOTICE}`
    const byStatus = summary.by_status.map((s) => `${s.count} ${s.status}`).join(', ')
    const recent = summary.most_recent_invoice
    const recentLine = recent ? ` Most recent: ${recent.invoice_number} — ${formatINR(recent.amount)} (${recent.status}).` : ''
    return `You have ${summary.invoice_count} invoice(s) totaling ${formatINR(summary.total_amount)} (${byStatus}).${recentLine}${MOCK_NOTICE}`
  }

  if (/(stock|inventory|units)/.test(question)) {
    const stock = (await runDealerTool('get_dealer_stock', supabase)) as Array<{
      quantity: number
      location: string | null
      product: { name: string } | null
    }>
    if (!stock.length) return `You have no stock on record yet.${MOCK_NOTICE}`
    const lines = stock
      .map((s) => `• ${s.product?.name ?? 'Unknown product'} — ${s.quantity} units — ${s.location ?? 'no location set'}`)
      .join('\n')
    return `Your current stock:\n${lines}${MOCK_NOTICE}`
  }

  if (/(service|ticket|repair|request)/.test(question)) {
    const requests = (await runDealerTool('get_service_requests', supabase)) as Array<{
      machine_model: string
      priority: string
      status: string
    }>
    if (!requests.length) return `You have no service requests on file.${MOCK_NOTICE}`
    const lines = requests.map((r) => `• ${r.machine_model} — ${r.priority} priority — ${r.status}`).join('\n')
    return `Your service requests:\n${lines}${MOCK_NOTICE}`
  }

  return `I'm running in demo mode without a live AI key yet, so I can only answer direct questions about your invoices, ledger balance, stock, or service requests right now. Try one of the suggestions above.`
}

async function runDealerChat(messages: Anthropic.MessageParam[], accessToken: string): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    throw new Error('unauthorized')
  }

  if (!HAS_API_KEY) {
    return runDealerChatMock(messages, supabase)
  }

  const convo: Anthropic.MessageParam[] = [...messages]

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: DEALER_SYSTEM_PROMPT,
      tools: DEALER_TOOLS,
      messages: convo,
    })

    if (response.stop_reason !== 'tool_use') {
      return lastText(response.content)
    }

    convo.push({ role: 'assistant', content: response.content })

    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of toolUseBlocks) {
      try {
        const result = await runDealerTool(block.name, supabase, block.input as Record<string, unknown>)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: err instanceof Error ? err.message : 'Tool execution failed',
          is_error: true,
        })
      }
    }
    convo.push({ role: 'user', content: toolResults })
  }

  return "I'm having trouble finishing that lookup right now — please try rephrasing, or reach out to your Dingli India contact directly."
}

// ---------------------------------------------------------------------------
// Category 2: Support / Manual Lookup (context-stuffing, one machine at a time)
// ---------------------------------------------------------------------------

const SUPPORT_STOPWORDS = new Set([
  'what', 'which', 'where', 'when', 'how', 'does', 'do', 'is', 'are', 'the', 'a', 'an', 'for', 'on',
  'in', 'of', 'to', 'and', 'my', 'me', 'can', 'you', 'i', 'it', 'with', 'part', 'number', 'please',
])

function splitManualIntoSections(manualText: string): { heading: string; body: string }[] {
  const headingRegex = /^\d+-\d+\s+\S.*/
  const raw: { heading: string; body: string[] }[] = []
  let current: { heading: string; body: string[] } | null = null

  for (const line of manualText.split('\n')) {
    const trimmed = line.trim()
    if (headingRegex.test(trimmed) && !trimmed.includes('....')) {
      if (current) raw.push(current)
      current = { heading: trimmed, body: [] }
    } else if (current) {
      current.body.push(line)
    }
  }
  if (current) raw.push(current)

  // The same heading text appears twice — once as a dot-leader-free table of
  // contents entry (near-empty body) and once as the real inline section
  // header. Keep whichever copy has the longer body.
  const byHeading = new Map<string, { heading: string; body: string }>()
  for (const s of raw) {
    const body = s.body.join('\n').trim()
    const existing = byHeading.get(s.heading)
    if (!existing || body.length > existing.body.length) {
      byHeading.set(s.heading, { heading: s.heading, body })
    }
  }
  return Array.from(byHeading.values()).filter((s) => s.body.length > 80)
}

function scoreSection(section: { heading: string; body: string }, words: string[]): number {
  const headingLower = section.heading.toLowerCase()
  const haystack = `${headingLower} ${section.body.toLowerCase()}`
  let score = 0
  for (const w of words) {
    if (headingLower.includes(w)) score += 3
    score += haystack.split(w).length - 1
  }
  return score
}

function tokenizeSupportQuestion(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !SUPPORT_STOPWORDS.has(w))
}

// How many top-scoring sections to hand Claude, instead of the whole manual.
// A single manual section here comfortably covers one part/assembly/procedure
// (see splitManualIntoSections' 80-char minimum), so 5 of them is generous
// room for a real question while still being a large cut from "entire
// manual" — the same handful of sections works whether the question is
// narrow ("what's the part number for X") or needs a bit of surrounding
// context (a procedure spanning a couple of related sections).
const SUPPORT_MAX_SECTIONS = 5

// This is the "graph"/index the token-reduction request asked for: a
// lightweight pre-parsed section list per manual (built by
// splitManualIntoSections), queried by keyword relevance (scoreSection) —
// the same retrieval the no-API-key mock path already used, now shared with
// the real Claude path too so neither one dumps the entire manual into
// context on every turn.
function selectRelevantSections(
  sections: { heading: string; body: string }[],
  words: string[],
): { heading: string; body: string; score: number }[] {
  const scored = sections
    .map((s) => ({ ...s, score: scoreSection(s, words) }))
    .sort((a, b) => b.score - a.score)

  const relevant = scored.filter((s) => s.score > 0).slice(0, SUPPORT_MAX_SECTIONS)
  if (relevant.length > 0) return relevant

  // Nothing scored above zero — an oddly-phrased or very generic question
  // (or one with no recognizable keywords at all). Fall back to a few
  // sections anyway, in their original manual order (all scores are tied at
  // 0, and Array#sort is stable), so Claude has *something* to reason over
  // rather than an empty manual and a guaranteed "I don't know."
  return scored.slice(0, 3)
}

async function runSupportChatMock(question: string, machine: { model_name: string; manual_text: string }): Promise<string> {
  const words = tokenizeSupportQuestion(question)

  if (words.length === 0) {
    return `Ask me something specific about the ${machine.model_name} — a part, an assembly, or a system (e.g. "telescopic cylinder" or "proximity switch").`
  }

  const sections = splitManualIntoSections(machine.manual_text)
  const [top] = sections.map((s) => ({ ...s, score: scoreSection(s, words) })).sort((a, b) => b.score - a.score)

  if (!top || top.score === 0) {
    return `I couldn't find a matching section for that in the ${machine.model_name} manual — demo mode uses keyword search, not full understanding, so try mentioning a specific part or assembly name.${MOCK_NOTICE}`
  }

  const excerpt = top.body.slice(0, 900).trim()
  return `Closest match — **${top.heading}**:\n\n${excerpt}${top.body.length > 900 ? '\n…' : ''}${MOCK_NOTICE}`
}

async function runSupportChat(
  messages: Anthropic.MessageParam[],
  machineModel: string,
  accessToken: string,
): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    throw new Error('unauthorized')
  }

  const { data: machine, error } = await supabase
    .from('machines')
    .select('model_name, category, manual_text')
    .eq('model_name', machineModel)
    .single()

  if (error || !machine) {
    return `I don't have a record for "${machineModel}" — please pick a model from the list.`
  }

  if (!machine.manual_text) {
    return `I don't have a manual on file for the ${machine.model_name} yet, so I can't answer service questions for it. Please contact Dingli India support directly for this model.`
  }

  if (!HAS_API_KEY) {
    const question = extractUserText(messages[messages.length - 1]?.content ?? '')
    return runSupportChatMock(question, { model_name: machine.model_name, manual_text: machine.manual_text })
  }

  // Retrieve only the manual sections relevant to this question instead of
  // sending the entire manual on every turn — the same keyword-scoring
  // retrieval the mock path uses (see selectRelevantSections above). This is
  // the main input-token saving for the support category.
  const question = extractUserText(messages[messages.length - 1]?.content ?? '')
  const words = tokenizeSupportQuestion(question)
  const sections = splitManualIntoSections(machine.manual_text)

  // Some manuals may not follow the numbered "N-N Heading" convention that
  // splitManualIntoSections looks for, in which case it returns no sections —
  // fall back to the full manual text for those rather than sending nothing.
  const manualContext =
    sections.length > 0
      ? selectRelevantSections(sections, words)
          .map((s) => `${s.heading}\n${s.body}`)
          .join('\n\n')
      : machine.manual_text

  const systemPrompt: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: `You are a Dingli technical support assistant helping a site engineer service a ${machine.model_name} (${machine.category}). Answer ONLY using the manual excerpt below — do not use outside knowledge about this or any other machine. The excerpt below contains only the sections of the manual most relevant to this question (retrieved by keyword match, not the full manual, to keep this efficient) — if it doesn't cover the question, say so plainly and suggest the engineer rephrase with a more specific part/assembly name, rather than assuming the manual has no answer at all. Always cite the section number and title you drew the answer from (e.g. "Section 3-13, Telescopic Cylinder Assembly Installations"), and include part numbers/quantities verbatim when relevant. When presenting more than 2-3 records (e.g. a parts list), format them as a GitHub-flavored Markdown table with clear column headers, not a bullet list.

--- MANUAL EXCERPT: ${machine.model_name} ---
${manualContext}
--- END MANUAL EXCERPT ---`,
      cache_control: { type: 'ephemeral' },
    },
  ]

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages,
  })

  return lastText(response.content)
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  let body: ChatBody
  try {
    body = (await readJsonBody(req)) as ChatBody
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' })
    return
  }

  const { category, messages, accessToken, machineModel } = body

  if (!accessToken) {
    sendJson(res, 401, { error: 'Missing access token' })
    return
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    sendJson(res, 400, { error: 'Missing messages' })
    return
  }

  try {
    if (category === 'dealer') {
      const reply = await runDealerChat(messages, accessToken)
      sendJson(res, 200, { reply })
      return
    }

    if (category === 'support') {
      if (!machineModel) {
        sendJson(res, 400, { error: 'Missing machineModel' })
        return
      }
      const reply = await runSupportChat(messages, machineModel, accessToken)
      sendJson(res, 200, { reply })
      return
    }

    sendJson(res, 400, { error: 'category must be "dealer" or "support"' })
  } catch (err) {
    if (err instanceof Error && err.message === 'unauthorized') {
      sendJson(res, 401, { error: 'Invalid or expired session' })
      return
    }
    console.error('chat handler error:', err)
    sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
