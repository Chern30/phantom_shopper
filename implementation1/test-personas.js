/**
 * Persona test — runs 2 TinyFish agents in parallel with different personalities.
 * Goal: verify that persona-infused goals produce meaningfully different outcomes.
 *
 * Usage:
 *   TINYFISH_API_KEY=your_key node test-personas.js
 */

// Load .env from project root
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const env = readFileSync(join(__dirname, '.env'), 'utf8')
  for (const line of env.split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
  }
} catch { /* .env not found, fall through to process.env */ }

const API_KEY = process.env.TINYFISH_API_KEY
const BASE_URL = 'https://agent.tinyfish.ai'

if (!API_KEY) {
  console.error('Missing TINYFISH_API_KEY env var')
  process.exit(1)
}

// ── Persona definitions ────────────────────────────────────────────────────

const PERSONAS = [
  {
    name: 'Budget Hunter',
    goal: `
You are a Budget Hunter shopping for a minimalist sofa online.
Your personality: extremely price-sensitive, hard limit of $600, you abandon anything above that immediately without reading further.
You always check the price before anything else. You filter by price ascending. You distrust brands you haven't heard of unless the reviews confirm value.

Task: Start at Google and search for "minimalist sofa". Browse as this persona would naturally browse.
Keep going until you either:
  - Find a product under $600 that looks good → end with: DECISION: PURCHASED "[product name]" at $[price] from [site]
  - Exhaust your options after checking at least 5 products → end with: DECISION: GAVE_UP because [specific reason]

Do not stop early. Browse at least 5 products before giving up.
    `.trim(),
  },
  {
    name: 'Premium Seeker',
    goal: `
You are a Premium Seeker shopping for a minimalist sofa online.
Your personality: brand-driven, price-insensitive, you make fast decisions when you find editorial validation or strong brand reputation. You distrust anything that looks cheap or unbranded.

Task: Start at Google and search for "best premium minimalist sofa". Browse as this persona would naturally browse.
Keep going until you either:
  - Find a well-regarded, premium product from a reputable brand → end with: DECISION: PURCHASED "[product name]" at $[price] from [site]
  - Fail to find anything meeting your quality bar after checking at least 5 options → end with: DECISION: GAVE_UP because [specific reason]

Do not stop early. Browse at least 5 products before giving up.
    `.trim(),
  },
]

// ── SSE stream parser ──────────────────────────────────────────────────────

async function runPersona(persona) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  STARTING: ${persona.name}`)
  console.log('─'.repeat(60))

  const response = await fetch(`${BASE_URL}/v1/automation/run-sse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      url: 'https://www.google.com',
      goal: persona.goal,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`[${persona.name}] HTTP ${response.status}: ${text}`)
  }

  const result = await parseSSE(response.body, persona.name)
  return { persona: persona.name, ...result }
}

async function parseSSE(body, label) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult = null
  let eventType = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() // hold incomplete final line

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

        // type can come from the event: line or from the data payload
        const type = eventType || event.type

        switch (type) {
          case 'STARTED':
            console.log(`[${label}] Run started  run_id=${event.run_id ?? '—'}`)
            break

          case 'STREAMING_URL':
            console.log(`[${label}] Live view → ${event.url ?? event.streaming_url ?? JSON.stringify(event)}`)
            break

          case 'PROGRESS':
            console.log(`[${label}] ↳ ${event.purpose ?? event.message ?? JSON.stringify(event)}`)
            break

          case 'COMPLETE':
            console.log(`\n[${label}] ✓ COMPLETE  status=${event.status}`)
            if (event.result) {
              console.log(`[${label}] Result:\n${JSON.stringify(event.result, null, 2)}`)
            }
            finalResult = { status: event.status, result: event.result ?? null }
            break

          case 'HEARTBEAT':
            break // ignore keep-alives

          default:
            if (type) console.log(`[${label}] [${type}]`, JSON.stringify(event))
        }

        eventType = null
      }
    }
  }

  return finalResult ?? { status: 'UNKNOWN', result: null }
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log('Running 2 persona agents in parallel...\n')
console.log('Watch for differences in:')
console.log('  • Which products they click')
console.log('  • Whether they purchased or gave up')
console.log('  • Their stated reason for the final decision\n')

Promise.all(PERSONAS.map(runPersona))
  .then(results => {
    console.log('\n' + '═'.repeat(60))
    console.log('  SUMMARY')
    console.log('═'.repeat(60))
    for (const r of results) {
      console.log(`\n${r.persona}`)
      console.log(`  Status : ${r.status}`)
      console.log(`  Result : ${r.result ? JSON.stringify(r.result).slice(0, 200) : 'none'}`)
    }
  })
  .catch(err => {
    console.error('\nFatal error:', err.message)
    process.exit(1)
  })
