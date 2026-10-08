# Large or complex planning

Choose this tier under the shared stakes contract when consequence, authority, reversibility, or evidence quality requires deeper review, including consequential migrations, security-sensitive work, and unresolved high-stakes behavior. Cross-module breadth alone expands source mapping; it does not select this tier.

## Process depth

- Build a full source map of every relevant entrypoint, caller, adapter, job, state transition, persistence path, operator path, and test seam.
- Trace every parent acceptance criterion to one implementation owner and exact verification path.
- Extract every assumption about external APIs, source data, missing fields, state values, query shapes, preservation, fallbacks, and compatibility.
- Resolve every open product, scope, security-policy, or authority decision before finalizing the affected plan section. Record a source-backed implementation hypothesis for reversible low-risk mechanics.
- Prefer synthetic fixtures and sanitized evidence. Keep private or production-derived data out of planning artifacts.
- Stress-test delivery sizing, blocker order, migration order, and rollback or compatibility obligations.
- Run one author completion preflight covering source coverage, acceptance ownership, sequencing, verification, security, operator copy, and artifact boundaries. Use the entrypoint's discovery handoff for authorized research delegation.

Planning prepares evidence. `implementation-plan-review` owns independent adversarial lanes, synthesis, and final disproof; do not duplicate that verdict loop in the author's preflight.

## Decision handling

Finish independent mechanical research before asking questions. Then use `grill-me` one question at a time for every open product, scope, security-policy, or authority decision. Technical breadth requires broad source mapping, not a question for every low-risk implementation detail.

For each question, give the recommended answer, tradeoff, affected acceptance criteria, affected slices, and exact plan sections that will change. Do not encode a provisional choice as settled scope.

## Change-path closure

For the core behavior or invariant, inspect and account for:

- sibling modules and alternate entrypoints
- wrappers, adapters, planners, patchers, and sanitizers
- scheduled, manual, background, repair, backfill, and diagnostic paths
- UI, report, export, and operator consumers
- schemas, package exports, runtime configuration, and persistence
- existing callers, fixtures, tests, missing and null inputs, fallbacks, and errors

Each relevant path must appear in an implementation slice or an evidence-backed exclusion. A sample of a wider enumerable contract is not proof of full coverage.

## Large or complex gate

Before the common handoff, confirm:

- every acceptance criterion has one primary implementation owner
- the dependency graph is acyclic and blocker order matches implementation order
- expand-migrate-contract sequencing preserves compatibility where required
- every external or production-data assumption is verified or marked `UNVERIFIED`
- the verification contract covers integrated behavior through a practical public interface or stable seam
- no unresolved decision can change behavior, authority, security, slice boundaries, or dependencies
- the author completion preflight found no unresolved source-backed handoff blocker; independent review remains required
