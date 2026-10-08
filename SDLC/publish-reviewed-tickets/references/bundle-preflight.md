# Bundle and preflight contract

Read this reference to inspect a Delivery Bundle, verify its receipt, perform read-only GitHub checks, and prepare the exact publication plan. Stop before loading the publication procedure if any check fails.

Read [publication-manifest.md](publication-manifest.md) when creating or checking the manifest and deterministic generated regions.

## Required bundle

Require one task-specific OS-temporary directory:

```text
delivery-bundle/
  bundle.md
  publication-manifest.json
  review-receipt.json
  slices/
    S01.md
    S02.md
```

`publication-manifest.json` is the canonical machine-readable contract. It must identify:

- GitHub `owner/repository`
- an existing parent issue explicitly designated by the user, or `create new`
- the exact reviewed base ref and 40-character commit SHA
- slice IDs, titles, outcomes, blockers, acceptance owners, and exact verification commands
- one primary owner and explicit verification mapping for every parent acceptance criterion

`bundle.md` must identify:

- the same GitHub repository, parent target, base ref, and base SHA
- parent title and exact parent body
- generated dependency and ownership tables that exactly match the manifest

Each `slices/SNN.md` must contain the exact future child body between its issue-body markers and include:

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

Require the templates' exact boundary markers. Read the parent title and body only from `bundle.md`'s Parent Issue section and `BEGIN PARENT BODY` block. Derive each child title only from `# SNN — <title>` and publish only the content inside its `BEGIN ISSUE BODY` block.

Require at least two slices. Stable IDs must be unique. The graph must be acyclic, and publication order must put blockers before blocked children. A final integration slice is valid only when it owns delayed implementation or verification work that the Controller's parent-readiness phase does not already own.

## Receipt verification

Before clean review and receipt creation, render the generated tables:

Resolve the [receipt tool](../scripts/review-receipt.mjs) from this document's canonical location and set `review_receipt_script` to its absolute path before running these commands.

```bash
node "$review_receipt_script" render \
  --bundle-dir <absolute-bundle-directory>
```

Run this command before any GitHub read-write sequence:

```bash
node "$review_receipt_script" verify \
  --bundle-dir <absolute-bundle-directory> \
  --repo-root <absolute-repository-root>
```

Require a clean result. The receipt proves deterministic schema, identity, graph, ownership, verification mapping, generated-table, and hash validity; it does not replace the reviewer's judgment. It binds the manifest and every reviewed Markdown file to GitHub repository identity, target, base ref, and exact base commit. Any file change, added or removed slice, repository, target, manifest, or base-ref change stops publication and returns the bundle to `implementation-plan-review`.

Also verify:

- the user explicitly approved the exact slice map; approval of the reviewed publication packet containing that map satisfies this requirement, including a combined publication-and-launch approval
- the receipt verdict is `deterministically-valid`
- no unresolved product decision or review blocker remains
- `type:parent`, `ready-for-dev`, and `ready-for-agent` already exist
- the target parent, when present, is the exact issue explicitly designated by the user
- the target parent has no lifecycle or ownership conflict
- no duplicate parent or child exists, except issues recorded by this bundle's verified partial-publication recovery state

## Exact publication plan

Before mutation, present one plan containing:

- repository and reviewed base
- parent create or update target
- every slice ID and title in dependency order
- every native parent and blocking edge
- final labels
- an explicit statement that no issue becomes runnable until the complete graph verifies

The approval must cover this exact plan. If it does not, stop without a write.
