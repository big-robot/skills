---
name: adversarial-evidence-packet
description: Use when Codex needs read-only adversarial review output for implementation plans, diffs, PR review threads, source-shape claims, security-sensitive changes, or readiness checks that require evidence packets instead of prose findings.
metadata:
  skill_library:
    tier: owned
---

# Adversarial Evidence Packet

## Core Rule

Produce structured evidence packets, not loose critique. Keep the work read-only unless another skill explicitly owns edits.

## When Used By Another Skill

If another skill invokes this one, follow that skill's scope and lanes. Use this skill only for the packet schema, confidence anchors, evidence gates, fixture checks, and final disproof pass.

## Evidence Packet

Return one packet per finding:

```yaml
claim: ""
location: ""
lane: ""
route: "fix now | decision needed | defer/out of scope | dismiss"
confidence_anchor: 0 | 25 | 50 | 75 | 100
verbatim_evidence:
  - "file:line quoted evidence"
verification_status: "verified | cannot-verify-from-diff | disproven | not-checked"
impact: ""
recommended_patch: ""
scope_status: "in scope | out of scope | unclear"
fixture_provenance: "synthetic | production-derived | not applicable | unknown"
absence_gate: "proven missing | not proven missing | not applicable"
notes: ""
```

If running as a subagent or read-only explorer, write full packets to the requested scratch path when one is provided and return only the path plus a compact summary.

## Confidence Anchors

- `100`: directly proven blocker with quoted source evidence and clear execution impact.
- `75`: likely blocker with quoted `file:line` evidence and clear execution impact.
- `50`: plausible concern or FYI; does not block readiness.
- `25`: weak or speculative; drop or count only.
- `0`: disproven; dismiss.

Only `75` or `100` findings can block readiness. Any `75` or `100` finding must start with quoted `file:line` evidence. If it lacks that evidence, demote it to `50` or lower.

Anchors are not self-protective. A finding that has quoted `file:line` evidence and a concrete execution-blocking impact must be rated `75` or higher; under-rating a real blocker to `50` to dodge the quote requirement is itself a defect. The synthesis judge re-rates in both directions: promote under-rated blockers, demote unquoted or speculative findings.

## Fingerprint And Cluster Identity

Caps, suppression, and escalation must key on stable identity, not wording, so a re-worded re-raise cannot reset a counter or dodge suppression.

- `fingerprint`: the deterministic identity of a single finding, independent of phrasing. Derive it from the normalized repo-relative file path, plus the nearest stable anchor (symbol name, or a line-anchored hunk), plus the claim class (for example `missing-null-guard`, `unverified-source-field`, `out-of-scope-hunk`). Two findings that touch the same location and claim class are the SAME fingerprint even if worded differently.
- `clusterKey`: the root assumption or premise a finding depends on. Findings that all evaporate if one premise is rejected share a `clusterKey`.

Suppression of dismissed or deferred findings, round-to-round counters, and any fix-verify cycle cap follow the `fingerprint` and `clusterKey`, never the comment text. A re-raise whose fingerprint matches a dismissed or deferred finding is suppressed unless the new comment, diff, or head SHA adds material new evidence.

## Evidence Gates

- Quote the line. Do not block on summaries, vibes, or inferred intent.
- Treat absence of evidence as unknown, not proof that a field, branch, fixture, or source value is missing.
- Mark anything that cannot be verified from the available plan, diff, source, fixture, command output, or official docs as `cannot-verify-from-diff`.
- For source-shape claims, require current source reads, fixtures, schemas, official docs, or live reads explicitly allowed by the user and repo rules.
- For security/privacy findings, include the exact path, log, artifact, permission, secret-handling, or external-service behavior that creates risk.

## Fixture Provenance

Scan committed docs, tests, snapshots, fixtures, and expected outputs for production-derived identifiers:

- customer, project, vendor, employee, or user names
- source ids, payment ids, invoice ids, document numbers, URLs, emails, or raw payload fragments
- exact amounts, dates, or state combinations that appear copied from live systems

If provenance is unclear, route as `decision needed` or `defer/out of scope` unless quoted evidence proves it blocks the requested change.

## Final Disproof Pass

Before declaring readiness, try to disprove it:

- What source-shape assumption could be wrong?
- What helper, query, fallback, adapter, or abstraction looks overbuilt?
- What branch, state, early return, or sibling path is uncovered?
- What fixture appears production-derived?
- What operator instruction could be harmful if followed literally?
- What acceptance criterion fails to prove the requested outcome?

Return only evidence-backed blockers. Route the rest to `defer/out of scope` or `dismiss`.
