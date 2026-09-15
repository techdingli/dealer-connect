import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Send, Sparkles } from 'lucide-react'
import type { ChatMessage } from '@/hooks/useAssistantChat'
import { cn } from '@/lib/utils'

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
                  'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'rounded-br-sm bg-gradient-to-r from-orange-600 to-orange-500 text-white'
                    : 'rounded-bl-sm border border-base-600 bg-base-800 text-base-100',
                )}
              >
                {m.content}
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
