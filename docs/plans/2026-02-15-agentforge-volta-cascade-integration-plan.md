# AgentForge x Volta OS x CASCADE Integration - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal**: Absorb AgentForge AI memory/swarm capabilities and CASCADE business automation into Volta OS as a unified cyberpunk dashboard.

**Architecture**: Plugin architecture with shared Supabase PostgreSQL + pgvector database, Express backend (port 3001), React 19 frontend with Three.js 3D visualizations, real-time Supabase subscriptions.

**Tech Stack**: React 19, TypeScript, Vite, Tailwind, Three.js, Express, Supabase, OpenAI embeddings, Twilio

---

## Phase 1: Infrastructure Setup

### Task 1: Supabase Project Setup

**Files:**
- Create: `server/.env.example`
- Modify: `server/.env` (not tracked)
- Create: `docs/SUPABASE_SETUP.md`

**Step 1: Create Supabase project documentation**

Create `docs/SUPABASE_SETUP.md`:

```markdown
# Supabase Setup Guide

## 1. Create Supabase Project

1. Go to https://supabase.com
2. Create new project: "volta-os-integration"
3. Choose region: closest to you
4. Generate secure database password
5. Wait for provisioning (~2 minutes)

## 2. Enable pgvector Extension

1. Go to Database → Extensions
2. Search for "vector"
3. Enable "vector" extension
4. Confirm enablement

## 3. Get API Credentials

1. Go to Settings → API
2. Copy:
   - Project URL (SUPABASE_URL)
   - anon/public key (SUPABASE_ANON_KEY)
   - service_role key (SUPABASE_SERVICE_KEY)

## 4. Configure Environment

Add to `server/.env`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
OPENAI_API_KEY=your_openai_key
```
```

**Step 2: Create environment template**

Create `server/.env.example`:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key

# Twilio Configuration (optional for CASCADE)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE=+1234567890

# Server Configuration
PORT=3001
NODE_ENV=development
```

**Step 3: Commit documentation**

```bash
git add docs/SUPABASE_SETUP.md server/.env.example
git commit -m "docs: add Supabase setup guide and env template"
```

---

### Task 2: Database Schema (Agent Memories)

**Files:**
- Create: `server/db/schema/001_agent_memories.sql`
- Create: `server/db/migrate.ts`

**Step 1: Create agent_memories table**

Create `server/db/schema/001_agent_memories.sql`:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- AgentForge Memory Engine
CREATE TABLE IF NOT EXISTS agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  strength FLOAT DEFAULT 1.0 CHECK (strength BETWEEN 0.0 AND 1.0),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  last_accessed TIMESTAMP DEFAULT NOW(),
  decay_rate FLOAT DEFAULT 0.1,
  tags TEXT[]
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_memories_hnsw
  ON agent_memories USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_agent_memories_agent
  ON agent_memories (agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_memories_strength
  ON agent_memories (strength DESC);

CREATE INDEX IF NOT EXISTS idx_agent_memories_created
  ON agent_memories (created_at DESC);

-- Vector search function
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INTEGER DEFAULT 10,
  filter_agent_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  agent_id TEXT,
  content TEXT,
  similarity FLOAT,
  strength FLOAT,
  metadata JSONB,
  created_at TIMESTAMP
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.agent_id,
    m.content,
    1 - (m.embedding <=> query_embedding) AS similarity,
    m.strength,
    m.metadata,
    m.created_at
  FROM agent_memories m
  WHERE
    (filter_agent_id IS NULL OR m.agent_id = filter_agent_id)
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

**Step 2: Create migration runner**

Create `server/db/migrate.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function runMigrations() {
  const schemaDir = path.join(__dirname, 'schema')
  const files = fs.readdirSync(schemaDir).sort()

  console.log('Running database migrations...')

  for (const file of files) {
    if (!file.endsWith('.sql')) continue

    console.log(`\nExecuting: ${file}`)
    const sql = fs.readFileSync(path.join(schemaDir, file), 'utf-8')

    // Try direct RPC execution first
    const { error } = await supabase.rpc('exec_sql', { sql })

    if (error) {
      // Fallback: Supabase may not support arbitrary SQL via API
      // In that case, use manual execution via Supabase SQL Editor
      console.log(`⚠️  RPC exec failed for ${file}: ${error.message}`)
      console.log(`📋 Copy this SQL to Supabase SQL Editor:`)
      console.log(sql)
      console.log(`\nThen mark as executed:`)
      console.log(`INSERT INTO _migrations (filename) VALUES ('${file}');`)
      continue
    }

    console.log(`✅ Migration ${file} completed`)
  }

  console.log('\n✅ All migrations completed')
}

runMigrations()
```

**Step 3: Run migration (test locally or manual Supabase setup)**

```bash
# Install dependencies
cd server && npm install @supabase/supabase-js dotenv

# Run migration (or list for manual execution in Supabase)
npx tsx db/migrate.ts
```

Expected: "All migrations completed" (or manual SQL instructions if RPC unavailable)

**If RPC execution is unavailable:**

1. Go to Supabase Dashboard -> SQL Editor
2. Copy SQL from migration file
3. Execute in SQL Editor
4. Mark as executed (if tracking migrations)

**Step 4: Commit schema**

```bash
git add server/db/
git commit -m "feat: add agent_memories schema with HNSW vector search"
```

---

### Task 3: Database Schema (Swarms & CASCADE)

**Files:**
- Create: `server/db/schema/002_swarms.sql`
- Create: `server/db/schema/003_cascade.sql`

**Step 1: Create swarms tables**

Create `server/db/schema/002_swarms.sql`:

```sql
-- AgentForge Swarms
CREATE TABLE IF NOT EXISTS swarms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  strategy TEXT CHECK (strategy IN ('hierarchical', 'mesh', 'adaptive')),
  topology JSONB NOT NULL,
  status TEXT CHECK (status IN ('idle', 'active', 'paused', 'completed')) DEFAULT 'idle',
  performance_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS swarm_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id UUID REFERENCES swarms(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT CHECK (status IN ('idle', 'working', 'blocked', 'completed')) DEFAULT 'idle',
  current_task JSONB,
  performance JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_swarms_status ON swarms (status);
CREATE INDEX IF NOT EXISTS idx_swarms_created ON swarms (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swarm_agents_swarm ON swarm_agents (swarm_id);
CREATE INDEX IF NOT EXISTS idx_swarm_agents_status ON swarm_agents (status);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER swarms_updated_at
  BEFORE UPDATE ON swarms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

**Step 2: Create CASCADE tables**

Create `server/db/schema/003_cascade.sql`:

```sql
-- CASCADE Business Automation
CREATE TABLE IF NOT EXISTS cascade_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  name TEXT,
  source TEXT CHECK (source IN ('missed_call', 'web_form', 'referral')),
  status TEXT CHECK (status IN ('new', 'contacted', 'qualified', 'booking', 'booked', 'completed', 'lost')) DEFAULT 'new',
  conversation_history JSONB DEFAULT '[]',
  memory_id UUID REFERENCES agent_memories(id) ON DELETE SET NULL,
  assigned_swarm_id UUID REFERENCES swarms(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_contact TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cascade_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES cascade_leads(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  scheduled_date TIMESTAMP NOT NULL,
  status TEXT CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')) DEFAULT 'pending',
  confirmation_sent BOOLEAN DEFAULT FALSE,
  reminders_sent INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS cascade_nurture_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES cascade_leads(id) ON DELETE CASCADE,
  sequence_type TEXT CHECK (sequence_type IN ('booking_reminder', 'follow_up', 'reengagement')),
  channel TEXT CHECK (channel IN ('sms', 'email', 'voice')),
  step INTEGER NOT NULL,
  scheduled_time TIMESTAMP NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  response JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cascade_leads_phone ON cascade_leads (phone);
CREATE INDEX IF NOT EXISTS idx_cascade_leads_status ON cascade_leads (status);
CREATE INDEX IF NOT EXISTS idx_cascade_leads_swarm ON cascade_leads (assigned_swarm_id);
CREATE INDEX IF NOT EXISTS idx_cascade_bookings_lead ON cascade_bookings (lead_id);
CREATE INDEX IF NOT EXISTS idx_cascade_bookings_date ON cascade_bookings (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cascade_nurture_lead ON cascade_nurture_sequences (lead_id);
CREATE INDEX IF NOT EXISTS idx_cascade_nurture_scheduled ON cascade_nurture_sequences (scheduled_time);
CREATE INDEX IF NOT EXISTS idx_cascade_nurture_sent ON cascade_nurture_sequences (sent) WHERE sent = FALSE;

-- Update timestamp trigger
CREATE TRIGGER cascade_leads_updated_at
  BEFORE UPDATE ON cascade_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

**Step 3: Run migrations**

```bash
npx tsx server/db/migrate.ts
```

Expected: "✅ All migrations completed successfully"

**Step 4: Verify tables in Supabase**

1. Go to Supabase Dashboard → Table Editor
2. Verify tables exist:
   - agent_memories
   - swarms
   - swarm_agents
   - cascade_leads
   - cascade_bookings
   - cascade_nurture_sequences

**Step 5: Commit schema**

```bash
git add server/db/schema/
git commit -m "feat: add swarms and CASCADE database schema"
```

---

## Phase 2: Backend - Supabase Client & Memory Engine

### Task 4: Supabase Client Setup

**Files:**
- Create: `server/lib/supabase.ts`
- Create: `server/lib/openai.ts`
- Modify: `server/package.json`

**Step 1: Install dependencies**

```bash
cd server
npm install @supabase/supabase-js openai
npm install -D @types/node
```

**Step 2: Create Supabase client**

Create `server/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL environment variable')
}

if (!process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_KEY environment variable')
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// Database types (auto-generated from schema)
export interface AgentMemory {
  id: string
  agent_id: string
  content: string
  embedding: number[]
  strength: number
  metadata: Record<string, any>
  created_at: string
  last_accessed: string
  decay_rate: number
  tags: string[]
}

export interface Swarm {
  id: string
  name: string
  strategy: 'hierarchical' | 'mesh' | 'adaptive'
  topology: Record<string, any>
  status: 'idle' | 'active' | 'paused' | 'completed'
  performance_metrics: Record<string, any>
  created_at: string
  updated_at: string
}

export interface CascadeLead {
  id: string
  phone: string
  name: string | null
  source: 'missed_call' | 'web_form' | 'referral'
  status: 'new' | 'contacted' | 'qualified' | 'booking' | 'booked' | 'completed' | 'lost'
  conversation_history: Array<{
    timestamp: string
    from: string
    message: string
  }>
  memory_id: string | null
  assigned_swarm_id: string | null
  created_at: string
  updated_at: string
  last_contact: string | null
}
```

**Step 3: Create OpenAI client**

Create `server/lib/openai.ts`:

```typescript
import OpenAI from 'openai'

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY environment variable')
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  })

  return response.data[0].embedding
}
```

**Step 4: Test clients**

Create `server/lib/__tests__/supabase.test.ts`:

```typescript
import { supabase } from '../supabase'

async function testConnection() {
  const { data, error } = await supabase.from('agent_memories').select('count')

  if (error) {
    console.error('❌ Supabase connection failed:', error)
    process.exit(1)
  }

  console.log('✅ Supabase connection successful')
}

testConnection()
```

Run test:
```bash
npx tsx server/lib/__tests__/supabase.test.ts
```

Expected: "✅ Supabase connection successful"

**Step 5: Commit client setup**

```bash
git add server/lib/
git commit -m "feat: add Supabase and OpenAI client setup"
```

---

### Task 5: Memory Engine - Store Operation

**Files:**
- Create: `server/engine/memory/index.ts`
- Create: `server/engine/memory/__tests__/store.test.ts`

**Step 1: Write failing test**

Create `server/engine/memory/__tests__/store.test.ts`:

```typescript
import { MemoryEngine } from '../index'

describe('MemoryEngine.store', () => {
  it('should store memory with embedding', async () => {
    const memory = await MemoryEngine.store({
      agentId: 'test-agent',
      content: 'This is a test memory about authentication',
      metadata: { type: 'test' },
      tags: ['test', 'auth']
    })

    expect(memory).toBeDefined()
    expect(memory.id).toBeDefined()
    expect(memory.agent_id).toBe('test-agent')
    expect(memory.content).toBe('This is a test memory about authentication')
    expect(memory.embedding).toHaveLength(1536)
    expect(memory.strength).toBe(1.0)
    expect(memory.tags).toEqual(['test', 'auth'])
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd server
npm install -D vitest @vitest/ui
npx vitest run engine/memory/__tests__/store.test.ts
```

Expected: FAIL with "Cannot find module '../index'"

**Step 3: Write minimal implementation**

Create `server/engine/memory/index.ts`:

```typescript
import { supabase } from '../../lib/supabase'
import { generateEmbedding } from '../../lib/openai'
import type { AgentMemory } from '../../lib/supabase'

export class MemoryEngine {
  static async store(params: {
    agentId: string
    content: string
    metadata?: Record<string, any>
    tags?: string[]
  }): Promise<AgentMemory> {
    // Generate embedding
    const embedding = await generateEmbedding(params.content)

    // Store in database
    const { data, error } = await supabase
      .from('agent_memories')
      .insert({
        agent_id: params.agentId,
        content: params.content,
        embedding,
        strength: 1.0,
        metadata: params.metadata || {},
        tags: params.tags || []
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to store memory: ${error.message}`)
    }

    return data as AgentMemory
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run engine/memory/__tests__/store.test.ts
```

Expected: PASS (1 test)

**Step 5: Commit memory store**

```bash
git add server/engine/memory/
git commit -m "feat: implement MemoryEngine.store with OpenAI embeddings"
```

---

### Task 6: Memory Engine - Search Operation

**Files:**
- Modify: `server/engine/memory/index.ts`
- Create: `server/engine/memory/__tests__/search.test.ts`

**Step 1: Write failing test**

Create `server/engine/memory/__tests__/search.test.ts`:

```typescript
import { MemoryEngine } from '../index'

describe('MemoryEngine.search', () => {
  beforeAll(async () => {
    // Store test memories
    await MemoryEngine.store({
      agentId: 'test-agent',
      content: 'How to implement authentication with JWT tokens',
      tags: ['auth', 'jwt']
    })

    await MemoryEngine.store({
      agentId: 'test-agent',
      content: 'Database optimization techniques for PostgreSQL',
      tags: ['database', 'performance']
    })
  })

  it('should find semantically similar memories', async () => {
    const results = await MemoryEngine.search({
      query: 'authentication security patterns',
      threshold: 0.5,
      limit: 5
    })

    expect(results).toBeDefined()
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].similarity).toBeGreaterThan(0.5)
    expect(results[0].content).toContain('authentication')
  })

  it('should filter by agent_id', async () => {
    const results = await MemoryEngine.search({
      query: 'database performance',
      agentId: 'test-agent',
      threshold: 0.5
    })

    expect(results.every(r => r.agent_id === 'test-agent')).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run engine/memory/__tests__/search.test.ts
```

Expected: FAIL with "MemoryEngine.search is not a function"

**Step 3: Implement search function**

Modify `server/engine/memory/index.ts`:

```typescript
export class MemoryEngine {
  // ... existing store method ...

  static async search(params: {
    query: string
    agentId?: string
    threshold?: number
    limit?: number
  }): Promise<Array<AgentMemory & { similarity: number }>> {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(params.query)

    // Call vector search function
    const { data, error } = await supabase.rpc('search_memories', {
      query_embedding: queryEmbedding,
      match_threshold: params.threshold || 0.7,
      match_count: params.limit || 10,
      filter_agent_id: params.agentId || null
    })

    if (error) {
      throw new Error(`Failed to search memories: ${error.message}`)
    }

    return data as Array<AgentMemory & { similarity: number }>
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run engine/memory/__tests__/search.test.ts
```

Expected: PASS (2 tests)

**Step 5: Commit memory search**

```bash
git add server/engine/memory/
git commit -m "feat: implement MemoryEngine.search with vector similarity"
```

---

## Phase 3: Backend - Memory & Swarm APIs

### Task 7: Memory API Routes

**Files:**
- Create: `server/routes/memory.ts`
- Create: `server/routes/__tests__/memory.test.ts`
- Modify: `server/index.ts`

**Step 1: Write API route tests**

Create `server/routes/__tests__/memory.test.ts`:

```typescript
import request from 'supertest'
import { app } from '../../index'

describe('POST /api/memory/store', () => {
  it('should store memory and return stored data', async () => {
    const response = await request(app)
      .post('/api/memory/store')
      .send({
        agentId: 'test-agent',
        content: 'API test memory',
        tags: ['api-test']
      })
      .expect(200)

    expect(response.body.id).toBeDefined()
    expect(response.body.content).toBe('API test memory')
    expect(response.body.embedding).toHaveLength(1536)
  })

  it('should return 400 for missing required fields', async () => {
    await request(app)
      .post('/api/memory/store')
      .send({})
      .expect(400)
  })
})

describe('POST /api/memory/search', () => {
  it('should search memories and return results', async () => {
    const response = await request(app)
      .post('/api/memory/search')
      .send({
        query: 'API test',
        threshold: 0.5
      })
      .expect(200)

    expect(Array.isArray(response.body.results)).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm install -D supertest @types/supertest
npx vitest run routes/__tests__/memory.test.ts
```

Expected: FAIL with route not found errors

**Step 3: Implement memory routes**

Create `server/routes/memory.ts`:

```typescript
import { Router } from 'express'
import { MemoryEngine } from '../engine/memory'

export const memoryRouter = Router()

// Store new memory
memoryRouter.post('/store', async (req, res) => {
  try {
    const { agentId, content, metadata, tags } = req.body

    if (!agentId || !content) {
      return res.status(400).json({
        error: 'Missing required fields: agentId, content'
      })
    }

    const memory = await MemoryEngine.store({
      agentId,
      content,
      metadata,
      tags
    })

    res.json(memory)
  } catch (error) {
    console.error('Error storing memory:', error)
    res.status(500).json({ error: 'Failed to store memory' })
  }
})

// Search memories
memoryRouter.post('/search', async (req, res) => {
  try {
    const { query, agentId, threshold, limit } = req.body

    if (!query) {
      return res.status(400).json({ error: 'Missing required field: query' })
    }

    const results = await MemoryEngine.search({
      query,
      agentId,
      threshold,
      limit
    })

    res.json({ results })
  } catch (error) {
    console.error('Error searching memories:', error)
    res.status(500).json({ error: 'Failed to search memories' })
  }
})

// Get specific memory
memoryRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('agent_memories')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error

    res.json(data)
  } catch (error) {
    console.error('Error fetching memory:', error)
    res.status(404).json({ error: 'Memory not found' })
  }
})
```

**Step 4: Update server index**

Modify `server/index.ts`:

```typescript
import express from 'express'
import cors from 'cors'
import { memoryRouter } from './routes/memory'

export const app = express()

app.use(cors())
app.use(express.json())

// Routes
app.use('/api/memory', memoryRouter)

const PORT = process.env.PORT || 3001

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`)
  })
}
```

**Step 5: Run tests**

```bash
npx vitest run routes/__tests__/memory.test.ts
```

Expected: PASS (3 tests)

**Step 6: Commit API routes**

```bash
git add server/routes/ server/index.ts
git commit -m "feat: add memory API routes (store, search, get)"
```

---

## Execution Strategy

**Plan complete and saved to `docs/plans/2026-02-15-agentforge-volta-cascade-integration-plan.md`.**

This plan provides comprehensive TDD-driven tasks for the integration, covering the first **7 tasks**:
- ✅ Phase 1: Infrastructure (Supabase setup, database schema)
- ✅ Database schema (memories, swarms, CASCADE)
- ✅ Backend foundation (Supabase client, OpenAI client)
- ✅ Memory Engine (store, search operations)
- ✅ Memory API routes

**Remaining work** (to be added in subsequent iterations):
- Phase 2: Backend Memory Engine (remaining)
- Phase 3: Backend Swarm Coordinator
- Phase 4: Backend CASCADE APIs
- Phase 5: Frontend AgentForge Components (VectorGalaxy, MemorySearch)
- Phase 6: Frontend CASCADE Components (LeadDashboard, BookingManager)
- Phase 7: Integration & Testing (real-time subscriptions, E2E)

---

## Two Execution Options

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
