# Run usage diagnostics

Read when initializing usage evidence, checking progress, or retaining the final summary. Use the existing `scripts/run-usage.mjs` collector with explicit active and archived session roots. Its ledger is separate from PR coordination state; telemetry errors never block delivery, review, merge, or approved cleanup.

## Windows and source status

`init` accepts `--started-at <UTC-ISO-timestamp>`; the default is invocation time. Set it to the actual approved run start when initialization is delayed. Preserve that timestamp when recovering evidence. Never replace it with thread creation time or guess a missing baseline from lifetime totals.

`report` accepts `--cutoff <UTC-ISO-timestamp>`; the default is invocation time. Session responses are counted by completion timestamp in `(startedAt, cutoffAt]`, including the whole response that completes in that window. The report also gives `lastObservedAt`; work whose usage has not yet been emitted is excluded, even if still running. A requested cutoff does not prove telemetry was emitted through that instant. Phase boundaries follow the same convention and are timeline attribution, not causal cost estimates.

The collector reads top-level `token_usage_record` response usage, deduplicates response IDs (including `compacted.payload.latest_token_usage_record` copies), and reconciles the sum against `thread_token_usage`. Compaction copies without a standalone timestamp remain unattributed. Only metadata-bound Worker/explorer descendants created within the run and before cutoff are included. Prompts and tool text are never used for attribution.

Legacy `event_msg.token_count` cumulative counters remain supported with partial provenance and unknown response counts. They may omit compaction usage. A trustworthy earlier counter or a v1 launch baseline can bound a legacy delta; missing prefixes, regressed counters, disagreement, or incomplete source evidence remain unknown/partial. A missing Controller source at initialization can be recovered by later reports against the original start timestamp. Never add legacy and modern counters together.

Known local reviews with absent, malformed, multiple ambiguous completion counters, or undated telemetry remain unknown. New guarded runner receipts bind a capture timestamp; that timestamp, not receipt import time, places reviews in a window. Existing receipts remain valid for review gates. A single validated, transcript-backed all-zero usage object is available reported zero. If its capture timestamp falls in `(startedAt, cutoffAt]`, the collector adds `local_review_zero_coverage_unverified` and marks the affected aggregate partial. Numeric counters stay zero, `unavailableCount` stays zero, response counts remain unknown, and the ledger's complete counter status is preserved. Undated or out-of-window reviews do not add this reason. An empty discovered participant set is zero; failed discovery is unknown. A reconciled no-work session without a local review remains complete zero. Local review counters are reported turn aggregates: zero and nonzero totals do not prove that every nested operation's cost is included or establish model response counts.

The report exposes `inputTokens` (gross), `cachedInputTokens`, derived `freshInputTokens`, `outputTokens`, and response counts where available. Cached input and reasoning output are subsets; total is input plus output. Partial totals are only known observed usage, not a complete run estimate. These diagnostics establish neither dollars charged nor quota impact.

## Material checkpoints

At material phase transitions, after a bounded verification batch when growth would affect strategy, or on request, the Controller can retain an elapsed interval:

```bash
node "$CDL_ROOT/scripts/run-usage.mjs" checkpoint \
  --file <absolute-run-usage-ledger-path> \
  --expected-revision <current-run-usage-revision> \
  --phase <phase-just-completed> \
  --active-sessions-root "${CODEX_HOME:-$HOME/.codex}/sessions" \
  --archived-sessions-root "${CODEX_HOME:-$HOME/.codex}/archived_sessions"
```

Phases are `implementation`, `verification`, `local-review`, `github-review`, `correction`, `integration`, `terminal`, or `unassigned`. Each checkpoint labels the interval since the previous checkpoint (initially run start); repeated phase labels are allowed. `report --phase <current-phase>` shows the live interval without changing state. Both support an explicit cutoff. The ledger retains at most 64 checkpoints; a limit or revision conflict is a diagnostic failure, never a delivery gate. Do not overwrite earlier checkpoints or create extra approval questions to recover accounting.

Carry `local_review_zero_coverage_unverified` into checkpoint and terminal summaries when a zero review falls within their interval. A later interval may be complete zero while the cumulative run remains partial because an earlier review was qualified. Report the numeric zero with its reason; do not infer hidden usage or estimate replacement counters. Coverage uncertainty and all collection/report failures remain diagnostic and cannot block review, delivery, merge readiness, or approved cleanup.

Use gross/cached/fresh/output growth and response counts to choose a more efficient bounded execution strategy within existing acceptance scope: batch qualified browser scenarios, reduce repeated full-context coordination, and reuse still-valid evidence. Preserve required coverage and invalidation rules. Do not add arbitrary token gates, request new budget approval, reduce acceptance obligations, or run a frequent model polling loop to monitor usage. No custom scheduler is needed.

## Retention and compatibility

Before approved cleanup, export a sanitized report with `report --summary-file <absolute-new-file-outside-worktree>` (and `--phase terminal`). Choose an existing task-owned output directory that will survive the exact cleanup plan. The collector creates a new mode-0600 JSON file exclusively; it refuses to replace existing files or write inside the worktree. Read the result back before deleting the usage ledger. Retain the bounded human summary in the final task response as described in `terminal-handoffs.md`.

Export failure does not block cleanup: keep the bounded stdout result in task context and provide it in the final response. Never copy raw session content, session paths, or response/agent IDs into the summary. The private Controller binding and existing hash-bound review identities remain only in the private ledger. Summary reports contain counters, timestamps, fixed phase/status/reason codes, and explicit exclusions.

New ledgers and reports use schema version 2. Version-1 usage ledgers remain readable; a checkpoint upgrades them without touching PR coordination state. Existing schema-v1 review receipts and schema-v1/v2 usage ledgers retain their formats and receipt hashes. New reports qualify dated stored zero reviews without rewriting receipt evidence; previously saved summaries remain historical. Old undated review totals cannot be assigned to a phase or cutoff. Older collectors may reject a checkpoint containing `local_review_zero_coverage_unverified` because their reason-code whitelist predates it. This downgrade limitation is a diagnostic failure: retain the newer collector for those checkpoints and continue authorized delivery work. Usage commands may also fail for invalid paths, revisions, or unavailable evidence; callers preserve existing lifecycle authority. The session format is a private source contract: unsupported or inconsistent evidence must remain partial/unknown rather than silently adopting new semantics.
