# Test Quality

Use this reference when planning, reviewing, or executing tests.

## Core Standard

Tests must protect behavior through the highest practical public interface or stable seam. Do not add tests by count. Each test must earn its place by reducing real risk.

## Required Test Rationale

For each proposed test, name:

- protected behavior
- public interface or seam
- old behavior it should fail against, when applicable
- fixture strategy
- why the test earns its place

## Baseline Evidence By Change Type

| Change type | Required evidence |
| --- | --- |
| Changed behavior | A regression or behavior test that would fail against the prior behavior when practical, then passes for the intended contract. |
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
- For a new behavior test, retain the failing (RED) output once before the passing output; summaries may reference both records.
- Completion claims require verification bound to the current relevant state and a VCS diff check.
- Keep test output clean. Do not normalize noisy warnings as acceptable unless the warnings are the thing under test.

## When The Seam Is Unclear

Add one tracer-bullet behavior test at a time. If no good test seam exists, record that as an architecture finding instead of forcing a low-value test.
