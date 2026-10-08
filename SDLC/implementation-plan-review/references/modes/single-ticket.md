# Single-ticket review

Load this reference only for one OS-temporary standalone plan with an explicitly designated existing GitHub issue or `create new` target.

## Input preflight

Require the plan to declare:

- absolute OS-temporary candidate directory containing `candidate.md` and `publication-manifest.json`
- exact GitHub repository
- existing standalone issue or `create new`
- proposed title
- base ref and 40-character base SHA

For an existing issue, require a pre-review SHA-256 digest over title, body, labels, state, assignees, and native parent identity. Re-read those fields, verify the digest, and check competing PR or branch ownership. Require no native parent and no `type:parent`, `ready-for-dev`, or `in-progress`. Do not require planning labels.

For `create new`, search the configured repository for duplicates before review.

Use the existing issue as the canonical request and the temporary plan as the candidate replacement. The candidate is not canonical until separately approved publication succeeds and is read back.

Require `candidate.md` to put the exact title between `<!-- BEGIN CANDIDATE TITLE -->` and `<!-- END CANDIDATE TITLE -->`, and the exact issue body between `<!-- BEGIN ISSUE BODY -->` and `<!-- END ISSUE BODY -->`. Read [the publication manifest contract](../../../publish-reviewed-tickets/references/publication-manifest.md) before authoring or validating its fields. Require the schema-v1 standalone manifest to agree with the repository, base ref/SHA, target, candidate title/body hash, and verification commands. For an existing target, the manifest must bind its 64-character pre-review state digest. The manifest and receipt prove deterministic publication identity; source review and immediate live read-back still establish readiness and freshness.

Review the marked body against [the standalone candidate template](../../../implementation-planning/assets/standalone-ticket-candidate-template.md). It must be an executable issue contract, with publication identity, temporary paths, review/approval instructions, and cleanup confined to the manifest or candidate text outside the body markers. Keep real implementation dependencies in the body.

Before semantic review, run read-only `check --candidate-dir` with repository root and exact repository/base bindings from the publication manifest contract. Correct deterministic failures locally; `check` neither creates a receipt nor establishes source-review readiness.

## Publication gate

After a clean tier-final check, create and immediately verify the schema-v2 receipt:

Resolve the [receipt tool](../../../publish-reviewed-tickets/scripts/review-receipt.mjs) relative to this reference's canonical file location and set `review_receipt_script` to its absolute path before running the command.

```bash
node "$review_receipt_script" create \
  --candidate-dir <absolute-candidate-directory> \
  --repo-root <absolute-repository-root> \
  --github-repo <owner/repository> \
  --base-ref <reviewed-base-ref>
```

Run the same command with `verify` and require success. Its `deterministically-valid` verdict binds candidate and manifest hashes, repository, target, and base; it is not a substitute for the clean source-review verdict.

When continuation is requested, use the shared approval packet in `SKILL.md`. Its publication scope is:

> Publish this exact reviewed plan as the standalone GitHub implementation ticket. Create or update only the declared target, apply `ready-for-agent`, verify the exact body, labels, identity, and absence of a native parent, then delete the temporary candidate directory and hand the issue URL to `codex-development-loop`.

For requested publication or recovery, load [single-ticket publication](../publication/single-ticket.md) before any external mutation. Its immediate receipt/base/live-state checks, exact authority, read-back, and cleanup remain mandatory. A planning-only review does not load or execute those steps. If publication is deferred, retain the exact temporary directory and state that the reviewed candidate is not canonical.

## Verification and report

Before a ready verdict, compare the candidate against the existing canonical issue body or the `create new` duplicate search so every proposed scope change is explicit.

Report the canonical issue-body changes proposed or published, issue URL and label state when published, retained draft path when deferred, and the exact temporary directory deleted or retained.
