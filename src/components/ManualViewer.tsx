import { useMemo, useState } from 'react'
import { BookOpen, Search } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'

/**
 * Reads a service manual in-app.
 *
 * Sections are split on the same "N-N Heading" convention the real manuals use
 * and that api/chat.ts already parses (see splitManualIntoSections) — so this
 * renders live manuals and the demo ones identically, and keeps working when
 * demo mode is switched off.
 */
const HEADING_RE = /^\d+-\d+\s+\S.*/

interface Section {
  heading: string
  body: string
}

function parseManual(manualText: string): Section[] {
  const sections: Section[] = []
  let current: { heading: string; body: string[] } | null = null

  for (const line of manualText.split('\n')) {
    const trimmed = line.trim()
    // Dot leaders mark a table-of-contents entry, not a real section header.
    if (HEADING_RE.test(trimmed) && !trimmed.includes('....')) {
      if (current) sections.push({ heading: current.heading, body: current.body.join('\n').trim() })
      current = { heading: trimmed, body: [] }
    } else if (current) {
      current.body.push(line)
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.body.join('\n').trim() })

  return sections.filter((s) => s.body.length > 0)
}

/** Wraps every case-insensitive hit in <mark> so matches are findable by eye. */
function highlight(text: string, query: string) {
  if (!query.trim()) return text
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.trim().toLowerCase() ? (
      <mark key={i} className="rounded bg-orange-500/30 px-0.5 text-base-50">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

export function ManualViewer({ manualText }: { manualText: string }) {
  const [query, setQuery] = useState('')
  const sections = useMemo(() => parseManual(manualText), [manualText])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sections
    return sections.filter((s) => `${s.heading} ${s.body}`.toLowerCase().includes(q))
  }, [sections, query])

  // A manual that doesn't follow the numbered convention still needs reading —
  // fall back to showing it whole rather than an empty panel.
  if (sections.length === 0) {
    return (
      <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-base-600 p-4 text-sm leading-relaxed text-base-200">
        {manualText}
      </div>
    )
  }

  return (
    <div className="flex max-h-[65vh] flex-col gap-3">
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-base-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the manual…"
          className="pl-10"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={BookOpen} title="No matching sections" description={`Nothing in this manual mentions "${query}".`} />
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <p className="text-xs text-base-400">
            {query.trim() ? `${visible.length} of ${sections.length} sections` : `${sections.length} sections`}
          </p>
          {visible.map((section) => (
            <section key={section.heading} className="rounded-xl border border-base-600 p-3.5">
              <h4 className="font-display text-sm font-semibold text-base-50">
                {highlight(section.heading, query)}
              </h4>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-base-300">
                {highlight(section.body, query)}
              </p>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
