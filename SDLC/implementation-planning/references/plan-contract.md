# Formal plan contract

Read when constructing formal implementation units and their verification contract. The entrypoint owns authority, binding constraints, safety-trigger selection, sizing, and completion; the selected tier and mode own their additional gates.

## Source-map inventory

Record exact inspected evidence:

- files, directories, and existing symbols
- commands, scripts, package exports, and runtime paths
- schemas, types, constants, state values, queries, fixtures, and tests
- repository rules, ADRs, durable docs, and existing decisions that constrain work
- alternate entrypoints, wrappers, adapters, jobs, UI consumers, persistence paths, and early returns sharing the changed behavior
- external APIs or source-data fields verified from current source, official docs, fixtures, or user-approved live evidence

Cite important assumptions with file paths and lines when practical. Include each relevant analogous path in a unit or explicitly exclude it with evidence. `Similar paths`, `client files if needed`, and `existing tests where behavior changes` do not substitute for a source map.

## Implementation-unit format

Every unit names:

- goal and owned acceptance criteria
- exact files to create or modify
- existing symbols and patterns to inspect
- ordered implementation steps
- relevant inputs, states, edge cases, fallbacks, and error behavior
- exact tests or checks and their files
- dependencies and downstream handoffs

Put applicable safety invariants and their checks in the existing risks/verification sections, following the entrypoint's conditional triggers. If no test is warranted, write `No test: <reason>` and name the manual or static check covering the risk.

## Bounded feasibility experiments

Before freezing steps, an unresolved feasibility question may justify one disposable experiment when source inspection cannot answer it. Define its hypothesis, synthetic inputs, success criterion, discard criterion, time or command bound, and the plan section it can inform.

Keep it local and disposable. It may not use production data, mutate product behavior, publish an artifact, or become a delivery slice. Record the result or `UNVERIFIED`; a failed experiment does not justify a speculative implementation branch.

## Sizing applications

Review and validation effort matter alongside agent context. Testing two functions separately is not enough to split delivery; each proposed slice needs a useful outcome that can be reviewed, verified, and adopted without unfinished companion work.

For a wide migration, use expand-migrate-contract: expand the shared contract without breaking callers, migrate one independently verifiable behavior per slice, then remove the legacy contract only after every migration completes.

A final integration slice is valid only when it owns delayed implementation or verification that `codex-development-loop` parent readiness does not already own.

## Source assumptions and preservation

For external APIs, source data, persistence shapes, payment/accounting states, warnings, and fallbacks:

- cite current source, official docs, fixtures, or approved live reads
- mark unsupported claims `UNVERIFIED`
- do not add fallback queries, optional metadata paths, parent lookups, adapters, or generalized helpers for unverified possibilities
- do not treat missing evidence as proof a field, path, or state is absent
- define preservation and overwrite behavior when a lookup is skipped, throttled, missing, or failed

## Verification contract

Apply [test-quality.md](../../shared/test-quality.md). For each test name the protected behavior, highest practical public interface or stable seam, baseline evidence appropriate to the change type, fixture strategy, and reason for existing.

Trace every acceptance criterion and unit to an exact check:

```text
acceptance criterion -> implementation unit -> files -> tests/checks -> command
```

Inspect package scripts and test paths before naming commands. Label a planned new test file `Create` and still give its final command. Use `No command: <reason>` only when no executable check exists.

Changed behavior uses a regression demonstration when practical. Refactors use preserved-contract checks; do not manufacture a failing baseline. Mechanical/documentation work uses proportionate static, rendering, link, lint, or manual checks with a reason executable testing is unwarranted.

For a binding composition property, the check must trace stimulus through the relevant production composition to an assertion at its required boundary. Do not weaken that property or boundary when substituting source-backed test mechanics.

## Placeholder and vagueness scan

Scan all plan Markdown for:

```text
similar to|if needed|if display logic changes|according to chosen policy|appropriate error handling|write tests|tests from prior plans|where behavior changes|left to the implementer|TBD|TODO|maybe|\?\?\?
```

Patch each hit or quote why it is harmless. The scan supports the entrypoint's completion contract; it does not replace source review.
