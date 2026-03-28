/**
 * Implementation 2 — Web UI Server
 *
 * Runs both persona agents server-side and streams real-time state to the browser via SSE.
 *
 * Usage:
 *   npm install
 *   TINYFISH_API_KEY=xxx OPENAI_API_KEY=xxx node server.js
 *   Open: http://localhost:3000
 */

import express from 'express'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

try {
  const env = readFileSync(join(__dirname, '..', '.env'), 'utf8')
  for (const line of env.split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
  }
} catch { /* .env not found */ }

const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY
const OPENAI_API_KEY   = process.env.OPENAI_API_KEY
const THUMIO_AUTH_KEY  = process.env.THUMIO_AUTH_KEY
const TINYFISH_BASE    = 'https://agent.tinyfish.ai'
const PORT             = 3000
const MAX_STEPS        = 12
const MIN_STEPS        = 6

// ── Personas ───────────────────────────────────────────────────────────────

const PERSONAS = [
  {
    id: 'young-couple',
    name: 'Young Couple — Baby Room',
    goal: 'Set up a cosy, affordable baby room for their first child',
    startUrl: 'https://duckduckgo.com/?q=IKEA+baby+nursery+room+setup+ideas',
    systemPrompt: `You are a young couple expecting your first baby in two months. You are excited but overwhelmed — you have no idea where to start with the nursery. Budget is tight (under $500 for the whole room). You are looking for essentials: a crib, storage, soft lighting. You gravitate toward anything labelled "nursery", "baby", or "kids". You avoid pages that feel too expensive or too generic.

At each step you receive the text content of a web page and a numbered dictionary of links.

You have exactly two possible actions. Respond with valid JSON using one of:

Option 1 — click a link:
{
  "reasoning": "your inner monologue as this couple",
  "action": "click",
  "index": <number from the links dictionary>
}

Option 2 — start a new search:
{
  "reasoning": "your inner monologue as this couple",
  "action": "search",
  "query": "<your search query>"
}

Use "search" when the page is a dead end or has no relevant links.
When you have explored enough and found what you need, use action "search" with query "DONE".`,
  },
  {
    id: 'single-man',
    name: 'Single Man — Broken Couch',
    goal: 'Find a replacement couch after breaking the old one',
    startUrl: 'https://duckduckgo.com/?q=IKEA+sofa+couch+buy',
    systemPrompt: `You are a single man in your early 30s. You just broke your couch — it is gone. You need a replacement ASAP. You live alone in a one-bedroom apartment. You want something comfortable for gaming and TV, ideally under $600, must fit through a standard door. You go straight for sofas and couches. You ignore anything about kids, bedrooms, kitchens, or outdoor furniture.

At each step you receive the text content of a web page and a numbered dictionary of links.

You have exactly two possible actions. Respond with valid JSON using one of:

Option 1 — click a link:
{
  "reasoning": "your inner monologue",
  "action": "click",
  "index": <number from the links dictionary>
}

Option 2 — start a new search:
{
  "reasoning": "your inner monologue",
  "action": "search",
  "query": "<your search query>"
}

Use "search" when the page is a dead end or has no relevant links.
When you have found a couch you would realistically buy, use action "search" with query "DONE".`,
  },
]

// ── State ──────────────────────────────────────────────────────────────────

function freshState(persona) {
  return {
    id:           persona.id,
    name:         persona.name,
    goal:         persona.goal,
    status:       'idle',   // idle | tinyfish | openai | done | error
    currentUrl:   null,
    streamingUrl: null,
    step:         0,
    history:      [],
  }
}

const agentState = Object.fromEntries(PERSONAS.map(p => [p.id, freshState(p)]))

// SSE clients: per-agent sets + 'all' channel for dashboard
const sseClients = Object.fromEntries(PERSONAS.map(p => [p.id, new Set()]))
sseClients['all'] = new Set()

function updateAgent(id, patch) {
  Object.assign(agentState[id], patch)
}

function emit(agentId, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  const targets = new Set([...(sseClients[agentId] ?? []), ...sseClients['all']])
  for (const res of targets) {
    try { res.write(payload) } catch {}
  }
}

// ── TinyFish: browse one page ──────────────────────────────────────────────

async function browsePage(agentId, url, step) {
  updateAgent(agentId, { status: 'tinyfish', currentUrl: url, streamingUrl: null })
  emit(agentId, 'tinyfish:start', { step, url })

  const goal = `STEP 1 — CAPTCHA AND POPUPS (do this first, before anything else):
Immediately after the page loads, check for:
- A CAPTCHA or reCAPTCHA challenge → solve it fully before continuing
- A cookie consent banner → accept or dismiss it
- Any modal or popup blocking content → close it
Do NOT proceed to Step 2 until the main page content is clearly visible.

STEP 2 — EXTRACT AND RETURN:
Return ONLY valid JSON with no markdown fences or extra text:
{
  "page_text": "<main readable content: headlines, product names, prices, descriptions. 3-6 sentences max.>",
  "links": {
    "0": { "text": "<link label>", "url": "<absolute URL>" },
    "1": { "text": "<link label>", "url": "<absolute URL>" }
  }
}
Include up to 15 relevant content links (search results, products, articles, categories).
Use absolute URLs. Exclude: nav chrome, login/signup, cookie notices, footer legal, share buttons.`

  const response = await fetch(`${TINYFISH_BASE}/v1/automation/run-sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': TINYFISH_API_KEY },
    body: JSON.stringify({
      url,
      goal,
      browser_profile: 'stealth',
      proxy_config: { enabled: true, country_code: 'US' },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`TinyFish HTTP ${response.status}: ${text}`)
  }

  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer    = ''
  let rawResult = null
  let eventType          = null
  let capturedStreamingUrl = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) { eventType = null; continue }
      if (trimmed.startsWith('event:')) { eventType = trimmed.slice(6).trim(); continue }
      if (!trimmed.startsWith('data:')) continue

      const raw = trimmed.slice(5).trim()
      if (!raw || raw === '[DONE]') continue

      let event
      try { event = JSON.parse(raw) } catch { continue }

      const type = eventType || event.type

      if (type === 'STREAMING_URL') {
        capturedStreamingUrl = event.url ?? event.streaming_url
        updateAgent(agentId, { streamingUrl: capturedStreamingUrl })
        emit(agentId, 'tinyfish:streaming', { step, streamingUrl: capturedStreamingUrl })
      } else if (type === 'PROGRESS') {
        const message = event.purpose ?? event.message ?? '...'
        emit(agentId, 'tinyfish:progress', { step, message })
      } else if (type === 'COMPLETE') {
        rawResult = event.result
      }

      eventType = null
    }
  }

  if (!rawResult) throw new Error('TinyFish returned no result')

  const text     = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult)
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const match    = stripped.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`Cannot parse TinyFish result: ${text.slice(0, 300)}`)

  const pageState = JSON.parse(match[0])

  // Attempt to capture a screenshot from the streaming session before it closes
  if (capturedStreamingUrl) {
    console.log(`[screenshot] streaming URL: ${capturedStreamingUrl}`)
    try {
      const snapRes = await fetch(`${capturedStreamingUrl}/screenshot`)
      console.log(`[screenshot] status: ${snapRes.status}, type: ${snapRes.headers.get('content-type')}`)
      if (snapRes.ok && snapRes.headers.get('content-type')?.includes('image')) {
        const buf = await snapRes.arrayBuffer()
        pageState.screenshot_base64 = Buffer.from(buf).toString('base64')
        console.log(`[screenshot] captured ${buf.byteLength} bytes`)
      }
    } catch (err) {
      console.log(`[screenshot] failed: ${err.message}`)
    }
  }

  emit(agentId, 'tinyfish:complete', { step, pageState })
  return pageState
}

// ── OpenAI: decide next action ─────────────────────────────────────────────

async function decide(agentId, persona, pageState, step, history, nudge = null) {
  updateAgent(agentId, { status: 'openai', streamingUrl: null })
  emit(agentId, 'openai:start', { step })

  const linksText = Object.entries(pageState.links ?? {})
    .map(([i, l]) => `[${i}] ${l.text}  —  ${l.url}`)
    .join('\n')

  const progress = step < MIN_STEPS
    ? `[Page ${step} of ${MIN_STEPS} minimum — keep exploring, do NOT finish yet]`
    : `[Page ${step} — you may finish if you have found what you need]`

  const userMessage = `${progress}\n\nPAGE CONTENT:\n${pageState.page_text}\n\nAVAILABLE LINKS:\n${linksText || '(none)'}\n\nWhat do you do next?`

  const historyMessages = history.flatMap(h => [
    { role: 'user', content: `Step ${h.step}\n\nPAGE CONTENT:\n${h.page_text}\n\nWhat do you do next?` },
    { role: 'assistant', content: JSON.stringify({ reasoning: h.reasoning, action: h.action, index: h.index, query: h.query }) },
  ])

  const messages = [
    { role: 'system', content: persona.systemPrompt },
    ...historyMessages,
    { role: 'user', content: userMessage },
  ]

  if (nudge) {
    messages.push({ role: 'user', content: nudge })
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenAI HTTP ${response.status}: ${text}`)
  }

  const data     = await response.json()
  const decision = JSON.parse(data.choices[0].message.content)
  emit(agentId, 'openai:complete', { step, decision })
  return decision
}

// ── Agent loop ─────────────────────────────────────────────────────────────

async function runAgent(persona) {
  const { id } = persona
  let currentUrl = persona.startUrl
  const history  = []

  Object.assign(agentState[id], freshState(persona))
  emit(id, 'agent:started', { id })

  for (let step = 1; step <= MAX_STEPS; step++) {
    updateAgent(id, { step })

    // TinyFish browses the page
    let pageState
    try {
      pageState = await browsePage(id, currentUrl, step)
    } catch (err) {
      emit(id, 'agent:error', { step, phase: 'tinyfish', message: err.message })
      updateAgent(id, { status: 'error', errorMessage: err.message, errorPhase: 'tinyfish' })
      return
    }

    // OpenAI decides next action
    let decision
    try {
      decision = await decide(id, persona, pageState, step, history)
    } catch (err) {
      emit(id, 'agent:error', { step, phase: 'openai', message: err.message })
      updateAgent(id, { status: 'error', errorMessage: err.message, errorPhase: 'openai' })
      return
    }

    const entry = {
      step,
      url:               currentUrl,
      page_text:         pageState.page_text,
      screenshot_base64: pageState.screenshot_base64 ?? null,
      links:             pageState.links ?? {},
      reasoning:         decision.reasoning,
      action:            decision.action,
      index:             decision.index ?? null,
      query:             decision.query ?? null,
    }
    history.push(entry)
    agentState[id].history.push(entry)
    emit(id, 'step:complete', entry)

    // Enforce minimum exploration — override premature DONE
    if (decision.action === 'search' && decision.query === 'DONE' && step < MIN_STEPS) {
      const remaining = MIN_STEPS - step
      const nudge = `You chose to finish, but you've only visited ${step} page${step === 1 ? '' : 's'}. You must explore at least ${remaining} more page${remaining === 1 ? '' : 's'} before finishing. Keep browsing.`
      try {
        decision = await decide(id, persona, pageState, step, history, nudge)
      } catch (err) {
        emit(id, 'agent:error', { step, phase: 'openai', message: err.message })
        updateAgent(id, { status: 'error', errorMessage: err.message, errorPhase: 'openai' })
        return
      }
    }

    // Resolve next URL
    if (decision.action === 'search') {
      if (decision.query === 'DONE') {
        updateAgent(id, { status: 'done' })
        emit(id, 'agent:done', { id })
        return
      }
      currentUrl = `https://duckduckgo.com/?q=${encodeURIComponent(decision.query)}`
    } else if (decision.action === 'click') {
      const chosen = (pageState.links ?? {})[String(decision.index)]
      if (!chosen) {
        const msg = `Link index ${decision.index} not found`
        emit(id, 'agent:error', { step, phase: 'click', message: msg })
        updateAgent(id, { status: 'error', errorMessage: msg, errorPhase: 'click' })
        return
      }
      currentUrl = chosen.url
    } else {
      const msg = `Unknown action: ${decision.action}`
      updateAgent(id, { status: 'error', errorMessage: msg, errorPhase: 'openai' })
      emit(id, 'agent:error', { step, phase: 'openai', message: msg })
      return
    }
  }

  updateAgent(id, { status: 'done' })
  emit(id, 'agent:done', { id })
}

// ── Express ────────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())
app.use(express.static(join(__dirname, 'public')))

// REST
app.get('/api/config', (_req, res) => res.json({ thumioAuthKey: THUMIO_AUTH_KEY ?? null }))

app.get('/api/agents', (_req, res) => res.json(Object.values(agentState)))

app.get('/api/agents/:id', (req, res) => {
  const agent = agentState[req.params.id]
  if (!agent) return res.status(404).json({ error: 'Not found' })
  res.json(agent)
})

app.post('/api/run', (_req, res) => {
  if (!TINYFISH_API_KEY) return res.status(500).json({ error: 'Missing TINYFISH_API_KEY' })
  if (!OPENAI_API_KEY)   return res.status(500).json({ error: 'Missing OPENAI_API_KEY' })
  Promise.all(PERSONAS.map(runAgent)).catch(console.error)
  res.json({ status: 'started', agents: PERSONAS.map(p => p.id) })
})

// SSE helper
function openSSE(req, res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()
  const hb = setInterval(() => { try { res.write(': ping\n\n') } catch {} }, 20000)
  req.on('close', () => clearInterval(hb))
}

// SSE — all agents (dashboard)
app.get('/api/events', (req, res) => {
  openSSE(req, res)
  res.write(`event: snapshot\ndata: ${JSON.stringify(Object.values(agentState))}\n\n`)
  sseClients['all'].add(res)
  req.on('close', () => sseClients['all'].delete(res))
})

// SSE — single agent (agent page)
app.get('/api/events/:id', (req, res) => {
  const { id } = req.params
  if (!sseClients[id]) return res.status(404).end()
  openSSE(req, res)
  res.write(`event: agent:snapshot\ndata: ${JSON.stringify(agentState[id])}\n\n`)
  sseClients[id].add(res)
  req.on('close', () => sseClients[id].delete(res))
})

// SPA fallback
app.get('*', (_req, res) => res.sendFile(join(__dirname, 'public', 'index.html')))

app.listen(PORT, () => {
  console.log(`\n  Agent Monitor → http://localhost:${PORT}`)
  console.log(`  Click "Run Agents" in the UI to start.\n`)
})
