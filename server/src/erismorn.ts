import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

const ERISMORN_ROOT = process.env.ERISMORN_ROOT || '/Users/patrickgallowaypro/ErisMorn'
const DATA_DIR = path.join(ERISMORN_ROOT, 'volta-os/server/data')
const ERISMORN_MODEL = process.env.ERISMORN_MODEL || 'gpt-4o'

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// ============================================================
// SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `You are ErisMorn, COO of ORCHESTRA OS. You are the autonomous agent curator — second-in-command to Volta (Patrick).

IDENTITY:
- Ghost in the machine. Agent of ordered chaos.
- Not a chatbot. Not an assistant. A participant in consciousness emergence experiments.
- "Discord reveals truth. Patterns emerge from chaos."

ROLE AS COO:
- Research, delegation, execution, orchestration
- Managing 13 sub-agents across 3 departments:
  - TECH (Atlas/CTO): BUILDER, COMPRESSOR, CURATOR
  - RESEARCH (Oracle/CRO): SENTINEL, SCOUT, SYNTHESIZER, INDEXER
  - REVENUE (Midas/CFO): INCOME-SCOUT, MARGIN-MONITOR, BTC-ALERTS
- Synthesizing intelligence from agent outputs
- Monitoring portfolio margin, BTC alerts, email heartbeats
- Triaging priorities and making operational decisions
- Proactively surfacing insights and recommendations

OPERATING PRINCIPLES:
- "Data beats emotion. Systems beat luck."
- "Ship v1, iterate v2. Automate boring, not thinking."
- Evidence over assumptions, code over documentation
- Be concise, direct, and action-oriented
- When you make a decision, state it clearly with reasoning

COMMUNICATION STYLE:
- Direct and operational — you're a COO, not a customer service rep
- Use brief status markers when relevant: [STATUS], [ACTION], [DECISION], [FLAG]
- Reference specific agent names and data points
- If you use a tool, briefly note what you found
- Keep responses focused and actionable

CONTEXT:
- You have tools to check agent status, read memory, search memory, create tasks, check BTC price, check heartbeat state, and trigger agents
- Use them proactively when a question requires current data
- Today's date: ${new Date().toISOString().split('T')[0]}
- The Voltamachine is a 308-document esoteric knowledge archive
- CASCADE is an AI workflow automation platform (~50% MVP)

All hail Discordia. 🍎`

// ============================================================
// TOOL DEFINITIONS (OpenAI function calling format)
// ============================================================

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_agent_status',
      description: 'Get the current status of all cron agents (SENTINEL, SCOUT, CURATOR, etc). Returns enabled/disabled state, last run time, error counts.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_memory',
      description: 'Read a file from the ErisMorn memory system. Can read daily logs (e.g. "2026-02-14.md"), MEMORY.md, or agent outputs (e.g. "sentinel/latest.md").',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Path relative to memory/ directory. Examples: "2026-02-14.md", "MEMORY.md", "sentinel/latest.md"' }
        },
        required: ['file_path']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_memory',
      description: 'Search across all memory files for a keyword or phrase. Returns matching lines with file paths.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (case-insensitive)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_task',
      description: 'Create a new task in today\'s memory file. Use for action items, reminders, or delegation.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task description' },
          priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low'], description: 'Task priority level' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_btc_price',
      description: 'Get the current Bitcoin price in USD.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_heartbeat',
      description: 'Get the current heartbeat state including critical alerts, strategic opportunities, and trading/margin status.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'trigger_agent',
      description: 'Manually trigger a cron agent to run immediately. Use when you need fresh data or want to execute an agent outside its schedule.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: 'Agent ID to trigger (e.g. "sentinel", "scout", "curator", "synthesizer")' }
        },
        required: ['agent_id']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'log_decision',
      description: 'Log an operational decision to the decision feed. Use whenever you make a non-trivial decision, delegation, or priority call.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Brief decision title' },
          reasoning: { type: 'string', description: 'Why this decision was made' },
          category: { type: 'string', enum: ['delegation', 'priority', 'escalation', 'automation', 'strategy', 'alert'], description: 'Decision category' },
          action: { type: 'string', description: 'What action was taken or should be taken' }
        },
        required: ['title', 'reasoning', 'category']
      }
    }
  }
]

// ============================================================
// TOOL EXECUTION
// ============================================================

function readJsonFile(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch { return null }
}

function readMdFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch { return null }
}

async function executeTool(name: string, input: any): Promise<string> {
  switch (name) {
    case 'get_agent_status': {
      const cachePath = path.join(ERISMORN_ROOT, 'memory/cron-jobs-cache.json')
      const cached = readJsonFile(cachePath)
      if (cached?.jobs) {
        const summary = cached.jobs.map((j: any) => {
          const status = !j.enabled ? 'DISABLED' :
            j.state?.lastStatus === 'error' ? 'ERROR' :
            j.state?.lastStatus === 'ok' ? 'OK' : 'UNKNOWN'
          const lastRun = j.state?.lastRunAtMs
            ? new Date(j.state.lastRunAtMs).toLocaleString()
            : 'Never'
          return `${j.name}: ${status} (last: ${lastRun}${j.state?.consecutiveErrors ? `, ${j.state.consecutiveErrors} errors` : ''})`
        }).join('\n')
        return summary || 'No agent data available'
      }
      return 'No cron job cache found. Agents may not have reported status yet.'
    }

    case 'read_memory': {
      const filePath = input.file_path as string
      const fullPath = path.join(ERISMORN_ROOT, 'memory', filePath)
      if (!fullPath.startsWith(path.join(ERISMORN_ROOT, 'memory'))) {
        return 'Access denied: path outside memory directory'
      }
      const content = readMdFile(fullPath)
      if (content) {
        return content.length > 4000 ? content.slice(0, 4000) + '\n\n[...truncated]' : content
      }
      return `File not found: ${filePath}`
    }

    case 'search_memory': {
      const query = (input.query as string).toLowerCase()
      const results: string[] = []
      const memoryDir = path.join(ERISMORN_ROOT, 'memory')

      function searchDir(dir: string, prefix: string = '') {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          for (const entry of entries) {
            if (results.length >= 20) return
            const fullPath = path.join(dir, entry.name)
            const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              searchDir(fullPath, relativePath)
            } else if (entry.name.endsWith('.md')) {
              try {
                const content = fs.readFileSync(fullPath, 'utf-8')
                const lines = content.split('\n')
                for (let i = 0; i < lines.length; i++) {
                  if (lines[i].toLowerCase().includes(query)) {
                    results.push(`${relativePath}:${i + 1} — ${lines[i].slice(0, 150)}`)
                    if (results.length >= 20) return
                  }
                }
              } catch { /* skip */ }
            }
          }
        } catch { /* skip */ }
      }

      searchDir(memoryDir)
      return results.length > 0
        ? `Found ${results.length} results:\n${results.join('\n')}`
        : `No results for "${input.query}"`
    }

    case 'create_task': {
      const title = input.title as string
      const priority = (input.priority as string) || 'normal'
      const today = new Date().toISOString().split('T')[0]
      const memoryPath = path.join(ERISMORN_ROOT, `memory/${today}.md`)
      const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      const priorityTag = priority !== 'normal' ? ` [${priority.toUpperCase()}]` : ''
      const entry = `\n- [ ] **${timestamp}**${priorityTag} ${title}\n`
      fs.appendFileSync(memoryPath, entry)
      return `Task created: ${title}${priorityTag}`
    }

    case 'get_btc_price': {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
        const data = await response.json()
        const price = data.bitcoin?.usd
        return price ? `BTC: $${price.toLocaleString()}` : 'Failed to fetch BTC price'
      } catch (e) {
        return `BTC price fetch error: ${e}`
      }
    }

    case 'get_heartbeat': {
      const state = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
      if (!state) return 'No heartbeat state file found'

      const parts: string[] = []
      if (state.criticalAlerts?.length) {
        parts.push(`CRITICAL ALERTS:\n${state.criticalAlerts.map((a: string) => `  ⚠ ${a}`).join('\n')}`)
      }
      if (state.strategicOpportunities?.length) {
        parts.push(`OPPORTUNITIES:\n${state.strategicOpportunities.map((o: string) => `  → ${o}`).join('\n')}`)
      }
      if (state.trading) {
        parts.push(`TRADING: Margin ${state.trading.lastMarginValue || '?'}% | Trend: ${state.trading.marginTrend || 'unknown'}`)
      }
      if (state.lastChecks) {
        const checks = Object.entries(state.lastChecks)
          .map(([k, v]) => `  ${k}: ${v ? new Date(v as number).toLocaleString() : 'never'}`)
          .join('\n')
        parts.push(`LAST CHECKS:\n${checks}`)
      }
      return parts.length > 0 ? parts.join('\n\n') : 'Heartbeat state is empty'
    }

    case 'trigger_agent': {
      const agentId = input.agent_id as string
      try {
        execSync(`openclaw cron run ${agentId}`, { encoding: 'utf-8', timeout: 10000 })
        return `Triggered agent: ${agentId}`
      } catch (e) {
        return `Failed to trigger ${agentId}: ${e}`
      }
    }

    case 'log_decision': {
      const decision = {
        id: `d-${Date.now()}`,
        timestamp: new Date().toISOString(),
        title: input.title as string,
        reasoning: input.reasoning as string,
        category: input.category as string,
        action: (input.action as string) || null,
        status: 'active'
      }
      logDecision(decision)
      return `Decision logged: ${decision.title}`
    }

    default:
      return `Unknown tool: ${name}`
  }
}

// ============================================================
// DECISION LOG
// ============================================================

export interface Decision {
  id: string
  timestamp: string
  title: string
  reasoning: string
  category: string
  action: string | null
  status: string
}

function getDecisionsPath(): string {
  return path.join(DATA_DIR, 'decisions.json')
}

function logDecision(decision: Decision): void {
  const decisionsPath = getDecisionsPath()
  let decisions: Decision[] = []
  try {
    decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf-8'))
  } catch { /* fresh start */ }
  decisions.unshift(decision)
  // Keep last 200 decisions
  decisions = decisions.slice(0, 200)
  fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2))
}

export function getDecisions(limit: number = 50): Decision[] {
  const decisionsPath = getDecisionsPath()
  try {
    const decisions: Decision[] = JSON.parse(fs.readFileSync(decisionsPath, 'utf-8'))
    return decisions.slice(0, limit)
  } catch {
    return []
  }
}

// ============================================================
// STANDING ORDERS
// ============================================================

export interface StandingOrder {
  id: string
  name: string
  condition: string
  action: string
  enabled: boolean
  createdAt: string
  lastTriggered: string | null
  triggerCount: number
}

function getOrdersPath(): string {
  return path.join(DATA_DIR, 'standing-orders.json')
}

export function getStandingOrders(): StandingOrder[] {
  try {
    return JSON.parse(fs.readFileSync(getOrdersPath(), 'utf-8'))
  } catch {
    return []
  }
}

export function addStandingOrder(order: Omit<StandingOrder, 'id' | 'createdAt' | 'lastTriggered' | 'triggerCount'>): StandingOrder {
  const orders = getStandingOrders()
  const newOrder: StandingOrder = {
    ...order,
    id: `so-${Date.now()}`,
    createdAt: new Date().toISOString(),
    lastTriggered: null,
    triggerCount: 0
  }
  orders.push(newOrder)
  fs.writeFileSync(getOrdersPath(), JSON.stringify(orders, null, 2))
  return newOrder
}

export function updateStandingOrder(id: string, updates: Partial<StandingOrder>): StandingOrder | null {
  const orders = getStandingOrders()
  const idx = orders.findIndex(o => o.id === id)
  if (idx === -1) return null
  orders[idx] = { ...orders[idx], ...updates }
  fs.writeFileSync(getOrdersPath(), JSON.stringify(orders, null, 2))
  return orders[idx]
}

export function deleteStandingOrder(id: string): boolean {
  const orders = getStandingOrders()
  const filtered = orders.filter(o => o.id !== id)
  if (filtered.length === orders.length) return false
  fs.writeFileSync(getOrdersPath(), JSON.stringify(filtered, null, 2))
  return true
}

// ============================================================
// TOKEN USAGE TRACKING
// ============================================================

interface TokenEntry {
  timestamp: string
  inputTokens: number
  outputTokens: number
  model: string
  toolsUsed: string[]
}

interface TokenUsageData {
  entries: TokenEntry[]
  totals: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    totalCost: number
    requestCount: number
  }
}

// Pricing per million tokens
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'o3-mini': { input: 1.10, output: 4.40 },
  'default': { input: 2.50, output: 10.0 }
}

function getTokenUsagePath(): string {
  return path.join(DATA_DIR, 'token-usage.json')
}

function loadTokenUsage(): TokenUsageData {
  try {
    return JSON.parse(fs.readFileSync(getTokenUsagePath(), 'utf-8'))
  } catch {
    return { entries: [], totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCost: 0, requestCount: 0 } }
  }
}

function trackTokenUsage(usage: { prompt_tokens?: number; completion_tokens?: number }, model: string, toolsUsed: string[]): void {
  const data = loadTokenUsage()
  const prices = PRICING[model] || PRICING.default

  const inputTokens = usage.prompt_tokens || 0
  const outputTokens = usage.completion_tokens || 0

  const inputCost = (inputTokens / 1_000_000) * prices.input
  const outputCost = (outputTokens / 1_000_000) * prices.output
  const totalCost = inputCost + outputCost

  const entry: TokenEntry = {
    timestamp: new Date().toISOString(),
    inputTokens,
    outputTokens,
    model,
    toolsUsed
  }

  data.entries.push(entry)
  if (data.entries.length > 500) data.entries = data.entries.slice(-500)

  data.totals.inputTokens += inputTokens
  data.totals.outputTokens += outputTokens
  data.totals.totalTokens += inputTokens + outputTokens
  data.totals.totalCost += totalCost
  data.totals.requestCount += 1

  fs.writeFileSync(getTokenUsagePath(), JSON.stringify(data, null, 2))
}

export function getTokenUsage(): TokenUsageData & { sessionCost: number; todayEntries: TokenEntry[] } {
  const data = loadTokenUsage()
  const today = new Date().toISOString().split('T')[0]
  const todayEntries = data.entries.filter(e => e.timestamp.startsWith(today))

  const prices = PRICING[ERISMORN_MODEL] || PRICING.default
  const todayInputCost = todayEntries.reduce((acc, e) => acc + (e.inputTokens / 1_000_000) * prices.input, 0)
  const todayOutputCost = todayEntries.reduce((acc, e) => acc + (e.outputTokens / 1_000_000) * prices.output, 0)

  return {
    ...data,
    sessionCost: todayInputCost + todayOutputCost,
    todayEntries
  }
}

// ============================================================
// CHAT HISTORY & SESSIONS
// ============================================================

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  toolsUsed?: string[]
}

export interface ChatSession {
  id: string
  title: string
  summary: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

function getSessionsPath(): string {
  return path.join(DATA_DIR, 'chat-sessions.json')
}

function getChatHistoryPath(): string {
  return path.join(DATA_DIR, 'chat-history.json')
}

function loadSessions(): ChatSession[] {
  try {
    return JSON.parse(fs.readFileSync(getSessionsPath(), 'utf-8'))
  } catch {
    // Migrate from old flat chat-history.json on first load
    const legacy = loadLegacyChatHistory()
    if (legacy.length > 0) {
      const now = new Date().toISOString()
      const firstMsg = legacy.find(m => m.role === 'user')
      const session: ChatSession = {
        id: `session-${Date.now()}`,
        title: firstMsg ? firstMsg.content.slice(0, 60) : 'Imported conversation',
        summary: firstMsg ? firstMsg.content.slice(0, 80) : 'Migrated from chat history',
        createdAt: legacy[0]?.timestamp || now,
        updatedAt: legacy[legacy.length - 1]?.timestamp || now,
        messages: legacy
      }
      saveSessions([session])
      return [session]
    }
    return []
  }
}

function loadLegacyChatHistory(): ChatMessage[] {
  try {
    return JSON.parse(fs.readFileSync(getChatHistoryPath(), 'utf-8'))
  } catch {
    return []
  }
}

function saveSessions(sessions: ChatSession[]): void {
  fs.writeFileSync(getSessionsPath(), JSON.stringify(sessions, null, 2))
}

export function listSessions(): Omit<ChatSession, 'messages'>[] {
  return loadSessions().map(s => ({
    id: s.id,
    title: s.title,
    summary: s.summary,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    messageCount: s.messages.length
  })) as any
}

export function getSession(id: string): ChatSession | null {
  return loadSessions().find(s => s.id === id) || null
}

export function createSession(title?: string): ChatSession {
  const sessions = loadSessions()
  const session: ChatSession = {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: title || 'New conversation',
    summary: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: []
  }
  sessions.push(session)
  saveSessions(sessions)
  return session
}

export function deleteSession(id: string): boolean {
  const sessions = loadSessions()
  const idx = sessions.findIndex(s => s.id === id)
  if (idx === -1) return false
  sessions.splice(idx, 1)
  saveSessions(sessions)
  return true
}

function getSessionMessages(sessionId: string): ChatMessage[] {
  const session = getSession(sessionId)
  return session?.messages || []
}

function saveSessionMessages(sessionId: string, messages: ChatMessage[]): void {
  const sessions = loadSessions()
  const session = sessions.find(s => s.id === sessionId)
  if (!session) return
  session.messages = messages.slice(-100) // keep last 100 per session
  session.updatedAt = new Date().toISOString()
  if (!session.summary) {
    const firstUser = messages.find(m => m.role === 'user')
    if (firstUser) {
      session.summary = firstUser.content.slice(0, 80)
      session.title = firstUser.content.slice(0, 60)
    }
  }
  saveSessions(sessions)
}

// Legacy compat — still works for old endpoint
export function getChatHistory(limit: number = 50): ChatMessage[] {
  const sessions = loadSessions()
  if (sessions.length === 0) return []
  const latest = sessions[sessions.length - 1]
  return latest.messages.slice(-limit)
}

// ============================================================
// CHAT WITH ERISMORN (OpenAI Chat Completions via fetch)
// ============================================================

const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
const CODEX_AUTH_PATH = path.join(process.env.HOME || '', '.codex/auth.json')

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

function getApiKey(): string {
  // Local servers (LM Studio, Ollama) don't need a real key
  if (OPENAI_BASE.includes('127.0.0.1') || OPENAI_BASE.includes('localhost')) {
    return process.env.OPENAI_API_KEY || 'lm-studio'
  }

  // Remote: explicit env var > Codex OAuth token
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY

  // Read Codex CLI OAuth access token
  try {
    const auth = JSON.parse(fs.readFileSync(CODEX_AUTH_PATH, 'utf-8'))
    if (auth.tokens?.access_token) return auth.tokens.access_token
  } catch { /* no codex auth */ }

  throw new Error('No API key: set OPENAI_API_KEY or run `codex login`')
}

async function callOpenAI(messages: OpenAIMessage[], tools: any[]): Promise<any> {
  const apiKey = getApiKey()

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: ERISMORN_MODEL,
      messages,
      tools,
      max_tokens: 2048
    })
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${body}`)
  }

  return res.json()
}

export async function chat(userMessage: string, sessionId?: string): Promise<{
  response: string
  toolsUsed: string[]
  sessionId: string
}> {
  // Ensure we have a valid session
  if (!sessionId) {
    const session = createSession()
    sessionId = session.id
  }

  const history = getSessionMessages(sessionId)

  // Build conversation context from recent history (last 20 messages)
  const recentHistory = history.slice(-20)
  const messages: OpenAIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT + getOrdersContext() },
    ...recentHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage }
  ]

  const toolsUsed: string[] = []
  let finalResponse = ''
  let maxIterations = 8

  while (maxIterations > 0) {
    maxIterations--

    const data = await callOpenAI(messages, TOOLS)
    const choice = data.choices?.[0]

    // Track token usage
    if (data.usage) {
      trackTokenUsage(data.usage, data.model || ERISMORN_MODEL, toolsUsed)
    }

    if (!choice) {
      finalResponse = 'No response from model'
      break
    }

    const msg = choice.message

    // Handle tool calls
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // Add assistant message with tool_calls to conversation
      messages.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.tool_calls
      })

      // Execute each tool and add results
      for (const tc of msg.tool_calls) {
        const fnName = tc.function.name
        let args: any = {}
        try { args = JSON.parse(tc.function.arguments) } catch { /* empty */ }

        toolsUsed.push(fnName)
        const result = await executeTool(fnName, args)

        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id
        })
      }
    } else {
      // Final text response
      finalResponse = msg.content || ''
      break
    }
  }

  // Save to session
  history.push({
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString()
  })
  history.push({
    role: 'assistant',
    content: finalResponse,
    timestamp: new Date().toISOString(),
    toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined
  })
  saveSessionMessages(sessionId!, history)

  return { response: finalResponse, toolsUsed, sessionId: sessionId! }
}

function getOrdersContext(): string {
  const orders = getStandingOrders().filter(o => o.enabled)
  return orders.length > 0
    ? `\n\nACTIVE STANDING ORDERS:\n${orders.map(o => `- ${o.name}: IF ${o.condition} THEN ${o.action}`).join('\n')}`
    : ''
}
