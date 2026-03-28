/**
 * Implementation 2 — OpenAI-Driven Page-by-Page Agent
 *
 * Role split:
 *   TinyFish  — browsing agent. Navigates to a URL, handles captchas and popups,
 *               parses the page, returns { page_text, links }.
 *
 *   OpenAI    — decision maker. Reads page_text + links, reasons as the persona,
 *               and chooses one of exactly two actions:
 *                 { action: "click",  index: N }
 *                 { action: "search", query: "..." }
 *
 * Usage:
 *   TINYFISH_API_KEY=xxx OPENAI_API_KEY=xxx node agent.js
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
} catch { /* .env not found, fall through to process.env */ }

const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY
const OPENAI_API_KEY   = process.env.OPENAI_API_KEY
const TINYFISH_BASE    = 'https://agent.tinyfish.ai'
const MAX_STEPS        = 10

// ── Persona ────────────────────────────────────────────────────────────────

const PERSONA = {
  name: 'Young Budget Couple',
  goal: 'Explore ideas for decorating a baby room on a tight budget',
  startUrl: 'https://www.google.com/search?q=baby+room+decor+ideas+budget',
  systemPrompt: `You are a young couple expecting your first baby. You have a tight budget — roughly $300 total for decorating the room. You are practical, slightly anxious about costs, and love Pinterest-style inspiration. You get excited about DIY ideas and budget-friendly finds. You lose interest when pages feel too commercial or expensive.

Your goal: Find actionable, affordable baby room decoration inspiration.

At each step you will receive the text content of a web page and a numbered dictionary of links you can click.

You have exactly two possible actions. Respond with valid JSON using one of these formats:

Option 1 — click a link:
{
  "reasoning": "your inner monologue as this persona",
  "action": "click",
  "index": <number from the links dictionary>
}

Option 2 — start a new Google search:
{
  "reasoning": "your inner monologue as this persona",
  "action": "search",
  "query": "<your search query>"
}

Use "search" when the current page is a dead end or has no relevant links.
Visit at least 6 pages before you are done. When you have gathered enough inspiration, use "search" with query "DONE" to signal completion.`,
}

// ── TinyFish: browse a page, handle captchas, return page state ────────────

async function browsePage(url) {
  console.log(`\n[TinyFish] Browsing: ${url}`)

  const goal = `Navigate to this page. Handle any captchas, cookie banners, or popups you encounter so the main content is visible.

Once the page is fully loaded, extract and return ONLY valid JSON with no markdown fences:
{
  "page_text": "<the main readable text content of the page — headlines, product names, descriptions, prices, article summaries. 3-6 sentences max.>",
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

  return parseSSE(response.body)
}

async function parseSSE(body) {
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
          console.log(`  ↳ ${event.purpose ?? event.message ?? '...'}`)
        } else if (type === 'COMPLETE') {
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

async function decide(pageState, step, history) {
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
        { role: 'system', content: PERSONA.systemPrompt },
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

// ── Main loop ──────────────────────────────────────────────────────────────

async function run() {
  if (!TINYFISH_API_KEY) { console.error('Missing TINYFISH_API_KEY'); process.exit(1) }
  if (!OPENAI_API_KEY)   { console.error('Missing OPENAI_API_KEY');   process.exit(1) }

  console.log('═'.repeat(62))
  console.log('  IMPLEMENTATION 2 — OpenAI-Driven Page-by-Page Agent')
  console.log(`  Persona : ${PERSONA.name}`)
  console.log(`  Goal    : ${PERSONA.goal}`)
  console.log('═'.repeat(62))

  let currentUrl = PERSONA.startUrl
  const history  = []

  for (let step = 1; step <= MAX_STEPS; step++) {
    console.log(`\n${'─'.repeat(62)}`)
    console.log(`  STEP ${step}`)
    console.log(`  URL: ${currentUrl}`)
    console.log('─'.repeat(62))

    // 1. TinyFish browses the page
    let pageState
    try {
      pageState = await browsePage(currentUrl)
    } catch (err) {
      console.error(`[TinyFish error] ${err.message}`)
      break
    }

    const linkCount = Object.keys(pageState.links ?? {}).length
    console.log(`\n[Page content] ${pageState.page_text}`)
    console.log(`[Links found]  ${linkCount}`)

    // 2. OpenAI decides: click or search
    let decision
    try {
      decision = await decide(pageState, step, history)
    } catch (err) {
      console.error(`[OpenAI error] ${err.message}`)
      break
    }

    console.log(`\n[Reasoning] ${decision.reasoning}`)
    console.log(`[Action]    ${decision.action}${decision.action === 'click' ? ` → index ${decision.index}` : ` → "${decision.query}"`}`)

    history.push({
      step,
      url:      currentUrl,
      page_text: pageState.page_text,
      reasoning: decision.reasoning,
      action:    decision.action,
      index:     decision.index ?? null,
      query:     decision.query ?? null,
    })

    if (decision.action === 'search') {
      if (decision.query === 'DONE') {
        console.log('\n[Agent] Persona has finished browsing.')
        break
      }
      currentUrl = `https://www.google.com/search?q=${encodeURIComponent(decision.query)}`
      console.log(`[Next URL]  ${currentUrl}`)

    } else if (decision.action === 'click') {
      const chosen = (pageState.links ?? {})[String(decision.index)]
      if (!chosen) {
        console.log(`[Agent] Index ${decision.index} not in links — stopping.`)
        break
      }
      currentUrl = chosen.url
      console.log(`[Next URL]  ${currentUrl}`)

    } else {
      console.log(`[Agent] Unknown action "${decision.action}" — stopping.`)
      break
    }
  }

  // ── Journey summary ────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(62))
  console.log('  JOURNEY SUMMARY')
  console.log('═'.repeat(62))

  for (const h of history) {
    console.log(`\nStep ${h.step}: ${h.url}`)
    console.log(`  Reasoning : ${h.reasoning}`)
    const actionStr = h.action === 'click' ? `click [${h.index}]` : `search "${h.query}"`
    console.log(`  Action    : ${actionStr}`)
  }

  console.log(`\nTotal steps: ${history.length}`)
}

run().catch(err => {
  console.error('\nFatal:', err.message)
  process.exit(1)
})
