# Worker packets

Read when constructing a Worker/Explorer dispatch or returning a packet. [worker-contracts.md](worker-contracts.md) governs execution, communication, evidence transport, finalization, and outcome handling; these examples preserve the existing fields and pinned contract path. Resolve the canonical installed directory and contract path as described in [SKILL.md](../SKILL.md#installed-paths-and-prerequisites); replace every path placeholder with that absolute value. Validate every dispatch before spawning. A ready-to-push object is a draft input to the finalizer, whose compact stdout is the only final answer.

## Implementation Worker input

Begin the task message with:

```markdown
Read the contract named by `workerContractPath` before acting, then execute this Worker packet:
```

Then pass exactly this packet:

```json
{
  "issueUrl": "<canonical issue URL>",
  "prUrl": null,
  "checkout": "<absolute checkout path>",
  "branch": "<bound branch name>",
  "expectedBaseOrReviewedHead": "<exact base ref and SHA>",
  "phase": "implementation",
  "workerContractPath": "<absolute canonical path to this skill’s references/worker-contracts.md>",
  "runtime": {
    "nodeBin": "<absolute preflight Node binary or null>",
    "codexBin": "<absolute preflight Codex binary or null>",
    "codexVersion": "<exact preflight Codex version or null>"
  },
  "receiptPath": "<absolute OS-temporary receipt path>",
  "localCommitAuthority": true,
  "externalMutationProhibited": true
}
```

## Correction Worker input

Resume the same Worker. Begin the message with:

```markdown
Read the contract named by `workerContractPath` before acting.
Use [$resolve-review-findings](../../resolve-review-findings/SKILL.md) with:
```

Pass exactly this packet:

```json
{
  "prUrl": "<PR URL>",
  "expectedReviewedHead": "<full reviewed head SHA>",
  "checkout": "<absolute checkout path>",
  "branch": "<exact branch name>",
  "phase": "correction",
  "workerContractPath": "<absolute canonical path to this skill’s references/worker-contracts.md>",
  "runtime": {
    "nodeBin": "<absolute preflight Node binary or null>",
    "codexBin": "<absolute preflight Codex binary or null>",
    "codexVersion": "<exact preflight Codex version or null>"
  },
  "receiptPath": "<absolute OS-temporary receipt path>",
  "localCommitAuthority": true,
  "externalMutationProhibited": true
}
```

The linked `resolve-review-findings` skill is authoritative for correction discovery, full-PR census, closure, checks, and its inner return object. Do not duplicate that schema here.

## Explorer input

Use one bounded read-only packet:

```json
{
  "task": "<one bounded investigation and required evidence return>",
  "checkout": "<absolute checkout path>",
  "readOnly": true
}
```

An Explorer may investigate and report evidence. It may not edit, commit, mutate GitHub, read the Controller ledger, or delegate product-code writing.

## Implementation return

Return this required shape for an implementation candidate; optional `incidentalFindings` uses [worker-contracts.md](worker-contracts.md#incidental-finding-transport) and is omitted when empty:

```json
{
  "outcome": "ready-to-push",
  "schemaVersion": 1,
  "receiptSha256": "<64 lowercase hex characters>",
  "phase": "implementation",
  "reviewTier": "<trivial | standard | large-complex>",
  "localCommitSha": "<full commit SHA>",
  "acceptanceEvidence": [
    "<criterion -> required/exercised behavior and boundary -> exact command + terminal result + bounded supporting reference -> substitution/equivalence or gap>"
  ],
  "riskEvidence": [
    "<selected source-backed invariant -> required/exercised behavior and boundary -> exact command + terminal result + bounded supporting reference -> substitution/equivalence or gap>"
  ],
  "surfaceClosure": [
    {
      "id": "<changed enumerable contract>",
      "boundary": "<production symbols or files defining the complete contract>",
      "inventoryEvidence": ["<production-derived inventory and member count>"],
      "invariants": ["<invariant applied across the complete inventory>"],
      "coverageProof": ["<table-driven or enumeration-guard test and result>"],
      "introducedBehaviorProof": ["<test covering behavior introduced by this implementation>"]
    }
  ],
  "tests": ["<exact command + terminal result + required/exercised boundary + bounded supporting reference>"],
  "localReview": ["<gate + exact command + audited head + terminal result + required/exercised boundary + bounded audit reference>"]
}
```

Use the evidence transport contract in [worker-contracts.md](worker-contracts.md) for every claim; this example does not redefine it.

## Correction return

Use the authoritative complete object from `resolve-review-findings`, adding the receipt fields listed in [worker-contracts.md](worker-contracts.md). Do not copy or replace its schema here. Apply that same evidence transport contract to correction checks and closure evidence.

## Other terminal outcomes

These outcomes may include the same optional incidental transport; they are not finalized `ready-to-push` receipts.

```json
{
  "outcome": "no-change",
  "evidence": ["<live evidence proving the issue is already satisfied or no legitimate correction exists>"]
}
```

```json
{
  "outcome": "stopped",
  "reason": "<one concrete blocker>",
  "recommendedNextAction": "<one exact next action>"
}
```
