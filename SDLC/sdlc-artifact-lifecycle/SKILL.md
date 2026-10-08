---
name: sdlc-artifact-lifecycle
description: Route plans, Delivery Bundles, review receipts, GitHub issue graphs, durable repository docs, and machine state. Use when deciding canonical ownership, temporary placement, publication recovery, or cleanup for SDLC artifacts.
metadata:
  skill_library:
    tier: owned
---

# SDLC Artifact Lifecycle

Prevent competing sources of truth.

## Routing

Read [the prepublication artifact contract](references/prepublication.md) for authority, artifact placement, privacy, deduplication, and retention. Planning and prepublication review read that reference directly; they do not need the execution lifecycles below.

For requested publication or recovery, read only the applicable lifecycle below and the owning workflow's mode-specific execution instructions. Preserve current exact authority and verified read-back before cleanup.

## Single-Ticket Lifecycle

Use this path when the whole change is the smallest useful independently green increment and fits one fresh agent context, one PR, and one complete-diff review. Apply the delivery sizing rule in `implementation-planning`.

1. `implementation-planning` writes `candidate.md` and its schema-v1 `publication-manifest.json` in one task-specific OS-temporary directory. They record the repository, existing standalone target or `create new`, proposed title/body hash, base ref/SHA, verification commands, and a digest of existing canonical issue state when applicable. Planning does not mutate GitHub.
2. For an existing target, its current body remains the canonical request during review. Require no native parent or parent lifecycle state. For `create new`, require a duplicate search.
3. `implementation-plan-review` source-checks and repairs the temporary candidate. GitHub remains unchanged during review rounds.
4. After a clean tier-final check, review creates and verifies the schema-v2 receipt. When continuation is requested, one exact approval may authorize publication and a fully described bounded launch. Re-read and require unchanged canonical issue state, then create or update only the declared standalone issue, apply `ready-for-agent`, and verify the exact reviewed body, title, labels, identity, open state, and absence of a native parent.
5. Delete only the exact temporary directory after full read-back. Hand the issue URL and any carried launch authority to `codex-development-loop` in `single-ticket` mode. If launch facts are incomplete, CDL completes read-only preflight and asks only for uncovered launch authority.

Standalone tickets do not use `type:parent`, `ready-for-dev`, `plan:ready-for-review`, or `plan:ready-for-tickets`.

## Delivery Bundle Lifecycle

Use this path when separate useful independently green increments improve review or feedback, or the whole change exceeds one agent context or complete-diff review. Apply the delivery sizing rule in `implementation-planning`; do not split solely because individual functions can be tested separately.

1. `implementation-planning` creates one OS-temporary directory containing `bundle.md`, schema-v1 `publication-manifest.json`, and exact future child bodies under `slices/`.
2. `implementation-plan-review` source-checks the parent contract, every child body, acceptance ownership, manifest graph, and dependency graph. Evidence-backed detail fixes stay in that directory and trigger re-review of affected graph and ownership.
3. After a clean tier-final check, review writes and verifies the schema-v2 `review-receipt.json`, binding every reviewed file and manifest to the GitHub repository and exact base ref and commit. Its deterministic verdict is not the review-ready verdict.
4. When continuation is requested, one exact approval may authorize the reviewed graph publication and a fully described bounded launch. `publish-reviewed-tickets` verifies the receipt, creates or updates only the designated parent, creates inactive children, and verifies exact bodies plus native parent and blocker relationships.
5. Only after the whole inactive graph verifies, apply `ready-for-agent` to every child and `ready-for-dev` to the `type:parent` parent. Delivery Bundle mode does not use `plan:ready-for-review` or `plan:ready-for-tickets`.
6. On partial publication, retain non-runnable issues and `<bundle>/publication-state.json`; resume those exact issues after live read-back rather than creating duplicates. Do not close or delete partial issues automatically.
7. After the complete active graph verifies, delete only the exact temporary bundle and hand the parent URL and any carried launch authority to `codex-development-loop`. If launch facts are incomplete, CDL completes read-only preflight and asks only for uncovered launch authority. The Controller remains unchanged.

The parent holds global decisions and invariants. Each child holds exact slice execution detail. Together they form the canonical execution contract after publication; do not duplicate every child body in the parent.

External writes require current exact authority. One post-review approval may cover the exact artifact publication and a fully described bounded launch; reuse it while all bindings remain exact. Terminal merge, deployment, production or destructive actions, credential use, and other sensitive actions retain separate approval. Missing workflow labels block publication; do not create them as a side effect of planning or review. Planning labels are not part of the current single-ticket or Delivery Bundle lifecycle.

## Cleanup

Report:

- which tracker issues are canonical
- which canonical body and label state were read back
- which durable repository docs were updated
- where machine-only state was placed
- which temporary drafts were deleted
- which Delivery Bundle receipt and publication-state files were retained or deleted
- any duplicate or stale local SDLC documents proposed for cleanup
- any sensitive material intentionally kept out of durable destinations

Do not delete user-created files unless explicitly asked. List proposed deletions with reasons.
