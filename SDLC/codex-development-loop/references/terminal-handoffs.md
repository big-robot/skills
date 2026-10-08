# Terminal handoffs

Read this reference at terminal readiness, terminal merge, cleanup, transfer to a new mutation lifecycle, or retention of a material incidental finding.

## Lifecycle and cleanup contract

- Only one unchanged `explicit-terminal` head passing shared readiness and with an absent watcher reaches terminal merge approval. Approval binds that reported head; drift requires fresh readiness and approval. Present only the actual worktree kind's choices and retain exact cleanup targets/policy with approval evidence.
- Re-read every live readiness/ownership/issue gate before merge; verify target ancestry, GitHub merged state, terminal issue closure, and exact lifecycle-label cleanup afterward. If a gate changed, return to its owner or ask one exact question.
- Classify confirmed merges: intermediate work continues sequentially in the same task, retiring only predecessor coordination/audit state; terminal work applies approved cleanup; unclear scope preserves everything for one question. Keep an intermediate managed task/worktree for the successor branch.
- Merge approval alone does not grant deletion or task archiving. Reuse exact cleanup authority only for matching task, branch, worktree kind and paths, clean tree, merged ancestry, and no competing owner/user files at risk. Preserve changed/uncovered scope. Never sweep unrelated or user-created state.
- Archive a Codex task only on explicit user selection for that task. General cleanup, merge approval, and delivery completion do not authorize `set_thread_archived`.
- After cleanup approval and before execution, snapshot sanitized run usage to a new file outside the worktree; retain readback or bounded stdout/unavailable status. Telemetry/export uncertainty never blocks cleanup. Transition a retained ledger to `terminal` with its current revision, or verify approved deletion of both exact ledgers.
- Verified terminal merge plus approved cleanup ends CDL. Include bounded usage and source limits in the final report. Read-only questions stay here; another mutation lifecycle requires confirmation and a fresh linked task using the compact handoff below. Never resume mutation orchestration here.

Read the report/example matching the current boundary below; do not treat an example as extra authority.

## Incidental finding retention

At an ordinary Worker return or Controller discovery, retain material already-observed concerns outside the approved task in one sanitized Markdown observation handoff in task-owned retained output outside all cleanup targets. Merge repeated observations into that record; do not add a recurring check, side investigation, or file when there are no findings. Worker transport is defined in [worker-contracts.md](worker-contracts.md#incidental-finding-transport).

For each concern retain its stable ID, expected/observed behavior, source path at a commit SHA, minimal safe evidence, reproduction result or `not reproduced`, confidence/impact uncertainty, and disposition. Existing issue references avoid duplicate filing; an authorized new issue or a retained `pending triage` observation are also valid dispositions. Record disproved/superseded conclusions briefly in the existing record. Duplicate search uses accessible authorized evidence only and never prevents retaining an uncertain observation. Secrets and raw private payloads remain excluded; handle sensitive evidence privately under repository security rules.

The observation record is noncanonical evidence, not an issue body, execution plan, or change to scope/acceptance. Retention grants no authority to file an issue, create another task, investigate, or fix unrelated work. A concern invalidating current acceptance or security follows existing readiness/stop gates; independent follow-up does not add a merge gate or per-finding approval question.

Before retiring predecessor evidence or executing cleanup, read back the retained record and ensure it contains usable commit-bound citations/minimal evidence rather than only soon-deleted local pointers. If retention fails, preserve the only usable evidence and report the affected cleanup limitation through the existing cleanup-scope rule; do not silently discard it. At readiness and completion, surface a bounded unresolved-finding/disposition summary and its retained link. Omit empty blocks. Another mutation lifecycle retains its existing confirmation boundary.

## Ready-for-merge report

Use only after the shared readiness gate passes on one unchanged `explicit-terminal` head and the watcher is deleted or confirmed absent.

```text
Ready for merge approval: <PR URL>, head <full head SHA>.

- Required checks: pass for <head SHA>
- Codex GitHub review: <clean | completed with verified dispositions> for <head SHA>
- Local review: <guarded Codex review at ancestor <localAudit.headSha>, result <clean | findings corrected through full-PR contract closure>, report <localAudit.outputFile> | inline trivial-tier audit clean>
- Review threads: zero unresolved, including outdated threads
- Worktree and target: clean and exact
- Cleanup targets: task <task ID>, branch <exact branch>, worktree <absolute path>, run files <exact paths>
- Scheduled follow-up: deleted or not available
- Incidental findings (only when present): <bounded dispositions and retained observation link>

Choose one option for this exact PR head and the identified task, branch, and worktree:

For a manual worktree:
1. Merge, then delete this task's exact run files, remote PR branch, local branch, and dedicated worktree after verifying the merge and cleanup safety checks.
2. Merge and keep the branch and worktree.
3. Merge, then delete only the remote PR branch and keep the local worktree.
4. Hold the merge.

For a Codex-managed worktree:
1. Merge and keep this task and managed worktree.
2. Merge, then archive this task after verifying the merge and cleanup safety checks. Use only when the user explicitly selects this option.
3. Merge, then make the worktree permanent before archiving this task. Use only when the user explicitly selects this option.
4. Hold the merge.
```

This is the only merge approval for a single-ticket run or parent-ticket run. Approval binds the exact reported head. Head drift requires a fresh readiness report and approval.
Present only the choices for the actual worktree kind. Record the selected cleanup policy and its exact task, branch, worktree kind, and paths with the approval evidence. Merge approval alone never implies cleanup approval; selecting a combined choice explicitly grants both. If cleanup safety checks fail after merge, preserve the state and ask about the changed scope.

## Merge verification

After approval:

1. Re-read the PR target, exact head, observed checks, exact-head review, local-audit coverage, all review threads, worktree, mergeability, issue body, labels, and competing ownership.
2. Require the approved head to remain unchanged.
3. Use the selected mode's completion procedure.
4. Verify the target branch contains the merged head and GitHub reports the PR merged.
5. Verify terminal issue closure and exact lifecycle-label cleanup.

The merge command removes `ready-for-agent` from a completed single ticket or child and `in-progress` from a completed final parent. Preserve type and domain labels. A terminal merge enters `needs-user` with cleanup as the sole continuation; if an exact cleanup policy is already approved, the Controller performs its safety checks and completes that transition without another question.

If any gate changed, do not merge. Return to the owning phase or ask one exact question.

## Post-merge classification

Classify every confirmed merge before cleanup:

- `intermediate`: approved parent sub-issues remain. Retire only the predecessor PR ledger and audit state, then continue the next pull-request unit in the same durable task.
- `terminal`: the single-ticket PR or final parent PR is merged and issue closure is verified. Apply the matching previously approved cleanup policy or present the cleanup question.
- `unclear`: preserve everything and ask whether approved work remains.

For an intermediate manual-worktree transition, report:

```text
Merge is confirmed, and approved sequential work remains.

- Successor base: <updated merged base>
- Successor branch/worktree: <branch and worktree>
- Canonical issue contracts: re-read from GitHub
- Predecessor loop state: retired after verified transfer
- Next unit: <next approved PR unit>
```

For an intermediate Codex-managed transition, report the same facts and state that the existing managed task and worktree were retained and moved to the successor branch. Do not archive it or create a second managed worktree.

## Cleanup question

Use only after a terminal merge is verified and cleanup authority is not already covered. Reword it for an abandoned loop. Never use it for an intermediate child merge.

An exact cleanup option may be approved in the launch packet or terminal merge approval. Before reusing it, verify the same task, branch, worktree kind, and paths; a clean tree; merged branch ancestry; and no competing owner or user-created files that would be removed. Preserve the worktree and ask only about changed or uncovered scope if those checks fail. Approval to merge alone does not authorize deletion.

Keep a Codex task open unless the user explicitly requests archiving that task. A general request to clean up, approval to merge, or completion of the delivery loop does not authorize `set_thread_archived`.

```text
Merge is confirmed. Worktree kind: <codex-managed or manual>.

For a manual worktree:
1. Delete this task's exact ledger and audit outputs, then delete the remote PR branch and remove this local worktree and branch. Recommended when no follow-up work is expected.
2. Keep this branch and worktree for follow-up investigation.
3. Delete only the remote branch and keep this local worktree.

For a Codex-managed worktree:
1. Keep the task and managed worktree for follow-up. Default unless the user explicitly chooses another option.
2. Archive this task and let the app clean up its managed worktree and machine state. Only if explicitly requested.
3. Make the worktree permanent before archiving when a long-lived environment is intentionally required.

Which applicable cleanup option should I take?
```

Delete only the exact approved machine files, branch, and worktree. Never sweep unrelated state or delete user-created files.

## Terminal state

After verified terminal merge and approved cleanup:

1. Before cleanup execution, snapshot the bounded run-usage report. Choose an explicit new summary file outside the worktree in a task-owned directory that survives cleanup:

   ```bash
   node "$CDL_ROOT/scripts/run-usage.mjs" report \
     --file <absolute-run-usage-ledger-path> \
     --phase terminal \
     --summary-file <absolute-new-summary-path-outside-worktree> \
     --active-sessions-root "${CODEX_HOME:-$HOME/.codex}/sessions" \
     --archived-sessions-root "${CODEX_HOME:-$HOME/.codex}/archived_sessions"
   ```

2. Read back the sanitized summary before deleting machine state, and retain its bounded JSON result in task context. Export is exclusive and never overwrites an existing file. If export fails, retain stdout for the final response; if collection is unavailable, use `status: unavailable` with a concise reason. Never infer missing counters or block cleanup. See [run-usage.md](run-usage.md) for source limits and compatibility.
3. If the cleanup option retains the PR ledger, transition it from `needs-user` to `terminal` with its exact current revision. If cleanup deletes the machine state, delete both exact ledgers and verify their deletion.
4. Verify the terminal PR-ledger state or approved deletion and complete the approved cleanup.
5. End this CDL run with any retained incidental-finding summary above and a token-usage block containing status, cutoff, Controller, Workers, Explorers, guarded local reviews, known total, reason codes, and exclusions. Include phase response counts and gross/cached/fresh/output totals where measured, requested cutoff and last observed timestamp, and the retained summary link. Omit zero-participant detail when it adds no information; label unknown telemetry explicitly.

The cutoff is immediately before approved cleanup execution. Cleanup, the final response itself, GitHub-hosted Codex review, and tool or service costs are excluded. Cached input is a subset of input, reasoning output is a subset of output, and total tokens equal input plus output; do not sum subset fields into the total again.

When the collector reports `local_review_zero_coverage_unverified`, retain its partial status and numeric zero in the terminal usage block: the review counters are available reported zeros with unverified coverage. Do not replace them with unknown or estimated usage. Nonzero review totals are also reported turn aggregates, without proof that all nested operations are included. Usage uncertainty or collection/export failure is diagnostic and never blocks review, delivery, merge readiness, or approved cleanup.

Keep read-only questions in the completed task. Offer only:

- Start staging deployment task
- Start data repair task
- Follow up on a retained incidental finding (only when present)
- Ask a question here
- Done

## New mutation lifecycle

Deployment, publication, data repair, or another mutation lifecycle requires one confirmation to create a fresh linked task. After confirmation, pass only this compact handoff:

```json
{
  "objective": "<new lifecycle objective>",
  "repository": "<owner/name and absolute checkout>",
  "verifiedMergedSha": "<full SHA>",
  "completedIssue": "<URL>",
  "completedPr": "<URL>",
  "authorizedScope": ["<approved action>"],
  "exclusions": ["<explicit exclusion>"],
  "requiredPreflight": ["<read-only check>"],
  "requiredReadback": ["<post-mutation verification>"]
}
```

Never resume delivery, deployment, repair, or another mutation orchestration inside the completed CDL task.
