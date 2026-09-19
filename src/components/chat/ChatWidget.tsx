import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MessageCircle, X, ChevronLeft, Receipt, Wrench, Sparkles, Package } from 'lucide-react'
import { useAssistantChat } from '@/hooks/useAssistantChat'
import { ChatMessages } from '@/components/chat/ChatMessages'
import { MachinePicker } from '@/components/chat/MachinePicker'

type Screen = 'menu' | 'dealer' | 'products' | 'support-picker' | 'support-chat'

const DEALER_SUGGESTIONS = [
  "What's my outstanding ledger balance?",
  'Show me my unpaid invoices',
  'What stock do I currently hold?',
]

function DealerScreen() {
  const chat = useAssistantChat({ category: 'dealer' })
  return (
    <ChatMessages
      messages={chat.messages}
      sending={chat.sending}
      error={chat.error}
      onSend={chat.sendMessage}
      placeholder="Ask about your invoices, ledger, stock…"
      suggestions={DEALER_SUGGESTIONS}
      emptyState={
        <>
          <div className="flex size-11 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400">
            <Receipt className="size-5" />
          </div>
          <p className="max-w-xs text-sm text-base-300">
            Ask me anything about your dealership account — invoices, ledger balance, service
            requests, or your stock. I can only see your own dealership's data.
          </p>
        </>
      }
    />
  )
}

const PRODUCT_SUGGESTIONS = [
  'Which model reaches 12 m indoors?',
  'What do you have for 20 m outdoor work?',
  'Tell me about the GTBZ20A',
]

function ProductScreen() {
  const chat = useAssistantChat({ category: 'products' })
  return (
    <ChatMessages
      messages={chat.messages}
      sending={chat.sending}
      error={chat.error}
      onSend={chat.sendMessage}
      placeholder="Ask about models, working heights, prices…"
      suggestions={PRODUCT_SUGGESTIONS}
      emptyState={
        <>
          <div className="flex size-11 items-center justify-center rounded-xl bg-green-500/15 text-green-400">
            <Package className="size-5" />
          </div>
          <p className="max-w-xs text-sm text-base-300">
            Ask me anything about the Dingli range — which machine suits a working height, indoor
            versus rough terrain, electric or diesel, spec comparisons and list prices.
          </p>
        </>
      }
    />
  )
}

function SupportChatScreen({ machineModel }: { machineModel: string }) {
  const chat = useAssistantChat({ category: 'support', machineModel })
  return (
    <ChatMessages
      messages={chat.messages}
      sending={chat.sending}
      error={chat.error}
      onSend={chat.sendMessage}
      placeholder={`Ask about the ${machineModel}…`}
      emptyState={
        <>
          <div className="flex size-11 items-center justify-center rounded-xl bg-green-500/15 text-green-400">
            <Wrench className="size-5" />
          </div>
          <p className="max-w-xs text-sm text-base-300">
            Ask a service or parts question about the <span className="text-base-100">{machineModel}</span> —
            I'll search its manual and cite the section I used.
          </p>
        </>
      }
    />
  )
}

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [screen, setScreen] = useState<Screen>('menu')
  const [machineModel, setMachineModel] = useState<string | null>(null)

  function closeAndReset() {
    setOpen(false)
    setScreen('menu')
    setMachineModel(null)
  }

  const title =
    screen === 'menu'
      ? 'Dingli Assistant'
      : screen === 'dealer'
        ? 'Dealer Site Inquiry'
        : screen === 'products'
          ? 'Product Enquiry'
          : screen === 'support-chat' && machineModel
            ? machineModel
            : 'Support'

  return (
    <>
      <div className="fixed bottom-5 right-5 z-40 sm:bottom-6 sm:right-6">
        <AnimatePresence>
          {!open && (
            <motion.button
              key="bubble"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setOpen(true)}
              aria-label="Open assistant"
              className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-orange-600 to-orange-500 text-white shadow-glow-orange"
            >
              <MessageCircle className="size-6" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-base-800 sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[600px] sm:w-[400px] sm:rounded-2xl sm:border sm:border-base-600 sm:shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-base-600 bg-base-900/60 p-3.5">
              {screen !== 'menu' && (
                <button
                  onClick={() => {
                    if (screen === 'support-chat') setScreen('support-picker')
                    else setScreen('menu')
                    setMachineModel(null)
                  }}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-base-300 hover:bg-base-700"
                >
                  <ChevronLeft className="size-4" />
                </button>
              )}
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500/25 to-green-500/25 text-orange-300">
                <Sparkles className="size-4" />
              </div>
              <p className="flex-1 truncate text-sm font-semibold text-base-50">{title}</p>
              <button
                onClick={closeAndReset}
                aria-label="Close assistant"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-base-300 hover:bg-base-700"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1">
              {screen === 'menu' && (
                <div className="flex h-full flex-col justify-center gap-3 p-5">
                  <p className="mb-1 text-center text-sm text-base-300">How can I help you today?</p>
                  <button
                    onClick={() => setScreen('dealer')}
                    className="flex items-center gap-3 rounded-xl border border-base-600 p-4 text-left transition-colors hover:border-orange-500/40 hover:bg-base-700/40"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-400">
                      <Receipt className="size-5" />
                    </div>
                    <div>
                      <p className="font-medium text-base-50">Dealer Site Inquiry</p>
                      <p className="text-xs text-base-400">Invoices, ledger, stock, service requests</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setScreen('products')}
                    className="flex items-center gap-3 rounded-xl border border-base-600 p-4 text-left transition-colors hover:border-green-500/40 hover:bg-base-700/40"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-green-500/15 text-green-400">
                      <Package className="size-5" />
                    </div>
                    <div>
                      <p className="font-medium text-base-50">Product Enquiry</p>
                      <p className="text-xs text-base-400">Models, working heights, use cases, prices</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setScreen('support-picker')}
                    className="flex items-center gap-3 rounded-xl border border-base-600 p-4 text-left transition-colors hover:border-green-500/40 hover:bg-base-700/40"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-green-500/15 text-green-400">
                      <Wrench className="size-5" />
                    </div>
                    <div>
                      <p className="font-medium text-base-50">Support</p>
                      <p className="text-xs text-base-400">Ask a service question for a specific machine</p>
                    </div>
                  </button>
                </div>
              )}

              {screen === 'dealer' && <DealerScreen />}

              {screen === 'products' && <ProductScreen />}

              {screen === 'support-picker' && (
                <MachinePicker
                  onSelect={(model) => {
                    setMachineModel(model)
                    setScreen('support-chat')
                  }}
                />
              )}

              {screen === 'support-chat' && machineModel && (
                <SupportChatScreen key={machineModel} machineModel={machineModel} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
