# Controller state

Read before creating, migrating, resuming, or yielding with a CDL ledger. Also read [controller-recovery.md](controller-recovery.md) for a pre-PR hold/resume, legacy migration, interrupted or uncertain review request, or invalid ownership state.

## State boundary

Keep per-PR coordination at:

```text
<worktree>/sdlc-scratch/ledgers/pr-<number>.json
```

Keep run-wide token evidence in a separate Controller-owned ledger:

```text
<worktree>/sdlc-scratch/ledgers/run-<root-issue-number>-usage.json
```

Keep audit briefs and sanitized review output under `sdlc-scratch/audits/`. Git-ignore both directories before writing. No machine file is canonical scope.

The ledger belongs only to the Controller. Do not pass it to a Worker or Explorer.

The run-usage ledger is not schema-v6 PR coordination state. It survives every intermediate child ledger and audit retirement, and it is retired only by the approved terminal cleanup. Store only counters, bounded status codes, and hash-bound local-review identities. Never store prompts, messages, tool output, session paths, or task identifiers other than the private Controller identity required for attribution.

## Run-usage initialization

After launch approval and runtime preflight, but before the first Worker dispatch, initialize the run-usage ledger once. Read [run-usage.md](run-usage.md) for explicit start/cutoff, source provenance, material phase checkpoints, and retained summaries:

```bash
node "$CDL_ROOT/scripts/run-usage.mjs" init \
  --file <absolute-run-usage-ledger-path> \
  --controller-thread-id "$CODEX_THREAD_ID" \
  --started-at <actual-approved-launch-UTC-timestamp> \
  --run-mode <single-ticket-or-parent-ticket> \
  --root-issue-number <root-issue-number> \
  --active-sessions-root "${CODEX_HOME:-$HOME/.codex}/sessions" \
  --archived-sessions-root "${CODEX_HOME:-$HOME/.codex}/archived_sessions"
```

Use only the task-local `CODEX_THREAD_ID` and explicit active and archived session roots. Do not search other home-directory content. If the private session schema or counters are unavailable, preserve the original run start and continue; a later report can recover available evidence. Usage is diagnostic and never changes a readiness, review, merge, or cleanup decision.

## Create and bind a PR ledger

After the approved branch and worktree exist, initialize the ledger from the live clean checkout instead of hand-writing schema fields:

```bash
node "$CDL_ROOT/scripts/init-ledger.mjs" \
  --repo <absolute-worktree> --kind <codex-managed-or-manual> \
  --base-ref <approved-base-ref> --issue-url <canonical-issue-url> \
  --expected-head <full-current-head-sha> --expected-branch <approved-branch>
```

For parent mode, also pass `--parent-issue-url <canonical-parent-url> --parent-branch <approved-parent-branch>`. The script derives the mode and merge policy, runs live runtime and checkout preflight, requires an ignored ledger path, validates the candidate, and creates `pr-<issue-number>.json` exclusively. Keep the returned revision. Initialize the separate run-usage ledger before Worker dispatch as described above.

After the exact Worker return is reconciled, the Worker identity is cleared, and GitHub has returned the new PR URL, bind that URL to the same ledger:

```bash
node "$CDL_ROOT/scripts/bind-pr.mjs" \
  --file <absolute-pr-ledger-path> --pr-url <returned-pr-url> \
  --expected-revision <current-revision> --expected-head <full-pr-head-sha>
```

The binding command requires foreground `controller-turn` ownership before contacting GitHub, then verifies the live PR identity, target, branch, and head before the revision-checked update. Do not put a synthetic `pending:` URL in the ledger or edit `prUrl` by hand. A null `prUrl` is valid only during implementation or local review with `controller-turn` or `needs-user` ownership and no GitHub review state.

## Schema authority

`scripts/validate-ledger.mjs` is the schema-v6 authority. Initialize with `init-ledger.mjs`; do not hand-write a replacement ledger. Run the validator after every material update. The field constraints below complement validation rather than reproduce its schema.

## Field rules

- Store machine coordination facts only. Do not store secrets, raw logs, bulky output, issue bodies, graph snapshots, source maps, copied findings, review-thread mirrors, Worker handoffs, cause taxonomies, ordinary failure history, or correction counters.
- `runMode` and `mergePolicy` control readiness. `auto-child` may target only `parentBranch`; `explicit-terminal` always stops for approval.
- A parent child ledger has `issueNumber != parentIssueNumber` and uses `auto-child`.
- A final parent ledger has `issueNumber == parentIssueNumber` and uses `explicit-terminal`.
- Runtime fields come from preflight. Prepend `runtime.nodeBin`'s directory to `PATH` on every wake. Pass `runtime.codexBin` and `runtime.codexVersion` explicitly to the guarded review wrapper; ambient `PATH` is not review provenance.
- `userAmendments` stores only user-approved one-line changes to loop behavior. Append them in the granting turn.
- `activeWorkerThreadId` is null or the actual assigned task identifier. Clear it only after native task state is terminal and task, branch, tree, and commits are reconciled.
- Optional `automaticReview` records an adopted current-head review with `headSha`, authenticated `dispositionActorLogin`, `observedAt`, and `evidenceRef`. The Controller establishes it through `adopt-review`; do not fabricate a manual request identifier for an automatic review.
- `codexReviewRequests` has at most one manual request entry per head with actual `headSha`, GitHub-returned `commentId`, `requestedAt`, and `eyesConfirmed`. Never predict an identifier or duplicate a request.
- `phase` records lifecycle phase. `revision` is a compare-and-swap token.
- Bind a real PR URL before entering GitHub review or another post-PR phase. A pre-PR ledger may keep `prUrl: null` only during implementation or local review with no review request or automatic-review evidence.

`localAudit` stores only authoritative completed initial-review provenance. Preserve `clean` or `findings` and the original audited `headSha` across descendant correction commits. Set `status: stale` only when the audit head is no longer an ancestor or its provenance is invalid. New guarded audits use `engine: "codex"`. Retain `engine: "claude"` only as immutable legacy provenance.

## Verification and request recovery

Before adopting or requesting GitHub review, derive `expectedChecks` from current repository guidance, check configuration, and applicable user instructions. Use `{ "mode": "required", "names": ["<exact required check name>"], "source": "<supporting evidence reference>" }`, or `{ "mode": "none", "source": "<evidence that no CI checks are required>" }`. Record the evidence already available; no separate no-CI approval is required. Missing workflow files or an empty check list alone do not establish that no external checks are required. If the contract remains unknown or conflicting, resolve that specific gap without inventing a CI requirement or treating unknown evidence as success.

A no-CI contract permits repository-required local verification followed by mandatory exact-head GitHub review: adopt a verified automatic connector review or request `@codex review` when needed, then await its result. It does not waive observed check failures, review, thread resolution, or merge approval gates. Legacy `mode: "none"` entries with a non-empty `authorizedBy` remain readable as prior contract evidence; use `source` for new entries. A legacy ledger without a contract cannot prove readiness; recover the contract from available evidence. Missing expected checks remain pending; missing or malformed rollup evidence remains unknown. An explicitly fetched null rollup for the head commit is a known empty check list, which an evidenced no-CI contract permits.

`request-review` requires foreground `controller-turn` ownership and no active Worker. Reconcile native terminal state and the verified return, then clear the Worker through the existing revision-checked transition. The command validates and locks before persisting intent and posting. For any interrupted or uncertain request, read [controller-recovery.md](controller-recovery.md); retain the intent/remote identity and foreign locks, reconcile by read-back, and never blindly retry a POST.

## Continuation owner

`continuationMode` names the only continuation owner:

- `controller-turn`
- `heartbeat`
- `needs-user`
- `terminal`

A Worker is not a continuation mechanism for an ended Controller turn. A non-terminal Worker question keeps the same assignment and Controller turn active: answer the concrete dependency within existing authority using [worker-contracts.md](worker-contracts.md), without converting an ordinary question or accidental status message into a new approval gate. Genuine stopped outcomes still require the prescribed needs-user transition.

For explicit continuation-owner transitions, use only:

```bash
node "$CDL_ROOT/scripts/transition-ledger.mjs" \
  --file <absolute-ledger-path> --to <continuation-mode> \
  --expected-revision <current-revision>
```

Every successful transition increments `revision`. After deleting and verifying heartbeat removal, atomically enter `controller-turn` before dispatching or resuming a Worker. Assign with `--worker-thread-id`. After terminal Worker reconciliation, clear that identity with `--clear-worker true`.

Before replacing a Worker, prove it inactive through native task state and reconcile its task, branch, tree, and commits. Unexpected ownership or head movement stops before mutation.

### Holds and recovery

A pre-PR `needs-user` hold preserves its current implementation/local-review phase and requires reconciled native terminal Worker state, cleared Worker identity, and no watcher or GitHub review state. Persist the supported transition before asserting yield. Resume retains that phase and clears the reason; phase changes require a subsequent foreground transition. Failed revision/validation/lock checks preserve prior bytes and foreign locks. Read [controller-recovery.md](controller-recovery.md) before holding/resuming or reconciling interrupted state; do not guess a missing phase.

## Controller transition command

Use one boundary command instead of reconstructing deterministic evidence across Controller turns:

```bash
node "$CDL_ROOT/scripts/controller-transition.mjs" \
  --repo <absolute-worktree> --ledger <absolute-ledger-path> \
  --expected-revision <number> --operation <operation> --issue <number> \
  --pr <number-if-applicable> --expected-head <full-sha-if-applicable>
```

Operations are:

- `verify-worker-return`
- `adopt-review`
- `request-review`
- `reconcile-review-request`
- `classify-review`
- `merge-child`
- `prepare-parent-approval`
- `merge-parent`

`verify-worker-return` requires foreground `controller-turn` ownership and `--worker-receipt`. For nontrivial returns it asserts existing local-audit coverage: first reconcile native terminal state and live receipt/provenance, persist classified `localAudit`, and attempt nonblocking usage recording as ordered in [review-cycle.md](review-cycle.md). `merge-parent` requires `--approval-head` equal to the exact expected head.

`adopt-review` takes the issue, PR, head, and current ledger revision; it discovers connector evidence without posting. Absent evidence returns `discover-review` with exit 10 and unchanged state. `request-review` refreshes discovery and reuses matching evidence in the same call; a manual POST requires `--manual-review-basis <source-backed-trigger-or-recovery-basis>`. Optional `manualReviewBasis` is retained in pending/final request entries; old entries and reconciliation remain valid. [review-cycle.md](review-cycle.md#first-candidate-push) owns applicability, discovery waiting, and fallback policy.

`reconcile-review-request` performs read-back for the same issue, PR, head, and revision without posting. Read [controller-recovery.md](controller-recovery.md) when recovering it. `classify-review` treats `dispositions_complete` as ready only with verified attestations and zero unresolved threads; it reports `unresolvedThreads` separately from `missingDispositions`, with unavailable evidence remaining `null`.

The command resolves identities and heads before mutation, fails closed on drift or unavailable evidence, reads back every mutation, advances the expected ledger revision, and emits one bounded JSON receipt. Exit codes are stable:

- `0`: ready or success
- `10`: still waiting
- `20`: needs human judgment
- `30`: evidence conflict
- `40`: tool failure

The command never edits product code, decides whether a finding is substantively valid, changes scope, deploys, touches production, or bypasses terminal approval. The Controller chooses the operation and retains semantic judgment.

Treat these commands as stable interfaces during an ordinary run. Do not inspect their source, duplicate their GitHub queries, manually edit their state transitions, or dump whole audit transcripts when the bounded receipt supplies the required evidence. Inspect implementation only to diagnose a concrete command failure.

`merge-parent` removes the exact terminal readiness label, verifies issue closure, and enters `needs-user` for cleanup selection. It does not enter `terminal`. A retained ledger enters `terminal` only after the approved cleanup action completes.

## Continuous watcher and heartbeat fallback

Continuous watching is the default after adopting automatic review or requesting `@codex review`:

1. Enter `controller-turn` phase `awaiting-github-review` using the exact current revision.
2. Run `scripts/watch-pr.mjs --file <absolute-ledger-path> --watch` and keep the Controller turn open.
3. Treat `pending`, `acknowledged`, and `github_unavailable` as nonterminal until the bounded idle window expires.
4. Act only on a deterministic terminal classification. Idle-window expiry requires user attention.

Use a 2-minute continuous polling interval.

Only when the continuous process cannot be maintained:

1. Inspect the available tool surface for `automation_update`.
2. Render the watcher prompt through `scripts/render-watcher.mjs`.
3. Create one same-task heartbeat with a 4-minute cadence unless the user requested another cadence.
4. Read the heartbeat back.
5. Hash the exact rendered prompt.
6. Persist the returned task ID, target task ID, active readback, prompt hash, and verification time with the exact ledger revision before yielding.

If creation or readback fails, remain in `controller-turn` and use the continuous watcher. Never create an undriven manual state or ask the user to report review completion.

Never run a heartbeat while foreground work is active. Delete and read back scheduled-task removal on readiness, merge, closure, user stop, `needs-user`, idle-window expiry, or before Worker dispatch. In the same Controller turn, transition the ledger to `controller-turn`, `needs-user`, or `terminal`.

Render the canonical fallback prompt:

```bash
node "$CDL_ROOT/scripts/render-watcher.mjs" \
  --state-file <absolute-ledger-path>
```

## Yield gate

Before every final answer:

```bash
node "$CDL_ROOT/scripts/assert-controller-can-yield.mjs" \
  --file <absolute-ledger-path>
```

A nonzero result forbids yielding. Keep the Controller turn open and complete the foreground transition. Schema validity alone does not prove the Controller may yield.

## Legacy migration

Never replace or truncate v1-v5 state. Read [controller-recovery.md](controller-recovery.md) and use the preservation-first migrator after live reconciliation. Deploy the coherent schema-v6 script set together; older binaries reject valid pre-PR holds.

## PR body block

Keep the PR body human-readable. Do not add fenced machine state.

```markdown
## Agent Loop

- PR: <PR URL>
- Branch: <branch name>
- Last audited head SHA: <head SHA>
- Merge policy: <auto-child into named parent branch | explicit terminal approval>
- Required review: Codex GitHub review
```
