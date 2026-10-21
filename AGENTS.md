# Repository instructions

Security first. Keep changes scoped and preserve the SDLC sibling layout. Source changes and exports do not activate installed skills.

## Code Review Rules

<!-- test-integrity:v1 -->
- TI-01: Never weaken verification solely to obtain a passing result; inspect test deletions and renames, changed assertions, expectations, snapshots, fixtures, skips, focused tests, discovery patterns, exclusions, runner configuration, and CI.
- TI-02: For every verification change, record the authoritative contract reason and retained or replacement proof; preserve required behavior, verification commands, and exercised boundaries.
- TI-03: Establish expected results from an acceptance criterion, authoritative contract, or independently worked example; implementation output or mock returns alone are not proof of correctness. Name a plausible wrong result rejected and the protection added beyond existing checks.
- TI-04: Flag production special-casing of fixture or test-only values without a domain contract; domain-required behavior is legitimate when the contract and behavioral proof support it.
- TI-05: When a failing test conflicts with intended behavior and the authoritative contract is unresolved, report TEST CONFLICT and stop the affected change before altering expectations, assertions, or exclusions.
- TI-06: Rate lost consequential protection by concrete consequence: P0 for immediate critical security, safety, or irreversible data-loss exposure; P1 for other material contractual protection lost. Do not assign P1 merely because a test changed; approved contract updates are legitimate when required proof is retained or replaced.

## Local review policy

- Scope fidelity first: compare changes to acceptance criteria.
- Only confidence `75` or `100` blocks readiness; quote exact `file:line` evidence.
- Missing evidence is unknown, not proof of absence.
- Tests protect behavior through the highest practical public interface or stable seam.
