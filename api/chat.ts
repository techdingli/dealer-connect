// Vercel serverless function (Node.js runtime) — the one place this app's
// Anthropic API key lives. Everything else in the repo is a static SPA that
// never sees this key. Deployed automatically by Vercel from this /api
// directory; no framework-specific config needed.
//
// Two chat "categories" share this endpoint:
//   - dealer:  tool-use — Claude calls read-only tools backed by the signed-in
//              dealer's own Supabase session, so Row Level Security scopes
//              every query exactly like the rest of the app.
//   - support: context-stuffing — the selected machine's manual text is
//              handed to Claude directly as system context (no tools needed;
//              a single model's manual comfortably fits Claude's context
//              window), with prompt caching since it's reused turn-to-turn.
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

const DEALER_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_invoices',
    description:
      "Get the signed-in dealer's invoices for the current financial year, including each invoice's line-item breakdown.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_ledger',
    description:
      "Get the signed-in dealer's ledger entries (date, voucher, description, debit, credit) as recorded in Focus. Payments and adjustments only — invoices are not consistently included, and there is no running balance.",
    input_schema: { type: 'object', properties: {}, required: [] },
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

async function runDealerTool(name: string, supabase: SupabaseClient): Promise<unknown> {
  switch (name) {
    case 'get_invoices': {
      const { data, error } = await supabase
        .from('invoices')
        .select('invoice_number, fy, invoice_date, amount, status, invoice_items(description, quantity, unit_price, line_total)')
        .order('invoice_date', { ascending: false })
      if (error) throw error
      return data
    }
    case 'get_ledger': {
      const { data, error } = await supabase
        .from('dealer_ledger')
        .select('entry_date, voucher_no, voucher_type, description, debit, credit')
        .order('entry_date', { ascending: true })
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
- You can only ever see the signed-in dealer's own data — if asked about another dealer, explain that politely.
- The ledger has no running balance and may not include every invoice — present it as a record of payments and adjustments, not a full statement of account.
- Format money as Indian Rupees, e.g. ₹8,75,000.
- Be concise and direct. Use a short list or table-like formatting for multiple records.
- If a tool returns no rows, say so plainly rather than inventing an answer.`

async function runDealerChatMock(messages: Anthropic.MessageParam[], supabase: SupabaseClient): Promise<string> {
  const question = extractUserText(messages[messages.length - 1]?.content ?? '').toLowerCase()

  if (/(ledger|balance|owe|outstanding)/.test(question)) {
    const entries = (await runDealerTool('get_ledger', supabase)) as Array<{
      debit: number
      credit: number
    }>
    if (!entries.length) return `You have no ledger entries on file yet.${MOCK_NOTICE}`
    const totalDebit = entries.reduce((s, e) => s + Number(e.debit), 0)
    const totalCredit = entries.reduce((s, e) => s + Number(e.credit), 0)
    return `Your ledger (payments and adjustments only, no running balance): total debit ${formatINR(totalDebit)}, total credit ${formatINR(totalCredit)}.${MOCK_NOTICE}`
  }

  if (/(invoice|bill)/.test(question)) {
    const invoices = (await runDealerTool('get_invoices', supabase)) as Array<{
      invoice_number: string
      amount: number
      status: string
    }>
    if (!invoices.length) return `You have no invoices on file yet.${MOCK_NOTICE}`
    const wantsUnpaid = /(unpaid|due|overdue|pending)/.test(question)
    const filtered = wantsUnpaid ? invoices.filter((i) => i.status !== 'paid') : invoices
    if (!filtered.length) return `You have no unpaid invoices — nice and clear!${MOCK_NOTICE}`
    const lines = filtered.map((i) => `• ${i.invoice_number} — ${formatINR(i.amount)} — ${i.status}`).join('\n')
    return `${wantsUnpaid ? 'Unpaid invoices' : 'Invoices'}:\n${lines}${MOCK_NOTICE}`
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
        const result = await runDealerTool(block.name, supabase)
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

async function runSupportChatMock(question: string, machine: { model_name: string; manual_text: string }): Promise<string> {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !SUPPORT_STOPWORDS.has(w))

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

  const systemPrompt: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: `You are a Dingli technical support assistant helping a site engineer service a ${machine.model_name} (${machine.category}). Answer ONLY using the parts/service manual excerpt below — do not use outside knowledge about this or any other machine. Always cite the section number and title you drew the answer from (e.g. "Section 3-13, Telescopic Cylinder Assembly Installations"), and include part numbers/quantities verbatim when relevant. If the manual doesn't cover the question, say so plainly rather than guessing.

--- MANUAL: ${machine.model_name} ---
${machine.manual_text}
--- END MANUAL ---`,
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
