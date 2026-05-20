---
name: implementation-plan-review
description: Use when Codex needs to review, repair, or readiness-check an implementation plan before execution, especially when asked if a plan is ready, to use subagents for plan review, or to make a plan ready for Superpowers-driven implementation.
metadata:
  skill_library:
    tier: owned
    profile_activatable: true
---

# Implementation Plan Review

## Core Principle

Treat the plan as unproven until it survives source-backed, repo-guidance-backed review. A plan is ready only when an implementation agent can execute it task-by-task without inventing missing files, contracts, behavior, tests, security boundaries, or product decisions.

## Ground Rules

- Read `AGENTS.md` first and treat it as authoritative.
- Use the repo's current docs, plan index, state handoff, and source code over stale notes.
- Use relevant Superpowers skills; this skill adds the plan-readiness standard, not a replacement for Superpowers.
- Preserve existing user changes. Do not revert unrelated dirty work.
- Keep the review local. Do not upload private files, extracted text, credentials, client evidence, or source data to external services.

## Start Here

1. Identify the target plan file or plan family. If it is not clear from the request or repo docs, ask for the exact file.
2. Read `AGENTS.md` and any referenced repo guidance.
3. Read the current docs/plans index and current-state or handoff docs when present.
4. Read the target plan file(s).
5. Build a source-backed map of the real repo before editing the plan: planned files, existing symbols, commands, package exports, schemas, tests, fixtures, runtime paths, and verification commands.

## Codex Subagent Pattern

When the user explicitly requests subagents and Codex subagents are available, use read-only `explorer` subagents for independent review lanes. Keep the main Codex thread as the coordinator and only editor.

Use self-contained subagent prompts. Do not rely on inherited context. Give each subagent:

- repo path
- plan file(s)
- relevant AGENTS/docs/source paths to inspect
- one review lane
- "read-only review; do not edit files"
- required output: blocker-only findings with evidence, impact, and recommended plan patch

If subagents are not available or not permitted in the current session, run the same lanes yourself and say so in the final response.

## Review Lanes

For non-trivial plans, cover these lanes:

- Repo Guidance And Security: `AGENTS.md` compliance, credentials, private data, external services, environment handling, committed vs ignored artifacts, logs, stdout, and durable docs.
- Mechanical Source Verification: planned files, symbols, commands, imports, package exports, schemas, types, tests, fixtures, and verification commands.
- Task Order And Ownership: each command/type/module/file is introduced once, dependencies are ordered correctly, and later tasks do not re-introduce or depend on missing work.
- Behavior And Parity: defaults, existing behavior, migrations, compatibility, and acceptance criteria match current code unless the plan explicitly changes them.
- Docs And Handoff: docs indexes, current-state docs, sibling/parent plans, stale terms, placeholders, and downstream handoffs stay synchronized.

## Readiness Standard

A plan is implementation-ready only if each task identifies:

- files to create vs modify
- existing files and symbols to inspect
- exact types, schemas, constants, query shapes, package exports, commands, and runtime inputs
- exact tests, fixtures, expected outputs, and verification commands
- exact task order and ownership
- exact handoffs to sibling, parent, or downstream plans
- exact security boundaries for committed files, ignored artifacts, stdout, logs, credentials, and external services

Block readiness when the plan leaves implementers to infer behavior with phrases like `similar to`, `high-signal`, `if needed`, `appropriate error handling`, `write tests for the above`, `left to the implementer`, `TBD`, `TODO`, or equivalent vague language.

## Review Loop

1. Run the first source-backed review.
2. Dispatch or perform the review lanes.
3. Merge findings and patch all resolvable plan issues in place.
4. Re-run targeted review for changed areas.
5. Repeat patch and re-review until mechanical, repo-guidance, security, testing, handoff, and execution-readiness findings are gone.
6. Run one final blocker-only review whose job is to disprove readiness.
7. Do not say `ready` until the final blocker-only review is clean.

## Product Decisions

Do not guess product decisions. Keep reviewing everything else first unless the ambiguity prevents further review.

After the review loop, present each required product decision once with:

- question
- why it blocks implementation readiness
- recommended answer
- tradeoff
- plan section to update after the decision

## Verification

Before claiming the plan is ready:

- run the repo-required docs/plan verification from `AGENTS.md`
- run a placeholder/vagueness scan across changed plan files
- run `git diff --check` for docs-only edits when no stronger repo check applies
- run code tests only when the plan change affects generated docs, executable examples, checked links, or code

## Final Response

Lead with a direct verdict:

- `ready`
- `not ready: product decisions remain`
- `not ready: blockers remain`

Then report:

- files changed
- highest-risk issues fixed
- review lanes used and final status
- verification and scans run
- remaining product decisions with recommendations, or `none`
- whether the plan is ready for `superpowers:subagent-driven-development`
