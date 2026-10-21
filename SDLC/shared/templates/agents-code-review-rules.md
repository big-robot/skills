# Repository code review rules template

Copy the complete section below into the repository-root AGENTS.md. Keep the marker and six core rules unchanged; append repository-specific rules after them. An incompatible core-rule change requires a new integrity contract version and matching preflight support. The preflight checks structural presence of the complete rules, not their semantic application or test correctness. Local confidence and readiness policies belong in a separate section.

## Code Review Rules

<!-- test-integrity:v1 -->
- TI-01: Never weaken verification solely to obtain a passing result; inspect test deletions and renames, changed assertions, expectations, snapshots, fixtures, skips, focused tests, discovery patterns, exclusions, runner configuration, and CI.
- TI-02: For every verification change, record the authoritative contract reason and retained or replacement proof; preserve required behavior, verification commands, and exercised boundaries.
- TI-03: Establish expected results from an acceptance criterion, authoritative contract, or independently worked example; implementation output or mock returns alone are not proof of correctness. Name a plausible wrong result rejected and the protection added beyond existing checks.
- TI-04: Flag production special-casing of fixture or test-only values without a domain contract; domain-required behavior is legitimate when the contract and behavioral proof support it.
- TI-05: When a failing test conflicts with intended behavior and the authoritative contract is unresolved, report TEST CONFLICT and stop the affected change before altering expectations, assertions, or exclusions.
- TI-06: Rate lost consequential protection by concrete consequence: P0 for immediate critical security, safety, or irreversible data-loss exposure; P1 for other material contractual protection lost. Do not assign P1 merely because a test changed; approved contract updates are legitimate when required proof is retained or replaced.
