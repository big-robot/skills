# Prepublication artifact contract

Read for planning, prepublication review, or artifact classification. Publication execution and recovery are conditional work owned by the applicable lifecycle workflow.

## Authority and classes

Before publication, one task-specific OS-temporary plan or Delivery Bundle is the sole working authority. An existing issue body remains the canonical request until its approved replacement is published and verified. After publication, human-authored SDLC authority lives in the configured GitHub issue body or native issue graph; never retain a competing canonical local plan.

| Class | Contents and destination |
| --- | --- |
| Tracker authority | Canonical implementation tickets, parent specifications, settled scope, stories, implementation/testing decisions, exclusions, acceptance criteria, native parent/blocker relationships, and workflow labels such as `type:parent`, `ready-for-dev`, and `ready-for-agent`. |
| Durable system knowledge | Repository-guided domain context rooted at `CONTEXT-MAP.md` or its configured equivalent, qualifying ADRs, policies, and runbooks. |
| Machine-only state | PR-loop ledgers, local audits, generated watcher prompts, and transient coordination facts in git-ignored per-repository `sdlc-scratch/`. |
| Temporary transport | Candidate/bundle bodies, scope locks, source notes, review packets, schema-bound manifests, receipts, and partial-publication recovery state in the task's OS-temporary directory. |
| Retained diagnostic evidence | Sanitized usage summaries and incidental observation handoffs in task-owned retained output outside cleanup targets. These are noncanonical evidence, never issue bodies, reviewed plans, implementation tickets, or acceptance/scope authority. CDL's terminal-handoffs contract owns retention mechanics. |

Comments are discussion or evidence, not canonical scope. Approved comment content changes scope only after incorporation into the issue body. Search existing tracker issues and repository docs within authorized access before writing; update the canonical destination rather than create a near-duplicate. Prefer a short durable decision over a debate log.

## Placement and privacy

- Keep plans, scope locks, review packets, source notes, issue drafts, and ordinary temporary handoffs out of `.sdlc-scratch/`, `sdlc-scratch/`, worktrees, and repository docs. The retained diagnostic evidence class above is the narrow exception to temporary storage, not permission to retain publication drafts as competing authority. Keep only machine state in `sdlc-scratch/`; git-ignore the whole directory or at least `ledgers/` and `audits/` when repository policy is narrower.
- Follow repository guidance for separately authorized durable documentation. Keep domain context implementation-free and do not duplicate tracker specifications, execution tickets, or issue graphs in it.
- Keep credentials, secrets, private client evidence, raw production payloads, and sensitive identifiers out of published material unless that exact destination is explicitly approved for them. Apply any stricter planning/review fixture and identifier rules.
- Planning and review grant no external mutation authority. A clean source verdict and deterministic receipt do not authorize publication, launch, deployment, or production writes. The selected mode still requires exact repository/base/target, acceptance ownership, and applicable manifest/receipt checks.

## Retention and cleanup

Record the task's exact temporary files. Retain the directory while review/publication is deferred or partial recovery remains. Delete it only after the owning publication workflow verifies complete canonical bodies, titles, labels, identity, and applicable native relationships. Never copy drafts into a worktree or retain them as competing authority after verified publication.

Delete only this task's exact machine files during loop cleanup; never sweep unrelated state. Do not delete user-created files without explicit authorization; list proposed deletions with reasons. Report retained/deleted artifacts and verified canonical destinations under the selected mode. Publication execution, partial-publication recovery, activation, and immediate live-state checks remain in their owning workflows and are loaded when continuation requires them.
