# Delivery Bundle mode

Use this mode when the change has at least two useful, independently green increments, or exceeds one fresh agent context or complete-diff review. Require at least two slices; do not split tightly coupled work merely to increase the slice count.

## Temporary artifact

Create one task-specific OS-temporary directory:

```text
delivery-bundle/
  bundle.md
  publication-manifest.json
  slices/
    S01.md
    S02.md
```

Copy [delivery-bundle-template.md](../../assets/delivery-bundle-template.md) to `bundle.md`. Copy [delivery-slice-template.md](../../assets/delivery-slice-template.md) once per slice. Preserve every boundary marker.

Create `publication-manifest.json` as schema v1 with `kind: "delivery-bundle"`, repository, base ref/SHA, declared parent target/title, slice IDs/titles/outcomes/blockers/verification, and acceptance ownership. The manifest is the deterministic source for bracketed dependency and ownership tables in `bundle.md`. Do not create `review-receipt.json`; `implementation-plan-review` owns the clean receipt. Do not publish any issue during planning or review.

Follow the exact schema and run `render --bundle-dir`, then read-only `check --bundle-dir` with the exact repository/base bindings from [Publication manifest contract](../../../publish-reviewed-tickets/references/publication-manifest.md) before handing the bundle to review. Re-render after any manifest graph or ownership change and recheck the resulting bodies. Slice acceptance entries use `- [ ] AC-NN: <criterion>` with the manifest's owned acceptance IDs.

## Parent contract

`bundle.md` must contain:

- exact GitHub `owner/repository`
- an existing parent issue explicitly designated by the user, or `create new`
- exact base ref and current 40-character base SHA
- parent title and exact future parent body
- global outcome, settled decisions, invariants, security boundaries, exclusions, overall acceptance criteria, and Controller verification contract
- manifest-backed slice map with stable ID, title, independently testable outcome, blockers, and owned parent acceptance criteria
- one primary child owner for every parent acceptance criterion

Additional verification ownership may not duplicate implementation ownership. Do not duplicate slice execution detail in the parent.

## Child contracts

Each `slices/SNN.md` is one exact future child body. Its H1 supplies the issue title. Publishable content belongs only between `BEGIN ISSUE BODY` and `END ISSUE BODY`.

Require these sections:

- Parent
- Outcome
- Source Map
- Files And Symbols
- Implementation Steps
- Behavior, Invariants, Edge Cases, And Source Assumptions
- Acceptance Criteria
- Tests And Verification
- Security And Privacy
- Explicitly Out Of Scope
- Blocked By

Use only `{{PARENT}}` and `{{SNN}}` tokens for issue references not yet known. Global facts belong in the parent. Slice-specific execution facts belong in the child. Put actual cross-slice code contracts in the owning child’s implementation steps; keep publication handoff and baseline metadata outside the publishable body markers. Parent and child together form the complete execution contract.

## Slice map and dependencies

Each slice must:

- own one independently testable behavior
- land green without unfinished companion work
- fit one fresh agent context
- support one complete-diff review
- own exact parent acceptance criteria
- name readable blockers that agree with the proposed native dependency graph

Stable IDs and filenames must be unique. The graph must be acyclic. Blockers must precede blocked slices. A final integration slice must own real delayed work rather than repeat `codex-development-loop` parent verification.

## Pre-review boundary changes

Complete source-backed planning and independent read-only review before requesting approval. During that work, revise a slice boundary, order, or blocker when evidence requires it; re-review the affected graph and acceptance ownership. A binding behavior, scope, security, or authority change remains decision-gated. The final exact map is presented once with the reviewed publication packet.

## Mode gate

Require:

- complete acceptance ownership
- acyclic dependency graph
- manifest graph, ownership, and generated-table agreement
- exact parent and child boundary markers
- exact repository, base ref, and base SHA
- every child body section
- no GitHub publication
- absolute temporary bundle path

Put shared source-backed facts in the parent or owning child rather than duplicating them. Hand the absolute bundle directory to `implementation-plan-review`.

Offer exactly:

> Review this exact Delivery Bundle with `implementation-plan-review`. Keep the bundle OS-temporary and make no GitHub change until review is clean. A later exact approval may authorize its publication and any bounded launch scope.
