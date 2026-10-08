# Delivery Bundle review

Load this reference only for one OS-temporary Delivery Bundle directory.

## Input preflight

Require:

- `bundle.md` and at least two `slices/SNN.md` files
- `publication-manifest.json` with the delivery-bundle schema v1
- exact GitHub repository, base ref, and 40-character base SHA
- no `review-receipt.json` from an earlier verdict unless it still verifies
- zero GitHub bundle publication except verified inactive issues recorded by a failed `publish-reviewed-tickets` attempt

Treat `bundle.md` and all `slices/*.md` as one review unit. Review each child against its relevant source evidence.

Before semantic review, run the read-only artifact preflight from the [publication manifest contract](../../../publish-reviewed-tickets/references/publication-manifest.md) using `check --bundle-dir`, the repository root, and exact repository/base bindings. Correct deterministic failures locally; `check` neither creates a receipt nor establishes source-review readiness.

## Bundle and child review

Require every child to fit one fresh agent context, produce one independently green PR, support one complete-diff review, and own one independently testable behavior. Do not impose a line-count or file-count threshold.

Validate globally:

- repository, base ref, and 40-character base SHA agree with current Git state
- manifest repository, base, target, graph, ownership, and verification agree with the reviewed bundle
- the bracketed dependency and ownership tables in `bundle.md` exactly match deterministic manifest rendering
- `bundle.md` and every slice preserve the templates' exact parent and body boundary markers
- stable slice IDs and filenames are unique
- the dependency graph is acyclic and blockers precede blocked slices
- every parent acceptance criterion has one primary child owner
- additional verification ownership does not duplicate implementation ownership
- child outcomes cover the full parent contract without scope expansion
- a final integration child owns real delayed work rather than duplicating the Controller's parent-readiness verification
- parent and child bodies contain implementation contracts; publication metadata and handoff remain outside their publishable body markers

Validate every child against the [task readiness checks](../review-procedure.md#task-readiness-checks). Parent plus child is the complete execution contract. Global facts belong in the parent; exact slice implementation facts belong in the child.

Patch evidence-backed detail in the temporary bundle. Revise slice boundaries, order, or blockers when the source-backed review requires it, then re-review the affected graph and acceptance ownership. Stop only when a product, scope, security-policy, or authority decision remains. The final exact graph is included in the one post-review approval packet.

For a detail-only edit, re-review the changed child, parent-criterion ownership, blockers, and downstream handoffs, then run one bundle-wide consistency pass. Re-review every child when the parent contract or slice boundaries change.

Use [Publication manifest contract](../../../publish-reviewed-tickets/references/publication-manifest.md) for schema and rendering. If a repair changes the manifest graph or ownership, re-render the tables before re-review. Never render after receipt creation without invalidating the receipt and reviewing the changed artifact.

## Receipt and handoff

After a clean tier-final check:

1. Remove any stale `review-receipt.json`.
2. Re-run bundle-wide acceptance ownership, dependency, placeholder, and vagueness checks.
3. Verify the exact base ref still resolves to the reviewed SHA.
4. Create the receipt:

Resolve the [receipt tool](../../../publish-reviewed-tickets/scripts/review-receipt.mjs) relative to this reference's canonical file location and set `review_receipt_script` to its absolute path before running the command.

```bash
node "$review_receipt_script" create \
  --bundle-dir <absolute-bundle-directory> \
  --repo-root <absolute-repository-root> \
  --github-repo <owner/repository> \
  --base-ref <reviewed-base-ref>
```

5. Immediately run the same script with `verify` and require success.

The schema-v2 receipt binds every reviewed file and manifest, SHA-256 file set, repository, base ref, and base SHA. Its `deterministically-valid` verdict is not a source-review-ready verdict. Any later body, graph, slice-set, manifest, repository, or base-ref change invalidates the receipt.

Offer exactly this outcome:

> Publish this exact reviewed Delivery Bundle with `publish-reviewed-tickets`. Create or update only the explicitly designated parent, create native GitHub sub-issues and blocker relationships, verify the complete inactive graph, then activate children with `ready-for-agent` and the parent with `type:parent` plus `ready-for-dev`.

Do not publish from plan review. When continuation is requested, use the one shared approval packet in `SKILL.md`; retain the complete temporary directory until publication verifies the active graph and deletes it.

## Verification and report

Before a ready verdict, verify parent-criterion ownership, graph acyclicity, exact child sections, permitted reference tokens, receipt hashes, repository identity, and exact base.

Report every reviewed bundle file, receipt path and verification result, publication approval status, retained bundle path, and readiness for `publish-reviewed-tickets`.
