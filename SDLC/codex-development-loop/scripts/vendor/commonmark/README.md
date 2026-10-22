# Vendored CommonMark parser

`commonmark-0.31.2.cjs` is the unchanged official `commonmark@0.31.2`
`dist/commonmark.js` standalone bundle, renamed only to make its CommonJS
format explicit inside this ES module package. The review-policy gate uses
its AST parser; it does not render HTML or execute candidate instructions.
No package installation or external runtime dependency is required.

- Upstream: <https://github.com/commonmark/commonmark.js/tree/0.31.2>
- Specification: <https://spec.commonmark.org/0.31.2/>
- Package: <https://registry.npmjs.org/commonmark/0.31.2>
- Archive: <https://registry.npmjs.org/commonmark/-/commonmark-0.31.2.tgz>
- Archive integrity: `sha512-2fRLTyb9r/2835k5cwcAwOj0DEc44FARnMp5veGsJ+mEAZdi52sNopLu07ZyElQUz058H43whzlERDIaaSw4rg==`
- Bundle size: `381239` bytes
- Bundle SHA-256: `4d124568b8d4490df72fea8aa0f9a144c5b581b0de0eb63d3a996104b2797edc`

The archive integrity and exact bundle bytes were verified against npm's
published metadata. Retained licenses cover CommonMark (BSD-2-Clause, plus
the notices included by upstream), bundled `entities@3.0.1` (BSD-2-Clause)
and `mdurl@1.0.1` (MIT, including its Node URL-code notice). The package's
CLI-only `minimist` dependency is absent from this standalone bundle.

Update deliberately: verify the versioned upstream archive and standalone
bundle, retain dependency notices, update this provenance, and rerun policy
CLI/finalizer/Controller grammar and safe-counterexample tests. Do not edit
the vendored bundle or assume that updating a user's installed package
updates this copy.
