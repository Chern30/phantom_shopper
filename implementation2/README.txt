IMPLEMENTATION 2 — OpenAI-Driven Page-by-Page Agent
====================================================

APPROACH
--------
TinyFish is used as a "page reader" only — it visits one URL at a time and
returns a page summary + list of links. It does NOT browse autonomously.

OpenAI (gpt-4o) acts as the decision-maker: given the page state and a persona
system prompt, it reasons and picks which link to follow next. This loop repeats
until the persona decides it's done or MAX_STEPS is reached.

Flow per step:
  1. TinyFish: GET current URL → {summary, links[]}
  2. OpenAI:   (persona system prompt) + page state → {reasoning, decision, chosen_index}
  3. Set currentUrl = links[chosen_index].url
  4. Repeat

Demo scenario:
  Persona  — Young couple, first baby, ~$300 total budget
  Goal     — Explore baby room decor ideas affordably
  Start    — Google search: "baby room decor ideas budget"


HOW THIS FIXES IMPLEMENTATION 1's FLAWS
-----------------------------------------
1. Emergent personality, not pre-scripted rules
   OpenAI reacts to what is actually on each page. The persona's behaviour
   emerges from the content it encounters, not from pre-written if-statements.

2. Full reasoning visibility at every step
   Every step logs the persona's inner monologue and explicit decision.
   You can see exactly why each link was chosen or skipped.

3. Persona consistency is enforced and observable
   The same persona system prompt governs every single decision. Drift is
   visible immediately in the logged reasoning.

4. Controllable decision boundary
   By constraining TinyFish to "read + return links only", we ensure OpenAI
   owns all navigation choices. TinyFish becomes a stateless page-reader.


KNOWN LIMITATIONS
-----------------
1. TinyFish still has some autonomy in what links it extracts
   The quality and selection of links depends on TinyFish's interpretation
   of the extraction goal. Sponsored links may still slip through.

2. No screenshots
   TinyFish extracts text-based state. Visual cues (images, layout) that
   would influence a real consumer are not captured.

3. No form interaction
   TinyFish can only return links. Actions like typing in a search bar,
   applying filters, or adding to cart are not possible. The initial query
   is baked into the start URL as a workaround.

4. Latency
   Two API calls per step (TinyFish + OpenAI) means each step takes
   several seconds. A 10-step run takes 1-3 minutes.


USAGE
-----
  TINYFISH_API_KEY=xxx OPENAI_API_KEY=xxx node agent.js

Or set both keys in a .env file at the project root.
