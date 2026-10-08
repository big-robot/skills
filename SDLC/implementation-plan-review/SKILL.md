---
name: implementation-plan-review
description: Source-check and repair an OS-temporary standalone ticket plan or Delivery Bundle before publication, validating behavior, source coverage, verification, lifecycle safety, and review receipts.
metadata:
  skill_library:
    tier: owned
---

# Implementation plan review

## Purpose and routing

Resolve relative references from the containing document's canonical location, following installation symlinks, rather than from the target repository or shell working directory. Shared references and companion skills must be installed in the referenced sibling layout; stop and report a missing dependency rather than substituting unrelated guidance.

Treat the plan as unproven until source and repository guidance establish that an implementation agent can execute it without inventing files, contracts, behavior, tests, security boundaries, or product decisions.

For a focused advisory review, inspect the relevant contract/source and answer directly without an artifact, mode selection, or publication preflight. Full review assesses complete implementation readiness or publication.

1. Read repository `AGENTS.md` and treat it as authoritative. Read [stakes-tier.md](../shared/stakes-tier.md) and set review depth.
2. A focused trivial advisory review uses the inline safety check and returns the answer. Promote any formal candidate/bundle at `trivial` to `standard` before mode preflight.
3. Identify the exact input mode and read exactly one reference: [single-ticket](references/modes/single-ticket.md) for a temporary standalone plan with an existing issue or `create new` target; [Delivery Bundle](references/modes/delivery-bundle.md) for a temporary bundle directory. Do not load the other mode; stop on ambiguous input or canonical target.
4. For formal review read [review-procedure.md](references/review-procedure.md), [test-quality.md](../shared/test-quality.md), and the [prepublication artifact contract](../sdlc-artifact-lifecycle/references/prepublication.md). Load the selected mode's publication execution and recovery details only when continuation requires them.
5. For risk-triggered adversarial review read [adversarial-lanes.md](references/adversarial-lanes.md) and select one to three lanes. For evidence packets, confidence/absence gates, provenance, and final disproof use [adversarial-evidence-packet](../adversarial-evidence-packet/SKILL.md).

Standard review covers relevant lanes inline and finishes with an inline blocker pass; use packets for concrete high-risk findings. Large/complex review uses source-backed lanes, evidence packets, acceptance traceability, and final disproof. Technical breadth widens source mapping without making every low-risk mechanic a product decision gate.

## Authority and artifacts

- Prefer current source and repository guidance over stale notes; comments are evidence, not scope changes. Use relevant Codex-native workflows and preserve existing user changes and unrelated dirty work.
- Temporary execution plans, scope locks, source notes and review packets stay in one task-specific OS temporary directory. Separately requested or explicitly repository-required durable system documentation uses its authorized repository location; that exception does not authorize committing temporary planning/review material.
- Keep temporary review material out of `.sdlc-scratch/`, `sdlc-scratch/`, worktrees, and the committed tree. Keep unpublished review work local; never upload private files, extracted text, credentials, client evidence, or source data to external services.
- Keep credentials, private evidence, live customer data, raw production data, and production-shaped identifiers out of committed plans, tests, fixtures, snapshots, and issue bodies.
- Make no GitHub change during review rounds; a clean verdict does not authorize publication. Approved writes require current exact authority, immediate live-state reread, fail-closed drift checks, and complete read-back before temporary cleanup.

## Reviewer independence and allocation

- An independent reviewer did not author the candidate. A reviewing root can qualify when it is separate from the author; review in the author's thread needs a fresh read-only reviewer context. The author/root editor alone changes artifacts; reviewers verify corrections and provide readiness recommendations.
- Standard plans need one independent lead. Add a second bounded reviewer for a materially distinct high-risk area, including large plans with separate behavior and migration/writer risks. Divide the selected one-to-three adversarial lanes; do not duplicate complete reviews or add agents solely for technical breadth.
- Delegate when authorized by the user, applicable `AGENTS.md`, or active orchestration instructions. Prefer `explorer` for routine discovery and factual mapping; use read-only `default` assignments for complex judgment or unavailable explorer. Select supported role/model/effort settings for the task; set a fallback's effort explicitly rather than silently inheriting the parent's. Do not change account configuration as part of review.
- If independent contexts are unavailable or forbidden, perform useful local checks and disclose author-only work as self-review. It does not satisfy required independent review or permit its ready receipt. Report the outstanding independence gate separately from source-backed findings.

## Source and proof boundaries

Apply mode preflight and its read-only artifact `check`, resolve repository and exact source base, then map planned files, symbols, commands, exports, schemas, tests, fixtures, runtime paths, alternate entrypoints, and verification commands. A deterministic check failure returns to local correction before semantic review; it is not a source-review verdict. If the plan or any slice lacks a real source map, stop with `not ready: rewrite from source map`; do not repair a source-blind plan in place.

For each binding verification property trace stimulus -> relevant production composition -> observed assertion at the required boundary. Isolated halves do not prove their interaction unless combined evidence establishes the contract. Declared limitations cannot close binding gaps. Accept source-backed equivalent files, fixtures, test arrangements, or commands that preserve required proof; do not impose a real-service or end-to-end boundary the contract does not require.

Block unsupported source shapes, absence-as-proof, speculative defensive complexity, live-derived fixtures, vague execution instructions, and irreversible operator instructions lacking an explicit product decision. Review-procedure.md supplies the task readiness checks and scan.

## Review and completion

1. The independent lead runs its source-backed review and synthesizes any bounded lane findings under review-procedure.md. Root owns the final report and consequential source checks. Only source-backed findings at confidence `75` or `100`, with exact quoted `file:line` evidence, block readiness. Record standard findings inline; use evidence packets for large/complex review or concrete high-risk findings.
2. Finish independent mechanical review before stopping for a product/policy decision unless the ambiguity prevents further work. Do not guess decisions; present each required decision once with its question, readiness impact, recommendation, tradeoff, and section to update.
3. The sole editor patches resolvable `fix now` findings in the temporary working copy; independent reviewers re-review changed areas, ownership, dependencies, and handoffs. No GitHub mutation occurs during these rounds.
4. Continue only with material progress and a source-backed reason another round can resolve in-scope blockers. Stop on stalled clusters, authority/scope limits, inadequate source maps, or binding drift; return the artifact to its owning workflow.
5. Before `ready`, require every task's exact source-backed execution/verification contract, acceptance ownership, security boundaries, and selected mode gates. Run repository-required plan/docs verification, the placeholder/vagueness scan over every reviewed Markdown file, and mode identity, ownership, graph, base, hash, and publication-readiness checks. Run code tests only when plan edits affect generated docs, executable examples, checked links, or code.
6. Require a clean tier-final check: inline blocker pass for standard; final disproof for large/complex. A new quoted blocker returns through triage and continues only if converging. Emit an evidence packet immediately before the verdict only for large/complex or a concrete high-risk finding; standard's inline final record is sufficient.
7. For formal candidates create and verify the selected mode's clean hash-bound receipt after the clean final check. Deterministic receipt validity does not replace the source-review verdict. Finish the complete read-only review and receipt verification before asking for authority.

## Approval and handoff boundaries

A planning-only request ends with the retained reviewed artifact and no approval question. When continuation is requested, reuse still-exact recorded authority. Otherwise present one exact approval packet identifying the reviewed candidate/bundle, manifest and receipt hashes, target repository/base, publication mutations, and cleanup outcome.

A bounded launch may be covered only when the packet identifies mode, issue/graph target, branch names and targets, merge policy, and cleanup selection. If launch facts are unknown until `codex-development-loop` read-only preflight, carry publication authority downstream and request only uncovered launch authority there.

Approval carries through exact publication and the identified bounded launch until artifact, manifest, receipt, target, base, graph, scope, security, authority, or launch boundary drifts. Terminal merge, deployment, production/destructive actions, credential use, and other sensitive actions retain their separate gates.

- Single-ticket review retains its draft or, after exact authority and verified read-back, yields one canonical standalone issue with `ready-for-agent`. Hand its URL and carried launch authority to `codex-development-loop`.
- Delivery Bundle review retains its bundle or a clean hash-bound receipt. After exact authority, [publish-reviewed-tickets](../publish-reviewed-tickets/SKILL.md) creates/updates and verifies the graph before handing parent URL and carried launch authority to `codex-development-loop`; do not publish the bundle from review.
- Product, scope, security-policy, authority, source, base, identity, ownership, body, graph, receipt, manifest, or decision drift returns to its owning workflow. Mode references retain the complete identity, publication, read-back, recovery, and cleanup checks.

## Final response

Lead with `ready`, `not ready: rewrite from source map`, `not ready: product decisions remain`, or `not ready: blockers remain`.

Report the reviewed artifact; fixed/remaining blockers with confidence and exact quoted evidence for every `75`/`100`; deferred/dismissed findings; reviewer independence, roles and any fallback settings; lanes, convergence and tier-final status; verification; remaining decisions; readiness for Codex subagent-driven development; exact canonical or retained paths; and cleanup status from the selected mode.
