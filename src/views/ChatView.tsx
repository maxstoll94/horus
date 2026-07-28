import { useCallback, useEffect, useRef, useState } from 'react'

type Message = {
  role: 'user' | 'assistant'
  content: string
  toolsUsed?: string[]
}

type Session = {
  id: number
  title: string
  messageCount: number
  createdAt: string
  updatedAt: string | null
}

const TOOL_LABELS: Record<string, string> = {
  get_available_months: 'Checking available months',
  get_accounts: 'Reading accounts',
  get_spending_summary: 'Reading spending summary',
  get_category_spending: 'Reading category spending',
  get_spending_trend: 'Reading spending trend',
  list_transactions: 'Reading transactions',
  list_uncategorized_transactions: 'Reading uncategorized transactions',
  categorize_transaction: 'Categorizing transaction',
  list_categories: 'Reading categories',
  list_tags: 'Reading tags',
  tag_transaction: 'Tagging transaction',
  get_budgets: 'Reading budgets',
  get_budget_actuals: 'Reading budget actuals',
  set_budget: 'Setting budget',
  create_category: 'Creating category',
  add_transaction: 'Adding transaction',
  create_rule: 'Creating rule',
}

const VIEW_SUGGESTIONS: Record<string, string[]> = {
  dashboard: [
    'How did I spend my money last month?',
    'What is my savings rate?',
    'How does my spending compare to the 50/30/20 rule?',
    'Show me my income vs spending trend.',
  ],
  budget: [
    'Am I over budget in any category?',
    'Set budgets for all my categories based on my spending.',
    'Which categories should I cut back on?',
    'What percentage of my income goes to fixed expenses?',
  ],
  transactions: [
    'What are my biggest expenses this month?',
    'Are there any unusual transactions?',
    'How much did I spend on dining out?',
    'Find all transactions from last month over €100.',
  ],
  categorization: [
    'What categories should I use for uncategorized transactions?',
    'Create rules for my most common payees.',
    'What are the most common uncategorized payees?',
    'Suggest categories based on my spending patterns.',
  ],
  categories: [
    'Are my categories set up correctly?',
    'Which group type should I use for each category?',
    'What categories am I missing based on best practices?',
    'How should I structure my savings categories?',
  ],
  rules: [
    'Create rules for my most common payees.',
    'How do categorization rules work?',
    'Which payees should I create rules for?',
    'Help me set up rules for all my regular expenses.',
  ],
}

const DEFAULT_SUGGESTIONS = [
  'How did I spend my money last month?',
  'How does my spending compare to the 50/30/20 rule?',
  'Set a budget for all my categories based on my spending.',
  'What are my biggest expenses?',
]

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type Props = {
  onDataChanged: () => void
  activeView?: string
}

export function ChatView({ onDataChanged, activeView }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const unsubscribe = window.api.chat.onToolCall((toolName) => {
      setActiveToolCall(toolName)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const loadSessions = useCallback(async () => {
    const list = await window.api.chat.sessions.list()
    setSessions(list)
  }, [])

  useEffect(() => {
    if (showHistory) loadSessions()
  }, [showHistory, loadSessions])

  const startNewChat = () => {
    setMessages([])
    setSessionId(null)
    setInput('')
    setShowHistory(false)
  }

  const openSession = async (id: number) => {
    const session = await window.api.chat.sessions.get(id)
    if (!session) return
    setMessages(session.messages.map((m) => ({ role: m.role, content: m.content })))
    setSessionId(session.id)
    setShowHistory(false)
  }

  const deleteSession = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    await window.api.chat.sessions.delete(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (sessionId === id) startNewChat()
  }

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMessage: Message = { role: 'user', content: text }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)
    setActiveToolCall(null)

    let currentSessionId = sessionId

    try {
      const { reply, toolsUsed } = await window.api.chat.send(
        updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        activeView
      )
      const finalMessages = [...updatedMessages, { role: 'assistant' as const, content: reply, toolsUsed }]
      setMessages(finalMessages)

      const persistMessages = finalMessages.map((m) => ({ role: m.role, content: m.content }))
      if (!currentSessionId) {
        const title = text.length > 60 ? text.slice(0, 57) + '…' : text
        currentSessionId = await window.api.chat.sessions.create(title, persistMessages)
        setSessionId(currentSessionId)
      } else {
        await window.api.chat.sessions.update(currentSessionId, persistMessages)
      }

      const writingTools = ['set_budget', 'create_category', 'add_transaction', 'create_rule', 'categorize_transaction', 'tag_transaction']
      if (toolsUsed.some((t) => writingTools.includes(t))) {
        onDataChanged()
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ])
    } finally {
      setLoading(false)
      setActiveToolCall(null)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const suggestions = activeView && VIEW_SUGGESTIONS[activeView] ? VIEW_SUGGESTIONS[activeView] : DEFAULT_SUGGESTIONS

  if (showHistory) {
    return (
      <div className="chat-view">
        <div className="chat-history-toolbar">
          <button className="chat-history-back" onClick={() => setShowHistory(false)}>← Back</button>
          <button className="chat-new-btn" onClick={startNewChat}>+ New Chat</button>
        </div>
        <div className="chat-history-list">
          {sessions.length === 0 && (
            <p className="chat-history-empty">No saved chats yet.</p>
          )}
          {sessions.map((s) => (
            <div key={s.id} className="chat-history-item" onClick={() => openSession(s.id)}>
              <div className="chat-history-title">{s.title}</div>
              <div className="chat-history-meta">
                {formatDate(s.updatedAt ?? s.createdAt)} · {s.messageCount} messages
              </div>
              <button
                className="chat-history-delete"
                onClick={(e) => deleteSession(s.id, e)}
                title="Delete"
              >✕</button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="chat-view">
      <div className="chat-toolbar">
        <button className="chat-toolbar-btn" onClick={startNewChat} title="New chat">+ New</button>
        <button className="chat-toolbar-btn" onClick={() => setShowHistory(true)} title="Chat history">History</button>
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Ask me anything about your finances.</p>
            <div className="chat-suggestions">
              {suggestions.map((s) => (
                <button key={s} onClick={() => setInput(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message chat-message-${msg.role}`}>
            <div className="chat-bubble">{msg.content}</div>
            {msg.toolsUsed && msg.toolsUsed.length > 0 && (
              <div className="chat-tools-used">
                {[...new Set(msg.toolsUsed)].map((t) => (
                  <span key={t} className="chat-tool-tag">{TOOL_LABELS[t] ?? t}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="chat-message chat-message-assistant">
            <div className="chat-bubble chat-loading">
              {activeToolCall ? (
                <span className="chat-tool-active">⟳ {TOOL_LABELS[activeToolCall] ?? activeToolCall}…</span>
              ) : (
                <span className="chat-dots"><span>.</span><span>.</span><span>.</span></span>
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-row">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your finances… (Enter to send)"
          rows={2}
          disabled={loading}
        />
        <button className="chat-send-btn" onClick={send} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
