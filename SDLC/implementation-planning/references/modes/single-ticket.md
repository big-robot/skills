# Single-ticket mode

Use this mode when the complete change fits one fresh agent context, one independently green PR, one complete-diff review, and one independently testable behavior.

## Temporary artifact

Create one task-specific OS-temporary directory containing `candidate.md` and `publication-manifest.json`. Planning makes no GitHub write. An existing issue body remains canonical until the reviewed replacement is explicitly published. For `create new`, no canonical ticket exists yet.

Record the following in `publication-manifest.json` or outside the `BEGIN ISSUE BODY` markers in `candidate.md`:

- exact GitHub `owner/repository`
- target issue URL or `create new`
- proposed ticket title
- exact base ref and current 40-character base SHA
- absolute temporary plan path
- for an existing target, a SHA-256 digest over title, body, labels, state, assignees, and native parent identity

Copy [the standalone candidate template](../../assets/standalone-ticket-candidate-template.md) to `candidate.md`. Put the exact title between `<!-- BEGIN CANDIDATE TITLE -->` and `<!-- END CANDIDATE TITLE -->`, and only the future implementation issue body between `<!-- BEGIN ISSUE BODY -->` and `<!-- END ISSUE BODY -->`. Read [the publication manifest contract](../../../publish-reviewed-tickets/references/publication-manifest.md) before authoring its schema-v1 standalone fields: repository, base ref/SHA, declared target, candidate title/body hash, and verification commands. For an existing issue, include its 64-character state digest in the declared target. The manifest is a deterministic publication binding, not a replacement for source review or live-state freshness checks.

## Target preflight

For an existing issue:

1. Re-read title, body, labels, state, assignees, and native parent identity.
2. Require no native parent, `type:parent`, `ready-for-dev`, or `in-progress`.
3. Check for a competing PR, branch, assignee, or Codex task.
4. Treat comments as evidence, not canonical scope changes.

For `create new`, search for duplicates and stop on ambiguous identity.

## Publishable body

Follow the candidate template's issue-body sections. Add sections only when the implementation contract needs them. Keep publication status, temporary paths, approval instructions, review handoff, and artifact cleanup outside the issue-body markers; the manifest and review workflow own those facts. Put actual implementation dependencies and downstream code contracts in the relevant implementation steps.

## Mode gate

Require the repository, target, proposed title, base ref and SHA, existing-target digest when applicable, exact candidate/manifest agreement, and absolute temporary path. Confirm the plan has one coherent implementation unit and no GitHub mutation occurred.

Run read-only `check --candidate-dir` with the exact repository/base bindings from the publication manifest contract before handoff. Correct deterministic failures locally; this preflight does not create a receipt or replace independent source review. Use stable `AC-NN:` checklist prefixes for acceptance traceability.

Hand the exact target and absolute plan path to `implementation-plan-review`. Do not apply or remove labels during planning.

Offer exactly:

> Review this exact standalone ticket plan with `implementation-plan-review`. Keep the draft OS-temporary and make no GitHub change until review is clean. A later exact approval may authorize its publication and any bounded launch scope.
