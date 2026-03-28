# Digital Mystery Shopper

> *"Every brand knows their click-through rate. Nobody knows what it's like to be their customer online. We do."*

A tool that lets big brands spawn multiple AI agents with different consumer personalities and let them surf the web — generating reports on customer visibility, SEO, ad efficiency, and competitive pricing from the point of view of real consumers.

---

## The Problem

Brands spend billions on analytics tools that tell them *what happened*. Nobody tells them *what their customers actually experience* — before the purchase decision is made.

Current brand intelligence is broken in 3 ways:

1. **SEO tools** show keyword rankings — not whether a 28-year-old price-sensitive shopper discovers you *organically* during a real purchase journey
2. **Ad platforms grade their own homework** — Google/Meta report impressions, but not whether the ad reached the right psychological profile at the right moment
3. **Competitive pricing data** is scraped in bulk — not experienced the way a consumer comparing options actually experiences it

**Our angle**: Consumer reality vs. platform-reported reality. And crucially — the full journey, from first inspiration to final purchase, not just the moment they land on your website.

---

## What It Does

Mystery shopping, deployed as 100+ AI consumers simultaneously across the entire web.

Brands define consumer persona archetypes. The agents surf the web with those personalities — not searching for products, but living as real consumers do. A persona buying furniture doesn't start by searching "buy sofa." They start with "futuristic room inspiration" or "how to make a small apartment feel bigger." Purchase intent emerges naturally mid-journey, exactly as it does for real people.

The agents surf from anywhere a real consumer might start — Google, Reddit, Pinterest, YouTube — and continue until they either make a purchase or give up. The tool maps every point where potential customers fall off, who they end up buying from instead, and critically, **where in the inspiration-to-purchase journey your brand appears (or doesn't).**

### The Three Phases of Every Journey

| Phase | Consumer mindset | Example search |
|-------|-----------------|----------------|
| **Inspiration** | No purchase intent — lifestyle, aesthetic, curiosity | "futuristic room ideas", "japandi living room" |
| **Consideration** | Intent begins to form — starts narrowing | "what furniture fits this aesthetic", "minimalist sofa styles" |
| **Decision** | Actively comparing and price-checking | "best minimalist sofa under $800", "[brand] vs [competitor]" |

Most analytics tools only see Phase 3. We see all three.

The most powerful findings come from Phase 1 and 2 — the moments your competitors are building brand affinity before a product name has even been typed into a search bar.

---

## The Unique Factor

Traditional analytics shows you your website. This shows you the entire web *from your customer's eyes* — the ads they saw, the Reddit thread that killed your sale, the competitor listing that looked better at the same price point.

This is only possible with stateful, persona-consistent browsing agents. Not a scraper. Not an API call. A genuine consumer journey.

---

## Agent Personas

Each campaign spawns 10+ personas with multiple instances each for statistical significance. Personas can be selected from archetypes or fully customised.

**Example archetypes:**

| Persona | Behaviour |
|---------|-----------|
| Budget Hunter | Price-first, filters aggressively, abandons above threshold |
| Prudent Parent | Reads reviews obsessively, compares 4-6 options, needs justification for premium |
| Premium Seeker | Brand-driven, price-insensitive, converts fast on editorial validation |
| Research Obsessive | Starts on Reddit/forums, deep Q&A reader, trusts community over brand |
| Impulse Buyer | Clicks first result, converts in under 10 minutes |

### Journey Starting Points

Agents begin from wherever real consumers begin:

- Google Search
- Google Shopping
- Amazon
- Reddit
- YouTube
- TikTok

---

## Customer Interface

### Campaign Setup

Brands input:
- What product/category they are shopping for
- Their brand URL
- Competitors to track (optional)
- Persona mix and agent count per persona
- Starting platforms

### Live Run View

Real-time feed showing all active agents, with a live count of:
- Purchased your brand
- Purchased a competitor
- Gave up
- Still shopping

Each agent surfaces a plain-English narration of what it is seeing and deciding in the moment.

**Example:**

> **Prudent Parent #1** — Pinterest  [Phase: Inspiration]
> "Searching 'scandinavian nursery ideas'. Saving competitor mood boards. No purchase intent yet."

> **Research Obsessive #2** — Reddit  [Phase: Consideration]
> "In r/malelivingspace. Found thread recommending a competitor's sofa as the 'best minimalist option under $1k'. Opened their website in a new tab."

> **Premium Seeker #2** — Google  [Phase: Decision]
> PURCHASED your brand. $1,200. Total journey: 3 days, 14 sessions. Decisive moment: editorial feature on Architectural Digest.

### Journey Map

A Sankey-style decision flow showing every fork in the road — from starting point through to final outcome. Every node is clickable, drilling into the actual agent transcripts.

```
                    WHERE THEY STARTED
        Google        Amazon        Reddit
       [12 agents]   [10 agents]   [8 agents]
            │               │            │
            └───────────────┴────────────┘
                            │
                    SAW YOUR BRAND?
                Yes [22]        No [8] ──→ BLIND SPOT
                    │
            ┌───────┴──────────┐
       Price check?        Clicked in?
          [14]                [8]
            │                  │
    ┌───────┴────────┐         └──→ PURCHASED [5] ✓
Saw too expensive  Compared to peers
      [9]                [5]
        │                  │
    ┌───┴────┐       ┌─────┴─────┐
  Left     Sought   Found       Couldn't
  site     reason   justification find reason
   [6]      [3]        [2]          [3]
    ↓         ↓          ↓            ↓
  Competitor  Stayed  PURCHASED     GAVE UP
              lurking    [2] ✓        [3]
```

### Insight Cards

Each falloff point generates an Insight Card in plain English. This is what the CMO actually reads.

**Example:**

---

**CRITICAL DROP-OFF — Invisible During Inspiration Phase**

22 out of 30 agents who eventually purchased furniture never encountered your brand during their inspiration phase. By the time they were ready to buy, 14 already had brand affinity for a competitor.

*What they did:*
Agents searching "japandi living room ideas" and "minimalist apartment inspiration" on Pinterest and Reddit encountered your competitor's content and mood boards repeatedly — across an average of 6 sessions — before they typed a product name into Google.

*What they thought when they finally reached the decision phase:*

> "Prudent Parent #1: I've seen [Competitor] everywhere when I was researching this look. I trust them. Let me check them first."

> "Research Obsessive #3: The r/malelivingspace community keeps recommending [Competitor]. I haven't heard of this other brand."

*Root cause:*
Your brand has no presence in lifestyle and inspiration content. Competitors are active on Pinterest, featured in interior design Reddit threads, and appearing in "room inspiration" YouTube videos. Your brand only becomes visible at the Google Shopping stage — after preferences are already formed.

*Fix:* Invest in top-of-funnel content that appears during the inspiration phase — Pinterest boards, editorial features, Reddit community presence.

---

### Persona Breakdown Report

| Persona | Purchased your brand | Lost to competitor | Top reason lost |
|---------|---------------------|--------------------|-----------------|
| Premium Seeker | 4/5 — 80% | — | — |
| Impulse Buyer | 3/4 — 75% | — | — |
| Research Obsessive | 2/7 — 28% | Brooks 3x | Wet grip reviews |
| Prudent Parent | 1/6 — 17% | Salomon 3x | No price justification |
| Budget Hunter | 0/8 — 0% | Nike 5x | Never in price range |

- **Your brand naturally wins:** Premium and Impulse segments
- **Your brand is invisible to:** Budget segment
- **Your brand is losing:** Research and Prudent segments — fixable

---

## What Every Journey Report Covers

| Signal | What it reveals |
|--------|----------------|
| Which page your brand appears on for each persona's natural searches | True organic visibility by customer segment |
| Which competitor ads appear when searching your brand name | Competitor attack surface |
| Price comparison journey — what prices agents see vs your prices | Dynamic pricing and leakage |
| What review content agents encounter first | Reputation reality |
| Whether retargeting ads follow agents correctly after site visit | Ad funnel effectiveness |

---

## Journey Outcomes

Every agent journey ends in one of three states only:

1. **Purchased your brand**
2. **Purchased a competitor** — which one, and the decisive moment
3. **Abandoned** — no purchase made (price, confusion, trust gap)

---

## Design Principles

1. **Every number links to a transcript.** Not just statistics — the actual agent inner monologue. That is the product's proof of truth.
2. **Journeys run to completion.** Agents do not stop at your website. They continue until they buy or give up.
3. **Reports speak in consumer voice**, not analytics jargon. Insight cards should be pasteable directly into a board deck.
4. **Scale equals confidence.** 30 agents is directional. 100 agents is reportable. Confidence bands are shown.

---

## Business Model

| Tier | Price | Offering |
|------|-------|---------|
| Starter | $500/mo | 3 personas, weekly scan, 1 brand |
| Growth | $2,500/mo | 10 personas, daily scan, 3 competitors tracked |
| Enterprise | $15,000+/mo | Custom personas, real-time, API access |

Target buyer: Head of Digital Marketing or CMO at brands doing $50M+ revenue. They already pay this for tools that show them less useful data.

---

## Technical Architecture

### How Agents Browse

Agents do not parse HTML. They see the web visually — the same way a human does.

Each step in a journey works as follows:

1. **AgentQL (TinyFish)** loads the page and returns a screenshot
2. **Vision LLM (Claude)** receives the screenshot and interprets what a human would see — ad creative, visual hierarchy, brand positioning, what stands out
3. **Persona prompt** filters perception ("as a Budget Hunter, I notice the price before anything else")
4. **LLM decides** the next action and narrates its reasoning in plain English
5. **AgentQL** executes the action (follow a link, run a new search, scroll)
6. Repeat until purchase or abandonment

This captures what DOM-scraping cannot: the emotional and visual reality of the page — the competitor's lifestyle photography, the review score displayed prominently, the ad that appeared before the organic result.

### Stack

| Layer | Tool | Role |
|-------|------|------|
| Browser automation | AgentQL REST API | Load pages, execute actions, return screenshots |
| Visual perception | Claude Vision / GPT-4o | Interpret screenshots as a human consumer would |
| Persona & decision | LLM with persona prompt | Decide next action, narrate reasoning, detect phase |
| Orchestration | Custom (Python/Node) | Manage agent state, journey log, termination |
| Output | Custom renderer | Sankey map, insight cards, persona report |

### Agent Loop (per agent)

```
INIT: assign persona + starting platform
  ↓
LOAD PAGE via AgentQL → get screenshot
  ↓
SEE: send screenshot to Vision LLM with persona context
  ↓
DECIDE: LLM returns { action, narration, phase, confidence }
  ↓
LOG: append step to journey transcript
  ↓
CHECK: purchase detected? → END (Purchased)
       give-up threshold? → END (Abandoned)
       phase transition?  → update phase, continue
  ↓
ACT: send action to AgentQL → load next page
  ↓
(repeat)
```

---

## Hackathon MVP

One complete loop:

1. Input: brand + one product category
2. Spawn 10 agents (2 per persona type), mixed starting points
3. Run real journeys via tinyfish
4. Output: one journey map + three insight cards

**The demo moment:** Show a persona that starts searching "futuristic room inspiration" — with zero purchase intent — and trace the full journey to a competitor purchase. Show exactly the moment intent emerged and where your brand was absent. Every CMO in the room will recognise it immediately, because it is exactly how they shop themselves.
