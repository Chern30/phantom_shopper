/**
 * Mystery Shopper — Backend Server
 *
 * Endpoints:
 *   POST /api/generate-personas      → AI-generated persona suggestions
 *   POST /api/generate-agent-names   → AI-generated agent names per persona
 *   POST /api/experiment             → Create & start experiment
 *   GET  /api/experiment/:id/status  → Current agent snapshot
 *   GET  /api/experiment/:id/stream  → SSE real-time updates
 *
 * Usage:
 *   npm install
 *   OPENAI_API_KEY=xxx TINYFISH_API_KEY=xxx node server.js
 */

import express from 'express'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Load .env from repo root ───────────────────────────────────────────────

try {
  const env = readFileSync(join(__dirname, '..', '..', '..', '.env'), 'utf8')
  for (const line of env.split('\n')) {
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    const val = line.slice(eq + 1).trim()
    if (key && !process.env[key]) process.env[key] = val
  }
} catch { /* .env not found — rely on real env vars */ }

const OPENAI_API_KEY   = process.env.OPENAI_API_KEY
const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY
const TINYFISH_BASE    = 'https://agent.tinyfish.ai'
const PORT             = 3000
const MIN_STEPS        = 4
const MAX_STEPS        = 12

// ── OpenAI helper ─────────────────────────────────────────────────────────

async function callOpenAI(messages, { jsonMode = true, model = 'gpt-4o-mini' } = {}) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      messages,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI ${res.status}: ${text}`)
  }
  const data = await res.json()
  return data.choices[0].message.content
}

// ── POST /api/generate-personas ───────────────────────────────────────────

async function generatePersonasSuggestions(brandName, brandUrl, category) {
  const content = await callOpenAI([
    {
      role: 'system',
      content: `You generate realistic customer persona suggestions for mystery shopping experiments. Return valid JSON only.`,
    },
    {
      role: 'user',
      content: `Generate 4 distinct customer personas who might shop for the following:

Brand: ${brandName} (${brandUrl})
Product / Category: ${category}

Each persona should have a different mindset, budget sensitivity, and decision-making style.
Give them a short catchy name (2–4 words) and a 2-sentence description of how they shop.

Return JSON:
{
  "personas": [
    { "id": "slug-here", "name": "Persona Name", "description": "Two sentences about their shopping behaviour." }
  ]
}`,
    },
  ])
  const { personas } = JSON.parse(content)
  return personas
}

// ── POST /api/generate-agent-names ───────────────────────────────────────

async function generateAgentNamesForPersonas(personas) {
  const content = await callOpenAI([
    {
      role: 'system',
      content: `You generate short, memorable human first names for AI shopping agents. Each name should subtly reflect the persona's character. Return valid JSON only.`,
    },
    {
      role: 'user',
      content: `Generate agent names for the following personas:

${personas.map(p => `Persona: ${p.name}\nDescription: ${p.description}\nCount: ${p.count}`).join('\n\n')}

Return JSON:
{
  "agentNames": [
    { "personaId": "<id>", "names": ["Name1", "Name2", ...] }
  ]
}`,
    },
  ])
  const { agentNames } = JSON.parse(content)
  return agentNames
}

// ── TinyFish: browse one page ─────────────────────────────────────────────

async function browsePage(url, onEvent) {
  if (!TINYFISH_API_KEY) throw new Error('TINYFISH_API_KEY not set')

  const goal = `STEP 1 — Handle overlays (do this first):
If there is a CAPTCHA, cookie consent, or popup blocking content — solve or dismiss it before continuing.

STEP 2 — Extract and return:
Return ONLY valid JSON with no markdown fences:
{
  "page_text": "<main readable content: headlines, product names, prices, descriptions. 3-6 sentences max.>",
  "links": {
    "0": { "text": "<link label>", "url": "<absolute URL>" },
    "1": { "text": "<link label>", "url": "<absolute URL>" }
  }
}
Include up to 15 relevant content links (search results, products, articles, categories).
Use absolute URLs. Exclude nav chrome, login, cookie notices, footer legal, share buttons.`

  const res = await fetch(`${TINYFISH_BASE}/v1/automation/run-sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': TINYFISH_API_KEY },
    body: JSON.stringify({
      url,
      goal,
      browser_profile: 'stealth',
      proxy_config: { enabled: true, country_code: 'US' },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TinyFish HTTP ${res.status}: ${text}`)
  }

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer    = ''
  let result    = null
  let eventType = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      const t = line.trim()
      if (!t) { eventType = null; continue }
      if (t.startsWith('event:')) { eventType = t.slice(6).trim(); continue }
      if (!t.startsWith('data:')) continue
      const raw = t.slice(5).trim()
      if (!raw || raw === '[DONE]') continue
      let ev
      try { ev = JSON.parse(raw) } catch { continue }
      const type = eventType || ev.type
      if (type === 'STREAMING_URL') onEvent?.('streaming_url', ev.url ?? ev.streaming_url)
      if (type === 'PROGRESS')      onEvent?.('progress', ev.purpose ?? ev.message ?? '…')
      if (type === 'COMPLETE')      result = ev.result
      eventType = null
    }
  }

  if (!result) throw new Error('TinyFish returned no result')

  const text     = typeof result === 'string' ? result : JSON.stringify(result)
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const match    = stripped.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`Cannot parse TinyFish result: ${text.slice(0, 200)}`)
  return JSON.parse(match[0])
}

// ── OpenAI: decide next action ────────────────────────────────────────────

async function decideAction(agentState, pageState, history, brandName, brandUrl, nudge = null) {
  const { agentName, personaLabel, personaDescription, category } = agentState

  const linksText = Object.entries(pageState.links ?? {})
    .map(([i, l]) => `[${i}] ${l.text}  —  ${l.url}`)
    .join('\n')

  const stepNum = history.length + 1
  const progress = stepNum < MIN_STEPS
    ? `[Step ${stepNum} — you must explore at least ${MIN_STEPS - stepNum} more page(s) before finishing]`
    : `[Step ${stepNum} — you may finish if you have found what you need]`

  const systemPrompt = `You are ${agentName}, a ${personaLabel}.

${personaDescription}

You are browsing the web looking for: ${category}
The brand being tracked is: ${brandName} (${brandUrl})

At each step you receive the text content of a web page and a numbered dictionary of links.
You have exactly two possible actions. Respond with valid JSON using one of:

Option 1 — click a link:
{ "reasoning": "your inner monologue", "action": "click", "index": <number> }

Option 2 — start a new search:
{ "reasoning": "your inner monologue", "action": "search", "query": "<search query>" }

Use "search" when the page is a dead end or has no relevant links.
When you have finished browsing, use action "search" with query one of:
  "DONE:purchased_brand"      — you found what you wanted at ${brandName}
  "DONE:purchased_competitor" — you found a better option elsewhere
  "DONE:abandoned"            — you gave up, couldn't find what you wanted`

  const historyMessages = history.flatMap(h => [
    { role: 'user',      content: `Step ${h.step}\n\nPAGE:\n${h.page_text}\n\nWhat do you do next?` },
    { role: 'assistant', content: JSON.stringify({ reasoning: h.reasoning, action: h.action, index: h.index, query: h.query }) },
  ])

  const messages = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: `${progress}\n\nPAGE:\n${pageState.page_text}\n\nAVAILABLE LINKS:\n${linksText || '(none)'}\n\nWhat do you do next?` },
    ...(nudge ? [{ role: 'user', content: nudge }] : []),
  ]

  const raw      = await callOpenAI(messages, { jsonMode: true, model: 'gpt-4o' })
  return JSON.parse(raw)
}

// ── Start URL from platform ───────────────────────────────────────────────

function startUrl(platform, category, brandName) {
  const q = encodeURIComponent(`${category} ${brandName}`)
  const platforms = {
    google:    `https://www.google.com/search?q=${q}`,
    reddit:    `https://www.reddit.com/search/?q=${encodeURIComponent(category + ' ' + brandName + ' review')}`,
    amazon:    `https://www.amazon.com/s?k=${encodeURIComponent(category)}`,
    youtube:   `https://www.youtube.com/results?search_query=${encodeURIComponent(category + ' review')}`,
    pinterest: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(category)}`,
    tiktok:    `https://www.tiktok.com/search?q=${encodeURIComponent(category)}`,
  }
  return platforms[platform] ?? `https://duckduckgo.com/?q=${q}`
}

// ── Agent state helpers ───────────────────────────────────────────────────

function inferPhase(stepCount, outcome) {
  if (outcome) return outcome === 'abandoned' ? 'gave_up' : 'purchased'
  return stepCount >= 4 ? 'choosing' : 'exploring'
}

function parseOutcome(query) {
  if (query === 'DONE:purchased_brand')      return 'purchased_brand'
  if (query === 'DONE:purchased_competitor') return 'purchased_competitor'
  if (query === 'DONE:abandoned')            return 'abandoned'
  return null
}

// ── Experiment store ──────────────────────────────────────────────────────
// experimentId -> { brand, agentStates, agentSse, agentFullHistory, done, sseClients }

const experiments = new Map()

function emitToExperiment(experimentId, event, data) {
  const exp = experiments.get(experimentId)
  if (!exp) return
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of exp.sseClients) {
    try { res.write(payload) } catch {}
  }
}

function emitToAgent(experimentId, agentId, event, data) {
  const exp = experiments.get(experimentId)
  if (!exp) return
  const clients = exp.agentSse.get(agentId)
  if (!clients) return
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) {
    try { res.write(payload) } catch {}
  }
}

// ── Agent loop ────────────────────────────────────────────────────────────

async function runAgent(experimentId, agentId) {
  const exp   = experiments.get(experimentId)
  const agent = exp.agentStates.get(agentId)
  const { brand } = exp

  let currentUrl = startUrl(agent.platform, brand.category, brand.name)
  const history  = []

  function patch(updates) {
    Object.assign(agent, updates)
    // Sync compatibility fields
    agent.step   = agent.stepCount
    agent.status = agent.outcome
      ? (agent.outcome === 'abandoned' ? 'error' : 'done')
      : (updates.status ?? agent.status ?? 'idle')
    emitToExperiment(experimentId, 'step', { ...agent })
  }

  function emitAgent(event, data) {
    emitToAgent(experimentId, agentId, event, data)
  }

  patch({ status: 'idle', phase: 'exploring', currentUrl, narration: 'Starting up…', stepCount: 0 })
  emitAgent('agent:started', { id: agentId })

  for (let step = 1; step <= MAX_STEPS; step++) {
    patch({ stepCount: step, step })

    // ── TinyFish ──
    patch({ status: 'tinyfish' })
    emitAgent('tinyfish:start', { step, url: currentUrl })

    let pageState
    try {
      pageState = await browsePage(currentUrl, (type, value) => {
        if (type === 'progress') {
          patch({ narration: value })
          emitAgent('tinyfish:progress', { step, message: value })
        } else if (type === 'streaming_url') {
          emitAgent('tinyfish:streaming', { step, streamingUrl: value })
        }
      })
    } catch (err) {
      const msg = `Browse error: ${err.message}`
      patch({ status: 'error', outcome: 'abandoned', phase: 'gave_up', narration: msg })
      emitAgent('agent:error', { step, phase: 'tinyfish', message: err.message })
      return
    }

    emitAgent('tinyfish:complete', { step, pageState })

    // ── OpenAI ──
    patch({ status: 'openai' })
    emitAgent('openai:start', { step })

    let decision
    try {
      decision = await decideAction(agent, pageState, history, brand.name, brand.url)
    } catch (err) {
      const msg = `Decision error: ${err.message}`
      patch({ status: 'error', outcome: 'abandoned', phase: 'gave_up', narration: msg })
      emitAgent('agent:error', { step, phase: 'openai', message: err.message })
      return
    }

    emitAgent('openai:complete', { step, decision })

    // Enforce minimum steps
    if (decision.action === 'search' && decision.query?.startsWith('DONE') && step < MIN_STEPS) {
      const remaining = MIN_STEPS - step
      const nudge = `You tried to finish, but you've only visited ${step} page(s). Explore at least ${remaining} more before concluding.`
      try {
        decision = await decideAction(agent, pageState, history, brand.name, brand.url, nudge)
        emitAgent('openai:complete', { step, decision })
      } catch (err) {
        patch({ status: 'error', outcome: 'abandoned', phase: 'gave_up', narration: `Decision error: ${err.message}` })
        emitAgent('agent:error', { step, phase: 'openai', message: err.message })
        return
      }
    }

    // Build full history entry (with page_text + links for agent detail page)
    const fullEntry = {
      step,
      url:       currentUrl,
      page_text: pageState.page_text,
      links:     pageState.links ?? {},
      reasoning: decision.reasoning,
      action:    decision.action,
      index:     decision.index ?? null,
      query:     decision.query ?? null,
    }
    history.push(fullEntry)
    exp.agentFullHistory.get(agentId).push(fullEntry)

    // Lean entry on agent state (no page_text/links)
    agent.history.push({ step, url: currentUrl, reasoning: decision.reasoning,
      action: decision.action, index: decision.index ?? null, query: decision.query ?? null })

    emitAgent('step:complete', fullEntry)
    patch({ narration: decision.reasoning })

    // Handle DONE
    if (decision.action === 'search' && decision.query?.startsWith('DONE')) {
      const outcome = parseOutcome(decision.query) ?? 'abandoned'
      patch({ outcome, phase: inferPhase(step, outcome), status: outcome === 'abandoned' ? 'error' : 'done' })
      emitAgent('agent:done', { id: agentId })
      return
    }

    // Resolve next URL
    if (decision.action === 'search') {
      currentUrl = `https://duckduckgo.com/?q=${encodeURIComponent(decision.query)}`
    } else if (decision.action === 'click') {
      const chosen = (pageState.links ?? {})[String(decision.index)]
      if (!chosen) {
        const msg = `Link ${decision.index} not found`
        patch({ status: 'error', outcome: 'abandoned', phase: 'gave_up', narration: msg })
        emitAgent('agent:error', { step, phase: 'click', message: msg })
        return
      }
      currentUrl = chosen.url
    } else {
      const msg = `Unknown action: ${decision.action}`
      patch({ status: 'error', outcome: 'abandoned', phase: 'gave_up', narration: msg })
      emitAgent('agent:error', { step, phase: 'openai', message: msg })
      return
    }

    patch({ currentUrl, phase: inferPhase(step, null) })
  }

  patch({ status: 'error', outcome: 'abandoned', phase: 'gave_up', narration: 'Reached maximum steps without a conclusion.' })
  emitAgent('agent:done', { id: agentId })
}

async function runExperiment(experimentId) {
  const exp = experiments.get(experimentId)
  const agentIds = [...exp.agentStates.keys()]

  try {
    await Promise.all(agentIds.map(id => runAgent(experimentId, id)))
  } finally {
    exp.done = true
    emitToExperiment(experimentId, 'done', {})
  }
}

// ── Express ───────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  next()
})

// POST /api/generate-personas
app.post('/api/generate-personas', async (req, res) => {
  const { brandName, brandUrl, category } = req.body
  if (!brandName || !category) return res.status(400).json({ error: 'brandName and category are required' })
  try {
    const personas = await generatePersonasSuggestions(brandName, brandUrl ?? '', category)
    res.json({ personas })
  } catch (err) {
    console.error('[generate-personas]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/generate-agent-names
app.post('/api/generate-agent-names', async (req, res) => {
  const { personas } = req.body
  if (!Array.isArray(personas) || personas.length === 0) return res.status(400).json({ error: 'personas array required' })
  try {
    const agentNames = await generateAgentNamesForPersonas(personas)
    res.json({ agentNames })
  } catch (err) {
    console.error('[generate-agent-names]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/experiment
app.post('/api/experiment', async (req, res) => {
  const { brand, personas } = req.body
  if (!brand?.name || !Array.isArray(personas) || personas.length === 0) {
    return res.status(400).json({ error: 'brand and personas are required' })
  }

  const experimentId = randomUUID()
  const agentStates  = new Map()

  for (const persona of personas) {
    for (let i = 0; i < persona.agents.length; i++) {
      const agentEntry = persona.agents[i]
      const agentId    = `${experimentId.slice(0, 8)}-${persona.id}-${i + 1}`
      const agentName = agentEntry.name || `Agent ${i + 1}`
      agentStates.set(agentId, {
        // Core fields
        agentId,
        personaLabel:       persona.name,
        instanceNum:        i + 1,
        agentName,
        personaDescription: persona.description,
        category:           brand.category,
        platform:           agentEntry.platform,
        phase:              'exploring',
        outcome:            null,
        currentUrl:         null,
        narration:          'Waiting to start…',
        stepCount:          0,
        history:            [],
        // Compatibility fields for monitor UI
        id:     agentId,
        name:   agentName,
        goal:   `${persona.name} — ${persona.description}`,
        status: 'idle',
        step:   0,
      })
    }
  }

  const agentSse         = new Map([...agentStates.keys()].map(id => [id, new Set()]))
  const agentFullHistory = new Map([...agentStates.keys()].map(id => [id, []]))

  experiments.set(experimentId, {
    brand,
    agentStates,
    agentSse,
    agentFullHistory,
    done:       false,
    sseClients: new Set(),
  })

  // Start agents in background — don't await
  runExperiment(experimentId).catch(err => console.error('[runExperiment]', err))

  res.json({ experimentId })
})

// GET /api/experiment/:id/status
app.get('/api/experiment/:id/status', (req, res) => {
  const exp = experiments.get(req.params.id)
  if (!exp) return res.status(404).json({ error: 'Experiment not found' })
  res.json({
    agents: [...exp.agentStates.values()],
    done:   exp.done,
  })
})

// GET /api/experiment/:id/stream  (SSE — dashboard, all agents)
app.get('/api/experiment/:id/stream', (req, res) => {
  const exp = experiments.get(req.params.id)
  if (!exp) return res.status(404).end()

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const hb = setInterval(() => { try { res.write(': ping\n\n') } catch {} }, 20000)
  exp.sseClients.add(res)
  req.on('close', () => { clearInterval(hb); exp.sseClients.delete(res) })

  // Send snapshot immediately so the monitor UI can hydrate
  res.write(`event: snapshot\ndata: ${JSON.stringify([...exp.agentStates.values()])}\n\n`)
  if (exp.done) res.write(`event: done\ndata: {}\n\n`)
})

// GET /api/experiment/:expId/agent/:agentId/stream  (SSE — single agent detail)
app.get('/api/experiment/:expId/agent/:agentId/stream', (req, res) => {
  const { expId, agentId } = req.params
  const exp = experiments.get(expId)
  if (!exp) return res.status(404).end()
  const agent = exp.agentStates.get(agentId)
  if (!agent) return res.status(404).end()

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const hb = setInterval(() => { try { res.write(': ping\n\n') } catch {} }, 20000)
  exp.agentSse.get(agentId).add(res)
  req.on('close', () => { clearInterval(hb); exp.agentSse.get(agentId)?.delete(res) })

  // Send full snapshot with history (including page_text + links)
  const snapshot = { ...agent, history: exp.agentFullHistory.get(agentId) }
  res.write(`event: agent:snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`)
  if (exp.done || agent.status === 'done' || agent.status === 'error') {
    res.write(`event: agent:done\ndata: ${JSON.stringify({ id: agentId })}\n\n`)
  }
})

app.listen(PORT, () => {
  console.log(`\n  Mystery Shopper API → http://localhost:${PORT}`)
  if (!OPENAI_API_KEY)   console.warn('  ⚠  OPENAI_API_KEY not set')
  if (!TINYFISH_API_KEY) console.warn('  ⚠  TINYFISH_API_KEY not set')
  console.log()
})
