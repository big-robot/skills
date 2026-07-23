---
name: grill-me
description: Use when a plan, decision, offer, workflow, strategy, or ambiguous proposal needs hard questioning before the user commits — especially when options are fuzzy, terms conflict, stakes are unclear, or premature narrowing is likely.
---

# Grill Me

Interrogate until you and the user share a concrete understanding of the decision space, what is already true, and what each choice opens or closes.

This skill ends when the user affirms a scope lock. Do not start planning, drafting, implementing, or handing off to another skill unless the user asks.

## Ground First

Before asking questions that available context can answer, inspect what is already at hand:

- materials the user provided or pointed to
- existing notes, docs, briefs, policies, or prior decisions when they exist
- domain constraints that are already known (budget, timeline, audience, legal, brand, ops)

If available sources contradict the user's framing, surface the contradiction and recommend which truth should win. Do not treat stale material as automatically correct.

If there is no local record, ground only on what the user has said so far. Do not invent project structure.

## Stakes Tier

Choose interview depth before asking:

- `trivial`: one blocking question only
- `standard`: targeted decision interrogation
- `large/complex`: map scope, risks, terminology, scenarios, and acceptance criteria

Escalate when any of these apply: ambiguous outcomes, irreversible or hard-to-reverse actions, money or reputation at risk, privacy/security, conflicting evidence, unfamiliar domain, or a weak/under-specified proposal. If unclear, treat it as one tier higher.

## Question Shape

Ask one decision question at a time. For each unresolved non-trivial decision, include:

- context from sources or prior answers
- realistic options
- tradeoff
- recommendation
- the specific question

Only move on after the user gives a final answer or clearly delegates the choice.

## Decision Pressure

- Map realistic paths before narrowing, including boring or partial paths.
- Name what each path opens, closes, preserves, delays, or makes harder.
- Resolve fuzzy terms and overloaded words before treating them as settled.
- Stress-test important decisions with concrete scenarios: happy path, missing information, failure, reversal, handoff, scale, and ownership conflict.
- Prefer recommendations that preserve useful future options unless the user needs commitment, speed, or simplification.

Stop when remaining questions are execution details that can be resolved later without changing the decision. Do not keep interviewing to fill in work that belongs to a later draft, plan, or build step.

## Capture

For long sessions, keep a scratch note so decisions are not lost. Prefer the workspace's existing notes convention when there is one; otherwise use a simple dated note the user can find:

```text
grill-me-YYYY-MM-DD-topic.md
```

Treat the note as scratch, not canonical documentation. Promote into durable docs only when the user asks, a resolved decision must survive the session, a term becomes canonical, or context loss is likely. Before promoting, say what you intend to update and why.

## Security

Never write credentials, tokens, private personal data, client evidence, or other sensitive details into durable notes unless the destination is already approved for that information. Prefer summaries and redacted examples.

## Closeout

When the interview converges, close with a one-screen scope lock:

- confirmed scope
- acceptance criteria / definition of done
- explicitly out of scope
- unresolved items marked `UNVERIFIED`

Ask the user to affirm the scope lock. After affirmation, stop.

If the user asks to continue into planning, drafting, or execution, proceed only under that new request.
