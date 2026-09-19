import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { DEMO_MODE } from '@/config/demo'
import { answerDealerQuestion, answerProductQuestion, answerSupportQuestion } from '@/lib/demo/assistant'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface UseAssistantChatOptions {
  category: 'dealer' | 'support' | 'products'
  machineModel?: string
}

export function useAssistantChat({ category, machineModel }: UseAssistantChatOptions) {
  const { session, user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    // Demo mode answers locally — /api/chat would hit Supabase with a real
    // access token, which is exactly what demo mode exists to avoid.
    if (DEMO_MODE) {
      const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
      setMessages(nextMessages)
      setSending(true)
      setError(null)

      const reply =
        category === 'support' && machineModel
          ? answerSupportQuestion(machineModel, trimmed)
          : category === 'products'
            ? answerProductQuestion(trimmed)
            : answerDealerQuestion(user?.id ?? '', trimmed)

      // A beat of latency so the typing indicator reads as a real reply.
      window.setTimeout(() => {
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
        setSending(false)
      }, 400)
      return
    }

    const accessToken = session?.access_token
    if (!accessToken) {
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
          accessToken,
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
