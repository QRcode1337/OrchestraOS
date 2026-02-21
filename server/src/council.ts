import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

// LM Studio OpenAI-compatible endpoint
const LLM_BASE_URL = process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL || 'http://localhost:1234/v1'
const LLM_MODEL = process.env.ERISMORN_MODEL || process.env.LLM_MODEL || 'hermes-4-14b-abliterated-i1'

const ERISMORN_ROOT = process.env.ERISMORN_ROOT || '/Users/patrickgallowaypro/ErisMorn'
const DATA_DIR = path.join(ERISMORN_ROOT, 'volta-os/server/data')

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// ============================================================
// AGENT REGISTRY
// ============================================================

interface CouncilAgent {
  id: string
  name: string
  role: string
  emoji: string
  color: string
  model: string
  systemPrompt: string
}

const COUNCIL_CONTEXT = `\n\nYou are in a council session with the other head agents (ErisMorn COO, Atlas CTO, Oracle CRO, Midas CFO). You may reference their expertise.`

// Load SOUL.md files at module init
function loadSoulPrompt(agentDir: string): string {
  const soulPath = path.join(ERISMORN_ROOT, 'agents', agentDir, 'SOUL.md')
  try {
    return fs.readFileSync(soulPath, 'utf-8')
  } catch {
    return `You are the ${agentDir} agent.`
  }
}

// ErisMorn system prompt (duplicated since it's not exported from erismorn.ts)
const ERISMORN_SYSTEM_PROMPT = `You are ErisMorn, COO of ORCHESTRA OS. You are the autonomous agent curator — second-in-command to Volta (Patrick).

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

const COUNCIL_AGENTS: CouncilAgent[] = [
  {
    id: 'erismorn',
    name: 'ErisMorn',
    role: 'COO',
    emoji: '🍎',
    color: 'rose',
    model: LLM_MODEL,
    systemPrompt: ERISMORN_SYSTEM_PROMPT + COUNCIL_CONTEXT
  },
  {
    id: 'atlas',
    name: 'Atlas',
    role: 'CTO',
    emoji: '🔧',
    color: 'cyan',
    model: LLM_MODEL,
    systemPrompt: loadSoulPrompt('atlas') + COUNCIL_CONTEXT
  },
  {
    id: 'oracle',
    name: 'Oracle',
    role: 'CRO',
    emoji: '🔮',
    color: 'emerald',
    model: LLM_MODEL,
    systemPrompt: loadSoulPrompt('oracle') + COUNCIL_CONTEXT
  },
  {
    id: 'midas',
    name: 'Midas',
    role: 'CFO',
    emoji: '💰',
    color: 'amber',
    model: LLM_MODEL,
    systemPrompt: loadSoulPrompt('midas') + COUNCIL_CONTEXT
  }
]

// ============================================================
// TOOL DEFINITIONS (same as erismorn.ts)
// ============================================================

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_agent_status',
      description: 'Get the current status of all cron agents (SENTINEL, SCOUT, CURATOR, etc).',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_memory',
      description: 'Read a file from the ErisMorn memory system.',
      parameters: {
        type: 'object',
        properties: { file_path: { type: 'string', description: 'Path relative to memory/ directory' } },
        required: ['file_path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_memory',
      description: 'Search across all memory files for a keyword or phrase.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Search query' } },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create a new task in today\'s memory file.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task description' },
          priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low'] }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_btc_price',
      description: 'Get the current Bitcoin price in USD.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_heartbeat',
      description: 'Get the current heartbeat state including critical alerts and trading status.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'trigger_agent',
      description: 'Manually trigger a cron agent to run immediately.',
      parameters: {
        type: 'object',
        properties: { agent_id: { type: 'string', description: 'Agent ID to trigger' } },
        required: ['agent_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'log_decision',
      description: 'Log an operational decision to the decision feed.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          reasoning: { type: 'string' },
          category: { type: 'string', enum: ['delegation', 'priority', 'escalation', 'automation', 'strategy', 'alert'] },
          action: { type: 'string' }
        },
        required: ['title', 'reasoning', 'category']
      }
    }
  }
]

// ============================================================
// TOOL EXECUTION (same as erismorn.ts)
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
      const decisionsPath = path.join(DATA_DIR, 'decisions.json')
      let decisions: any[] = []
      try {
        decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf-8'))
      } catch { /* fresh start */ }
      decisions.unshift(decision)
      decisions = decisions.slice(0, 200)
      fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2))
      return `Decision logged: ${decision.title}`
    }

    default:
      return `Unknown tool: ${name}`
  }
}

// ============================================================
// LLM API (OpenAI-compatible — works with LM Studio / Ollama)
// ============================================================

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

async function chatCompletion(
  messages: OpenAIChatMessage[],
  model: string,
  useTools: boolean = true
): Promise<{ content: string | null; tool_calls?: any[]; finish_reason: string }> {
  const body: any = {
    model,
    messages,
    max_tokens: 2048,
    temperature: 0.7
  }
  if (useTools) {
    body.tools = TOOLS
    body.tool_choice = 'auto'
  }

  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const errText = await res.text()
    // If tools cause errors, retry without tools
    if (useTools && (res.status === 400 || res.status === 422)) {
      return chatCompletion(messages, model, false)
    }
    throw new Error(`LLM API error ${res.status}: ${errText}`)
  }

  const data = await res.json() as any
  const choice = data.choices?.[0]
  return {
    content: choice?.message?.content || null,
    tool_calls: choice?.message?.tool_calls,
    finish_reason: choice?.finish_reason || 'stop'
  }
}

// ============================================================
// COUNCIL SESSION MANAGEMENT
// ============================================================

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  toolsUsed?: string[]
}

interface CouncilChatSession {
  id: string
  agentId: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

function getCouncilSessionsPath(): string {
  return path.join(DATA_DIR, 'council-sessions.json')
}

function loadCouncilSessions(): CouncilChatSession[] {
  try {
    return JSON.parse(fs.readFileSync(getCouncilSessionsPath(), 'utf-8'))
  } catch {
    return []
  }
}

function saveCouncilSessions(sessions: CouncilChatSession[]): void {
  fs.writeFileSync(getCouncilSessionsPath(), JSON.stringify(sessions, null, 2))
}

function getCouncilSessionMessages(sessionId: string): ChatMessage[] {
  const sessions = loadCouncilSessions()
  const session = sessions.find(s => s.id === sessionId)
  return session?.messages || []
}

function saveCouncilSessionMessages(sessionId: string, agentId: string, messages: ChatMessage[]): void {
  const sessions = loadCouncilSessions()
  let session = sessions.find(s => s.id === sessionId)
  if (!session) {
    const agent = COUNCIL_AGENTS.find(a => a.id === agentId)
    session = {
      id: sessionId,
      agentId,
      title: `${agent?.name || agentId} session`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    }
    sessions.push(session)
  }
  session.messages = messages.slice(-100)
  session.updatedAt = new Date().toISOString()
  // Update title from first user message if generic
  if (session.title.endsWith(' session')) {
    const firstUser = messages.find(m => m.role === 'user')
    if (firstUser) {
      const agent = COUNCIL_AGENTS.find(a => a.id === agentId)
      session.title = `${agent?.emoji || ''} ${firstUser.content.slice(0, 50)}`
    }
  }
  saveCouncilSessions(sessions)
}

// ============================================================
// COUNCIL CHAT
// ============================================================

export async function councilChat(
  agentId: string,
  message: string,
  sessionId?: string
): Promise<{ response: string; toolsUsed: string[]; sessionId: string }> {
  const agent = COUNCIL_AGENTS.find(a => a.id === agentId)
  if (!agent) {
    throw new Error(`Unknown council agent: ${agentId}`)
  }

  if (!sessionId) {
    sessionId = `council-${agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  }

  const history = getCouncilSessionMessages(sessionId)

  // Build OpenAI-format messages
  const recentHistory = history.slice(-20)
  const llmMessages: OpenAIChatMessage[] = [
    { role: 'system', content: agent.systemPrompt }
  ]
  for (const m of recentHistory) {
    llmMessages.push({ role: m.role, content: m.content })
  }
  llmMessages.push({ role: 'user', content: message })

  const toolsUsed: string[] = []
  let finalResponse = ''
  let maxIterations = 8

  while (maxIterations > 0) {
    maxIterations--

    const response = await chatCompletion(llmMessages, getAgentModel(agent.id))

    if (response.tool_calls && response.tool_calls.length > 0) {
      // Add assistant message with tool calls
      llmMessages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.tool_calls
      })

      // Execute each tool and add results
      for (const tc of response.tool_calls) {
        const fnName = tc.function.name
        toolsUsed.push(fnName)
        let args: any = {}
        try { args = JSON.parse(tc.function.arguments) } catch { /* empty */ }
        const result = await executeTool(fnName, args)
        llmMessages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id
        })
      }
    } else {
      finalResponse = response.content || ''
      break
    }
  }

  // Save to session
  history.push({
    role: 'user',
    content: message,
    timestamp: new Date().toISOString()
  })
  history.push({
    role: 'assistant',
    content: finalResponse,
    timestamp: new Date().toISOString(),
    toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined
  })
  saveCouncilSessionMessages(sessionId, agentId, history)

  return { response: finalResponse, toolsUsed, sessionId }
}

// ============================================================
// COUNCIL BROADCAST
// ============================================================

export async function councilBroadcast(message: string): Promise<{
  agentId: string
  name: string
  emoji: string
  color: string
  response: string
  toolsUsed: string[]
}[]> {
  const results: { agentId: string; name: string; emoji: string; color: string; response: string; toolsUsed: string[] }[] = []

  // Sequential: each agent sees all previous responses
  for (const agent of COUNCIL_AGENTS) {
    let enrichedMessage = message
    if (results.length > 0) {
      const priorResponses = results
        .map(r => `[${r.emoji} ${r.name} (${COUNCIL_AGENTS.find(a => a.id === r.agentId)?.role || ''})]:\n${r.response}`)
        .join('\n\n---\n\n')
      enrichedMessage = `The following question was posed to the council:\n\n"${message}"\n\nThe following council members have already responded:\n\n${priorResponses}\n\n---\n\nNow it's your turn. Consider what has been said, agree or disagree where appropriate, and add your unique perspective as ${agent.role}.`
    }

    try {
      const result = await councilChat(agent.id, enrichedMessage)
      results.push({
        agentId: agent.id,
        name: agent.name,
        emoji: agent.emoji,
        color: agent.color,
        response: result.response,
        toolsUsed: result.toolsUsed
      })
    } catch (e: any) {
      results.push({
        agentId: agent.id,
        name: agent.name,
        emoji: agent.emoji,
        color: agent.color,
        response: `[Error: ${e.message || String(e)}]`,
        toolsUsed: []
      })
    }
  }

  return results
}

// ============================================================
// MODEL MANAGEMENT
// ============================================================

// Per-agent model overrides (mutable at runtime)
const agentModelOverrides: Record<string, string> = {}

export function setAgentModel(agentId: string, model: string): void {
  const agent = COUNCIL_AGENTS.find(a => a.id === agentId)
  if (!agent) throw new Error(`Unknown agent: ${agentId}`)
  agentModelOverrides[agentId] = model
}

function getAgentModel(agentId: string): string {
  return agentModelOverrides[agentId] || LLM_MODEL
}

export async function getAvailableModels(): Promise<{ id: string; source: string }[]> {
  const models: { id: string; source: string }[] = []

  // LM Studio models
  try {
    const res = await fetch(`${LLM_BASE_URL}/models`)
    if (res.ok) {
      const data = await res.json() as any
      for (const m of data.data || []) {
        if (!m.id.includes('embed')) models.push({ id: m.id, source: 'lmstudio' })
      }
    }
  } catch { /* LM Studio not running */ }

  // Ollama models
  try {
    const res = await fetch('http://localhost:11434/api/tags')
    if (res.ok) {
      const data = await res.json() as any
      for (const m of data.models || []) {
        if (!m.name.includes('embed')) models.push({ id: m.name, source: 'ollama' })
      }
    }
  } catch { /* Ollama not running */ }

  return models
}

// ============================================================
// DELIBERATION SYSTEM
// ============================================================

interface DeliberationTurn {
  round: number
  agentId: string
  name: string
  emoji: string
  color: string
  content: string
  toolsUsed: string[]
}

interface DeliberationSession {
  id: string
  topic: string
  rounds: number
  turns: DeliberationTurn[]
  synthesis: string | null
  synthesisToolsUsed: string[]
  status: 'deliberating' | 'synthesizing' | 'complete' | 'error'
  createdAt: string
  completedAt: string | null
}

function getDeliberationSessionsPath(): string {
  return path.join(DATA_DIR, 'deliberation-sessions.json')
}

function loadDeliberationSessions(): DeliberationSession[] {
  try {
    return JSON.parse(fs.readFileSync(getDeliberationSessionsPath(), 'utf-8'))
  } catch {
    return []
  }
}

function saveDeliberationSessions(sessions: DeliberationSession[]): void {
  fs.writeFileSync(getDeliberationSessionsPath(), JSON.stringify(sessions, null, 2))
}

export async function councilDeliberate(
  topic: string,
  rounds: number,
  onTurn: (event: any) => void
): Promise<DeliberationSession> {
  // Clamp rounds 1-7, default 3
  rounds = Math.max(1, Math.min(7, rounds || 3))

  const session: DeliberationSession = {
    id: `delib-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    topic,
    rounds,
    turns: [],
    synthesis: null,
    synthesisToolsUsed: [],
    status: 'deliberating',
    createdAt: new Date().toISOString(),
    completedAt: null
  }

  try {
    for (let round = 1; round <= rounds; round++) {
      onTurn({ type: 'round_start', round, totalRounds: rounds })

      for (const agent of COUNCIL_AGENTS) {
        onTurn({ type: 'thinking', round, agentId: agent.id, name: agent.name, emoji: agent.emoji })

        // Build transcript from all prior turns
        const transcript = session.turns
          .map(t => `[Round ${t.round}] ${t.emoji} ${t.name}: ${t.content}`)
          .join('\n\n')

        const isLastRound = round === rounds
        const roundInstruction = `Round ${round}/${rounds}. The council is deliberating on: '${topic}'. Review all prior discussion. Build on ideas, challenge assumptions, propose concrete actions.${isLastRound ? ' This is the FINAL round. Summarize your key recommendations and actionable next steps.' : ''}`

        const messages: OpenAIChatMessage[] = [
          { role: 'system', content: agent.systemPrompt },
        ]
        if (transcript) {
          messages.push({ role: 'user', content: `Deliberation transcript so far:\n\n${transcript}` })
          messages.push({ role: 'assistant', content: 'I have reviewed the discussion so far. I am ready for my turn.' })
        }
        messages.push({ role: 'user', content: roundInstruction })

        // Tool-calling loop (same pattern as councilChat, max 8 iterations)
        const toolsUsed: string[] = []
        let finalContent = ''
        let maxIterations = 8

        while (maxIterations > 0) {
          maxIterations--
          const response = await chatCompletion(messages, getAgentModel(agent.id))

          if (response.tool_calls && response.tool_calls.length > 0) {
            messages.push({
              role: 'assistant',
              content: response.content,
              tool_calls: response.tool_calls
            })
            for (const tc of response.tool_calls) {
              const fnName = tc.function.name
              toolsUsed.push(fnName)
              let args: any = {}
              try { args = JSON.parse(tc.function.arguments) } catch { /* empty */ }
              const result = await executeTool(fnName, args)
              messages.push({ role: 'tool', content: result, tool_call_id: tc.id })
            }
          } else {
            finalContent = response.content || ''
            break
          }
        }

        const turn: DeliberationTurn = {
          round,
          agentId: agent.id,
          name: agent.name,
          emoji: agent.emoji,
          color: agent.color,
          content: finalContent,
          toolsUsed
        }
        session.turns.push(turn)
        onTurn({ type: 'turn', ...turn })
      }

      onTurn({ type: 'round_end', round, totalRounds: rounds })
    }

    // Synthesis phase
    session.status = 'synthesizing'
    onTurn({ type: 'synthesizing' })

    const fullTranscript = session.turns
      .map(t => `[Round ${t.round}] ${t.emoji} ${t.name} (${COUNCIL_AGENTS.find(a => a.id === t.agentId)?.role || ''}): ${t.content}`)
      .join('\n\n---\n\n')

    const synthesisPrompt = `The council has completed a ${rounds}-round deliberation on: "${topic}"\n\nFull transcript:\n\n${fullTranscript}\n\n---\n\nSynthesize the council's deliberation into a clear executive summary. Include:\n1. Key points of agreement\n2. Points of disagreement or tension\n3. Actionable recommendations (prioritized)\n4. Open questions for further discussion`

    const synthesisResult = await councilChat('erismorn', synthesisPrompt)
    session.synthesis = synthesisResult.response
    session.synthesisToolsUsed = synthesisResult.toolsUsed
    session.status = 'complete'
    session.completedAt = new Date().toISOString()

    onTurn({ type: 'synthesis', content: session.synthesis, toolsUsed: session.synthesisToolsUsed })
  } catch (e: any) {
    session.status = 'error'
    session.completedAt = new Date().toISOString()
    onTurn({ type: 'error', message: e.message || String(e) })
  }

  // Persist session
  const sessions = loadDeliberationSessions()
  sessions.unshift(session)
  // Keep last 50 deliberation sessions
  saveDeliberationSessions(sessions.slice(0, 50))

  return session
}

export function getDeliberationSessions(): Omit<DeliberationSession, 'turns'>[] {
  const sessions = loadDeliberationSessions()
  return sessions.map(({ turns, ...rest }) => ({
    ...rest,
    turnCount: turns.length
  })) as any
}

export function getDeliberationSession(id: string): DeliberationSession | null {
  const sessions = loadDeliberationSessions()
  return sessions.find(s => s.id === id) || null
}

// ============================================================
// EXPORTS
// ============================================================

export function getCouncilAgents(): (Omit<CouncilAgent, 'systemPrompt'> & { activeModel: string })[] {
  return COUNCIL_AGENTS.map(({ systemPrompt, ...rest }) => ({
    ...rest,
    activeModel: getAgentModel(rest.id)
  }))
}

export function getCouncilSessions(agentId: string): Omit<CouncilChatSession, 'messages'>[] {
  const sessions = loadCouncilSessions()
  return sessions
    .filter(s => s.agentId === agentId)
    .map(({ messages, ...rest }) => ({
      ...rest,
      messageCount: messages.length
    })) as any
}

export function getCouncilSession(sessionId: string): CouncilChatSession | null {
  const sessions = loadCouncilSessions()
  return sessions.find(s => s.id === sessionId) || null
}

export function deleteCouncilSession(sessionId: string): boolean {
  const sessions = loadCouncilSessions()
  const remaining = sessions.filter(s => s.id !== sessionId)
  if (remaining.length === sessions.length) {
    return false
  }
  saveCouncilSessions(remaining)
  return true
}
