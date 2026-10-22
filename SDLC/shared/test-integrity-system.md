# Test integrity in the SDLC skills

The skills connect requirements, implementation, tests and review. Passing tests are evidence to assess, not proof that expectations or coverage are correct.

## Roles

Planning defines source-backed acceptance criteria and verification boundaries. Plan review checks them independently. Publication and launch use the existing authorization rules.

One Worker owns product edits, tests, local verification and corrections for a PR unit. The Controller owns lifecycle state and independently compares the full diff and returned evidence with the approved contract. Local review and exact-head GitHub review provide additional scrutiny. Existing risk tiers and review procedures still apply.

## Review instructions

Copy the [Code Review Rules template](templates/agents-code-review-rules.md) into a product repository's root AGENTS.md. Add product-specific rules there or in applicable nested AGENTS.md files.

Before launch, the delivery instructions tell the Controller to read root AGENTS.md and check that the required guidance is present. If missing, report the path, missing guidance and template, and stop launch without editing the product repository. This is an instruction-level check. The preflight script does not parse or enforce these rules.

[OpenAI documents](https://learn.chatgpt.com/docs/third-party/github#customize-what-codex-reviews) Code Review Rules in root and nested AGENTS.md files and one-off review guidance in PR comments. Rules guide the reviewer and do not replace tests or branch protections. Linked issue or PR bodies are not a verified way to deliver review instructions. The existing request helper sends its standard request and tracking marker; richer custom requests remain deferred.

## Test changes and evidence

Planning, plan review, delivery and correction load the shared [test-quality guidance](test-quality.md). Each test should protect behavior through a public interface or stable seam. Establish expected results from an acceptance criterion, authoritative contract or independently worked example. Name a plausible wrong result the assertion rejects and the protection added beyond existing tests. Copying implementation output or a mock's configured return is insufficient justification.

Never weaken verification solely to obtain a passing result. Inspect changed assertions and expectations, removed or renamed tests, fixtures, snapshots, skips, focused tests, discovery patterns, exclusions, runner configuration and CI. Approved contract updates may legitimately change tests and source together when the reason and retained or replacement proof are clear. Domain-required observable behavior is legitimate; production branches that recognize test values without a domain contract are suspect.

Account for each modified, deleted or renamed existing test, its authoritative reason and retained or replacement proof, including related fixture, snapshot and configuration changes. Keep this accounting inline when it fits or in existing referenced verification evidence. Existing receipt evidence strings may summarize and give a resolvable local reference to the complete verification record through the existing bounded supporting-evidence transport. The Controller reads the full accounting and checks it against the diff; do not omit or truncate proof to fit the receipt. Receipt fields, schema and size limit are unchanged; there is no new automatic census or reference verifier.

When intended behavior is unresolved, report:

```text
TEST CONFLICT: <file>:<line> <reason>
```

Stop the affected expectation, assertion or exclusion change and use the existing decision route. Continue independent safe work where authorized. An implementation defect that can be corrected under the settled contract stays with the Worker; an already approved contract update needs no new approval merely because tests change.

For changed behavior, obtain a meaningful failure against prior behavior when practical, then a passing result. Import, setup or syntax failure is not behavioral RED. Preserved behavior uses before-and-after passing checks. If a failing baseline is unavailable, state why and retain alternative proof. Documentation changes use proportionate static or manual checks.

## Limits and adoption

Existing receipt hashes, size limits and runtime checks retain their current behavior. They do not prove commands ran, expected values are independent or coverage is sufficient. This change adds policy and instruction routing, not executable enforcement. The bounded decision scenarios assess proposed decisions; absent tool traces do not establish executed actions or live instruction compliance.

Source changes and public exports do not activate skills. Keep active workflows fixed and coordinate adoption after affected runs finish or stop. Begin fresh chats after the supported upgrade procedure. This change does not install skills or modify product repositories.

Deferred work includes typed receipt/schema changes, exact-diff census and capacity handling, deterministic launch/candidate policy checks, custom Markdown parsing, audit-reference enforcement, CI test-diff labels, CODEOWNERS, a read-only-test sandbox, ADR 0008 QA agents, ADR 0005's review-brief decision, independent test-authorship and mutation/property-testing pilots, and product-repository adoption.
