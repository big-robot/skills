# Controller recovery

Read before a pre-PR hold/resume, legacy migration, interrupted/uncertain review request, or invalid ownership-state reconciliation. [controller-state.md](controller-state.md) owns normal initialization, runtime binding, transitions, watcher cadence, and yield. Recovery grants no additional authority and stays in the same durable Controller task.

## Pre-PR holds and resume

Before a PR exists, enter `needs-user` with a nonblank `--reason` while preserving the current `implementation` or `local-review` phase. Repeated holds retain that phase and update the reason and revision. The hold requires no active Worker, scheduled task, watcher policy, waiting timestamp, heartbeat binding, or requested, pending, or automatic GitHub review state. After PR binding, a hold continues to use `phase: "needs-user"`.

Observe native terminal Worker state and reconcile the task, branch, tree, and commits before clearing `activeWorkerThreadId`; the ledger cannot prove process termination. After persisting the hold, run `assert-controller-can-yield.mjs`. Issue the terminal hold handoff only when both commands succeed. A failed transition or assertion keeps the Controller responsible for reconciliation.

On resume, recheck the stated hold condition and current source/runtime state. Transition to `controller-turn` without `--phase` to retain the saved pre-PR phase and clear the reason. An explicit matching phase is accepted; a mismatch fails without mutation. Use a subsequent foreground transition to change phase. A resumed `local-review` phase stays there; implementation receipts still require their supported phase before verification.

Preserving phase grants no new merge, publication, or credential authority. Held state cannot bind a PR or produce a verified Worker-return push receipt. Expected-revision checks and validation failures preserve prior ledger bytes; a failed exclusive lock acquisition preserves the other Controller's lock.

Deploy the coherent schema-v6 script set together. Older binaries reject valid pre-PR holds; reconcile or resume them with the new scripts before any downgrade.

## Interrupted review requests

`request-review` requires `controller-turn` ownership with no active Worker. Reconcile native terminal Worker state and the verified return, then use the existing explicit clear-Worker transition before requesting review. It validates candidate ledger state before persistence and posting, and acquires its own ledger lock before persisting intent and contacting GitHub. `pendingReviewRequest` preserves the head, operation identity, timestamp, posting state, and returned comment ID when known. After an interrupted or failed request, resume the same operation and read back its recorded remote ID. Do not delete another process's lock, clear an uncertain intent, or post again to make local state look complete. An uncertain POST without a recoverable remote identity requires evidence reconciliation before any retry.

`reconcile-review-request` takes the same issue, PR, head, and current ledger revision as the interrupted request. It performs read-back only, using the durable operation marker and remote identity, and never posts another review or requires a new manual-review basis. Reconciliation of an already finalized request re-verifies its remote identity without changing the ledger revision. Already-invalid legacy ledgers remain blocked for explicit evidence reconciliation; the command does not infer Worker termination or repair ownership. `classify-review` treats `dispositions_complete` as ready only after every current finding has a verified attestation and no unresolved threads remain. Its receipt reports `unresolvedThreads` separately from `missingDispositions`; unavailable evidence remains `null`, including unknown thread state.

## Legacy migration

Never replace or truncate a v1-v5 ledger. Run the preservation-first migrator:

```bash
node "$CDL_ROOT/scripts/migrate-ledger.mjs" \
  --file <absolute-ledger-path> \
  --base-ref <reviewed-base-ref> \
  --worktree-kind <codex-managed-or-manual> \
  --current-checkout <absolute-current-checkout> \
  --continuation-mode <controller-turn-or-needs-user-or-terminal> \
  --phase <reconciled-foreground-phase>
```

Omit `--continuation-mode` only when the legacy ledger already records it. For `needs-user` or `terminal`, pass `--continuation-reason`. An active legacy heartbeat also requires watcher-policy options and scheduler readback values. The migrator backs up the exact legacy file and removes only obsolete schema-v6 mirrors.

A v1-v5 null-PR `needs-user` migration requires `--phase implementation` or `--phase local-review` after live-state reconciliation. Missing or incompatible phases fail before backup or write; a valid migration preserves the reason and inactive ownership. A valid v6 ledger is validated without mutation. An invalid v6 hold that lost its phase requires explicit reconciliation; the migrator never guesses it.
