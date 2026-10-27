import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { DEMO_MODE } from '@/config/demo'
import { readUatAccess } from '@/lib/uat'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface UseAssistantChatOptions {
  category: 'dealer' | 'support' | 'products'
  machineModel?: string
}

export function useAssistantChat({ category, machineModel }: UseAssistantChatOptions) {
  const { session } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    // Demo (UAT) mode has no Supabase session: /api/chat checks the shared
    // UAT password instead and reads only the chosen dealer's GSTIN.
    const uatAccess = DEMO_MODE ? readUatAccess() : null
    const accessToken = session?.access_token
    if (DEMO_MODE ? !uatAccess : !accessToken) {
      setError('Your session has expired — please sign in again.')
      return
    }

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setSending(true)
    setError(null)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          machineModel,
          ...(uatAccess
            ? { uat: { password: uatAccess.password, gstin: uatAccess.gstin } }
            : { accessToken }),
          messages: nextMessages,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong. Please try again.')
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply as string }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  function reset() {
    setMessages([])
    setError(null)
  }

  return { messages, sending, error, sendMessage, reset }
}
