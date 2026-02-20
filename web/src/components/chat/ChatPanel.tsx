'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Button } from '@/components/ui'
import { ChatMessage } from './ChatMessage'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatPanelProps {
  ticker?: string
}

const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

export function ChatPanel({ ticker }: ChatPanelProps) {
  const { getToken } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedTicker, setSelectedTicker] = useState(ticker || '')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || !selectedTicker) return

    const userMessage: Message = { role: 'user', content: input }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const token = await getToken()
      const res = await fetch(`/api/fastapi/research-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ticker: selectedTicker,
          question: input,
          conversation_history: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        setMessages([...newMessages, { role: 'assistant', content: `Error: ${res.status} — ${errText}` }])
        return
      }

      const data = await res.json() as { response: string }
      setMessages([...newMessages, { role: 'assistant', content: data.response }])
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: 'Network error. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const TICKERS = ['PME','XRO','WTC','DRO','CSL','GMG','CBA','NAB','MQG','FMG','BHP','RIO','WDS','WOR','GYG','SIG','OCL','DXS']

  return (
    <>
      <div className="chat-panel">
        <div className="chat-header">
          <h2 className="chat-title">AI Research Analyst</h2>
          <select
            className="ticker-select"
            value={selectedTicker}
            onChange={e => setSelectedTicker(e.target.value)}
          >
            <option value="">Select a stock…</option>
            {TICKERS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {!selectedTicker && (
          <div className="chat-empty">
            <p>Select a stock above to start your research conversation.</p>
          </div>
        )}

        {selectedTicker && (
          <>
            <div className="chat-messages">
              {messages.length === 0 && (
                <div className="chat-hint">
                  <p>Ask about hypotheses, evidence, catalysts, risks, or valuation for <strong>{selectedTicker}</strong>.</p>
                  <div className="chat-suggestions">
                    {[`What is the dominant narrative for ${selectedTicker}?`, `What are the key tripwires?`, `What evidence is most inconsistent?`].map(s => (
                      <button key={s} className="chat-suggestion" onClick={() => setInput(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <ChatMessage key={i} role={m.role} content={m.content} />
              ))}
              {loading && (
                <div className="chat-loading">
                  <span className="chat-loading-dot" /><span className="chat-loading-dot" /><span className="chat-loading-dot" />
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="chat-input-area">
              <textarea
                className="chat-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask about ${selectedTicker}… (Enter to send)`}
                rows={3}
                disabled={loading}
              />
              <Button onClick={sendMessage} loading={loading} disabled={!input.trim()}>
                Send
              </Button>
            </div>
          </>
        )}
      </div>
      <style>{`
        .chat-panel { display: flex; flex-direction: column; height: calc(100vh - 120px); max-width: 900px; }
        .chat-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-lg); }
        .chat-title { font-size: 22px; font-weight: 700; }
        .ticker-select { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-primary); padding: 8px 12px; border-radius: 6px; font-size: 14px; font-family: var(--font-ui); cursor: pointer; }
        .chat-messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-md); padding: var(--space-md) 0; min-height: 200px; }
        .chat-empty, .chat-hint { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: var(--space-xl); text-align: center; }
        .chat-empty p, .chat-hint p { font-size: 14px; color: var(--text-secondary); margin-bottom: var(--space-lg); }
        .chat-suggestions { display: flex; flex-direction: column; gap: var(--space-sm); }
        .chat-suggestion { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); padding: var(--space-sm) var(--space-md); border-radius: 6px; font-size: 13px; text-align: left; cursor: pointer; font-family: var(--font-ui); }
        .chat-suggestion:hover { border-color: var(--accent-teal); color: var(--text-primary); }
        .chat-input-area { display: flex; gap: var(--space-md); align-items: flex-end; padding-top: var(--space-md); border-top: 1px solid var(--border); }
        .chat-input { flex: 1; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-primary); padding: var(--space-md); border-radius: 8px; font-size: 14px; font-family: var(--font-ui); resize: none; line-height: 1.5; }
        .chat-input:focus { outline: none; border-color: var(--accent-teal); }
        .chat-loading { display: flex; gap: 4px; padding: var(--space-md); }
        .chat-loading-dot { width: 6px; height: 6px; background: var(--text-muted); border-radius: 50%; animation: bounce 1.2s infinite; }
        .chat-loading-dot:nth-child(2) { animation-delay: 0.2s; }
        .chat-loading-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce { 0%,80%,100% { transform: scale(0); } 40% { transform: scale(1); } }
      `}</style>
    </>
  )
}
