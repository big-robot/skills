---
name: implementation-planning
description: Create a source-backed standalone implementation-ticket plan or temporary Delivery Bundle. Use for non-trivial work needing exact scope, units, verification, and an implementation-plan-review handoff before implementation or publication.
metadata:
  skill_library:
    tier: owned
---

# Implementation planning

## Purpose and routing

Resolve relative references from the containing document's canonical location, following installation symlinks, rather than from the target repository or shell working directory. Shared references and companion skills must be installed in the referenced sibling layout; stop and report a missing dependency rather than substituting unrelated guidance.

Create a plan an implementation agent can execute without inventing files, contracts, behavior, tests, security boundaries, or product decisions. Prefer the smallest safe plan; do not pre-write large implementation blocks or turn an ordinary fix into a long PRD.

For a focused advisory question, inspect the relevant source and answer directly. Do not create a candidate, require a delivery mode, or run publication preflight unless the request asks for implementation readiness or publication assessment.

1. Read repository `AGENTS.md` and treat it as authoritative. Read [stakes-tier.md](../shared/stakes-tier.md) and set the tier before choosing process depth.
2. Read exactly one matching tier: [trivial](references/tiers/trivial.md), [standard](references/tiers/standard.md), or [large/complex](references/tiers/large-complex.md). Follow its exit or escalation rule.
3. For non-trivial work, build enough of the source map to choose delivery mode. Formal planning reads exactly one mode: [single-ticket](references/modes/single-ticket.md) for one unit, or [Delivery Bundle](references/modes/delivery-bundle.md) for multiple slices.
4. Read [plan-contract.md](references/plan-contract.md) when constructing formal units and their verification contract. Do not load it for focused advisory answers.
5. Before drafting tests or choosing artifact paths, read [test-quality.md](../shared/test-quality.md) and the [prepublication artifact contract](../sdlc-artifact-lifecycle/references/prepublication.md). Publication execution and recovery instructions belong to the requested continuation, not planning.

Do not load unselected tier or mode references. Trivial work follows its compact exit; standard and large/complex candidates require `implementation-plan-review` by a reviewer who did not author the candidate. The review skill owns reviewer allocation and fallback disclosure.

## Authority and artifacts

- Inspect current source before writing tasks; discover files and symbols rather than expecting the request to predict them. Cover each relevant analogous path or exclude it with evidence. Mark unanswered source-shape questions `UNVERIFIED`; missing evidence does not prove absence.
- Settle product decisions in this order: user request; repository `AGENTS.md` and rules; scope lock, decision record, or ADR; current source and configuration. Comments and prior notes are evidence, not scope authority. Code patterns alone do not settle an open product decision.
- Mark a decision `settled` only with an authoritative source. Use `grill-me` only for open decisions required by the tier; source-answerable mechanics do not need it. Never guess user-visible behavior, source of record, billing, finance, legal, privacy, compliance, security, destructive actions, source/vendor bias, or operator instructions. Present each blocking decision with its question, readiness impact, recommendation, tradeoff, and affected section.
- Preserve user changes and unrelated dirty work. Do not add defensive branches or helpers for unsupported possibilities.
- Temporary execution plans, scope locks, source notes and review packets stay in one task-specific OS temporary directory. Separately requested or explicitly repository-required durable system documentation uses its authorized repository location; that exception does not authorize committing temporary planning/review material.
- Keep temporary planning material out of `.sdlc-scratch/`, `sdlc-scratch/`, worktrees, and repository docs. `sdlc-scratch/` holds downstream machine ledgers and audits only. Classify artifacts as GitHub authority, durable repository documentation, temporary working material, or machine-only state.
- Keep credentials, private evidence, customer data, raw production data, and production-shaped identifiers out of committed plans, tests, fixtures, snapshots, and issue bodies. Publish repository source citations only to the configured repository approved for that content.
- Do not instruct an operator to delete, void, cancel, post, reverse, approve, mark paid, or perform another irreversible source-system or accounting action without an explicit product decision.
- Make no GitHub write during planning. Planning-only work ends with a retained candidate and no publication or launch approval question.

## Binding contract and implementation hypothesis

Acceptance criteria, explicit exclusions, settled product decisions, security boundaries, repository/base identity, and publication target are binding. Required observable behavior, security invariants, and explicitly required verification properties and boundaries are also binding. Exact files, symbols, steps, test structure, fixtures, and command mechanics outside those constraints are source-verified implementation hypotheses.

A Worker may make a documented, reversible mechanical deviation when fresh source evidence requires it and the binding contract remains intact, including equivalent proof across the required boundaries. Revalidate affected evidence and checks, record the substitution and its equivalence in existing verification evidence, and remain within approved repository and branch scope. Equivalent mechanics need no renewed approval. Weakening proof or changing behavior, acceptance, scope, authority, security, privacy, target, base, graph, or dependency returns to the contract owner or applicable approval gate.

## Formal workflow

1. Restate the outcome; resolve repository, exact base ref, and current commit. Build the source map before proposing units, using the discovery handoff below when delegating.
2. Read any `grill-me` scope lock at its exact absolute path. Carry confirmed scope, acceptance, and exclusions; record settled and open decisions.
3. Define acceptance criteria and exclusions; separate binding constraints from implementation hypotheses. Run only a bounded disposable feasibility experiment when source cannot answer a material question, under plan-contract.md.
4. Choose and justify the smallest useful independently green increment. One unit must be independently testable, green without unfinished companions, fit one fresh agent context, and support complete-diff review with at most one consolidated correction batch.
5. Split only when separate useful outcomes pass public-interface or stable-seam checks and reduce review/feedback delay. Merge parts that cannot remain correct and green alone; never size by lines or file counts. Use single-ticket for the smallest coherent whole, otherwise Delivery Bundle; explicit user direction may force either.
6. Write exact units, order, ownership, dependencies, and acceptance-to-command verification using plan-contract.md and the selected mode's templates and markers.
7. Select only applicable safety invariants below. Complete the completion contract and tier/mode gates, then add the mode's exact review handoff outside publishable body markers.

## Discovery handoff

- When delegation is authorized, assign nonoverlapping, read-only discovery scopes. Prefer `explorer` for routine file, caller, and test mapping; use `default` for complex analysis. Give each assignment the repository/base, relevant behavior, scope and exclusions, sources, and required verification.
- Return a compact source map of inspected paths/symbols, responsibilities, relevant invariants, public test seams, citations, and unresolved questions. Keep raw reads in the agent thread or task-specific temporary evidence files; preserve privacy boundaries.
- Root spot-checks consequential claims and closes coverage gaps without rebuilding every delegated map. Refresh affected evidence when source changes. Independent reviewers may inspect any source needed to challenge the map; planner summaries do not establish review correctness.

## Conditional safety invariants

Select from the changed behavior and production paths it invokes or relies on:

- Write/external side effect or reliance on its ordering: identify preconditions before the first effect and prove rejected input causes no unintended effect.
- Shared-resource ownership, retry, resume, or recovery: identify source-supported overlaps, ownership loss, cleanup responsibility, and recovery transitions.
- Credential-bearing calls or destination selection, or reliance on destination restrictions: identify allowed destinations and enforcement before credentials are transmitted.

Record relevant invariants and checks in existing unit risks and verification sections; reuse sufficient source-backed evidence. Justify excluding an apparently relevant trigger. When none applies, omit extra cases; mechanical/documentation changes need no exhaustive input/state/failure matrix.

## Completion contract

Before handoff, patch every failure; do not call a candidate ready unless:

- The source map is current and covers or evidences exclusion of each relevant analogous path. Source-shape, fallback, preservation, missing, error, throttled, and unknown policies are evidenced or explicitly `UNVERIFIED`.
- Decisions are settled or carry the tier-required recommendation and gate; acceptance, exclusions, units, tests, and commands agree. Each acceptance criterion has one owning unit and exact check.
- Each unit names test files or an evidence-backed `No test: <reason>` with a manual/static check. Existing commands/test files exist; planned files are labelled `Create`. Every named test appears in a command; each changed package has typecheck or equivalent static verification.
- Every test protects behavior through the highest practical public interface or stable seam and names its baseline evidence, fixture strategy, and rationale. The verification contract preserves required properties and boundaries, including equivalent mechanical substitutions.
- Security, privacy, operator-copy, and artifact boundaries are explicit. Live-data commands declare read-only, dry-run, or write-gated behavior; repair/backfill tools disclose whether they write. Write modes require explicit approval gates.
- No unresolved placeholders or vague execution language remains. Run plan-contract.md's scan and a skeptical pass for anything `implementation-plan-review` would block.
- The selected tier/mode's identity, base, ownership, graph, and temporary-path gates pass; no GitHub write occurred; the exact temporary path and mode-required review handoff are ready.

## Handoff boundaries

Planning ends with temporary working authority, never a canonical scope mutation. `implementation-plan-review` checks source, behavior, tests, sizing, ownership, and artifact safety independently.

A standalone issue becomes canonical and receives `ready-for-agent` only after clean review, exact publication authority, and verified read-back. A Delivery Bundle requires a clean hash-bound review receipt and exact authority before `publish-reviewed-tickets` publishes and reads back the inactive graph, then activates children and parent. Delete only task-specific temporary planning material after verified publication; `publish-reviewed-tickets` owns bundle cleanup.

`codex-development-loop` implements only the verified issue or native graph; it does not repair planning defects in place. Comments, review notes, and machine files never replace canonical bodies or native relationships. Source, base, identity, ownership, body, graph, or product-decision drift returns to its owning workflow. A later reviewed artifact may carry one exact publication and bounded-launch approval; planning does not request it early.
