# Verification receipt contract

Read before creating or accepting a ready-to-push Worker receipt. Both implementation and correction use schemaVersion 2. Version 1 is rejected; obtain a fresh Worker packet and receipt rather than upgrading old evidence in the Controller. Keep the existing 64 KiB size limit, clean exact-commit bindings, and hash finalization.

## Typed execution evidence

Every entry in implementation `acceptanceEvidence`, `riskEvidence`, `tests`, and `localReview`, and correction `checks`, has this shape:

```json
{
  "claim": "AC-01: rejected input causes no write",
  "command": "node --test tests/rejection.test.mjs",
  "result": { "status": "passed", "exitCode": 0 },
  "requiredBoundary": "public request through persistence boundary",
  "exercisedBoundary": "public request through an isolated persistence adapter",
  "references": [{ "path": "sdlc-scratch/evidence/rejection.txt", "startLine": 1, "endLine": 8 }]
}
```

`claim`, boundaries, and executed `command` are nonblank text limited to 4,096 UTF-8 bytes each. Each required array is limited to 256 entries. `result.status` is `passed`, `failed`, or `not-run`. Passed results require exitCode 0; failed results require an integer exitCode from 1 through 255. A not-run result requires null exitCode and a nonblank reason; command may be null. Document manual/static checks through their actual command and retained result, without claiming a test was executed.

Each evidence entry has 1 to 16 references. Paths are checkout-relative, at most 1,024 UTF-8 bytes, without traversal. References must resolve within the checkout to nonempty regular non-symlink files no larger than 1 MiB. Optional positive line numbers must resolve and be ordered. References cannot use shell expressions, URLs, or absolute paths. Validators do not execute content. Retain sanitized output or authorized contract excerpts under ignored checkout-local evidence paths.

Guarded Codex audit references have one bounded exception: a regular file directly under the real `sdlc-scratch/audits/` directory may exceed 1 MiB up to 128 MiB plus 64 KiB. This shared serialization limit covers two captured streams of at most 64 MiB each plus receipt metadata. Both boundaries verify the completed wrapper transcript and hash, pinned Codex binary/version, guarded command, audited commit tree, and ancestry to the candidate. The Controller also matches the reference path, audited head, brief hash, and exit result to its authoritative `localAudit`. Arbitrary large logs, relocated copies, invalid audits, and references beyond this bound are rejected. Ordinary references retain the 1 MiB limit.

A syntactically valid failed/not-run result is honest transport, not permission to ignore a required check. Controller semantic acceptance still checks outstanding gaps, exercised boundaries, oracle authority, and actual terminal output. Never report an assertion or self-authored excerpt as independent authority.

## Verification change dispositions

The receipt includes `verificationBaseSha` and `verificationChanges` in both phases. Each changed verification path has one entry:

```json
{
  "path": "tests/rejection.test.mjs",
  "status": "M",
  "disposition": "replaced",
  "reason": "Approved AC-01 changes rejection status and preserves the no-write assertion.",
  "contractRefs": [{ "path": "sdlc-scratch/evidence/approved-contract.md", "startLine": 3 }],
  "proof": [{
    "claim": "The updated rejection contract still forbids writes",
    "command": "node --test tests/rejection.test.mjs",
    "result": { "status": "passed", "exitCode": 0 },
    "requiredBoundary": "request through persistence",
    "exercisedBoundary": "request through isolated persistence adapter",
    "references": [{ "path": "sdlc-scratch/evidence/rejection.txt" }]
  }]
}
```

`status` is Git A, M, D, or T. Disposition is added, retained, replaced, or removed. Added files use added; deleted files use removed or replaced. `reason` states the contract-backed justification and preserved or replacement protection. A proof array has 1 to 16 typed evidence entries, including at least one passing check. Deleted tests can reference a passing replacement or proportionate static verification of an approved removal. `contractRefs` uses the same reference contract. There are at most 256 unique dispositions.

The finalizer computes the merge base from the Controller-approved packet base and candidate HEAD. The Controller independently computes it from its protected target ref and HEAD. `verificationBaseSha` must equal the independently derived full SHA at both boundaries. Both phases require packet `expectedBaseOrReviewedHead` in the exact form `<ref> <40-character lowercase SHA>`. Correction keeps `expectedReviewedHead` separately for review provenance.

The full Git diff uses no rename detection. Renames therefore require deletion and addition dispositions. Every automatically detected verification file must be present exactly once with matching status. Additional declared verification paths are allowed only if they occur in the same diff. Inspect the complete changed-file list for custom test paths or indirect verification scripts and add dispositions before acceptance. Any declared verification change requires at least standard local review; the Controller verifies this independently.

The conventional detector covers test/spec directories and filenames, fixtures/snapshots, common runner/config files, package manifests and locks, CI directories, hooks, and build/test command files. It is conservative and can include files whose verification effect is small. Record that reason and proportionate proof. It cannot discover every custom naming convention or determine semantic weakening.

Conventional hooks include root and nested `conftest.py`. Coverage configuration includes `.coveragerc`, `.simplecov` variants, `coverage.*`, `c8.*`, the existing nyc/c8 rc files, and Codecov/Coveralls YAML files. These can change collection, fixtures, or exclusions even when no assertion-bearing test file changes.

## Existing structured closure fields

`surfaceClosure`, `prSurfaceCensus`, and `findingClosure` retain the structured production-surface fields owned by [resolve-review-findings](../../resolve-review-findings/SKILL.md). They are not generic execution-evidence entries. Closure identifiers must match census identifiers and findings must name existing affected surfaces. Their factual string arrays stay distinct from typed command execution evidence.

The runtime rejects malformed fields and inconsistent identifiers. The Controller still traces actual production inventories and required behavior to assertions. Hashes, fields, and resolvable references do not establish complete behavioral proof.
