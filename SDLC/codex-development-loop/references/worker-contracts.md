# Worker contracts

This is the fixed Worker front door. Read it before acting, dispatching a Worker/Explorer, or accepting a Worker return. Read [worker-packets.md](worker-packets.md) when constructing dispatch packets or returning packets; use its existing shapes without adding a schema.

## Worker execution contract

The assigned Worker is the sole product-code writer for one pull-request unit through every bounded correction. It owns all in-scope edits, checks, local review, and commits through terminal return. The Controller never edits, stages, or commits product code. Resume the same Worker for correction; use a fresh Worker only for the next unit. The Worker and read-only Explorers never read or write the Controller ledger.

- Read `workerContractPath` before acting. Before selecting a review tier or preparing the initial local review, read [review-cycle.md](review-cycle.md). When `runtime.nodeBin` is non-null, prepend its directory to `PATH` for every command and use that exact binary to run CDL scripts. Standard and large/complex review also require the packet's exact non-null `runtime.codexBin` and `runtime.codexVersion`.
- Autonomously complete authorized discovery, mechanical decisions, edits, focused tests, package typecheck, repository-required checks, local review, locally correctable failures, and one-commit consolidation when authorized. Verification or review completion is not a checkpoint for renewed permission.
- Poll every Worker-owned subprocess to terminal completion in the same Worker turn.
- Do not return `stopped` because work remains, a check is running, consolidation remains, or a completed review found a locally correctable defect.
- Return `stopped` only for a real authority or external-state blocker requiring a user decision or state change.
- Adapt source-mapped files and mechanical implementation steps when fresh evidence warrants it within the approved acceptance criteria, exclusions, security, compatibility, and required verification boundaries. Record the substitution, affected verification, and source-backed proof equivalence in `acceptanceEvidence`; an equivalent mechanical substitution needs no renewed approval. Return scope or behavior changes to the Controller before editing the affected behavior.
- Never push, request review, mutate GitHub, control a watcher, merge, deploy, publish, or access production or credentials.

## Action requests during execution

Before terminal completion, Worker↔Controller messages must request or supply a concrete action needed to finish the assignment. Do not send progress, acknowledgements, usage updates, or test/review-status messages. Keep routine evidence for the terminal return; do not ask the Controller to repeat authority already granted.

When a needed fact or decision cannot be resolved from accessible evidence within existing authority, send a non-terminal request stating the action needed, minimum supporting evidence, affected work, and safe independent work that can continue. Questions about missing facts, scope interpretation, or ownership reconciliation do not by themselves mean `stopped`. Keep the assignment active while the Controller answers and continue safe independent work. On an ownership or safety conflict, stop affected work immediately; do not change ownership, overwrite changes, or infer permission from silence.

The Controller answers an actionable request with the missing fact, evidence, or decision already within its authority, then continues waiting. It does not acknowledge accidental status messages, issue encouragement, or reauthorize existing work. After an answer resolves the dependency, the same Worker continues without an acknowledgement or a new approval checkpoint. If investigation establishes a real product-scope, authority, or external-state blocker that requires a user decision or state change, return `stopped` and follow the existing `needs-user` handoff; do not disguise that blocker as an ordinary question.

Unexpected requests remain deliverable through native agent messaging. Do not restrict delivery based on a predispatch prediction of which messages will matter.

While the Worker is active, the Controller uses `wait_agent` with a watchdog timeout bounded by the host maximum blocking wait and required communication cadence. A Worker message, terminal status, or new user input wakes the Controller immediately; handle actionable input before waiting again. On watchdog timeout, check native status once and wait again when the Worker remains active. A wait-tool error is not evidence that the Worker stopped: inspect native state and reconcile the wait before continuing; do not replace the Worker, duplicate work, or invent a user gate from the error alone.

For an outer execution wrapper around an event or subprocess wait, explicitly set its yield to cover the inner wait within host limits; for example, use a 60-second outer yield around a 60-second inner wait when permitted. A transport yield is not a watchdog timeout: resume it directly without status inspection or commentary. At a genuine watchdog timeout, provide only the shortest update required by the host's communication cadence. Preserve input interruption, timeout/error handling, and fresh mutation-boundary checks; do not introduce fixed long sleeps or change watcher cadence.

Keep Worker↔Controller communication limited to actionable dependencies and terminal handoffs. Do not send a message merely because waiting timed out or a phase completed. Silence and elapsed time are not evidence of inactivity.

## Evidence transport for CDL handoffs

Read [shared/test-quality.md](../../shared/test-quality.md) for test design and execution. For CDL Worker handoffs, the existing finalized and verified receipt specializes that reference's inline-command/output presentation rule: use the receipt as the reporting format, without duplicating raw output in a final answer. This exception changes evidence transport only, not required checks, current evidence, or semantic proof.

Each verification claim in implementation `acceptanceEvidence`, `riskEvidence`, `tests`, and `localReview`, or correction evidence and `checks`, records the exact command actually run, terminal result, required versus exercised boundary, and a bounded resolvable supporting reference to current command output or audit evidence. Newly claimed check execution must occur in the current Worker turn; retain its verbatim terminal output in the supporting reference. Include source-backed substitutions/equivalence and explicit remaining gaps; record `not run: <reason>` for checks not run. Never claim intended coverage as exercised coverage. References resolve in the authorized workspace or canonical contract and exclude secrets and raw private payloads. Hashes and valid shape never substitute for semantic coverage. The Controller independently compares proof with the canonical acceptance and verification contract. Use the documented JSON fields, including the optional transport below, and retain the 64 KiB finalized-receipt limit.

Use an empty `surfaceClosure` only when the complete diff changes no enumerable contract; the Controller independently checks that claim. Handwritten examples are not inventory or coverage proof.

## Incidental finding transport

Carry material already-observed concerns outside the approved task in optional `incidentalFindings` on the existing terminal return. Omit it when empty; do not send progress messages or investigate extra work to populate it. Each entry has a stable `id` (nonblank, at most 64 UTF-8 bytes), `summary` (at most 1,024 bytes), full lowercase `sourceSha`, `status` (`suspected` or `confirmed`), and nonempty `evidence` strings (each nonblank, at most 1,024 bytes). IDs are unique within a return and retained across corrections. State the observation and uncertainty, citing source locations and minimal sanitized facts; confirmation requires supporting proof. Existing receipt-size and privacy limits apply.

The field is permitted on implementation and correction receipts and on `no-change`/`stopped` messages; those other outcomes retain their existing format and handling. It grants no scope or external mutation authority. The Controller also captures its own observations and follows [terminal-handoffs.md](terminal-handoffs.md#incidental-finding-retention) for disposition and retention at ordinary return/transition boundaries.

## Hash-bound receipt

Every `ready-to-push` return is one JSON object no larger than 64 KiB with:

- `schemaVersion: 1`
- `outcome: "ready-to-push"`
- `phase: "implementation"` or `"correction"`
- `reviewTier: "trivial"`, `"standard"`, or `"large-complex"`
- full `localCommitSha`
- `receiptSha256`

Write the return object without `receiptSha256` to a private OS-temporary draft file. Finalize it under the packet-bound runtime:

```bash
<runtime.nodeBin or node> \
  "$CDL_ROOT/scripts/finalize-worker-receipt.mjs" \
  --repo <absolute-worktree> --packet <absolute-worker-packet>
```

The finalizer validates the packet, exact runtime, checkout, branch, clean HEAD, phase, evidence shape, and receipt hash. Return its compact stdout unchanged as the only final answer. Do not handwrite or summarize a `ready-to-push` return.

The finalizer atomically replaces `receiptPath` with the hash-bound receipt. The Controller does not copy or reconstruct the return. Before final verification, it reconciles native terminal Worker state, live receipt/branch/tree/commit/runtime bindings and wrapper provenance, persists validated localAudit, and attempts diagnostic usage recording in the order in [review-cycle.md](review-cycle.md). It then validates that exact file and live full HEAD with:

```bash
node "$CDL_ROOT/scripts/controller-transition.mjs" \
  --repo <absolute-worktree> --ledger <absolute-ledger-path> \
  --expected-revision <number> --operation verify-worker-return \
  --issue <number> --expected-head <full-sha> \
  --worker-receipt <absolute-receipt-path>
```

Do not reconstruct evidence from raw logs or repair an invalid Worker return in the Controller. Reject malformed or stale evidence before any push or review request; after reconciling ownership and the current head, request the exact receipt correction from the same Worker when it is locally correctable. Unexplained head or ownership drift remains a blocker, not permission to regenerate evidence against a guessed head.

## Correction return

Use the complete return object required by `resolve-review-findings`, then add the hash-bound receipt fields required above:

- `schemaVersion: 1`
- `receiptSha256`
- `phase: "correction"`
- `reviewTier`

Reject a correction that uses the implementation shape or omits `checks`, `prSurfaceCensus`, `findingClosure`, or `surfaceClosure`. The Controller requires the census to cover the full PR production diff and every current or historical actionable review concern, including resolved and outdated threads.

## Other terminal outcomes

Only `ready-to-push`, `no-change`, and `stopped` are valid top-level outcomes. Read [worker-packets.md](worker-packets.md) when returning any packet.

On `no-change`, continue only when live evidence proves the issue is satisfied or no legitimate correction exists. On `stopped`, do not retry or resume the Worker in that Controller turn. Reconcile the Worker, remove any watcher, transition to `needs-user`, and ask only the exact required question. A later user-authorized runtime repair may resume the same Worker once under a materially changed, revalidated runtime binding.

## Spawn rules

- Use `fork_turns: "none"` and `agent_type: "worker"` for the assigned Worker.
- Use `fork_turns: "none"` and `agent_type: "explorer"` for an optional read-only Explorer.
- Never fork Controller history into another agent.
- Write the exact packet to a private ignored file before dispatch.
- Run the spawn validator before every Worker and Explorer dispatch. Do not spawn when validation fails.
- Do not pass the Controller ledger, copied finding sets, review-history mirrors, GitHub mutation authority, or broader external authority.

Validate every dispatch:

```bash
node "$CDL_ROOT/scripts/validate-agent-spawn.mjs" \
  --role <worker-or-explorer> --fork-turns none \
  --agent-type <worker-or-explorer> --packet <absolute-packet-path>
```

## Assignment completeness

Before dispatch, verify that the existing packet and its accessible canonical references together supply:

- objective, acceptance criteria, exclusions, and source evidence through `issueUrl`, or the retained canonical issue and `prUrl` for correction
- checkout, sole-Worker ownership, branch, exact base or reviewed head, and the pinned `runtime`
- permitted local actions and mechanical decisions through `localCommitAuthority`, `externalMutationProhibited`, this contract, and the canonical scope
- required checks, review tier and procedure, dependencies, and escalation boundaries through repository guidance and [review-cycle.md](review-cycle.md)
- terminal evidence and the finalization destination through `phase`, `receiptPath`, and the return contracts above

Use these existing fields and references; do not add a second packet schema, copy Controller history, or assume the Worker can access private Controller state. Resolve known assignment gaps before dispatch. This does not require predicting every question: an unexpected dependency may be raised through the action-request procedure above.
