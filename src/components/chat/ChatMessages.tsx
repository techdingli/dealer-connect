import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Send, Sparkles } from 'lucide-react'
import type { ChatMessage } from '@/hooks/useAssistantChat'
import { cn } from '@/lib/utils'

// The chatbot is now instructed (see DEALER_SYSTEM_PROMPT / the support
// system prompt in api/chat.ts) to format multi-row answers as GitHub-
// flavored Markdown tables rather than bullet lists, so assistant replies
// need real Markdown rendering — otherwise a table shows up as literal pipe
// and dash characters. The surface Claude actually uses is narrow and known
// (paragraphs, **bold**, bullet/numbered lists, and GFM pipe tables), so
// rather than pull in a full Markdown dependency for that, this is a small
// hand-rolled parser covering exactly those cases. User messages are plain
// typed text and render as-is (see the `whitespace-pre-wrap` branch below).
type MdBlock =
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'p'; text: string }

const TABLE_SEPARATOR_RE = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/
const BULLET_RE = /^[-*]\s+/
const NUMBERED_RE = /^\d+[.)]\s+/

function splitTableRow(line: string): string[] {
  let trimmed = line.trim()
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1)
  return trimmed.split('|').map((cell) => cell.trim())
}

function isTableHeaderLine(line: string, nextLine: string | undefined): boolean {
  return line.includes('|') && nextLine !== undefined && TABLE_SEPARATOR_RE.test(nextLine.trim())
}

function parseMarkdownBlocks(content: string): MdBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: MdBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }

    if (isTableHeaderLine(line, lines[i + 1])) {
      const header = splitTableRow(line)
      i += 2 // skip the header row and the |---|---| separator row
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) {
        rows.push(splitTableRow(lines[i]))
        i++
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    if (BULLET_RE.test(line.trim())) {
      const items: string[] = []
      while (i < lines.length && BULLET_RE.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(BULLET_RE, ''))
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    if (NUMBERED_RE.test(line.trim())) {
      const items: string[] = []
      while (i < lines.length && NUMBERED_RE.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(NUMBERED_RE, ''))
        i++
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    // Paragraph: accumulate consecutive plain lines until a blank line or the
    // start of one of the block types above.
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !BULLET_RE.test(lines[i].trim()) &&
      !NUMBERED_RE.test(lines[i].trim()) &&
      !isTableHeaderLine(lines[i], lines[i + 1])
    ) {
      paraLines.push(lines[i])
      i++
    }
    blocks.push({ type: 'p', text: paraLines.join('\n') })
  }

  return blocks
}

// Inline **bold** and `code` spans within a block's text.
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${keyPrefix}-${idx}`} className="font-semibold text-base-50">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={`${keyPrefix}-${idx}`} className="rounded bg-base-900/60 px-1 py-0.5 text-xs">
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}

function MarkdownLite({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content])
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'table') {
          return (
            <div key={i} className="mb-2 overflow-x-auto last:mb-0">
              <table className="w-full border-collapse text-xs">
                <thead className="border-b border-base-500 text-left">
                  <tr>
                    {block.header.map((h, hi) => (
                      <th key={hi} className="px-2 py-1.5 font-semibold text-base-100">
                        {renderInline(h, `h${i}-${hi}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="border-t border-base-700 px-2 py-1.5 align-top">
                          {renderInline(cell, `r${i}-${ri}-${ci}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (block.type === 'ul') {
          return (
            <ul key={i} className="mb-2 list-disc space-y-1 pl-4 last:mb-0">
              {block.items.map((item, ii) => (
                <li key={ii}>{renderInline(item, `ul${i}-${ii}`)}</li>
              ))}
            </ul>
          )
        }
        if (block.type === 'ol') {
          return (
            <ol key={i} className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">
              {block.items.map((item, ii) => (
                <li key={ii}>{renderInline(item, `ol${i}-${ii}`)}</li>
              ))}
            </ol>
          )
        }
        return (
          <p key={i} className="mb-2 whitespace-pre-wrap last:mb-0">
            {renderInline(block.text, `p${i}`)}
          </p>
        )
      })}
    </>
  )
}

export function ChatMessages({
  messages,
  sending,
  error,
  onSend,
  placeholder,
  emptyState,
  suggestions,
}: {
  messages: ChatMessage[]
  sending: boolean
  error: string | null
  onSend: (text: string) => void
  placeholder: string
  emptyState: React.ReactNode
  suggestions?: string[]
}) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    onSend(input)
    setInput('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            {emptyState}
            {suggestions && suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSend(s)}
                    className="rounded-full border border-base-600 px-3 py-1.5 text-xs text-base-300 transition-colors hover:border-orange-500/40 hover:text-orange-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'rounded-br-sm whitespace-pre-wrap bg-gradient-to-r from-orange-600 to-orange-500 text-white'
                    : 'rounded-bl-sm border border-base-600 bg-base-800 text-base-100',
                )}
              >
                {m.role === 'assistant' ? <MarkdownLite content={m.content} /> : m.content}
              </div>
            </motion.div>
          ))
        )}

        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-base-600 bg-base-800 px-3.5 py-2.5 text-sm text-base-400">
              <Loader2 className="size-3.5 animate-spin" />
              Thinking…
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-base-600 p-3">
        <div className="relative flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-base-500" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-xl border border-base-500 bg-base-900/60 py-2.5 pl-9 pr-3 text-sm text-base-50 outline-none placeholder:text-base-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25"
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 text-white transition-opacity disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  )
}
