import { useState, useEffect, useRef } from 'react'
import { Send, Loader2, AlertCircle, Plus, MessageSquare, Trash2, Clock } from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  toolsUsed?: string[]
}

interface SessionSummary {
  id: string
  title: string
  summary: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

export default function ErisMornConsole() {
  // Session state
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(true)

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load sessions on mount
  useEffect(() => {
    loadSessions()
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function loadSessions() {
    setSessionsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/erismorn/sessions`)
      if (!res.ok) throw new Error('Failed to load sessions')
      const data = await res.json()
      const list: SessionSummary[] = data.sessions || []
      setSessions(list)

      // Auto-select most recent session
      if (list.length > 0) {
        const latest = list[list.length - 1]
        setActiveSessionId(latest.id)
        await loadSessionMessages(latest.id)
      }
    } catch (e) {
      console.error('Failed to load sessions:', e)
    } finally {
      setSessionsLoading(false)
    }
  }

  async function loadSessionMessages(sessionId: string) {
    setHistoryLoading(true)
    try {
      const res = await fetch(`${API_BASE}/erismorn/sessions/${sessionId}`)
      if (!res.ok) throw new Error('Failed to load session')
      const data = await res.json()
      setMessages(data.session?.messages || [])
    } catch (e) {
      console.error('Failed to load session messages:', e)
      setMessages([])
    } finally {
      setHistoryLoading(false)
    }
  }

  async function switchSession(sessionId: string) {
    setActiveSessionId(sessionId)
    setError(null)
    await loadSessionMessages(sessionId)
  }

  async function createNewSession() {
    try {
      const res = await fetch(`${API_BASE}/erismorn/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (!res.ok) throw new Error('Failed to create session')
      const data = await res.json()
      const newSession = data.session
      setSessions(prev => [...prev, {
        id: newSession.id,
        title: newSession.title,
        summary: newSession.summary,
        createdAt: newSession.createdAt,
        updatedAt: newSession.updatedAt,
        messageCount: 0
      }])
      setActiveSessionId(newSession.id)
      setMessages([])
      setError(null)
    } catch (e) {
      console.error('Failed to create session:', e)
    }
  }

  async function handleDeleteSession(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await fetch(`${API_BASE}/erismorn/sessions/${sessionId}`, { method: 'DELETE' })
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter(s => s.id !== sessionId)
        if (remaining.length > 0) {
          await switchSession(remaining[remaining.length - 1].id)
        } else {
          setActiveSessionId(null)
          setMessages([])
        }
      }
    } catch (e) {
      console.error('Failed to delete session:', e)
    }
  }

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || sending) return

    setError(null)

    // Create session if none active
    let sessionId = activeSessionId
    if (!sessionId) {
      try {
        const res = await fetch(`${API_BASE}/erismorn/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })
        const data = await res.json()
        sessionId = data.session.id
        setActiveSessionId(sessionId)
        setSessions(prev => [...prev, {
          id: data.session.id,
          title: data.session.title,
          summary: data.session.summary,
          createdAt: data.session.createdAt,
          updatedAt: data.session.updatedAt,
          messageCount: 0
        }])
      } catch {
        setError('Failed to create conversation')
        return
      }
    }

    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      const res = await fetch(`${API_BASE}/erismorn/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, sessionId })
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      const data = await res.json()

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.response,
        timestamp: data.timestamp || new Date().toISOString(),
        toolsUsed: data.toolsUsed
      }

      setMessages(prev => [...prev, assistantMsg])

      // Update session summary in sidebar
      setSessions(prev => prev.map(s => {
        if (s.id !== sessionId) return s
        return {
          ...s,
          summary: s.summary || trimmed.slice(0, 80),
          title: s.title === 'New conversation' ? trimmed.slice(0, 60) : s.title,
          updatedAt: new Date().toISOString(),
          messageCount: s.messageCount + 2
        }
      }))
    } catch (e: any) {
      setError(e.message || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  function formatTime(ts: string) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  function formatDate(ts: string) {
    try {
      const d = new Date(ts)
      const now = new Date()
      const diff = now.getTime() - d.getTime()
      if (diff < 86400000) return formatTime(ts) // today
      if (diff < 172800000) return 'Yesterday'
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    } catch {
      return ''
    }
  }

  return (
    <div className="flex h-[calc(100vh-140px)]">
      {/* Session Sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-rose-900/20 bg-[#0d1117] flex flex-col">
        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={createNewSession}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-900/30 hover:bg-rose-900/50 border border-rose-700/30 text-rose-200 text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-500 text-xs">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading...
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-gray-600 text-xs">
              No conversations yet
            </div>
          ) : (
            [...sessions].reverse().map(session => (
              <button
                key={session.id}
                onClick={() => switchSession(session.id)}
                className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors group relative ${
                  activeSessionId === session.id
                    ? 'bg-rose-900/30 border border-rose-700/30 text-rose-100'
                    : 'hover:bg-[#1e2433] text-gray-400 border border-transparent'
                }`}
              >
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-50" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium text-[11px] leading-tight">
                      {session.summary || session.title}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-600">
                      <Clock className="w-3 h-3" />
                      {formatDate(session.updatedAt)}
                      <span className="text-gray-700">·</span>
                      {session.messageCount || 0} msgs
                    </div>
                  </div>
                </div>
                {/* Delete button */}
                <button
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/40 text-gray-600 hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {historyLoading ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading conversation...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-3">🍎</div>
                <h3 className="text-lg font-semibold text-amber-100 mb-1">ErisMorn Console</h3>
                <p className="text-gray-500 text-sm max-w-sm">
                  Direct command channel to ErisMorn. Ask questions, give orders, or request synthesis.
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                  msg.role === 'assistant'
                    ? 'bg-green-900/40 border border-green-700/40'
                    : 'bg-amber-900/40 border border-amber-700/40'
                }`}>
                  {msg.role === 'assistant' ? '🍎' : '⚡'}
                </div>

                {/* Message Bubble */}
                <div className={`max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-amber-900/30 border border-amber-700/30 text-amber-100'
                      : 'bg-[#1e2433] border border-green-900/30 text-gray-200'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>

                  {/* Tool Use Badges */}
                  {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {msg.toolsUsed.map((tool, j) => (
                        <span
                          key={j}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-700/30"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Timestamp */}
                  <span className={`text-[10px] text-gray-600 mt-1 block ${
                    msg.role === 'user' ? 'text-right' : 'text-left'
                  }`}>
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              </div>
            ))
          )}

          {/* Thinking Indicator */}
          {sending && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm bg-green-900/40 border border-green-700/40">
                🍎
              </div>
              <div className="bg-[#1e2433] border border-green-900/30 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ErisMorn is thinking...
                </div>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-red-900/20 border border-red-700/30 rounded-lg text-sm text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-amber-900/20 bg-[#0f1219] px-4 py-3">
          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="Talk to ErisMorn..."
              rows={1}
              disabled={sending}
              className="flex-1 bg-[#1e2433] border border-amber-900/30 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-green-700/50 focus:ring-1 focus:ring-green-700/30 disabled:opacity-50 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white flex items-center justify-center transition-colors"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5 pl-1">
            Shift+Enter for new line. Enter to send.
          </p>
        </div>
      </div>
    </div>
  )
}
