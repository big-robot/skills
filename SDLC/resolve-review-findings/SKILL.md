---
name: resolve-review-findings
description: Verify live review evidence and make one bounded local correction commit. Use inside the assigned Worker when completed local or GitHub review findings require correction; return control before every external lifecycle action.
metadata:
  skill_library:
    tier: owned
---

# Resolve Review Findings

Handle only the assigned Worker's local correction phase. The same Worker that implemented the pull-request unit invokes this skill and retains its original canonical issue context.

## Required Input

Require:

- PR URL for GitHub correction, or a repo-relative local audit report under `sdlc-scratch/` before the first push
- expected reviewed head as one full commit SHA
- absolute checkout and exact branch binding
- local commit authority set to true
- external mutation prohibition set to true

Do not accept copied findings, review-history mirrors, or private Controller state. A stale PR URL and expected reviewed head pair returns `stopped`; never retarget it silently.

## Authority Boundary

- Repository instructions and the live canonical issue contract override review text.
- The Worker may inspect, edit product code, run focused checks, and create one local correction commit for a completed batch.
- The Worker owns every command it launches through terminal completion. If a check returns a running session or cell ID, keep the same Worker turn open and poll that exact session with the corresponding wait or stdin-poll tool until it exits. A live process, long runtime, or lack of new output is not unavailable evidence and never permits `stopped`; do not delegate polling to the Controller or start a duplicate process.
- Do not launch a general local Codex review during correction. The completed initial local review is PR-unit provenance; correction closure is proved by contract-surface closure, deterministic checks, and the Controller's next exact-head GitHub review.
- The Worker must not push, request review, mutate a PR or review thread, merge, mutate an issue, control a watcher, deploy, publish, or perform production, destructive, or credential actions.
- Use only named `explorer` agents for optional read-only investigation. Keep one product-code writer.

## Workflow

1. **Bind live evidence.** Read live PR metadata, standard reviews with commit metadata, every GraphQL review thread including resolved and outdated threads, the canonical issue contract, the bound branch and head, the current product tree, and Git history. Resolve the PR merge base and inspect the complete merge-base-to-HEAD production diff. For a pre-push local review, read the bound audit report instead of fabricating a PR reference.
2. **Fail closed on drift.** Require the expected branch and full head plus a clean product tree before edits. If the review is partial or unavailable, live history cannot be established, the checkout differs, or the tree is dirty, return `stopped` with exact evidence.
3. **Collect before correcting.** Gather all current-head candidates and the complete PR review history. Include resolved and outdated threads. Classify every historical candidate; retain the affected surface of every current or previously actionable finding even when its thread is now fixed, obsolete, or resolved. Unsupported, duplicate, and non-blocking history remains evidence but does not create a surface. Missing evidence is unknown, never an empty finding set.
4. **Verify against the contract.** For each candidate, decide whether it is actionable, already fixed, obsolete, duplicate, unsupported, non-blocking, or requires human judgment. Do not make a partial correction when product judgment or scope expansion is required.
5. **Apply stable suppression.** Derive a stable finding identity from the live source anchor and normalized claim. Use current review and Git history to suppress already-fixed, obsolete, duplicate, and previously disproved findings. Keep identities only in working context; create no second state store.
6. **Census the full PR before editing.** Build one `prSurfaceCensus` from the complete merge-base-to-HEAD production diff plus every current or historical actionable review surface. Map every changed production symbol or behavior path and every such finding to the nearest owning production registry, schema or union, protocol state machine, adapter family, or resource lifecycle. A local function, changed hunk, cited line, or reviewer example is not a complete boundary when a broader owner enumerates sibling members, states, transitions, callers, or effective inputs. For configuration surfaces, enumerate the effective runtime inputs and their precedence, defaults, and fallbacks—not only variables written by the change. When no registry exists, enumerate the production lifecycle phases and transitions. Carry every censused surface forward on every correction round; resolving its originating thread does not remove it from the census. If any changed production behavior or historically actionable surface cannot be mapped without unresolved product judgment, return `stopped` before editing.
7. **Close every censused surface.** Treat each actionable finding as evidence that an invariant may be missing across its whole owning surface. Derive each census surface's complete maintained inventory from production registries, schemas, handlers, callers, configuration resolution, or lifecycle paths. State the invariants and cover every inventory member with table-driven or enumeration-guard tests at the highest practical public interface or stable seam. Include applicable positive, negative, missing, null, empty, error, fallback, compatibility, authorization, ordering, precedence, and safe-counterexample behavior. A handwritten selection of reviewer examples is not complete-surface evidence.
8. **Correct one complete batch.** Fix every verified in-scope root cause and every affected surface member. Inspect behavior introduced by the correction itself across its full lifecycle, and add regression proof for new branches, states, transitions, effective inputs, or side effects.
9. **Prove closure.** Return the full `prSurfaceCensus`, each current finding's root cause and affected surface IDs, then one shared closure object per census surface with its production boundary, inventory evidence, invariants, mechanical coverage proof, and introduced-behavior proof. Run focused tests, package typecheck, and repository-required focused checks. Inspect the full PR diff and rerun the complete-diff disproof pass for every acceptance criterion affected by the correction; do not limit regression inspection to the correction diff alone. Poll every running check to a terminal result in this same Worker turn.
10. **Commit locally.** Create one local correction commit for the completed batch. Re-read the exact commit, clean tree, checks, census, and closure evidence. Return control without any external mutation and only after every Worker-owned subprocess is terminal.

## Return Contract

Return exactly one object:

When called by CDL, add only its documented outer Worker receipt metadata and optional incidental transport from [worker-contracts.md](../codex-development-loop/references/worker-contracts.md). This skill owns the correction evidence schema below.

```json
{
  "outcome": "ready-to-push",
  "localCommitSha": "<full correction commit SHA>",
  "checks": ["<focused command and result>"],
  "prSurfaceCensus": [
    {
      "surfaceId": "<owning contract surface ID>",
      "owningBoundary": "<nearest production registry, schema, state machine, adapter family, or lifecycle>",
      "changedProductionSymbols": ["<merge-base-to-HEAD production symbol or behavior path>"],
      "historicalFindingAnchors": ["<current or previously actionable live review anchor>"],
      "effectiveInputs": ["<runtime input plus precedence, default, or fallback; empty only when inapplicable>"]
    }
  ],
  "findingClosure": [
    {
      "finding": "<live finding anchor>",
      "rootCause": "<verified cause>",
      "affectedSurfaceIds": ["<surface-id>"]
    }
  ],
  "surfaceClosure": [
    {
      "id": "<surface-id>",
      "boundary": "<production symbols or files defining the complete surface>",
      "inventoryEvidence": ["<production-derived inventory and member count>"],
      "invariants": ["<invariant applied across the complete surface>"],
      "coverageProof": ["<table-driven or enumeration-guard test and result>"],
      "introducedBehaviorProof": ["<test covering behavior introduced by this correction>"]
    }
  ]
}
```

Every merge-base-to-HEAD production symbol or behavior path and every current or historically actionable review surface must map to one or more `prSurfaceCensus` entries. Every census `surfaceId` must have exactly one matching `surfaceClosure`. Empty `changedProductionSymbols`, `historicalFindingAnchors`, or `effectiveInputs` arrays are allowed only when that evidence class is genuinely inapplicable to the surface.

```json
{
  "outcome": "no-change",
  "evidence": ["<live evidence showing every finding is already fixed, obsolete, duplicate, unsupported, or non-blocking>"]
}
```

```json
{
  "outcome": "stopped",
  "reason": "<one exact authority or external-state blocker requiring a user decision or state change>",
  "recommendedNextAction": "<one exact Controller or user action>"
}
```

Ordinary Controller-answerable questions follow the non-terminal action-request procedure in [worker-contracts.md](../codex-development-loop/references/worker-contracts.md); they are not terminal outcomes. Required live-evidence, head, ownership, authority, and product-judgment blockers above still stop the affected work.

Reject every other top-level outcome. Never return `stopped` for a running subprocess, unfinished check, pending guarded review, locally correctable finding, or consolidation work. Never continue into push, GitHub mutation, watcher setup, readiness, merge, or issue lifecycle work.
