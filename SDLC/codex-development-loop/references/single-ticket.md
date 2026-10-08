# Single-ticket mode

Read this reference only after live preflight classifies the request as `single-ticket`.

## Preflight

Require all of the following:

- the issue is open and labelled `ready-for-agent`
- the issue has no native parent
- the body contains a complete behavioral contract and practical public verification seam
- no `type:parent`, `ready-for-dev`, `in-progress`, `needs-info`, `ready-for-human`, or `wontfix` lifecycle conflict exists
- no competing active PR, branch, worktree, assignee, or Codex task owns the issue
- the approved base is clean and the delivery branch is safe to create or exactly resume

## Branch and PR

Create the delivery branch from the approved exact base. The PR targets that same approved base and uses an `explicit-terminal` ledger.

Run the shared Worker, review, correction, and readiness loop. Do not merge when readiness passes. Delete the watcher and ask for explicit merge approval with the exact unchanged head and gate evidence.

## Completion

After approval:

1. Re-read and re-verify every shared readiness gate on the approved head.
2. Merge the PR into the approved base.
3. Verify the base branch contains the merged head.
4. Verify GitHub closed the issue. Close it directly only if the approved merge did not.
5. Follow `references/terminal-handoffs.md` for cleanup and the terminal task boundary.
