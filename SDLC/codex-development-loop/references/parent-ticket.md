# Parent-ticket mode

Read this reference only after live preflight classifies the request as `parent-ticket`.

## Preflight

Require all of the following:

- the parent is open with `type:parent` and `ready-for-dev`
- the parent has no `plan:ready-for-review`, `plan:ready-for-tickets`, legacy `spec:ready-for-review`, legacy `spec:ready-for-tickets`, or `in-progress`
- every intended implementation child is a native sub-issue
- every open implementation child has `ready-for-agent` and no `needs-info`, `ready-for-human`, or `wontfix`
- every child body preserves the reviewed Delivery Bundle's Parent, Outcome, Acceptance Criteria, and Blocked By sections
- readable blocker text agrees with native dependencies
- blockers resolve to sibling issues or completed prerequisites
- the graph is acyclic and has an open frontier unless every child is complete
- each child fits the parent specification
- the parent Integrated Verification Contract identifies a practical public interface or stable seam
- no competing active PR, branch, worktree, assignee, or Codex task owns the parent or any child
- the approved base is clean and the parent feature branch is safe to create or exactly resume

## Launch transition

The first post-approval mutation must replace parent `ready-for-dev` with `in-progress`. Re-read the parent and verify both label states. Then create and push the unchanged parent feature branch before creating the first child branch. Stop if either transition cannot be verified.

The approved launch gives standing authority for child branches and PRs targeting only the named parent feature branch. It also authorizes child merges and child closure after every shared gate and readback passes.

## Child loop

Work one frontier child at a time in deterministic native sub-issue order.

1. Re-read parent, child, blockers, labels, ownership, and the exact current parent feature head.
2. Create the child branch from that exact parent feature head.
3. Assign a fresh Worker and run the shared delivery and review loop.
4. When readiness passes, re-read the PR target and exact head, observed checks, exact-head review, review threads, parent branch, and child body.
5. Run `scripts/assert-review-threads-resolved.mjs`.
6. Merge only into the named parent feature branch.
7. Verify the resulting parent-branch SHA and PR merged state.
8. Close only that child issue and verify closure.
9. Preserve the run-usage ledger and any [incidental evidence](terminal-handoffs.md#incidental-finding-retention) before retiring the completed child's PR ledger and audit state.
10. Refresh the native graph before creating the next child branch from the new exact parent head.

The user is not asked to approve child merges. Shared readiness is the standing merge authority.

## Corrective children

Integrated verification may expose work directly required by an existing parent acceptance criterion. The Controller may create a corrective `ready-for-agent` sub-issue only when all of these hold:

- the work is necessary to satisfy an existing parent acceptance criterion
- the new body stays within the approved parent specification
- readable Parent and Blocked By sections are complete
- native parent and blocker relationships match the body and are read back

Stop for the user if the work changes or expands the approved parent specification.

## Parent readiness

After every implementation child is closed:

1. Re-read the parent and complete native graph.
2. Treat final parent integration as a new pull-request unit.
3. Assign a fresh Worker to run the parent's full Integrated Verification Contract against the integrated parent head.
4. Commit only genuine integration changes.
5. If verification exposes qualifying missing work, use the corrective-child rule and return to the frontier.
6. Open the parent PR against the approved base with a fresh `explicit-terminal` ledger for PR coordination. Never reuse an `auto-child` PR ledger; continue using the same run-usage ledger.
7. Run the shared exact-head review, same-Worker correction, audit, check, and zero-unresolved-thread loop.
8. When the unchanged parent head is ready, delete its watcher and ask for the run's only merge approval with exact evidence.

## Completion

After approval:

1. Re-read and re-verify every shared readiness gate on the approved head.
2. Merge the parent PR into the approved base.
3. Verify the base branch contains the merged head.
4. Verify GitHub closed the parent. Close it directly only if the approved merge did not.
5. Remove `in-progress` and verify the resulting label state.
6. Follow `references/terminal-handoffs.md` for cleanup and the terminal task boundary.
