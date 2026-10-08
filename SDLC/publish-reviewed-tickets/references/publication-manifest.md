# Publication manifest contract

Use this reference when creating, rendering, validating, or resuming a receipt-bound publication artifact.

`publication-manifest.json` is schema version 1. A Delivery Bundle manifest has this shape:

```json
{
  "schemaVersion": 1,
  "kind": "delivery-bundle",
  "repository": "owner/repository",
  "base": { "ref": "main", "sha": "40-character commit SHA" },
  "target": { "kind": "create-new" },
  "parent": { "title": "Exact parent title" },
  "slices": [
    { "id": "S01", "title": "First increment", "outcome": "First testable result", "blockedBy": [], "verification": [{ "id": "V-01", "command": "node --test tests/first.test.mjs", "description": "First behavior" }] },
    { "id": "S02", "title": "Second increment", "outcome": "Second testable result", "blockedBy": ["S01"], "verification": [{ "id": "V-02", "command": "node --test tests/second.test.mjs", "description": "Second behavior" }] }
  ],
  "acceptance": [
    { "id": "AC-01", "owner": "S01", "verification": ["V-01"] },
    { "id": "AC-02", "owner": "S02", "verification": ["V-02"] }
  ]
}
```

Use `target.kind: "existing-issue"` with an exact same-repository GitHub issue URL when updating a user-designated parent. Slice IDs use `SNN`; acceptance IDs use `AC-NN`; verification IDs use `V-NN`. Blockers must name declared slice IDs and form an acyclic graph. Each parent acceptance criterion has exactly one owner and one or more verification IDs owned by that slice.

Before review, generate the two bundle tables from the manifest:

Resolve the [receipt tool](../scripts/review-receipt.mjs) from this document's canonical location and set `review_receipt_script` to its absolute path before running these commands.

```bash
node "$review_receipt_script" render \
  --bundle-dir <absolute-bundle-directory>
```

The renderer replaces only the bracketed ownership and dependency-table regions. Run receipt `create` only after rendering and review. A receipt reports `deterministically-valid`: it proves the schema, identity, graph, mapping, generated regions, and hashes; it does not report review quality or publication authority.

For standalone candidates, use `kind: "standalone-ticket"`, top-level `verification`, and `candidate` with exact `title` plus `bodySha256`. An existing issue target additionally requires `target.digest`, its current live-issue digest. `candidate.md` contains the exact title between `BEGIN CANDIDATE TITLE` markers and the exact issue body between `BEGIN ISSUE BODY` markers.

Before semantic review, validate the artifact without creating a receipt or changing any file:

```bash
node "$review_receipt_script" check \
  --bundle-dir <absolute-bundle-directory> \
  --repo-root <absolute-repository-root> \
  --github-repo <owner/repository> \
  --base-ref <reviewed-base-ref>
```

For a standalone candidate, replace `--bundle-dir` with `--candidate-dir <absolute-candidate-directory>`. `check` applies the existing mode's schema/body and repository/base validation, including bundle acceptance-ID, graph, and generated-table agreement. It does not verify a prior receipt or assess source correctness, security, acceptance coverage, or publication authority. Correct failures before independent review; create and verify a receipt only after the clean independent verdict.
