import { Router } from 'express'
import * as fs from 'fs'
import * as path from 'path'

const router = Router()
const ERISMORN_ROOT = process.env.ERISMORN_ROOT || '/Users/patrickgallowaypro/ErisMorn'
const DATA_DIR = path.join(ERISMORN_ROOT, 'volta-os/server/data')
const SHARED_MEMORY_DIR = path.join(ERISMORN_ROOT, 'memory/shared')

// ── Helpers ──────────────────────────────────────────────────

function readJsonFile(filePath: string): any {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')) } catch { return null }
}

function readMdFile(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf-8') } catch { return null }
}

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function writeJsonFile(filePath: string, data: any): boolean {
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    return true
  } catch { return false }
}

function parseAgentOutputs(dirName: string, maxFiles = 5) {
  const dirPath = path.join(ERISMORN_ROOT, 'memory', dirName)
  const items: any[] = []
  try {
    if (!fs.existsSync(dirPath)) return items
    const files = fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.md') && f !== 'CLAUDE.md' && f !== 'README.md')
      .sort().reverse().slice(0, maxFiles)
    for (const file of files) {
      const fullPath = path.join(dirPath, file)
      const stat = fs.statSync(fullPath)
      const content = readMdFile(fullPath) || ''
      const lines = content.split('\n')
      const title = lines.find(l => l.startsWith('# '))?.replace(/^#+\s*/, '') || file.replace('.md', '')
      const preview = lines.slice(0, 20).join('\n')
      const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/)
      const date = dateMatch ? dateMatch[1] : stat.mtime.toISOString().split('T')[0]
      items.push({ file, title, content, preview, date, mtime: stat.mtime.toISOString(), size: stat.size })
    }
  } catch { /* skip */ }
  return items
}

function extractSections(content: string) {
  const sections: { heading: string; level: number; content: string }[] = []
  const lines = content.split('\n')
  let cur: { heading: string; level: number; lines: string[] } | null = null
  for (const line of lines) {
    const m = line.match(/^(#{1,4})\s+(.+)$/)
    if (m) {
      if (cur) sections.push({ heading: cur.heading, level: cur.level, content: cur.lines.join('\n') })
      cur = { heading: m[2], level: m[1].length, lines: [] }
    } else if (cur) cur.lines.push(line)
  }
  if (cur) sections.push({ heading: cur.heading, level: cur.level, content: cur.lines.join('\n') })
  return sections
}

function extractBulletItems(content: string) {
  const items: { text: string; checked: boolean }[] = []
  for (const line of content.split('\n')) {
    const checkMatch = line.match(/^[-*]\s+\[([ x])\]\s+(.+)$/)
    if (checkMatch) { items.push({ text: checkMatch[2], checked: checkMatch[1] === 'x' }); continue }
    const bulletMatch = line.match(/^[-*]\s+(.+)$/)
    if (bulletMatch && !bulletMatch[1].startsWith('#')) items.push({ text: bulletMatch[1], checked: false })
  }
  return items
}

function extractParticipants(content: string): string[] {
  const participants = new Set<string>()
  const patterns = [/erismorn/gi, /sentinel/gi, /scout/gi, /curator/gi, /synthesizer/gi, /builder/gi, /compressor/gi, /voltamachine/gi, /volta/gi]
  for (const p of patterns) {
    if (p.test(content)) {
      const match = content.match(p)
      if (match) participants.add(match[0].toLowerCase().replace(/[^a-z]/g, '-'))
    }
  }
  return Array.from(participants)
}

// ── Status & Core ────────────────────────────────────────────

router.get('/status', (req, res) => {
  const heartbeatState = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
  const todayMemory = readMdFile(path.join(ERISMORN_ROOT, `memory/${getTodayStr()}.md`))
  res.json({ timestamp: new Date().toISOString(), heartbeatState, hasTodayMemory: !!todayMemory, workspace: ERISMORN_ROOT, status: 'online' })
})

router.get('/btc-price', async (req, res) => {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
    const data = await response.json()
    res.json({ price: data.bitcoin?.usd || null, timestamp: new Date().toISOString() })
  } catch { res.json({ price: null, error: 'fetch failed' }) }
})

router.get('/cron-jobs', (req, res) => {
  const cached = readJsonFile(path.join(ERISMORN_ROOT, 'memory/cron-jobs-cache.json'))
  if (cached?.jobs) return res.json(cached)
  res.json({ jobs: [] })
})

router.get('/heartbeat-state', (req, res) => {
  const state = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
  res.json(state || {})
})

router.get('/cron-outputs', (req, res) => {
  const memoryDir = path.join(ERISMORN_ROOT, 'memory')
  const outputs: Record<string, any[]> = {}
  const jobDirs: Record<string, string> = { sentinel: 'sentinel', scout: 'scout', synthesis: 'synthesis', curator: 'curated', 'pieces-ltm': 'pieces-ltm', voltamachine: 'voltamachine', portfolio: 'portfolio', builder: 'builder' }
  for (const [jobKey, dirName] of Object.entries(jobDirs)) {
    outputs[jobKey] = []
    const dirPath = path.join(memoryDir, dirName)
    try {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 3)
        for (const file of files) {
          const content = readMdFile(path.join(dirPath, file))
          const stat = fs.statSync(path.join(dirPath, file))
          outputs[jobKey].push({ file, preview: content?.split('\n').slice(0, 8).join('\n') || '', timestamp: stat.mtime.toISOString() })
        }
      }
    } catch { /* skip */ }
  }
  res.json({ outputs, lastUpdated: new Date().toISOString() })
})

// ── ErisMorn Agent Endpoints ─────────────────────────────────

router.get('/erismorn/synthesis', (req, res) => {
  const data = readJsonFile(path.join(DATA_DIR, 'synthesis.json'))
  res.json({ patterns: data?.patterns || [] })
})

router.get('/erismorn/anomalies', (req, res) => {
  const cached = readJsonFile(path.join(ERISMORN_ROOT, 'memory/cron-jobs-cache.json'))
  const anomalies: any[] = []
  const now = Date.now()
  if (cached?.jobs && Array.isArray(cached.jobs)) {
    for (const job of cached.jobs) {
      const state = job.state || {}
      if (state.consecutiveErrors && state.consecutiveErrors > 2) {
        anomalies.push({ type: 'error_spike', severity: state.consecutiveErrors > 5 ? 'critical' : 'warning', agentId: job.id, agentName: job.name || job.id, message: `${state.consecutiveErrors} consecutive errors`, detectedAt: new Date().toISOString() })
      }
      if (state.lastRunAtMs && job.intervalMs) {
        const elapsed = now - state.lastRunAtMs
        if (elapsed > job.intervalMs * 2) {
          anomalies.push({ type: 'missing_run', severity: elapsed > job.intervalMs * 5 ? 'critical' : 'warning', agentId: job.id, agentName: job.name || job.id, message: `Last run was ${Math.round((elapsed - job.intervalMs) / 60000)} minutes overdue`, detectedAt: new Date().toISOString() })
        }
      }
    }
  }
  res.json({ anomalies, count: anomalies.length, analyzedAt: new Date().toISOString() })
})

router.get('/erismorn/recommendations', (req, res) => {
  let data = readJsonFile(path.join(DATA_DIR, 'recommendations.json'))
  if (!data?.recommendations?.length) {
    const heartbeat = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
    const autoRecs: any[] = []
    if (heartbeat?.strategicOpportunities) {
      for (const opp of heartbeat.strategicOpportunities) {
        autoRecs.push({ id: generateId(), title: typeof opp === 'string' ? opp : opp.title || 'Opportunity', description: typeof opp === 'string' ? opp : opp.description || '', source: 'heartbeat-auto', priority: 'important', status: 'active', createdAt: new Date().toISOString() })
      }
    }
    data = { recommendations: autoRecs }
    if (autoRecs.length > 0) writeJsonFile(path.join(DATA_DIR, 'recommendations.json'), data)
  }
  res.json({ recommendations: data.recommendations || [] })
})

router.get('/erismorn/delegations', (req, res) => {
  const data = readJsonFile(path.join(DATA_DIR, 'delegations.json'))
  res.json({ delegations: data?.delegations || [] })
})

router.get('/erismorn/triage', (req, res) => {
  let data = readJsonFile(path.join(DATA_DIR, 'triage.json'))
  if (!data?.items?.length) {
    const heartbeat = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
    const autoItems: any[] = []
    if (heartbeat?.criticalAlerts) {
      for (const alert of heartbeat.criticalAlerts) {
        autoItems.push({ id: generateId(), source: 'heartbeat-critical', message: typeof alert === 'string' ? alert : alert.message || JSON.stringify(alert), priority: 'urgent', timestamp: new Date().toISOString() })
      }
    }
    data = { items: autoItems }
  }
  res.json({ items: data.items || [] })
})

router.get('/erismorn/decisions', (req, res) => {
  try {
    const decisions = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'decisions.json'), 'utf-8'))
    res.json({ decisions: Array.isArray(decisions) ? decisions.slice(0, 50) : [] })
  } catch { res.json({ decisions: [] }) }
})

router.get('/erismorn/standing-orders', (req, res) => {
  try {
    const orders = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'standing-orders.json'), 'utf-8'))
    res.json({ orders })
  } catch { res.json({ orders: [] }) }
})

router.get('/erismorn/token-usage', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'token-usage.json'), 'utf-8'))
    const today = new Date().toISOString().split('T')[0]
    const todayEntries = (data.entries || []).filter((e: any) => e.timestamp.startsWith(today))
    res.json({ ...data, todayEntries })
  } catch { res.json({ entries: [], totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCost: 0, requestCount: 0 }, todayEntries: [] }) }
})

router.get('/erismorn/history', (req, res) => {
  try {
    const history = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'chat-history.json'), 'utf-8'))
    res.json({ messages: Array.isArray(history) ? history.slice(-50) : [] })
  } catch { res.json({ messages: [] }) }
})

// ── Intelligence Briefing ────────────────────────────────────

router.get('/intelligence/briefing', (req, res) => {
  const cached = readJsonFile(path.join(ERISMORN_ROOT, 'memory/cron-jobs-cache.json'))
  let criticalCount = 0, warningCount = 0, healthyCount = 0
  if (cached?.jobs) {
    for (const job of cached.jobs) {
      const state = job.state || {}
      if (state.consecutiveErrors > 5) criticalCount++
      else if (state.consecutiveErrors > 2) warningCount++
      else if (job.enabled) healthyCount++
    }
  }
  const heartbeat = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
  const criticalAlerts = heartbeat?.criticalAlerts || []
  const opportunities = heartbeat?.strategicOpportunities || []

  let threatLevel: string = 'nominal'
  if (criticalCount > 0 || criticalAlerts.length > 2) threatLevel = 'critical'
  else if (warningCount > 2 || criticalAlerts.length > 0) threatLevel = 'high'
  else if (warningCount > 0) threatLevel = 'elevated'

  const latestSentinel = parseAgentOutputs('sentinel', 1)[0]
  const latestScout = parseAgentOutputs('scout', 1)[0]
  const latestSynthesis = parseAgentOutputs('synthesis', 1)[0]
  const latestCurator = parseAgentOutputs('curated', 1)[0]
  const synthesisData = readJsonFile(path.join(DATA_DIR, 'synthesis.json'))

  res.json({
    threatLevel,
    agentHealth: { critical: criticalCount, warning: warningCount, healthy: healthyCount, total: (cached?.jobs?.length || 0) },
    criticalAlerts: criticalAlerts.slice(0, 5),
    opportunities: opportunities.slice(0, 5),
    patternCount: synthesisData?.patterns?.length || 0,
    latestSignals: {
      sentinel: latestSentinel ? { title: latestSentinel.title, date: latestSentinel.date, preview: latestSentinel.preview.slice(0, 200) } : null,
      scout: latestScout ? { title: latestScout.title, date: latestScout.date, preview: latestScout.preview.slice(0, 200) } : null,
      synthesis: latestSynthesis ? { title: latestSynthesis.title, date: latestSynthesis.date, preview: latestSynthesis.preview.slice(0, 200) } : null,
      curator: latestCurator ? { title: latestCurator.title, date: latestCurator.date, preview: latestCurator.preview.slice(0, 200) } : null
    },
    timestamp: new Date().toISOString()
  })
})

// ── Labs ─────────────────────────────────────────────────────

router.get('/labs/ideas', (req, res) => {
  const ideas: any[] = []
  for (const output of parseAgentOutputs('scout', 5)) {
    for (const s of extractSections(output.content)) {
      if (s.level <= 2 && s.heading && s.content.length > 50)
        ideas.push({ id: `scout-${output.file}-${s.heading.slice(0, 20)}`, source: 'SCOUT', type: 'discovery', title: s.heading.replace(/\*\*/g, ''), content: s.content.slice(0, 500), date: output.date, file: `scout/${output.file}`, priority: s.heading.toLowerCase().includes('critical') ? 'high' : 'medium' })
    }
  }
  for (const output of parseAgentOutputs('sentinel', 5)) {
    for (const item of extractBulletItems(output.content)) {
      if (item.text.length > 10)
        ideas.push({ id: `sentinel-${output.file}-${item.text.slice(0, 20)}`, source: 'SENTINEL', type: 'signal', title: item.text.replace(/\*\*/g, ''), content: item.text, date: output.date, file: `sentinel/${output.file}`, priority: item.text.toLowerCase().includes('critical') ? 'high' : 'low', resolved: item.checked })
    }
  }
  ideas.sort((a, b) => b.date.localeCompare(a.date))
  res.json({ ideas, count: ideas.length, sources: ['SCOUT', 'SENTINEL'], timestamp: new Date().toISOString() })
})

router.get('/labs/prototypes', (req, res) => {
  const prototypes: any[] = []
  for (const output of parseAgentOutputs('builder', 10)) {
    prototypes.push({ id: `builder-${output.file}`, source: 'BUILDER', type: 'build', title: output.title, preview: output.preview, date: output.date, file: `builder/${output.file}`, size: output.size })
  }
  prototypes.sort((a, b) => b.date.localeCompare(a.date))
  res.json({ prototypes, count: prototypes.length, sources: ['BUILDER'], timestamp: new Date().toISOString() })
})

router.get('/labs/reviews', (req, res) => {
  const reviews: any[] = []
  for (const output of parseAgentOutputs('curated', 10)) {
    const sections = extractSections(output.content)
    const summary = sections.find(s => s.heading.toLowerCase().includes('summary'))
    reviews.push({ id: `curator-${output.file}`, source: 'CURATOR', type: 'synthesis', title: output.title, summary: summary?.content.slice(0, 300) || output.preview.slice(0, 300), date: output.date, file: `curated/${output.file}`, size: output.size })
  }
  reviews.sort((a, b) => b.date.localeCompare(a.date))
  res.json({ reviews, count: reviews.length, sources: ['CURATOR'], timestamp: new Date().toISOString() })
})

router.get('/labs/ideation', (req, res) => {
  const ideation: any[] = []
  for (const output of parseAgentOutputs('synthesis', 10)) {
    const sections = extractSections(output.content)
    ideation.push({ id: `synth-${output.file}`, source: 'SYNTHESIZER', type: 'pattern-analysis', title: output.title, preview: output.preview, sections: sections.map(s => ({ heading: s.heading, level: s.level })), date: output.date, file: `synthesis/${output.file}`, size: output.size })
  }
  try {
    const strategyDir = path.join(ERISMORN_ROOT, 'memory/strategy')
    if (fs.existsSync(strategyDir)) {
      for (const file of fs.readdirSync(strategyDir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 5)) {
        const content = readMdFile(path.join(strategyDir, file)) || ''
        const stat = fs.statSync(path.join(strategyDir, file))
        const title = content.split('\n').find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || file.replace('.md', '')
        ideation.push({ id: `strategy-${file}`, source: 'STRATEGY', type: 'strategy', title, preview: content.split('\n').slice(0, 15).join('\n'), date: stat.mtime.toISOString().split('T')[0], file: `strategy/${file}`, size: stat.size })
      }
    }
  } catch { /* skip */ }
  ideation.sort((a, b) => b.date.localeCompare(a.date))
  res.json({ ideation, count: ideation.length, sources: ['SYNTHESIZER', 'STRATEGY'], timestamp: new Date().toISOString() })
})

// ── Observability ────────────────────────────────────────────

const FLOW_STATE_DIR = path.join(ERISMORN_ROOT, '.openclaw-flow')

router.get('/observability/state', (req, res) => {
  const state = readJsonFile(path.join(FLOW_STATE_DIR, 'state.json'))
  const spawned = readJsonFile(path.join(FLOW_STATE_DIR, 'spawned.json'))
  const memory = readJsonFile(path.join(FLOW_STATE_DIR, 'memory.json'))
  const agents = Object.values(state?.agents || {}) as any[]
  const swarms = Object.values(state?.swarms || {}) as any[]
  const tasks = Object.values(state?.tasks || {}) as any[]
  const spawnedList = Object.values(spawned || {}) as any[]
  res.json({ agents, swarms, tasks, spawned: spawnedList, memory: memory || {}, timestamp: new Date().toISOString() })
})

// ── Memory browser ───────────────────────────────────────────

router.get('/memory/today', (req, res) => {
  const content = readMdFile(path.join(ERISMORN_ROOT, `memory/${getTodayStr()}.md`))
  res.json({ date: getTodayStr(), content: content || '# No memory file for today yet', exists: !!content })
})

router.get('/memory/list', (req, res) => {
  const memoryDir = path.join(ERISMORN_ROOT, 'memory')
  const result: any = { dailyLogs: [], subdirs: [], rootFiles: [] }
  try {
    for (const entry of fs.readdirSync(memoryDir, { withFileTypes: true })) {
      const fullPath = path.join(memoryDir, entry.name)
      if (entry.isDirectory()) {
        try { result.subdirs.push({ name: entry.name, fileCount: fs.readdirSync(fullPath).filter(f => f.endsWith('.md') || f.endsWith('.json')).length }) } catch { /* skip */ }
      } else if (/^\d{4}-\d{2}-\d{2}\.md$/.test(entry.name)) {
        const stat = fs.statSync(fullPath)
        result.dailyLogs.push({ date: entry.name.replace('.md', ''), size: stat.size, mtime: stat.mtime.toISOString() })
      }
    }
    result.dailyLogs.sort((a: any, b: any) => b.date.localeCompare(a.date))
  } catch { /* skip */ }
  res.json(result)
})

// ── Claude-mem bridge ────────────────────────────────────────

const CLAUDE_MEM_BASE = 'http://localhost:37777'

router.get('/claude-mem/health', async (req, res) => {
  try {
    const response = await fetch(`${CLAUDE_MEM_BASE}/health`)
    const data = await response.json()
    res.json({ ...data, available: true })
  } catch { res.json({ available: false, error: 'Claude Code not running' }) }
})

router.get('/claude-mem/observations', async (req, res) => {
  const { offset = '0', limit = '20', project, type } = req.query
  try {
    let url = `${CLAUDE_MEM_BASE}/api/observations?offset=${offset}&limit=${limit}`
    if (project) url += `&project=${encodeURIComponent(project as string)}`
    if (type) url += `&type=${encodeURIComponent(type as string)}`
    const response = await fetch(url)
    res.json(await response.json())
  } catch { res.json({ items: [], available: false }) }
})

export default router
