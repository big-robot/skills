# Stakes Tier

Canonical work-mode tiers for decision clarification, implementation planning, plan review, and delivery. Set the tier before choosing process depth so standard features stay lean and only large/complex work pays full ceremony.

## Tier Contract

| Tier | Required discovery and artifacts | Review depth | Clarification gate |
| --- | --- | --- | --- |
| `trivial` | Inspect the affected file, symbol, caller, and existing check. No temporary plan or formal review artifact. | One inline safety check; no evidence packet or multi-pass review. | The request must settle behavior and scope. Escalate if it does not. |
| `standard` | Targeted source map, exact acceptance-to-check traceability, and one temporary candidate when a ticket is needed. | Inline review and one final blocker pass. Use evidence packets for concrete high-risk findings. | Resolve only a decision that changes behavior, authority, security, or the approved scope. Record source-backed low-risk mechanical choices. |
| `large/complex` | Full relevant source map, acceptance ownership, explicit assumptions, and the mode-required manifest or receipt. | Source-backed lanes, evidence packets, acceptance traceability, and final disproof. | Resolve product, authority, security, and scope decisions. A documented reversible implementation choice may remain with the worker. |

## Choosing The Tier

Tier depth follows consequence, authority, reversibility, and evidence quality. Escalate for ambiguous product behavior; production or real data; security, privacy, or credentials; irreversible or accounting-authoritative actions; multi-repo or unfamiliar domains; conflicting evidence; or a weak plan.

Technical breadth determines how much source mapping is necessary. It does not alone make every low-risk implementation choice a user question or require large/complex review. Security, authority, consequential product behavior, and irreversible effects always retain their gates. If the risk tier is unclear, use the next higher tier.

`trivial` has no formal ticket, receipt, or publication-review path. If work requires one of those artifacts, promote it to `standard` before preflight.
