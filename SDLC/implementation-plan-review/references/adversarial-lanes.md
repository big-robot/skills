# Adversarial Lanes

Use these lanes only when risk warrants them. Keep the active set to one to three lanes unless the user explicitly asks for deeper review.

## Triggers

Run selective adversarial lanes when a plan includes:

- production data reads or writes
- billing, payment, finance, legal, privacy, or compliance behavior
- authn, authz, security, credentials, secrets, or auditability
- migrations, destructive actions, or irreversible source-system effects
- ambiguous product behavior
- large cross-module refactors
- repeated failed fixes or unclear test failures

## Lanes

- Source-shape skeptic: disprove assumptions about fields, queries, schemas, external APIs, state values, and source authority.
- Edge-case/path hunter: look for alternate states, sibling paths, missing branches, early exits, compatibility hazards, wrappers, adapters, jobs, and persistence paths.
- Acceptance auditor: check whether acceptance criteria actually prove the requested outcome and whether out-of-scope behavior is explicit.
- Security/operator-copy reviewer: check secrets, sensitive data, logs, committed artifacts, permissions, external tooling, and harmful operator-facing instructions.
- Simplification reviewer: challenge unnecessary abstraction, fallback paths, broad rewrites, generalized helpers, and ceremony.

## Output

Use [adversarial-evidence-packet](../../adversarial-evidence-packet/SKILL.md) for all findings. Return packets, not prose.
