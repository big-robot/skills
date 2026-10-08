# Trivial planning

Use this tier only for a mechanical, low-risk, unambiguous change with no unresolved behavior.

## Required conditions

All conditions must hold:

- one narrow code-only, configuration-only, documentation-only, or copy-only change
- no production or real customer data
- no security, privacy, credentials, billing, finance, legal, compliance, or destructive behavior
- no source-of-record or operator-authority decision
- no new dependency, architecture change, migration, or cross-module contract change
- no ambiguous acceptance criterion or competing implementation path
- no formal GitHub ticket or `codex-development-loop` handoff requested

If any condition fails, escalate to `standard` before planning further and read only `standard.md`.

## Fast path

1. Inspect repository guidance and the exact affected file, symbol, caller, and existing test or check.
2. Confirm the request fully settles behavior and scope.
3. State the smallest change, the exact file, and the verification command.
4. Identify one public interface or stable seam when behavior changes.
5. Record `No test: <reason>` only when the change cannot regress executable behavior.
6. Return a compact source-backed implementation outline in the current task.

Do not create a Delivery Bundle, OS-temporary plan, review packet, or GitHub issue. Do not invoke `grill-me` or `implementation-plan-review`.

If source inspection reveals wider impact, an open decision, or a need for a durable implementation ticket, stop the fast path and escalate to `standard`.
