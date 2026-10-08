---
name: publish-reviewed-tickets
description: Publish an implementation-plan-review-approved Delivery Bundle to GitHub as one parent issue and rigorous tracer-bullet sub-issues. Use only after a temporary bundle directory has a clean hash-bound review receipt and the user explicitly approves publication; create and verify native parent/blocker relationships before activating the graph.
metadata:
  skill_library:
    tier: owned
---

# Publish reviewed tickets

Publish exact reviewed issue bodies. Do not decompose, rewrite, improve, or reinterpret the bundle.

## Shared contract

Resolve relative references from the containing document's canonical location, following installation symlinks, rather than from the target repository or shell working directory.

- GitHub only. Require native sub-issue and blocking relationships.
- Require explicit user publication authority for this exact bundle, repository, parent target, slice graph, and activation plan before any GitHub write. Accept earlier combined authority only when it explicitly covers publication of this unchanged receipt-bound artifact and exact target. General planning or review approval never authorizes publication.
- Read `AGENTS.md` and the configured tracker guidance before preflight or mutation.
- Treat `publication-manifest.json`, `bundle.md`, `slices/*.md`, and `review-receipt.json` as one reviewed publication input.
- Permit only deterministic replacement of reviewed `{{PARENT}}` and `{{SNN}}` reference tokens with real GitHub issue references.
- Keep standalone single-ticket planning and publication out of scope.
- Do not create labels, close issues, delete issues, post scope in comments, launch implementation, or change the Controller.
- Keep credentials, private evidence, raw production data, and sensitive identifiers out of GitHub.

## Stage routing

Load detail only for the current stage:

1. For bundle inspection, receipt verification, and read-only GitHub preflight, read [references/bundle-preflight.md](references/bundle-preflight.md). Do not load the publication procedure if preflight stops.
2. Present the exact publication plan described by that reference. Proceed only when the user's approval covers the complete plan.
3. After successful preflight and exact approval, read [references/github-publication.md](references/github-publication.md) and follow its inactive publication, relationship verification, activation, rollback, and recovery procedure.

Do not load both references merely to audit the skill or explain its workflow. A real approved publication normally needs them in sequence because the second stage depends on the first.

## Consolidated gates

Before every write, require all of these to remain true:

- the receipt reports only deterministic validity and verifies the complete unchanged manifest and bundle against the exact GitHub repository, target, base ref, and 40-character base commit
- the reviewed slice graph and parent-acceptance ownership remain complete, unique, and acyclic
- no unresolved decision, review blocker, ambiguous issue identity, duplicate issue, missing required label, or lifecycle conflict remains
- the user's approval still identifies the exact bundle, repository, parent target, slices, native relationships, and final labels
- every partial issue recorded by an earlier attempt has been re-read and matched to the reviewed bundle

Any failed gate stops publication. Content, repository, base, graph, or scope drift returns the bundle to `implementation-plan-review`. Missing labels or ambiguous identity block publication. Do not create labels or guess a repository, issue, or relationship identifier.

Re-run receipt verification immediately before the first write. Re-read external state after every write before recording that phase as complete.

## Required outcome

- Publish and verify the complete parent, child, and blocker graph while it is non-runnable.
- Require rendered bodies and their readable Parent and Blocked By sections to agree with native GitHub relationships.
- Add `ready-for-agent` only after the inactive graph verifies. Add parent `ready-for-dev` last.
- If activation fails, roll back runnable child labels created by that attempt, verify the rollback, and leave the parent without `ready-for-dev`.
- Do not add `plan:ready-for-review` or `plan:ready-for-tickets` in Delivery Bundle mode.

## Partial publication boundary

Fail closed and resume the same publication rather than restarting it.

- Keep partial issues non-runnable and preserve the reviewed bundle plus `publication-state.json`.
- Record only issue URLs and phases verified by live read-back. Local state is never proof of GitHub state.
- Reuse verified partial issues. Never create duplicates. Never close or delete partial issues automatically.
- If rollback cannot remove every runnable label, report the exact live labels and keep the parent without `ready-for-dev`.

## Completion and handoff

Completion requires a full live read-back of exact titles, rendered bodies, labels, open state, and native relationships.

- Report the canonical parent URL, child URLs, labels, native graph, and reviewed base.
- Delete only this task's exact OS-temporary bundle directory after the full active graph verifies.
- Do not delete user-created files or unrelated temporary state.
- Treat deletion failure or incomplete read-back as unfinished cleanup, not as evidence that publication failed.
- Hand the verified parent URL to `codex-development-loop`; do not launch implementation.
