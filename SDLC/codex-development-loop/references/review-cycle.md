# Review cycle

Read this reference when selecting the review tier, preparing the first candidate review, pushing a candidate, or processing GitHub review.

## Select one tier

Read [shared/stakes-tier.md](../../shared/stakes-tier.md) and select exactly one tier:

- `trivial`: no local CLI review. Run the inline read-only risk audit from `review-prompts.md`.
- `standard`: run exactly one guarded local Codex review against the clean initial candidate head.
- `large/complex`: run the same single guarded local Codex review with risk and acceptance detail appropriate to the tier.

Read [review-prompts.md](review-prompts.md) only when preparing the selected local review. Do not load its other-tier prompt.

## Initial local review: Worker execution

For standard and large/complex work, the assigned Worker:

1. Commits a clean initial candidate checkpoint and generates an ignored brief under `sdlc-scratch/audits/`.
2. Invokes `scripts/run-codex-review.mjs` with repository, base ref, brief/output paths, and the packet-bound Codex binary/version. Never bypass the wrapper with direct CLI review. Poll the subprocess to terminal completion in the same turn.
3. Requires the wrapper receipt binding exact brief/input hashes, executable/version, immutable Git state, completed transcript, and transcript hash; proves unchanged HEAD, tree, base, brief, and clean state after review.
4. Classifies findings for local correction under the shared readiness gate. For actionable findings the same Worker uses [$resolve-review-findings](../../resolve-review-findings/SKILL.md), completes full-PR contract closure and the correction commit. Do not run another general local Codex review after the completed initial review.
5. Finalizes the Worker receipt with `localReview` audit references and verification claims in the [worker-contracts.md](worker-contracts.md) evidence format, then returns the finalizer stdout. The Worker does not read or write the Controller ledger or usage ledger.

A zero process exit without a completed agent result and valid wrapper receipt is invalid provenance. The reviewer never generates/repeats provenance metadata. Run one guarded review per candidate/runtime binding. If the wrapper fails, return `stopped`; do not retry the same head, brief, binary, and version. After user-authorized runtime repair, re-run preflight and permit one new attempt only when the validated binary path or version changed.

For trivial work, the Worker completes the selected inline risk audit and includes its head/result and current evidence in the finalized receipt; no local CLI review is required.

## Worker return: Controller acceptance order

Before any push, the Controller completes these prerequisites in order:

1. Observe native terminal Worker state and reconcile task, checkout, branch, clean tree, exact commit, packet runtime, and live hash-bound receipt. An assertion or receipt alone cannot prove native termination. Reject stale/malformed bindings; do not reconstruct or repair the Worker's object from logs.
2. Reconcile the receipt's bounded audit references with the wrapper-generated provenance and completed review result. For a nontrivial initial return, classify the verified result as `clean` or `findings` and persist only sanitized authoritative provenance in the existing Controller-owned `localAudit` fields. Use the existing Controller ledger update and `scripts/validate-ledger.mjs --file <absolute-ledger-path>` after that material update, retaining ownership and revision/lock protections; no new persistence command or Worker ledger access is introduced. Preserve original audited head and classification across descendant correction commits. Verify any retained audit's provenance and ancestry on correction returns.
3. Attempt diagnostic review-usage recording in the separate Controller-owned run ledger before audit retirement:

   ```bash
   node "$CDL_ROOT/scripts/run-usage.mjs" record-review \
     --file <absolute-run-usage-ledger-path> \
     --expected-revision <current-run-usage-revision> \
     --audit <absolute-audit-output-path> \
     --issue-number <pull-request-unit-issue-number> \
     --head-sha <full-audited-head-sha>
   ```

4. Run the final `controller-transition.mjs --operation verify-worker-return` with the existing flags in [worker-contracts.md](worker-contracts.md). For a nontrivial receipt this command asserts persisted local-audit coverage; never run it first and defer `localAudit` persistence until afterward. Ensure the ledger's supported phase matches the return before verification; a resumed local-review phase requires its explicit subsequent foreground phase transition.
5. Independently compare actual acceptance/risk/test/closure evidence, required versus exercised proof boundaries, and documented substitutions with the canonical issue and verification contract. Hash/shape validity is not semantic proof. Return locally correctable gaps to the same Worker; equivalent source-backed proof substitutions need no new approval. Push only after both deterministic verification and semantic acceptance pass.

`record-review` is idempotent for the same receipt. Conflicting receipt, stale usage revision, malformed counter, or unavailable usage source makes usage partial/unavailable and never changes review results or blocks delivery. Do not copy transcript content into usage state. Usage is checked against receipt-bound completion evidence: absent or undated telemetry is unknown; explicit validated zero is available reported zero. A dated in-window zero adds `local_review_zero_coverage_unverified`, making aggregates partial without changing numeric counters, availability, receipt validity, or readiness. Zero/nonzero turn aggregates do not prove coverage of all nested operations; the runner capture timestamp bounds attribution. See [run-usage.md](run-usage.md).

Before push, heartbeat, or readiness, require:

```bash
node "$CDL_ROOT/scripts/assert-local-audit-covered.mjs" \
  --file <absolute-ledger-path> --head-sha <full-current-pr-head-sha>
```

The completed initial audit may cover descendant correction heads by proven ancestry. The exact-head model gate after every push is GitHub review.

## First candidate push

After the Controller validates the hash-bound Worker return:

1. Push only the exact Worker commit.
2. Open or update a ready-for-review PR against the exact target branch.
3. After native task state is terminal and the Worker return, branch, tree, and commit are reconciled, clear `activeWorkerThreadId` through `transition-ledger.mjs --to controller-turn --clear-worker true` with the current revision.
4. Bind the returned PR URL to the pre-PR ledger with `scripts/bind-pr.mjs`, the current revision, and the exact candidate head. Use the bounded receipt; do not inspect or rewrite the ledger to fill in `prUrl` manually.
5. Run `controller-transition.mjs --operation adopt-review` for the exact candidate head. The connector can automatically review a newly opened or ready-for-review PR. Adopt its completed or running review without posting `@codex review`. Classify completed evidence and process findings or readiness; monitor running evidence.
6. `discover-review` means evidence is absent, not that automatic review is disabled. Keep discovery in the open Controller turn at the existing two-minute polling interval and bounded idle window until applicability/evidence is established; an unbound ledger cannot yet enter the bound watcher. Use `request-review --manual-review-basis <source-backed-basis>` only when trusted repository/connector settings or the approved run contract establish trigger inapplicability, or a failed attempt has a reconciled, authorized recovery decision. The basis is a bounded Controller attestation, not machine proof; missing evidence/configuration or elapsed time alone is insufficient. Unknown applicability at idle expiry uses the existing attention path. The operation refreshes complete evidence before posting and adopts a matching running/completed review in the same call. Otherwise it records the basis and recovery marker; record and re-read the returned identifier.
7. While review is pending, transition to `controller-turn` phase `awaiting-github-review` and start the continuous watcher defined in `controller-state.md`. Apply the host-bounded wrapper wait rules in `worker-contracts.md`, preserving the existing two-minute watcher polling policy and fresh mutation-boundary checks.

Never duplicate a review request for the same head or request another pass solely because a completed or running automatic review has no manual request comment.

If posting or read-back is interrupted, keep the persisted intent and run `controller-transition.mjs --operation reconcile-review-request` with the same issue, PR, head, and current ledger revision. This operation reconciles the marked request without posting. Treat an ambiguous remote outcome as unknown; do not clear the intent or repeat the POST.

## Exact-head review binding

Accept trusted connector evidence for the exact current head regardless of whether the trigger was automatic or manual. Standard review commit metadata is the primary completion signal. A flat review result may abbreviate its reviewed commit SHA. Count it only when its body identifies the reviewed commit token and this command exits zero:

```bash
node "$CDL_ROOT/scripts/resolve-reviewed-commit.mjs" \
  --repo <worktree> \
  --current-head <full-current-head-sha> \
  --reviewed-commit <reviewed-sha-token>
```

The connector’s canonical `codex-pull-request-review-summary` comment can also bind its Code Review status to a commit token. A completed matching summary plus a trusted connector thumbs-up after that completion and complete findings/thread evidence can establish clean automatic review. A running matching summary means wait. A reaction alone, a stale summary, or another actor’s comment cannot prove current-head review.

Git must uniquely resolve the token to the full current head. The watcher uses the bound checkout to resolve abbreviations; an unresolvable or ambiguous token cannot establish clean review. Do not compare prefixes as strings or substitute timestamps or comment order.

## Finding disposition

For every GitHub finding:

1. Re-read the canonical issue, repository guidance, complete PR diff, standard reviews, and all GraphQL review threads, including resolved and outdated threads.
2. If the finding repeats a hash-bound settled decision without new evidence, reply with the verified disposition and its machine-readable attestation below, resolve the thread, and do not invoke the Worker.
3. If the finding is actionable, remove and read back the watcher, then atomically enter `controller-turn` with the same Worker ID.
4. Resume that Worker with the exact correction packet from `worker-contracts.md`.
5. Keep the Controller turn open until the Worker returns.

The Worker uses `resolve-review-findings` as the authoritative correction procedure. It builds one `prSurfaceCensus` from the full merge-base-to-HEAD production diff and every current or historical actionable review concern. Resolved and outdated threads do not remove a previously actionable contract from the census.

Reject a correction return unless:

- every changed production symbol or behavior path maps to an owning production registry, schema, state machine, adapter family, configuration resolution path, or resource lifecycle
- every current or historical actionable finding maps through the census
- every census entry has exactly one `surfaceClosure`
- every current finding maps through `findingClosure`
- each closure has production-derived `inventoryEvidence`, `invariants`, mechanical `coverageProof`, and `introducedBehaviorProof`
- `checks` are complete and terminal

Do not rerun the general local review on a correction head.

## Correction push and rereview

After a valid correction return:

1. Verify the completed initial audit still covers the correction head with `scripts/assert-local-audit-covered.mjs`.
2. Push only the exact correction commit.
3. Use `findingClosure` to reply to and resolve every thread proven fixed or obsolete.
4. Re-read GitHub and verify those threads are resolved. Never rely on a push to resolve threads automatically.
5. Apply the [first candidate push](#first-candidate-push) discovery/fallback procedure to the correction head.
6. Start the continuous watcher again.

After `no-change`, the Controller owns evidence-backed thread disposition. After a genuine `stopped`, keep every watcher absent, transition to `needs-user`, and ask one exact question.

Do not request another GitHub review when the head is unchanged and the only action was an evidence-backed thread disposition.

### Verified disposition attestation

After checking the source and authority, the Controller includes this marker in its disposition reply, using its authenticated identity recorded by automatic review adoption or the manual review request:

```text
<!-- cdl-disposition finding=<review-or-thread-comment-id> head=<full-sha> source-sha256=<fingerprint> evidence-ref=<evidence-url> evidence-sha256=<evidence-digest> -->
```

Use the finding’s GraphQL `id`, or its decimal `fullDatabaseId` fetched on that same review or review comment. Preserve large database IDs as strings; never round a numeric ID or infer an ID from another entity. If a numeric ID identifies both a review and a review comment, use their distinct GraphQL IDs. Compute the source fingerprint as SHA-256 of the exact ID written in `finding=`, newline, finding commit SHA, newline, and current finding body. Multiple markers may appear in one reply; each must independently verify. Use the digest of the actual cited evidence for `evidence-sha256`. The evidence URL must identify the verified disposition's supporting evidence; do not invent a link or digest. The marker records the Controller's judgment, not a model-generated substitute for checking the source.

Cover each exact-head findings review and every inline Codex finding, including a review with no inline comments. Read back the actual marker and thread state. The watcher accepts `dispositions_complete` only for matching current fingerprints, the unchanged head, the authorized actor, and zero unresolved threads. A changed finding, changed head, missing attestation, or new concern reopens review. A resolved checkbox alone is insufficient.

## Review-thread gate

Before readiness or merge, run:

```bash
node "$CDL_ROOT/scripts/assert-review-threads-resolved.mjs" \
  --repo <owner/repository> --pr <number>
```

Require zero unresolved threads, including outdated threads.

## Readiness handoff

When the shared readiness gate in `SKILL.md` passes on one unchanged head:

- an `auto-child` parent-mode PR proceeds through its standing merge authority
- an `explicit-terminal` single-ticket or final parent PR deletes its watcher and uses the exact readiness report in `terminal-handoffs.md`
