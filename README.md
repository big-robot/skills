# Big Robot Skills

Big Robot helps software companies scale product development through stronger processes and modern AI tooling. The firm combines product management consulting with hands-on engineering to improve customer discovery, prioritization, specifications, and learning from releases while helping teams adopt AI agents in everyday development. Through process design and coaching, Big Robot helps leaders, product managers, and engineers give those agents clear context, define human decision points, and evaluate results against customer needs and business goals.

**If you think you should copy these skill verbatim, you should not be using them at all.**

## Skills

| Skill                                                       | What it helps with                                                                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [generate-diagram-from-code](./generate-diagram-from-code/) | Create SVG diagrams from code paths, logs, workflows, and technical investigations.                                                     |
| [grill-me](./grill-me/)                                     | Based on Matt Pocock's grill-me and grill-with-docs skills. Resolve scope, decisions, and tradeoffs without assuming a coding workflow. |

## SDLC skills

These skills connect source-backed planning, independent review, approved GitHub publication, and guarded implementation. Use the smallest workflow that fits the change. Trivial advisory work can end with an inline answer; formal plans use a temporary standalone ticket candidate or a Delivery Bundle.

| Skill                                                              | Responsibility                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [implementation-planning](./SDLC/implementation-planning/)         | Inspect current source, settle required decisions, and define acceptance criteria, implementation units, dependencies, and verification. Produce a standalone candidate or Delivery Bundle without changing GitHub.                                   |
| [implementation-plan-review](./SDLC/implementation-plan-review/)   | Independently check and repair the candidate against source, behavior, test boundaries, security, and ownership. Create and verify a hash-bound receipt only after a clean formal review.                                                             |
| [publish-reviewed-tickets](./SDLC/publish-reviewed-tickets/)       | After exact approval, publish a reviewed Delivery Bundle as a parent issue and native sub-issues with blocker relationships. Verify the inactive graph before activating it. This skill does not publish standalone tickets or launch implementation. |
| [codex-development-loop](./SDLC/codex-development-loop/)           | Optional Codex delivery integration: implement approved GitHub tickets through dedicated worktrees, assigned Workers, local and GitHub review, verified PRs, and explicit terminal merge approval.                                                    |
| [sdlc-artifact-lifecycle](./SDLC/sdlc-artifact-lifecycle/)         | Define canonical issue authority, temporary planning artifacts, durable documentation, machine state, recovery, and cleanup boundaries.                                                                                                               |
| [adversarial-evidence-packet](./SDLC/adversarial-evidence-packet/) | Supply evidence packets, confidence anchors, provenance checks, and final disproof for reviews that require them.                                                                                                                                     |
| [resolve-review-findings](./SDLC/resolve-review-findings/)         | Let the assigned delivery Worker verify findings and complete a bounded local correction commit, then return control before external lifecycle actions.                                                                                               |

[shared/](./SDLC/shared/) contains the stakes-tier and test-quality contracts used across these skills. It is supporting material, not a separately invocable skill.

### Workflow

1. **Plan.** Invoke `implementation-planning` with the requested outcome and target repository. It inspects repository guidance and source before drafting tasks. Open product or authority decisions must be settled before affected behavior is planned.
2. **Review.** Invoke `implementation-plan-review` with the exact temporary candidate or bundle. An independent reviewer checks source and proof; the editor repairs resolvable findings. A deterministic receipt binds the reviewed files and repository/base identity, but does not itself prove review quality or grant publication authority.
3. **Publish with approval.** For one standalone ticket, review's single-ticket continuation creates or updates the declared issue after exact approval and live-state verification. For multiple increments, `publish-reviewed-tickets` publishes the approved Delivery Bundle and verifies its complete native graph.
4. **Implement with launch authority.** Optionally invoke `codex-development-loop` with the canonical standalone or parent issue URL. It performs read-only launch preflight and requests only launch authority not already covered by an exact earlier approval. The Controller coordinates lifecycle actions; the assigned Worker owns product edits and local corrections.
5. **Merge and clean up.** Delivery requires current checks, review, acceptance evidence, and resolved threads. Parent-mode child merges can be covered by exact launch authority; the terminal standalone or parent integration merge requires explicit approval. Cleanup follows the approved, task-specific selection.

Planning and review alone authorize no GitHub writes. Publication, implementation launch, terminal merge, deployment, and production or destructive actions retain their applicable authority boundaries.

### Repository conventions

The formal workflow currently targets GitHub, including native sub-issue and blocking relationships. It uses these existing labels:

| Issue role                                      | Labels                                        |
| ----------------------------------------------- | --------------------------------------------- |
| Standalone implementation ticket or child issue | `ready-for-agent`                             |
| Parent issue after complete graph verification  | `type:parent`, `ready-for-dev`                |
| Active implementation ownership                 | `in-progress`, according to the delivery mode |

Missing required labels block the applicable workflow; these skills do not create labels automatically. Repository `AGENTS.md` and configured tracker guidance remain authoritative. Repository and base identity are discovered and verified at runtime; no personal checkout path is required.

Candidates, bundles, scope locks, source notes, manifests, and review packets belong in a task-specific OS temporary directory. Canonical published requirements belong in GitHub issue bodies and native relationships. `sdlc-scratch/` is reserved for git-ignored machine state such as delivery ledgers and audits. Sensitive source data and credentials must stay out of published artifacts.

### Installation and dependencies

Keep the sibling directory layout inside `SDLC/` intact. Copying or installing only an individual SDLC skill folder omits required shared contracts and companion skills. Relative references resolve from each document's canonical location, following installation symlinks, rather than from the repository being implemented or the shell's working directory.

For planning and review, retain these directories inside `SDLC/`:

- `implementation-planning/` and `implementation-plan-review/`
- `publish-reviewed-tickets/`, which also provides the manifest contract and receipt tool
- `shared/`, `sdlc-artifact-lifecycle/`, and `adversarial-evidence-packet/`
- `grill-me/` for decision clarification when required by the selected stakes tier

For the optional delivery loop, also retain `codex-development-loop/` and `resolve-review-findings/`.

Invoke the chosen skill through its `SKILL.md`, or register it with your agent's skill-discovery mechanism while retaining these dependencies. A reference to a companion skill does not grant permission to execute its external actions.

The receipt tooling uses Node.js and Git. GitHub inspection and publication need authorized GitHub access; the delivery scripts use the `gh` CLI. `codex-development-loop` additionally requires a compatible Codex CLI and host support for its Worker/Explorer roles, worktrees, and continuation mechanisms. Its preflight pins and verifies the actual runtime. It is a Codex integration, not an agent-independent executor. Diagnostic usage collection is nonblocking.

### Local verification

From this checkout, run:

```sh
node --test SDLC/publish-reviewed-tickets/tests/*.test.mjs SDLC/codex-development-loop/tests/*.test.mjs
```

These tests exercise the receipt CLI and delivery portability using temporary repositories and synthetic fixtures. They do not publish issues or run a live delivery task. Passing them verifies those tool contracts; it does not establish a plan's readiness or authorize external actions.
