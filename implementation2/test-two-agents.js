/**
 * Test — 2 agents browsing IKEA simultaneously with different personalities.
 *
 * Role split:
 *   TinyFish  — browsing agent. Navigates to URL, handles captchas/popups,
 *               returns { page_text, links } representing the page.
 *
 *   OpenAI    — decision maker. Reads page state, reasons as the persona,
 *               chooses exactly one of two actions:
 *                 { action: "click",  index: N }
 *                 { action: "search", query: "..." }
 *
 * Agent 1: Young couple setting up their first baby room
 * Agent 2: Single man who just broke his couch
 *
 * Usage:
 *   TINYFISH_API_KEY=xxx OPENAI_API_KEY=xxx node test-two-agents.js
 */

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
const TINYFISH_BASE    = 'https://agent.tinyfish.ai'
const MAX_STEPS        = 8

// ── Personas ───────────────────────────────────────────────────────────────

const PERSONAS = [
  {
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

Option 2 — start a new Google search:
{
  "reasoning": "your inner monologue as this couple",
  "action": "search",
  "query": "<your search query>"
}

Use "search" when the page is a dead end or has no relevant links.
Visit at least 5 pages. When done, use action "search" with query "DONE".`,
  },
  {
    name: 'Single Man — Broken Couch',
    goal: 'Find a replacement couch after breaking the old one',
    startUrl: 'https://duckduckgo.com/?q=IKEA+sofa+couch+buy',
    systemPrompt: `You are a single man in your early 30s. You just broke your couch — it's gone. You need a replacement ASAP. You live alone, one-bedroom apartment. You want something comfortable for gaming and TV, ideally under $600, must fit through a standard door. You go straight for sofas and couches. You ignore anything about kids, bedrooms, kitchens, or outdoor furniture.

At each step you receive the text content of a web page and a numbered dictionary of links.

You have exactly two possible actions. Respond with valid JSON using one of:

Option 1 — click a link:
{
  "reasoning": "your inner monologue",
  "action": "click",
  "index": <number from the links dictionary>
}

Option 2 — start a new Google search:
{
  "reasoning": "your inner monologue",
  "action": "search",
  "query": "<your search query>"
}

Use "search" when the page is a dead end or has no relevant links.
Visit at least 5 pages. When you have found a couch you would buy, use action "search" with query "DONE".`,
  },
]

// ── TinyFish: browse a page, handle captchas, return page state ────────────

async function browsePage(url, label) {
  console.log(`\n  [${label}] ── TinyFish: browsing ──────────────────────────`)
  console.log(`  [${label}] Navigating to: ${url}`)

  const goal = `STEP 1 — CAPTCHA AND POPUPS (do this first, before anything else):
Inspect the page immediately after loading. If you see any of the following, resolve them before proceeding:
- A CAPTCHA or reCAPTCHA challenge → solve it fully (click checkbox, complete image puzzle, etc.)
- A cookie consent banner → dismiss or accept it
- Any modal or popup blocking the content → close it
Do not move to Step 2 until the main page content is fully visible.

STEP 2 — EXTRACT AND RETURN:
Once the page content is visible, return ONLY valid JSON with no markdown fences:
{
  "page_text": "<the main readable content — headlines, product names, descriptions, prices, article summaries. 3-6 sentences max.>",
  "links": {
    "0": { "text": "<link label>", "url": "<absolute URL>" },
    "1": { "text": "<link label>", "url": "<absolute URL>" }
  }
}

For the links dictionary:
- Include up to 15 of the most relevant clickable links (search results, products, articles, categories).
- Keys must be sequential integers as strings starting from "0".
- Use absolute URLs, resolving any relative paths against the page domain.
- Exclude: login/signup, cookie notices, social share buttons, footer legal text, navigation chrome.`

  const response = await fetch(`${TINYFISH_BASE}/v1/automation/run-sse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': TINYFISH_API_KEY,
    },
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

  return parseSSE(response.body, label)
}

async function parseSSE(body, label) {
  const reader  = body.getReader()
  const decoder = new TextDecoder()
  let buffer    = ''
  let rawResult = null
  let eventType = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) { eventType = null; continue }

      if (trimmed.startsWith('event:')) {
        eventType = trimmed.slice(6).trim()
        continue
      }

      if (trimmed.startsWith('data:')) {
        const raw = trimmed.slice(5).trim()
        if (!raw || raw === '[DONE]') continue

        let event
        try { event = JSON.parse(raw) } catch { continue }

        const type = eventType || event.type

        if (type === 'PROGRESS') {
          process.stdout.write(`  [${label}][TinyFish] ↳ ${event.purpose ?? event.message ?? '...'}\n`)
        } else if (type === 'COMPLETE') {
          process.stdout.write(`  [${label}][TinyFish] ✓ Done — handing off to OpenAI\n`)
          rawResult = event.result
        }

        eventType = null
      }
    }
  }

  if (!rawResult) throw new Error('TinyFish returned no result')

  const text     = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult)
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const match    = stripped.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`Cannot parse TinyFish result: ${text.slice(0, 400)}`)

  return JSON.parse(match[0])
}

// ── OpenAI: decide next action (click or search) ───────────────────────────

async function decide(persona, pageState, step, history) {
  const linksText = Object.entries(pageState.links ?? {})
    .map(([idx, link]) => `[${idx}] ${link.text}  —  ${link.url}`)
    .join('\n')

  const userMessage =
`Step ${step}

PAGE CONTENT:
${pageState.page_text}

AVAILABLE LINKS:
${linksText || '(no links found)'}

What do you do next?`

  const historyMessages = history.flatMap(h => [
    { role: 'user',      content: `Step ${h.step}\n\nPAGE CONTENT:\n${h.page_text}\n\nWhat do you do next?` },
    { role: 'assistant', content: JSON.stringify({ reasoning: h.reasoning, action: h.action, index: h.index, query: h.query }) },
  ])

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: persona.systemPrompt },
        ...historyMessages,
        { role: 'user',   content: userMessage },
      ],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenAI HTTP ${response.status}: ${text}`)
  }

  const data = await response.json()
  return JSON.parse(data.choices[0].message.content)
}

// ── Single agent run ───────────────────────────────────────────────────────

async function runAgent(persona) {
  const label   = persona.name
  const history = []
  let currentUrl = persona.startUrl

  console.log(`\n${'═'.repeat(64)}`)
  console.log(`  AGENT: ${label}`)
  console.log(`  Goal : ${persona.goal}`)
  console.log('═'.repeat(64))

  for (let step = 1; step <= MAX_STEPS; step++) {
    console.log(`\n  [${label}] Step ${step}`)
    console.log(`  [${label}] URL: ${currentUrl}`)

    // 1. TinyFish browses the page
    let pageState
    try {
      pageState = await browsePage(currentUrl, label)
    } catch (err) {
      console.error(`  [${label}][TinyFish error] ${err.message}`)
      break
    }

    const linkCount = Object.keys(pageState.links ?? {}).length
    console.log(`  [${label}][TinyFish] Page text : ${pageState.page_text}`)
    console.log(`  [${label}][TinyFish] Links found: ${linkCount}`)

    // 2. OpenAI decides: click or search
    console.log(`\n  [${label}] ── OpenAI: deciding ───────────────────────────`)
    let decision
    try {
      decision = await decide(persona, pageState, step, history)
    } catch (err) {
      console.error(`  [${label}][OpenAI] Error: ${err.message}`)
      break
    }

    console.log(`  [${label}][OpenAI] Reasoning : ${decision.reasoning}`)
    console.log(`  [${label}][OpenAI] Action    : ${decision.action}${decision.action === 'click' ? ` → index ${decision.index}` : ` → "${decision.query}"`}`)

    history.push({
      step,
      url:       currentUrl,
      page_text: pageState.page_text,
      reasoning: decision.reasoning,
      action:    decision.action,
      index:     decision.index ?? null,
      query:     decision.query ?? null,
    })

    if (decision.action === 'search') {
      if (decision.query === 'DONE') {
        console.log(`  [${label}][OpenAI] ✓ Satisfied — finishing browse.`)
        break
      }
      currentUrl = `https://duckduckgo.com/?q=${encodeURIComponent(decision.query)}`
      console.log(`  [${label}][OpenAI] → New Google search: "${decision.query}"`)
      console.log(`  [${label}][OpenAI] → Passing to TinyFish: ${currentUrl}`)

    } else if (decision.action === 'click') {
      const chosen = (pageState.links ?? {})[String(decision.index)]
      if (!chosen) {
        console.log(`  [${label}][OpenAI] Index ${decision.index} not found — stopping.`)
        break
      }
      currentUrl = chosen.url
      console.log(`  [${label}][OpenAI] → Clicking link [${decision.index}]: "${chosen.text}"`)
      console.log(`  [${label}][OpenAI] → Passing to TinyFish: ${currentUrl}`)

    } else {
      console.log(`  [${label}][OpenAI] Unknown action "${decision.action}" — stopping.`)
      break
    }
  }

  return { persona: label, goal: persona.goal, history }
}

// ── Main ───────────────────────────────────────────────────────────────────

if (!TINYFISH_API_KEY) { console.error('Missing TINYFISH_API_KEY'); process.exit(1) }
if (!OPENAI_API_KEY)   { console.error('Missing OPENAI_API_KEY');   process.exit(1) }

console.log('Running 2 agents in parallel, starting from Google search...')
console.log('(output from both agents will be interleaved)\n')

Promise.all(PERSONAS.map(runAgent)).then(results => {
  console.log('\n' + '═'.repeat(64))
  console.log('  FINAL JOURNEY COMPARISON')
  console.log('═'.repeat(64))

  for (const r of results) {
    console.log(`\n── ${r.persona} ──`)
    console.log(`   Goal: ${r.goal}`)
    for (const h of r.history) {
      const actionStr = h.action === 'click' ? `click [${h.index}]` : `search "${h.query}"`
      console.log(`\n   Step ${h.step}: ${h.url}`)
      console.log(`     Reasoning : ${h.reasoning}`)
      console.log(`     Action    : ${actionStr}`)
    }
    console.log(`\n   Total steps: ${r.history.length}`)
  }
}).catch(err => {
  console.error('\nFatal:', err.message)
  process.exit(1)
})
