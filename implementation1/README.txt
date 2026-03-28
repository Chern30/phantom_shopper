IMPLEMENTATION 1 — TinyFish Persona-Injected Goals
====================================================

APPROACH
--------
Pass persona definitions directly into TinyFish's `goal` parameter as natural
language instructions. TinyFish runs the full browser journey autonomously.
Two test personas were used: Budget Hunter and Premium Seeker, each given a
different search query and behavioural description.

The idea was that the goal string alone would cause TinyFish to behave
differently across personas — producing different outcomes (purchased vs gave up)
and browsing patterns.


FLAWS
-----
1. Pre-defined behaviour, not emergent personality
   The persona's reactions had to be explicitly scripted upfront (e.g. "abandon
   anything over $600"). This means we are not modelling how a personality type
   would naturally react to what they encounter — we are just telling the agent
   what to do in terms we already anticipated. Real consumer behaviour is
   reactive, not pre-scripted.

2. No per-step reasoning visibility
   TinyFish runs the journey end-to-end in one call. We only get high-level
   PROGRESS events — there is no window into the decision made at each step.
   The "reasoning" we see is TinyFish's internal narration, not a persona-driven
   thought process we control.

3. Persona consistency is unverifiable mid-run
   Once the goal is submitted, we cannot steer or correct the agent. If TinyFish
   drifts from the persona mid-journey (e.g. a Budget Hunter clicks a $1,200
   product), we have no mechanism to intervene or even detect it until the run
   completes.

4. No screenshots / visual evidence
   The analytics value comes from seeing what the agent actually saw at each
   decision point. This approach provides only text narration, not visual proof
   of what influenced the agent's choices.

5. Persona differentiation is shallow
   Both personas ultimately follow the same TinyFish execution model. The only
   difference is the initial search query and a few behavioural rules in the
   goal string. This is not a genuine simulation of different consumer mindsets.


SHELVED IN FAVOUR OF
--------------------
A more robust architecture where personalities are defined as traits and
tendencies, and the agent reacts to what it actually sees on each page —
rather than following pre-scripted rules. See implementation2 when built.
