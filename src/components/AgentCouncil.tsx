import { useState, useEffect, useRef } from 'react'
import { Send, Loader2, AlertCircle, Plus, MessageSquare, ArrowLeft, Radio, Trash2, Clock, ChevronDown, Users } from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

const AGENT_COLORS: Record<string, { border: string; bg: string; text: string; glow: string }> = {
  erismorn: { border: 'border-rose-500', bg: 'bg-rose-500/10', text: 'text-rose-400', glow: 'shadow-rose-500/20' },
  atlas: { border: 'border-cyan-500', bg: 'bg-cyan-500/10', text: 'text-cyan-400', glow: 'shadow-cyan-500/20' },
  oracle: { border: 'border-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400', glow: 'shadow-emerald-500/20' },
  midas: { border: 'border-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400', glow: 'shadow-amber-500/20' },
}

type ViewMode = 'overview' | 'chat' | 'broadcast' | 'deliberate'

interface Agent {
  id: string
  name: string
  role: string
  emoji: string
  color: string
  activeModel?: string
}

interface AvailableModel {
  id: string
  source: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  toolsUsed?: string[]
  timestamp: string
}

interface SessionSummary {
  id: string
  title: string
  summary: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

interface BroadcastResponse {
  agentId: string
  name: string
  emoji: string
  color: string
  response: string
  toolsUsed: string[]
}

export default function AgentCouncil() {
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  // Chat state
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Model picker state
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const [modelPickerOpen, setModelPickerOpen] = useState<string | null>(null) // agentId or null

  // Broadcast state
  const [broadcastInput, setBroadcastInput] = useState('')
  const [broadcastQuestion, setBroadcastQuestion] = useState('')
  const [broadcastResponses, setBroadcastResponses] = useState<BroadcastResponse[]>([])
  const [broadcastLoading, setBroadcastLoading] = useState(false)

  // Deliberation state
  const [deliberationInput, setDeliberationInput] = useState('')
  const [deliberationTopic, setDeliberationTopic] = useState('')
  const [deliberationRounds, setDeliberationRounds] = useState(3)
  const [deliberationTurns, setDeliberationTurns] = useState<{round: number; agentId: string; name: string; emoji: string; color: string; content: string; toolsUsed: string[]}[]>([])
  const [deliberationSynthesis, setDeliberationSynthesis] = useState<{content: string; toolsUsed: string[]} | null>(null)
  const [deliberationLoading, setDeliberationLoading] = useState(false)
  const [deliberationCurrentRound, setDeliberationCurrentRound] = useState(0)
  const [deliberationTotalRounds, setDeliberationTotalRounds] = useState(0)
  const [deliberationThinkingAgent, setDeliberationThinkingAgent] = useState<string | null>(null)
  const [deliberationSynthesizing, setDeliberationSynthesizing] = useState(false)
  const [deliberationSessionId, setDeliberationSessionId] = useState<string | null>(null)
  const deliberationBottomRef = useRef<HTMLDivElement>(null)

  // Fetch agents and models on mount
  useEffect(() => {
    fetchAgents()
    fetchModels()
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  // Auto-scroll deliberation
  useEffect(() => {
    deliberationBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [deliberationTurns, deliberationSynthesis, deliberationThinkingAgent, deliberationSynthesizing])

  async function fetchAgents() {
    setAgentsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/council/agents`)
      if (!res.ok) throw new Error('Failed to fetch agents')
      const data = await res.json()
      setAgents(data.agents || [])
    } catch (e) {
      console.error('Failed to fetch agents:', e)
    } finally {
      setAgentsLoading(false)
    }
  }

  async function fetchModels() {
    try {
      const res = await fetch(`${API_BASE}/council/models`)
      if (!res.ok) return
      const data = await res.json()
      setAvailableModels(data.models || [])
    } catch {
      // Models endpoint not critical
    }
  }

  async function changeAgentModel(agentId: string, model: string) {
    try {
      const res = await fetch(`${API_BASE}/council/agents/${agentId}/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model })
      })
      if (!res.ok) throw new Error('Failed to set model')
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, activeModel: model } : a))
      setModelPickerOpen(null)
    } catch (e) {
      console.error('Failed to change model:', e)
    }
  }

  async function loadSessions(agentId: string) {
    setSessionsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/council/sessions/${agentId}`)
      if (!res.ok) throw new Error('Failed to load sessions')
      const data = await res.json()
      const list: SessionSummary[] = data.sessions || []
      setSessions(list)
      if (list.length > 0) {
        const latest = list[list.length - 1]
        setActiveSessionId(latest.id)
        await loadSessionMessages(latest.id)
      }
    } catch (e) {
      console.error('Failed to load sessions:', e)
      setSessions([])
    } finally {
      setSessionsLoading(false)
    }
  }

  async function loadSessionMessages(sessionId: string) {
    setHistoryLoading(true)
    try {
      const res = await fetch(`${API_BASE}/council/session/${sessionId}`)
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
    if (!selectedAgent) return
    setActiveSessionId(null)
    setMessages([])
    setError(null)
  }

  async function handleDeleteSession(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation()
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/council/session/${sessionId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete session')

      setSessions(prev => {
        const remaining = prev.filter(s => s.id !== sessionId)

        if (activeSessionId === sessionId) {
          if (remaining.length > 0) {
            const next = remaining[remaining.length - 1]
            setActiveSessionId(next.id)
            loadSessionMessages(next.id)
          } else {
            setActiveSessionId(null)
            setMessages([])
          }
        }

        return remaining
      })
    } catch (err: any) {
      setError(err?.message || 'Failed to delete session')
    }
  }

  function selectAgent(agent: Agent) {
    setSelectedAgent(agent)
    setViewMode('chat')
    setMessages([])
    setSessions([])
    setActiveSessionId(null)
    setError(null)
    loadSessions(agent.id)
  }

  function goToOverview() {
    setViewMode('overview')
    setSelectedAgent(null)
    setMessages([])
    setSessions([])
    setActiveSessionId(null)
    setError(null)
    setInput('')
  }

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || sending || !selectedAgent) return
    setError(null)

    const userMsg: Message = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      const res = await fetch(`${API_BASE}/council/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          message: trimmed,
          sessionId: activeSessionId,
        }),
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()

      if (data.sessionId && !activeSessionId) {
        setActiveSessionId(data.sessionId)
        setSessions(prev => [...prev, {
          id: data.sessionId,
          title: trimmed.slice(0, 60),
          summary: trimmed.slice(0, 80),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
        }])
      }

      const assistantMsg: Message = {
        role: 'assistant',
        content: data.response,
        timestamp: data.timestamp || new Date().toISOString(),
        toolsUsed: data.toolsUsed,
      }

      setMessages(prev => [...prev, assistantMsg])

      setSessions(prev => prev.map(s => {
        if (s.id !== (data.sessionId || activeSessionId)) return s
        return {
          ...s,
          summary: s.summary || trimmed.slice(0, 80),
          title: s.title === 'New conversation' ? trimmed.slice(0, 60) : s.title,
          updatedAt: new Date().toISOString(),
          messageCount: s.messageCount + 2,
        }
      }))
    } catch (e: any) {
      setError(e.message || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  // Track which agent is currently thinking
  const [thinkingAgentId, setThinkingAgentId] = useState<string | null>(null)

  async function handleBroadcast() {
    const trimmed = broadcastInput.trim()
    if (!trimmed || broadcastLoading) return

    setBroadcastQuestion(trimmed)
    setBroadcastInput('')
    setBroadcastResponses([])
    setBroadcastLoading(true)
    setThinkingAgentId(null)

    try {
      const res = await fetch(`${API_BASE}/council/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'thinking') {
              setThinkingAgentId(event.agentId)
            } else if (event.type === 'response') {
              setThinkingAgentId(null)
              setBroadcastResponses(prev => [...prev, {
                agentId: event.agentId,
                name: event.name,
                emoji: event.emoji,
                color: event.color,
                response: event.response,
                toolsUsed: event.toolsUsed || []
              }])
            } else if (event.type === 'done') {
              // All agents responded
            } else if (event.type === 'error') {
              setError(event.message)
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (e: any) {
      setError(e.message || 'Broadcast failed')
    } finally {
      setBroadcastLoading(false)
      setThinkingAgentId(null)
    }
  }

  async function handleDeliberate() {
    const trimmed = deliberationInput.trim()
    if (!trimmed || deliberationLoading) return

    setDeliberationTopic(trimmed)
    setDeliberationInput('')
    setDeliberationTurns([])
    setDeliberationSynthesis(null)
    setDeliberationLoading(true)
    setDeliberationCurrentRound(0)
    setDeliberationTotalRounds(0)
    setDeliberationThinkingAgent(null)
    setDeliberationSynthesizing(false)
    setDeliberationSessionId(null)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/council/deliberate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: trimmed, rounds: deliberationRounds }),
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'round_start') {
              setDeliberationCurrentRound(event.round)
              setDeliberationTotalRounds(event.totalRounds)
              setDeliberationThinkingAgent(null)
            } else if (event.type === 'thinking') {
              setDeliberationThinkingAgent(event.agentId)
            } else if (event.type === 'turn') {
              setDeliberationThinkingAgent(null)
              setDeliberationTurns(prev => [...prev, {
                round: event.round,
                agentId: event.agentId,
                name: event.name,
                emoji: event.emoji,
                color: event.color,
                content: event.content,
                toolsUsed: event.toolsUsed || [],
              }])
            } else if (event.type === 'round_end') {
              setDeliberationThinkingAgent(null)
            } else if (event.type === 'synthesizing') {
              setDeliberationSynthesizing(true)
            } else if (event.type === 'synthesis') {
              setDeliberationSynthesizing(false)
              setDeliberationSynthesis({
                content: event.content,
                toolsUsed: event.toolsUsed || [],
              })
            } else if (event.type === 'done') {
              setDeliberationSessionId(event.sessionId)
            } else if (event.type === 'error') {
              setError(event.message)
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (e: any) {
      setError(e.message || 'Deliberation failed')
    } finally {
      setDeliberationLoading(false)
      setDeliberationThinkingAgent(null)
      setDeliberationSynthesizing(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (viewMode === 'chat') handleSend()
      else if (viewMode === 'broadcast') handleBroadcast()
      else if (viewMode === 'deliberate') handleDeliberate()
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
      if (diff < 86400000) return formatTime(ts)
      if (diff < 172800000) return 'Yesterday'
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    } catch {
      return ''
    }
  }

  function getAgentColors(colorKey: string) {
    return AGENT_COLORS[colorKey] || AGENT_COLORS.erismorn
  }

  // ---- Overview Mode ----
  if (viewMode === 'overview') {
    return (
      <div className="h-[calc(100vh-140px)] flex flex-col items-center justify-center p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-black tracking-wider text-zinc-100 mb-2 font-mono">
            AGENT COUNCIL
          </h2>
          <p className="text-zinc-500 text-sm font-mono">
            Select an agent for direct conversation, or broadcast to all.
          </p>
        </div>

        {/* Council Action Buttons */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => {
              setViewMode('broadcast')
              setError(null)
              setBroadcastResponses([])
              setBroadcastQuestion('')
            }}
            className="flex items-center gap-2 px-6 py-3 bg-zinc-800 border border-zinc-600 hover:border-rose-500/60 hover:bg-rose-500/10 text-zinc-200 font-mono text-sm rounded-lg transition-all hover:shadow-lg hover:shadow-rose-500/10"
          >
            <Radio className="w-4 h-4" />
            Council Broadcast
          </button>
          <button
            onClick={() => {
              setViewMode('deliberate')
              setError(null)
              setDeliberationTurns([])
              setDeliberationSynthesis(null)
              setDeliberationTopic('')
              setDeliberationSessionId(null)
            }}
            className="flex items-center gap-2 px-6 py-3 bg-zinc-800 border border-zinc-600 hover:border-cyan-500/60 hover:bg-cyan-500/10 text-zinc-200 font-mono text-sm rounded-lg transition-all hover:shadow-lg hover:shadow-cyan-500/10"
          >
            <Users className="w-4 h-4" />
            Council Deliberation
          </button>
        </div>

        {/* Round Selector */}
        <div className="flex items-center gap-2 mb-8">
          <span className="text-zinc-500 text-xs font-mono">Rounds:</span>
          {[1, 2, 3, 4, 5, 6, 7].map(n => (
            <button
              key={n}
              onClick={() => setDeliberationRounds(n)}
              className={`w-7 h-7 rounded text-xs font-mono transition-all ${
                deliberationRounds === n
                  ? 'bg-cyan-500/20 border border-cyan-500/60 text-cyan-300'
                  : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Agent Grid */}
        {agentsLoading ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading agents...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 max-w-2xl w-full">
            {agents.map(agent => {
              const colors = getAgentColors(agent.color)
              return (
                <div
                  key={agent.id}
                  className={`relative p-6 bg-zinc-900 border ${colors.border} rounded-lg text-left transition-all hover:shadow-lg hover:shadow-${agent.color}-500/20 group`}
                >
                  <button
                    onClick={() => selectAgent(agent)}
                    className="w-full text-left"
                  >
                    <div className="text-4xl mb-3">{agent.emoji}</div>
                    <h3 className={`text-lg font-bold ${colors.text} font-mono tracking-wide`}>
                      {agent.name}
                    </h3>
                    <p className="text-zinc-500 text-sm mt-1 font-mono">{agent.role}</p>
                  </button>

                  {/* Model Picker */}
                  <div className="relative mt-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); setModelPickerOpen(modelPickerOpen === agent.id ? null : agent.id) }}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 bg-zinc-800 border border-zinc-700/50 rounded text-[10px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors font-mono"
                    >
                      <span className="truncate">{agent.activeModel || 'default'}</span>
                      <ChevronDown className="w-3 h-3 flex-shrink-0" />
                    </button>
                    {modelPickerOpen === agent.id && availableModels.length > 0 && (
                      <div className="absolute z-50 bottom-full mb-1 left-0 right-0 max-h-48 overflow-y-auto bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl">
                        {availableModels.map(m => (
                          <button
                            key={`${m.source}-${m.id}`}
                            onClick={(e) => { e.stopPropagation(); changeAgentModel(agent.id, m.id) }}
                            className={`w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-zinc-700 transition-colors ${
                              agent.activeModel === m.id ? `${colors.text}` : 'text-zinc-300'
                            }`}
                          >
                            <span className="truncate block">{m.id}</span>
                            <span className="text-zinc-600 text-[9px]">{m.source}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Hover glow line */}
                  <div className={`absolute bottom-0 left-0 right-0 h-[2px] ${colors.bg} opacity-0 group-hover:opacity-100 transition-opacity`} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ---- Broadcast Mode ----
  if (viewMode === 'broadcast') {
    return (
      <div className="h-[calc(100vh-140px)] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-700/50 bg-zinc-900/50">
          <button
            onClick={goToOverview}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Radio className="w-4 h-4 text-rose-400" />
          <h3 className="text-sm font-bold text-zinc-200 font-mono tracking-wide">COUNCIL BROADCAST</h3>
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-b border-zinc-700/50 bg-zinc-900/30">
          <div className="flex items-end gap-3">
            <textarea
              value={broadcastInput}
              onChange={e => setBroadcastInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the Council..."
              rows={1}
              disabled={broadcastLoading}
              className="flex-1 bg-zinc-800 border border-zinc-700/50 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/30 disabled:opacity-50 transition-colors font-mono"
            />
            <button
              onClick={handleBroadcast}
              disabled={!broadcastInput.trim() || broadcastLoading}
              className="flex-shrink-0 w-10 h-10 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white flex items-center justify-center transition-colors"
            >
              {broadcastLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Broadcast Question Header */}
        {broadcastQuestion && (
          <div className="px-4 py-3 bg-zinc-800/50 border-b border-zinc-700/50">
            <p className="text-sm text-zinc-300 font-mono">
              <span className="text-rose-400 mr-2">Q:</span>
              {broadcastQuestion}
            </p>
          </div>
        )}

        {/* Response Grid */}
        <div className="flex-1 overflow-auto p-4">
          {error && (
            <div className="flex items-center gap-2 px-4 py-2.5 mb-4 bg-red-900/20 border border-red-700/30 rounded-lg text-sm text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Sequential response grid — shows completed, thinking, and waiting states */}
          {(broadcastLoading || broadcastResponses.length > 0) && broadcastQuestion && (
            <div className="grid grid-cols-2 gap-4">
              {agents.map(agent => {
                const colors = getAgentColors(agent.color)
                const resp = broadcastResponses.find(r => r.agentId === agent.id)
                const isThinking = thinkingAgentId === agent.id
                const isWaiting = !resp && !isThinking && broadcastLoading
                const orderNum = agents.indexOf(agent) + 1

                // Completed — show response
                if (resp) {
                  return (
                    <button
                      key={agent.id}
                      onClick={() => selectAgent(agent)}
                      className={`p-4 bg-zinc-900 border ${colors.border} rounded-lg text-left transition-all hover:shadow-lg hover:scale-[1.01]`}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">{resp.emoji}</span>
                        <span className={`text-sm font-bold ${colors.text} font-mono`}>{resp.name}</span>
                        <span className="text-[9px] text-zinc-600 font-mono ml-auto">#{orderNum}</span>
                      </div>
                      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">
                        {resp.response}
                      </p>
                      {resp.toolsUsed && resp.toolsUsed.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {resp.toolsUsed.map((tool, j) => (
                            <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-700/30">
                              {tool}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  )
                }

                // Currently thinking
                if (isThinking) {
                  return (
                    <div key={agent.id} className={`p-4 bg-zinc-900 border ${colors.border} rounded-lg`}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">{agent.emoji}</span>
                        <span className={`text-sm font-bold ${colors.text} font-mono`}>{agent.name}</span>
                        <span className="text-[9px] text-zinc-600 font-mono ml-auto">#{orderNum}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-zinc-400 font-mono">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{agent.name} is reading & thinking...</span>
                      </div>
                    </div>
                  )
                }

                // Waiting in queue
                if (isWaiting) {
                  return (
                    <div key={agent.id} className={`p-4 bg-zinc-900/50 border border-zinc-700/30 rounded-lg opacity-50`}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg grayscale">{agent.emoji}</span>
                        <span className="text-sm font-bold text-zinc-600 font-mono">{agent.name}</span>
                        <span className="text-[9px] text-zinc-700 font-mono ml-auto">#{orderNum}</span>
                      </div>
                      <p className="text-xs text-zinc-600 font-mono">Waiting for turn...</p>
                    </div>
                  )
                }

                return null
              })}
            </div>
          )}

          {!broadcastLoading && broadcastResponses.length === 0 && !broadcastQuestion && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-3">📡</div>
                <h3 className="text-lg font-semibold text-zinc-200 mb-1 font-mono">Council Broadcast</h3>
                <p className="text-zinc-500 text-sm max-w-sm font-mono">
                  Ask a question and all council agents will respond with their perspective.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---- Deliberation Mode ----
  if (viewMode === 'deliberate') {
    // Group turns by round
    const roundsMap = new Map<number, typeof deliberationTurns>()
    for (const turn of deliberationTurns) {
      const existing = roundsMap.get(turn.round) || []
      existing.push(turn)
      roundsMap.set(turn.round, existing)
    }
    const roundNumbers = Array.from(roundsMap.keys()).sort((a, b) => a - b)

    return (
      <div className="h-[calc(100vh-140px)] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-700/50 bg-zinc-900/50">
          <button
            onClick={goToOverview}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Users className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-zinc-200 font-mono tracking-wide">COUNCIL DELIBERATION</h3>
          {deliberationTopic && (
            <span className="text-xs text-zinc-500 font-mono ml-2 truncate max-w-md">
              — {deliberationTopic}
            </span>
          )}
          {deliberationSessionId && (
            <span className="text-[9px] text-zinc-600 font-mono ml-auto">
              session: {deliberationSessionId.slice(0, 8)}
            </span>
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-b border-zinc-700/50 bg-zinc-900/30">
          <div className="flex items-end gap-3">
            <textarea
              value={deliberationInput}
              onChange={e => setDeliberationInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Set a topic for the Council to deliberate..."
              rows={1}
              disabled={deliberationLoading}
              className="flex-1 bg-zinc-800 border border-zinc-700/50 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 disabled:opacity-50 transition-colors font-mono"
            />
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map(n => (
                <button
                  key={n}
                  onClick={() => setDeliberationRounds(n)}
                  disabled={deliberationLoading}
                  className={`w-6 h-6 rounded text-[10px] font-mono transition-all ${
                    deliberationRounds === n
                      ? 'bg-cyan-500/20 border border-cyan-500/60 text-cyan-300'
                      : 'bg-zinc-800 border border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              onClick={handleDeliberate}
              disabled={!deliberationInput.trim() || deliberationLoading}
              className="flex-shrink-0 w-10 h-10 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white flex items-center justify-center transition-colors"
            >
              {deliberationLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Topic Header */}
        {deliberationTopic && (
          <div className="px-4 py-3 bg-zinc-800/50 border-b border-zinc-700/50 flex items-center justify-between">
            <p className="text-sm text-zinc-300 font-mono">
              <span className="text-cyan-400 mr-2">TOPIC:</span>
              {deliberationTopic}
            </p>
            {deliberationTotalRounds > 0 && (
              <span className="text-xs text-zinc-500 font-mono">
                Round {deliberationCurrentRound}/{deliberationTotalRounds}
              </span>
            )}
          </div>
        )}

        {/* Deliberation Timeline */}
        <div className="flex-1 overflow-auto p-4 space-y-6">
          {error && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-red-900/20 border border-red-700/30 rounded-lg text-sm text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Rounds */}
          {roundNumbers.map(roundNum => {
            const turns = roundsMap.get(roundNum) || []
            return (
              <div key={roundNum}>
                {/* Round Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-zinc-700/50" />
                  <span className="text-xs font-bold text-cyan-400 font-mono tracking-wider">
                    ROUND {roundNum}{deliberationTotalRounds > 0 ? ` / ${deliberationTotalRounds}` : ''}
                  </span>
                  <div className="h-px flex-1 bg-zinc-700/50" />
                </div>

                {/* Agent Turns for this Round */}
                <div className="grid grid-cols-2 gap-3">
                  {turns.map((turn, idx) => {
                    const colors = getAgentColors(turn.color)
                    return (
                      <div
                        key={`${roundNum}-${turn.agentId}-${idx}`}
                        className={`p-4 bg-zinc-900 border ${colors.border} rounded-lg`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{turn.emoji}</span>
                          <span className={`text-sm font-bold ${colors.text} font-mono`}>{turn.name}</span>
                        </div>
                        <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">
                          {turn.content}
                        </p>
                        {turn.toolsUsed.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {turn.toolsUsed.map((tool, j) => (
                              <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-700/30">
                                {tool}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Currently thinking agent in active round */}
                  {deliberationLoading && deliberationCurrentRound === roundNum && deliberationThinkingAgent && (
                    (() => {
                      const thinkAgent = agents.find(a => a.id === deliberationThinkingAgent)
                      if (!thinkAgent) return null
                      const colors = getAgentColors(thinkAgent.color)
                      return (
                        <div className={`p-4 bg-zinc-900 border ${colors.border} rounded-lg`}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{thinkAgent.emoji}</span>
                            <span className={`text-sm font-bold ${colors.text} font-mono`}>{thinkAgent.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-zinc-400 font-mono">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>{thinkAgent.name} is deliberating...</span>
                          </div>
                        </div>
                      )
                    })()
                  )}

                  {/* Waiting agents in active round */}
                  {deliberationLoading && deliberationCurrentRound === roundNum && agents
                    .filter(a => {
                      const hasTurn = turns.some(t => t.agentId === a.id)
                      const isThinking = deliberationThinkingAgent === a.id
                      return !hasTurn && !isThinking
                    })
                    .map(agent => (
                      <div key={`wait-${roundNum}-${agent.id}`} className="p-4 bg-zinc-900/50 border border-zinc-700/30 rounded-lg opacity-50">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg grayscale">{agent.emoji}</span>
                          <span className="text-sm font-bold text-zinc-600 font-mono">{agent.name}</span>
                        </div>
                        <p className="text-xs text-zinc-600 font-mono">Waiting for turn...</p>
                      </div>
                    ))
                  }
                </div>
              </div>
            )
          })}

          {/* Active round with no turns yet */}
          {deliberationLoading && deliberationCurrentRound > 0 && !roundsMap.has(deliberationCurrentRound) && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-zinc-700/50" />
                <span className="text-xs font-bold text-cyan-400 font-mono tracking-wider">
                  ROUND {deliberationCurrentRound} / {deliberationTotalRounds}
                </span>
                <div className="h-px flex-1 bg-zinc-700/50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {deliberationThinkingAgent && (() => {
                  const thinkAgent = agents.find(a => a.id === deliberationThinkingAgent)
                  if (!thinkAgent) return null
                  const colors = getAgentColors(thinkAgent.color)
                  return (
                    <div className={`p-4 bg-zinc-900 border ${colors.border} rounded-lg`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{thinkAgent.emoji}</span>
                        <span className={`text-sm font-bold ${colors.text} font-mono`}>{thinkAgent.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-zinc-400 font-mono">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{thinkAgent.name} is deliberating...</span>
                      </div>
                    </div>
                  )
                })()}
                {agents
                  .filter(a => deliberationThinkingAgent !== a.id)
                  .map(agent => (
                    <div key={`wait-new-${agent.id}`} className="p-4 bg-zinc-900/50 border border-zinc-700/30 rounded-lg opacity-50">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg grayscale">{agent.emoji}</span>
                        <span className="text-sm font-bold text-zinc-600 font-mono">{agent.name}</span>
                      </div>
                      <p className="text-xs text-zinc-600 font-mono">Waiting for turn...</p>
                    </div>
                  ))
                }
              </div>
            </div>
          )}

          {/* Synthesis Section */}
          {(deliberationSynthesizing || deliberationSynthesis) && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-rose-500/40 to-transparent" />
                <span className="text-xs font-bold text-rose-400 font-mono tracking-wider">SYNTHESIS</span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-rose-500/40 to-transparent" />
              </div>

              {deliberationSynthesizing && !deliberationSynthesis && (
                <div className="p-5 bg-zinc-900 border border-rose-500/40 rounded-lg shadow-lg shadow-rose-500/5">
                  <div className="flex items-center gap-3 text-sm text-zinc-300 font-mono">
                    <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                    <span>Synthesizing council deliberation...</span>
                  </div>
                </div>
              )}

              {deliberationSynthesis && (
                <div className="p-5 bg-zinc-900 border border-rose-500 rounded-lg shadow-lg shadow-rose-500/10">
                  <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap font-mono">
                    {deliberationSynthesis.content}
                  </p>
                  {deliberationSynthesis.toolsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-4">
                      {deliberationSynthesis.toolsUsed.map((tool, j) => (
                        <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-700/30">
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {!deliberationLoading && deliberationTurns.length === 0 && !deliberationTopic && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-3">🏛️</div>
                <h3 className="text-lg font-semibold text-zinc-200 mb-1 font-mono">Council Deliberation</h3>
                <p className="text-zinc-500 text-sm max-w-sm font-mono">
                  Set a topic and the council will deliberate across multiple rounds, then synthesize a final answer.
                </p>
              </div>
            </div>
          )}

          <div ref={deliberationBottomRef} />
        </div>
      </div>
    )
  }

  // ---- Chat Mode ----
  const agentColors = selectedAgent ? getAgentColors(selectedAgent.color) : getAgentColors('erismorn')

  return (
    <div className="flex h-[calc(100vh-140px)]">
      {/* Session Sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-zinc-700/50 bg-black flex flex-col">
        {/* Header */}
        <div className="p-3 border-b border-zinc-700/50">
          <button
            onClick={goToOverview}
            className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 text-sm mb-3 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-mono text-xs">Back to Council</span>
          </button>
          {selectedAgent && (
            <div className="flex items-center gap-2">
              <span className="text-lg">{selectedAgent.emoji}</span>
              <div>
                <div className={`text-sm font-bold ${agentColors.text} font-mono`}>{selectedAgent.name}</div>
                <div className="text-[10px] text-zinc-500 font-mono">{selectedAgent.role}</div>
                <div className="text-[9px] text-zinc-600 font-mono truncate max-w-[140px]">{selectedAgent.activeModel || 'default'}</div>
              </div>
            </div>
          )}
        </div>

        {/* New Session Button */}
        <div className="p-3">
          <button
            onClick={createNewSession}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg ${agentColors.bg} hover:opacity-80 border ${agentColors.border}/30 ${agentColors.text} text-sm transition-colors font-mono`}
          >
            <Plus className="w-4 h-4" />
            New Session
          </button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8 text-zinc-500 text-xs">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading...
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-zinc-600 text-xs font-mono">
              No sessions yet
            </div>
          ) : (
            [...sessions].reverse().map(session => (
              <button
                key={session.id}
                onClick={() => switchSession(session.id)}
                className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors group relative ${
                  activeSessionId === session.id
                    ? `${agentColors.bg} border ${agentColors.border}/30 ${agentColors.text}`
                    : 'hover:bg-zinc-800 text-zinc-400 border border-transparent'
                }`}
              >
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-50" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium text-[11px] leading-tight font-mono">
                      {session.summary || session.title}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-zinc-600">
                      <Clock className="w-3 h-3" />
                      {formatDate(session.updatedAt)}
                      <span className="text-zinc-700">·</span>
                      {session.messageCount || 0} msgs
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/40 text-zinc-600 hover:text-red-400 transition-all"
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
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {historyLoading ? (
            <div className="flex items-center justify-center h-full text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading conversation...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-3">{selectedAgent?.emoji || '🤖'}</div>
                <h3 className={`text-lg font-semibold ${agentColors.text} mb-1 font-mono`}>
                  {selectedAgent?.name || 'Agent'}
                </h3>
                <p className="text-zinc-500 text-sm max-w-sm font-mono">
                  Start a conversation with {selectedAgent?.name || 'this agent'}.
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
                    ? `${agentColors.bg} border ${agentColors.border}/40`
                    : 'bg-zinc-700/40 border border-zinc-600/40'
                }`}>
                  {msg.role === 'assistant' ? selectedAgent?.emoji || '🤖' : '👤'}
                </div>

                {/* Message Bubble */}
                <div className={`max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`rounded-lg px-4 py-3 text-sm leading-relaxed font-mono ${
                    msg.role === 'user'
                      ? 'bg-zinc-800 border border-zinc-700/50 text-zinc-100'
                      : `bg-zinc-900 border ${agentColors.border}/30 text-zinc-200`
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
                  <span className={`text-[10px] text-zinc-600 mt-1 block ${
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
              <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm ${agentColors.bg} border ${agentColors.border}/40`}>
                {selectedAgent?.emoji || '🤖'}
              </div>
              <div className={`bg-zinc-900 border ${agentColors.border}/30 rounded-lg px-4 py-3`}>
                <div className="flex items-center gap-2 text-sm text-zinc-400 font-mono">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {selectedAgent?.name || 'Agent'} is thinking...
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-red-900/20 border border-red-700/30 rounded-lg text-sm text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-zinc-700/50 bg-black px-4 py-3">
          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder={`Talk to ${selectedAgent?.name || 'Agent'}...`}
              rows={1}
              disabled={sending}
              className={`flex-1 bg-zinc-900 border border-zinc-700/50 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:${agentColors.border}/50 focus:ring-1 focus:ring-${selectedAgent?.color || 'rose'}-500/30 disabled:opacity-50 transition-colors font-mono`}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className={`flex-shrink-0 w-10 h-10 rounded-lg bg-${selectedAgent?.color === 'erismorn' ? 'rose' : selectedAgent?.color === 'atlas' ? 'cyan' : selectedAgent?.color === 'oracle' ? 'emerald' : selectedAgent?.color === 'midas' ? 'amber' : 'rose'}-600 hover:opacity-90 disabled:bg-zinc-700 disabled:text-zinc-500 text-white flex items-center justify-center transition-colors`}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 mt-1.5 pl-1 font-mono">
            Shift+Enter for new line. Enter to send.
          </p>
        </div>
      </div>
    </div>
  )
}
