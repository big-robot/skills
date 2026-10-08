# GitHub publication procedure

Read this reference only after the bundle preflight passes and the user has approved the exact publication plan. Keep the graph non-runnable until every body and native relationship verifies.

## Phase 1: publish the inactive graph

1. Satisfy `SKILL.md`'s immediate pre-write receipt gate.
2. Create the parent, or update only the explicitly designated parent, with the reviewed title and body. Apply `type:parent`; do not apply `ready-for-dev`.
3. Re-read the parent. Verify repository, number, title, rendered body, open state, and labels.
4. Create children in dependency order without `ready-for-agent`.
5. Replace only reference tokens whose real issue numbers are now known. Do not change substantive wording.
6. After each creation, re-read and verify the exact title and rendered body.
7. Create native parent/sub-issue and blocking relationships with the configured GitHub operation.
8. Re-read every issue and native relationship. Require readable Parent and Blocked By sections to agree with native state.

Write resumable coordination only to `<bundle>/publication-state.json`. Record real issue URLs and completed phases only after creating and re-reading each external object. Never predict an issue number or relationship identifier. This file is machine state, not reviewed scope, and is outside the receipt hash set.

## Phase 2: activate after verification

Only after the complete inactive graph verifies:

1. Add `ready-for-agent` to every child.
2. Re-read every child. Require the exact rendered body, native relationships, `ready-for-agent`, and no conflicting lifecycle label.
3. If any child activation fails, remove `ready-for-agent` from children activated by this attempt, verify the rollback, keep the parent without `ready-for-dev`, and stop with exact evidence.
4. Add `ready-for-dev` to the parent last.
5. Re-read the complete graph. Require parent `type:parent` plus `ready-for-dev`, every child `ready-for-agent`, exact rendered bodies, and exact native relationships.

Do not add `plan:ready-for-review` or `plan:ready-for-tickets` in Delivery Bundle mode.

## Partial publication and recovery

Apply the partial-publication boundary in `SKILL.md`. Report exact created issues, missing bodies or relationships, and activation state. On retry, re-read every recorded issue and continue at the first phase that live evidence has not verified.

## Verified return

Return the evidence required by `SKILL.md` completion and handoff. Do not launch `codex-development-loop`.
