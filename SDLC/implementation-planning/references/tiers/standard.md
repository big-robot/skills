# Standard planning

Use this tier for a normal feature or fix with bounded scope and understood architecture.

## Process depth

- Build a targeted source map across the changed behavior and its known sibling paths.
- Verify every named file, symbol, command, schema, fixture, export, and test against current source.
- Ask only about open decisions that change behavior, authority, security, or approved scope. Record a source-backed, reversible mechanical choice for a low-risk implementation detail.
- Prefer single-ticket mode unless the delivery sizing rule proves that independently green slices are required.
- Write exact acceptance-to-unit-to-command traceability.
- Run one inline self-review and the completion contract.
- Route the finished temporary artifact through `implementation-plan-review`.

## Decision handling

An open high-stakes decision blocks drafting the affected behavior. Continue independent source mapping first, then ask one question through `grill-me` with a recommendation and tradeoff.

Gated decisions include user-visible behavior, source of record, security or privacy, billing or finance, destructive actions, source or vendor selection bias, and operator instructions that could change an authoritative system. Cross-module breadth requires a wider source map; it does not by itself turn every low-risk technical choice into a question.

Do not ask about details current source, repository rules, or existing decisions already settle.

## Standard gate

Before the common handoff, confirm:

- the source map covers the main path, relevant siblings, errors, and persistence or external boundaries
- every change unit is independently coherent and testable
- every new branch, fallback, helper, or query has source evidence and a stated test
- compatibility and existing defaults remain unchanged unless acceptance criteria explicitly change them
- no unresolved high-stakes decision remains

A concrete high-risk discovery may require escalation to `large/complex`. Escalate before adding large-tier ceremony and read only `large-complex.md`.
