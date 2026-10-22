# Test Quality

Use this reference when planning, reviewing, or executing tests.

## Core Standard

Tests must protect behavior through the highest practical public interface or stable seam. Do not add tests by count. Each test must earn its place by reducing real risk.

## Required Test Rationale

For each proposed test, name:

- protected behavior and required observable result
- expected-result source: an acceptance criterion, authoritative contract, or independently worked example
- public interface or seam
- plausible wrong result or behavior that the assertion rejects
- old behavior it should fail against, when applicable
- fixture strategy
- marginal protection beyond existing checks, or why strengthening an existing test is preferable

An **oracle** is the basis for deciding whether a result is correct. Establish it before deriving expectations from implementation output. Characterization may record observed current behavior; label that limitation rather than presenting observation as independently established correctness. Reject expectations that only repeat a mock's configured return or copy the production algorithm without independent justification. Independently justified arithmetic or properties can be valid; similar syntax alone does not establish a copied oracle.

## Verification Integrity

Never weaken verification solely to obtain a passing result. Inspect the complete diff for changed assertions and expectations, removed or renamed tests, snapshots and fixtures, skips and focused-test markers, discovery patterns and exclusions, runner configuration, and CI. A passing focused run does not replace repository-required verification.

For every verification change, record its authoritative contract reason and retained or replacement proof, including required behavior and exercised boundaries. Account for deletions and discovery changes as well as additions. Inspect the complete Git diff rather than only an author's selected files. In verification evidence, account for each modified, deleted or renamed existing test, its reason, and retained or replacement proof; include fixture, snapshot, discovery and CI changes in the same review. Existing receipt evidence strings may carry a concise summary and resolvable local reference to the complete verification record through the workflow's existing bounded supporting-evidence transport instead of repeating every detail inline. Preserve the complete accounting for the Controller or reviewer to inspect; do not omit or truncate proof to fit the receipt. No new receipt fields are required.

Approved contract changes may require changed expectations and source/test edits together. Preserve proof of the revised contract, unaffected behavior, and required boundaries. Domain-required call counts, status, audit/log content, and fixture values may be observable contracts. Flag production branches that special-case test or fixture values without such a domain contract; do not prohibit justified domain behavior or ordinary synthetic fixture setup.

When a failing test conflicts with intended behavior and the authoritative contract is unresolved, report `TEST CONFLICT: <file>:<line> <reason>`, identify the conflicting sources and affected work, and stop that change before altering assertions, expectations, snapshots, or exclusions. Continue independent safe work through existing workflow authority; use the existing Controller/user decision route for the unresolved contract. Do not invent a new approval stage for a locally correctable defect or an already approved contract update.

Review lost consequential protection according to its concrete impact, not test-edit count: P0 for immediate critical security, safety, or irreversible data-loss exposure; P1 for other material contractual protection lost. Legitimate approved updates with retained or replacement proof are not integrity findings merely because tests changed. Severity and local finding confidence/readiness are separate policies; preserve the governing repository's local confidence and exact-evidence requirements.

The portable [Code Review Rules template](templates/agents-code-review-rules.md) supplies repository review guidance. Delivery instructions require reading the root AGENTS.md before launch. The current runtime does not parse these rules or enforce their semantic application.

## Baseline Evidence By Change Type

| Change type | Required evidence |
| --- | --- |
| Changed behavior | A meaningful behavioral failure against the prior behavior when practical, then a passing result for the intended contract. If unavailable, record the reason and alternative evidence. |
| Preserved behavior, including a refactor | Characterization or contract checks that pass before and after the change. Do not require an artificial failing baseline. |
| Mechanical or documentation-only change | A proportionate static, rendering, link, lint, or manual check; state why an executable behavior test is not warranted. |

When a proposed test cannot fail against the prior implementation, name the preserved or changed contract it demonstrates instead of claiming a false failing baseline.

## Strong Test Targets

Prefer tests that protect:

- safety, permissions, data integrity, and security boundaries
- billing, payment, finance, legal, privacy, or compliance behavior
- external contracts, source-shape assumptions, schemas, and query paths
- bug-prone state transitions, fallback behavior, and edge cases
- user-visible or operator-visible outcomes that must not regress

## Red Flags

Treat these as review signals, not automatic failures:

- tests that only verify mock shape or internal collaborator calls
- heavy mocking of the unit's main collaborators
- assertions on implementation call counts such as `toHaveBeenCalled*`
- broad `getByText`, `toBeTruthy`, or `toBeDefined` assertions
- database-bypass assertions that do not exercise the real persistence seam
- assertions on transport status alone when success and error share that status or envelope; assert the response discriminant and intended behavioral payload
- tests that pin incidental copy, layout, timing, or wiring without behavior value

## TDD And Verification

- When behavior intentionally changes and practical, watch the test fail for the prior behavior before trusting it. For preserved behavior, use characterization or contract checks that pass before and after the change; do not manufacture a failing baseline.
- Verification evidence must identify the exact command, exit/result, relevant source revision and working-tree state, and retained output in the tool/agent record or a local evidence file. Summaries may reference that output instead of pasting it. Missing or unbound evidence is unverified; state `not run: <reason>` when applicable.
- Reuse evidence only while the relevant source, dependencies, configuration, environment, and required proof remain unchanged. Rerun affected checks after relevant changes or when a workflow boundary explicitly requires fresh verification; a new turn or context compaction alone does not invalidate evidence. Never describe a historical run as newly executed.
- For changed behavior when practical, retain meaningful failing (RED) output once before passing output; summaries may reference both records. Import, setup, or syntax failure is not behavioral RED. When unavailable, record the reason and alternative evidence. For preserved behavior, retain before-and-after passing evidence; do not manufacture RED.
- Completion claims require verification bound to the current relevant state and a VCS diff check.
- Keep test output clean. Do not normalize noisy warnings as acceptable unless the warnings are the thing under test.

## When The Seam Is Unclear

Add one tracer-bullet behavior test at a time. If no good test seam exists, record that as an architecture finding instead of forcing a low-value test.
