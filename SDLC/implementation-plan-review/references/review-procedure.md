# Formal review procedure

Read for formal implementation-readiness or publication review. The entrypoint owns authority, proof boundaries, finding confidence, tier-final checks, approval, and handoff; the selected mode owns identity, receipt, publication, and cleanup mechanics.

## Task readiness checks

Each task must identify:

- files to create versus modify and existing symbols to inspect
- exact types, schemas, constants, query shapes, exports, commands, and runtime inputs
- source evidence covering relevant analogous call sites, states, handlers, persistence paths, and early returns
- evidence for every external API/source-data field, missing-field assumption, state value, query shape, and lookup path
- exact tests, fixtures, expected outputs, commands, and rationale satisfying [test-quality.md](../../shared/test-quality.md)
- baseline evidence appropriate to the change: regression demonstration for changed behavior when practical; preserved-contract checks for refactors; proportionate static/manual checks for mechanical work
- exact task order, ownership, sibling and downstream handoffs
- security boundaries for committed files, ignored artifacts, stdout, logs, credentials, and external services
- the selected mode's exact identity, lifecycle, ownership, and publication preconditions

Trace binding composition proof under the entrypoint's required boundary. A declared limitation cannot close a gap, and equivalent source-backed mechanics are allowed.

Scan every reviewed Markdown file for vague execution language, including `similar to`, `high-signal`, `if needed`, `appropriate error handling`, `write tests for the above`, `left to the implementer`, `TBD`, and `TODO`. Patch each hit or establish why it does not leave behavior to the implementer.

Also check for live-derived names, identifiers, amounts, payloads, or production-shaped values replacing synthetic fixtures; temporary authority placed in machine-state/worktree/repository paths; unsupported defensive complexity; absence treated as proof; and irreversible accounting or source-system operator instructions without an explicit product decision. Durable system documentation is a separate authorized artifact class, never an exception for committing temporary plans or review packets.

## Review lanes

Cover relevant lanes inline for standard review; use packets for large/complex or concrete high-risk findings. [Adversarial lanes](adversarial-lanes.md) owns risk triggers and selective adversarial lane selection; it does not require every routine review to load additional lanes.

- Repo guidance/security: rules, credentials, private data, external services, environment handling, committed versus ignored artifacts, logs, stdout, and durable docs.
- Mechanical source verification: files, symbols, commands, imports, exports, schemas, types, tests, fixtures, and verification commands.
- Change-surface coverage: sibling paths, alternate entrypoints, early exits, adapters, wrappers, jobs, UI flows, persistence paths, and shared-behavior tests.
- Source assumptions/minimality: external APIs, source data, returned fields, missing metadata, transitions, and lookups. Challenge unsupported fallbacks, parent lookups, adapters, generalized helpers, and optional branches.
- Task order/ownership: commands, types, modules, and files are introduced once; dependencies are ordered; later tasks neither re-introduce nor depend on missing work.
- Behavior/parity: defaults, migrations, compatibility, and acceptance match current code unless explicitly changed. Require evidence for each new branch, fallback, helper, or query.
- Operator copy safety: destructive, accounting-authoritative, or source-of-record instructions require explicit product authority.
- Artifact lifecycle/docs/handoff: temporary material stays temporary, GitHub becomes canonical only after verified publication, durable docs need authorized lasting value, and comments remain evidence.

## Independent lane assignments

Follow the entrypoint's reviewer independence, authorization, and role allocation. Give each reviewer a self-contained assignment with repository/base, exact candidate, settled scope, relevant guidance/source paths, its bounded review responsibility, explicit read-only scope, and tier-appropriate output. Provide raw source access and the source index, not the author's expected verdict. Root remains coordinator and sole editor; reviewers may inspect any relevant source needed to challenge the candidate.

Use [adversarial-evidence-packet](../../adversarial-evidence-packet/SKILL.md) for packet fields, confidence anchors, quote/absence gates, fixture provenance, fingerprints, cluster keys, and final disproof when the tier requires packets. Keep raw output in reviewer threads or temporary evidence files and return compact findings with citations. Unavailable independent review follows the entrypoint's disclosed self-review fallback, not an independent verdict.

## Triage and synthesis

Review is a readiness gate, not the primary author of a weak plan. Route every finding into exactly one bucket:

- `fix now`: evidence-backed blocker to patch before execution
- `decision needed`: product or policy ambiguity blocking readiness
- `defer/out of scope`: real but tangential, pre-existing, or outside confirmed scope
- `dismiss`: disproven, duplicate, fixed, or too weak to retain

After the lanes, the independent lead runs one synthesis-judge pass and returns its readiness recommendation to root:

- de-duplicate and read source before rating impact
- discard lane/subagent severity labels; assign final confidence, route, and readiness effect
- promote exact quoted `file:line` evidence with concrete execution-blocking impact to `75` or `100`; demote unquoted/speculative claims to `50` or lower
- suppress by evidence-packet fingerprint and cluster key, not wording
- never reopen fixed, deferred, or dismissed findings without materially new evidence

Standard inline findings can block under the same source/confidence/quote gate. Packet format is required only by large/complex review or a concrete high-risk finding.

## Progress and convergence

Run source-backed review, selected lanes, and synthesis. Finish independent mechanical review before stopping for a decision unless ambiguity prevents further review. Patch resolvable `fix now` findings in the task's temporary copy, then re-review changed areas, affected ownership, dependencies, and handoffs.

Classify each round:

- `converging`: blocker set materially shrank, new evidence resolved uncertainty, and remaining fixes stay in scope. Record progress and why another round can resolve the rest.
- `clean`: no `75`/`100` blocker remains. Immediately run standard's inline blocker pass or large/complex's final disproof.
- `decision-gated`: product, scope, security-policy, or authority choice is required. Finish independent review, then return `not ready: product decisions remain`.
- `stalled`: same blocker cluster returns without new evidence, no net progress, or next fix exceeds scope/authority. Return `not ready: blockers remain`.
- `invalidated`: source map is inadequate or relevant source, base, identity, ownership, body, graph, or decision state drifted. Return to the owning planning/review step.

A tier-final new blocker returns through triage. Continue only when converging; possible additional rounds alone are no reason to continue. Every new round names material progress and a source-backed reason it can close remaining in-scope blockers.

Never say `ready` before the clean tier-final check and mode-required verification. Emit packets immediately before the verdict for large/complex or a concrete high-risk finding; an inline final blocker record suffices for standard.
