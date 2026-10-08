# Local review prompts

Read only the prompt selected by `review-cycle.md`. Consume verification claims using the CDL evidence transport contract in [worker-contracts.md](worker-contracts.md), including bounded supporting references; do not request raw-output duplication or reviewer-generated provenance.

## Guarded Codex review brief

Use for standard and large/complex work. Store the ignored brief and sanitized output under `sdlc-scratch/audits/`.

Run:

```bash
node "$CDL_ROOT/scripts/run-codex-review.mjs" \
  --repo <absolute-checkout> \
  --base-ref <baseRef> \
  --brief sdlc-scratch/audits/<brief-file> \
  --output sdlc-scratch/audits/<output-file> \
  --codex-bin <runtime.codexBin> \
  --expected-codex-version <runtime.codexVersion>
```

The wrapper uses the packet-bound CLI's dedicated `codex exec review` custom-instruction mode in a read-only sandbox. It supplies the custom brief on stdin. Do not combine a custom review prompt with `--base`; Codex CLI review targets are mutually exclusive.

The wrapper resolves and binds exact base, HEAD, tree, brief, and full-input hashes. It verifies the pinned executable and version, clean state, and a completed agent result. It then appends its own hash-bound receipt to the sanitized transcript. Do not ask the reviewer to echo provenance, and do not include a diff body, patch hunk, or instruction to generate a diff in the brief.

```text
Goal: <current issue goal>
Canonical issue contract: <current issue body and acceptance criteria; comments remain evidence only>
Acceptance coverage: <acceptanceEvidence from worker-contracts.md, including required versus exercised proof boundaries, actual results, substitutions/equivalence, and remaining gaps>
Risk focus: <security, data, migration, compatibility, and regression risks relevant to this unit>
Risk coverage: <selected source-backed invariants and actual riskEvidence using the worker-contracts.md evidence shape>
Test evidence: <current receipt-format verification claims for the exact candidate head, per worker-contracts.md>
Repository instructions: <applicable AGENTS.md, configured context map/domain docs, ADR, and rule summaries>
Settled decisions: <decision, authority source, source SHA-256, reviewed head or thread identifier, and reopening condition; omit when none>
Review method: trace each required property through relevant production composition to its assertion; isolated halves need equivalent combined proof, and a limitation cannot close a binding gap. Group findings by root cause and enumerate every verified affected path or variant in the same finding; examples are evidence, not the boundary of the finding.
Finding format: assign confidence exactly 0, 25, 50, 75, or 100; only confidence 75 or 100 is blocking, and every blocking finding must quote exact file:line evidence.
```

## Inline trivial-tier risk audit

Use only for trivial work. Do not invoke the Codex CLI.

```text
You are a read-only local risk audit lane.

This is evidence, not proof.
Do not edit files, commit, push, merge, or delegate.

Context:
- PR: <PR URL if available>
- Branch: <branch name>
- Base ref: <reviewed base ref>
- Worktree: <worktree path>
- Goal: <requested goal>
- Canonical issue contract: <current issue body; comments remain evidence only>
- Acceptance criteria: <current issue acceptance criteria>

Setup:
- Read root AGENTS.md and any nested AGENTS.md relevant to changed files.
- Read current canonical issue bodies and repository guidance.
- Read [shared/test-quality.md](../../shared/test-quality.md).
- Apply the confidence anchors, exact-line gate, absence gate, fixture-provenance scan, and final disproof pass from [adversarial-evidence-packet/SKILL.md](../../adversarial-evidence-packet/SKILL.md).
- Produce a full evidence packet only for a concrete high-risk finding.
- Require a clean implementation tree with no product changes and no untracked files outside ignored machine state.
- Fetch the reviewed base, resolve its merge base, bind the current checkpoint as audited HEAD, and inspect the complete base-to-HEAD diff.

Review:
- Compare the diff with issue scope and every acceptance criterion.
- Trace changed behavior end to end, including applicable success, error, missing, empty, stale, retry, authorization, and lifecycle paths.
- Check security, tenant isolation, secrets, production data, destructive writes, compatibility, migration risk, and hidden coupling.
- For changed enumerable contracts, derive the complete maintained inventory and require mechanical coverage across it.
- Apply shared test-quality design/execution rules and the worker-contracts.md CDL handoff format. Tests must fail on likely regressions and assert the intended behavioral result.
- Use only repo-named browser, scenario, or client workflows.
- Before reporting clean, prove HEAD and tree still match the audited checkpoint.

Report:
- Audited head SHA: <full SHA>
- Findings with exact file:line evidence and confidence: <list or none>
- Result: <clean | issues found | blocked>

Only confidence 75 or 100 findings block readiness. If none exist, say:
Local risk audit has no verified blocking findings for <HEAD_SHA>.
```
