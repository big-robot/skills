import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { receiptHash } from "../scripts/worker-receipt.mjs";
import { createReviewAuditReceipt, serializeReviewAudit, sha256 } from "../scripts/review-audit-receipt.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SCRIPTS = path.join(ROOT, "scripts");
const CONTRACT = fileURLToPath(new URL("../references/worker-contracts.md", import.meta.url));
const RULES = path.join(ROOT, "../shared/templates/agents-code-review-rules.md");

function run(command, args, cwd) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(command, args, { cwd, encoding: "utf8", env });
}

function git(repo, ...args) {
  const result = run("git", args, repo);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function write(repo, file, contents) {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), contents);
}

function evidence() {
  return { claim: "contractual retention hours", command: "node --test tests/domain.test.mjs", result: { status: "passed", exitCode: 0 }, requiredBoundary: "public domain export", exercisedBoundary: "public domain export", references: [{ path: "sdlc-scratch/check.txt", startLine: 1 }] };
}

function surface() {
  return { id: "retention", boundary: "domain.mjs hours export", inventoryEvidence: ["one public retention setting"], invariants: ["configured hours match contract"], coverageProof: ["node --test tests/domain.test.mjs passed"], introducedBehaviorProof: ["new duration verified through public export"] };
}

function ledger(repo, head) {
  return {
    schemaVersion: 6, revision: 0, phase: "implementation", runMode: "single-ticket", mergePolicy: "explicit-terminal",
    issueUrl: "https://github.com/acme/repo/issues/41", issueNumber: 41, prUrl: "https://github.com/acme/repo/pull/42",
    branch: "feature", baseRef: "main", worktree: repo, worktreeKind: "manual", currentCheckout: repo,
    scheduledTaskId: null, heartbeatTargetThreadId: null, heartbeatPromptSha256: null, heartbeatVerifiedAt: null, watcherPolicy: null,
    continuationMode: "controller-turn", continuationReason: null, waitingSince: null,
    runtime: { nodeBin: null, codexBin: null, codexVersion: null }, userAmendments: [],
    localAudit: { engine: "codex", headSha: head, status: "clean", completedAt: "2026-10-21T12:00:00Z", promptSha256: "a".repeat(64), exitCode: 0, outputFile: "sdlc-scratch/audits/review.jsonl" },
    activeWorkerThreadId: null, codexReviewRequests: [], pendingReviewRequest: null,
    expectedChecks: { mode: "none", authorizedBy: "runtime test fixture" },
  };
}

function writeAudit(repo, head, promptSha256) {
  const transcript = `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "No findings." } })}\n${JSON.stringify({ type: "turn.completed" })}\n`;
  const receipt = createReviewAuditReceipt({
    baseRef: "main", baseSha: head, headSha: head, treeSha: git(repo, "rev-parse", `${head}^{tree}`),
    briefSha256: promptSha256, inputSha256: sha256(`${promptSha256}:${head}`),
    codexBin: "/test/codex", codexVersion: "codex-cli fixture",
    command: ["exec", "--ephemeral", "--sandbox", "read-only", "review", "--json", "-"],
    exitCode: 0, transcript, usage: null,
  });
  write(repo, "sdlc-scratch/audits/review.jsonl", serializeReviewAudit(transcript, receipt));
}

function fixture(t, { phase = "implementation", changes = true, extra = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-integrity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "Runtime Test");
  git(repo, "config", "user.email", "runtime@example.test");
  write(repo, "AGENTS.md", fs.readFileSync(RULES, "utf8"));
  write(repo, ".gitignore", "sdlc-scratch/\n");
  write(repo, "contract.md", "Approved retention duration: 12 hours.\n");
  write(repo, "domain.mjs", "export const hours = 12;\n");
  write(repo, "tests/domain.test.mjs", "import assert from 'node:assert/strict'; import {hours} from '../domain.mjs'; assert.equal(hours, 12);\n");
  write(repo, "fixtures/old.json", "{\"hours\":12}\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "baseline");
  const base = git(repo, "rev-parse", "HEAD");
  git(repo, "checkout", "-b", "feature");
  if (changes) {
    write(repo, "contract.md", "Approved retention duration: 24 hours.\n");
    write(repo, "domain.mjs", "export const hours = 24;\n");
    write(repo, "tests/domain.test.mjs", "import assert from 'node:assert/strict'; import {hours} from '../domain.mjs'; assert.equal(hours, 24);\n");
  }
  if (extra) extra(repo);
  if (changes || extra) {
    git(repo, "add", "-A");
    git(repo, "commit", "-m", "approved duration update");
  }
  const head = git(repo, "rev-parse", "HEAD");
  const check = run(process.execPath, ["--test", "tests/domain.test.mjs"], repo);
  assert.equal(check.status, 0, check.stderr);
  write(repo, "sdlc-scratch/check.txt", check.stdout);
  const receiptFile = path.join(root, "receipt.json");
  const packetFile = path.join(root, "packet.json");
  const ledgerFile = path.join(repo, "sdlc-scratch/ledgers/pr-42.json");
  const packet = { issueUrl: "https://github.com/acme/repo/issues/41", prUrl: "https://github.com/acme/repo/pull/42", checkout: repo, branch: "feature", phase, expectedBaseOrReviewedHead: `main ${base}`, ...(phase === "correction" ? { expectedReviewedHead: base } : {}), workerContractPath: CONTRACT, runtime: { nodeBin: process.execPath, codexBin: null, codexVersion: null }, receiptPath: receiptFile, localCommitAuthority: true, externalMutationProhibited: true };
  fs.writeFileSync(packetFile, JSON.stringify(packet));
  const state = ledger(repo, head);
  state.phase = phase;
  writeAudit(repo, head, state.localAudit.promptSha256);
  write(repo, "sdlc-scratch/ledgers/pr-42.json", JSON.stringify(state));
  const disposition = (file, status = "M") => ({ path: file, status, disposition: status === "A" ? "added" : status === "D" ? "replaced" : "retained", reason: "Approved retention contract update; retained public-export protection", contractRefs: [{ path: "contract.md", startLine: 1 }], proof: [evidence()] });
  const draft = { schemaVersion: 2, outcome: "ready-to-push", phase, reviewTier: changes || extra ? "standard" : "trivial", localCommitSha: head, verificationBaseSha: base, verificationChanges: changes ? [disposition("tests/domain.test.mjs")] : [], ...(phase === "implementation" ? { acceptanceEvidence: [evidence()], riskEvidence: [], surfaceClosure: [], tests: [evidence()], localReview: [evidence()] } : { checks: [evidence()], prSurfaceCensus: [{ surfaceId: "retention", owningBoundary: "domain.mjs public export", changedProductionSymbols: ["hours"], historicalFindingAnchors: [], effectiveInputs: [] }], findingClosure: [{ finding: "live review anchor", rootCause: "old contractual duration", affectedSurfaceIds: ["retention"] }], surfaceClosure: [surface()] }) };
  const finalize = (body = draft) => {
    fs.writeFileSync(receiptFile, JSON.stringify(body));
    return run(process.execPath, [path.join(SCRIPTS, "finalize-worker-receipt.mjs"), "--repo", repo, "--packet", packetFile], ROOT);
  };
  const verify = (body, expectedHead = head) => {
    if (body) fs.writeFileSync(receiptFile, JSON.stringify({ ...body, receiptSha256: receiptHash(body) }));
    return run(process.execPath, [path.join(SCRIPTS, "controller-transition.mjs"), "--repo", repo, "--ledger", ledgerFile, "--expected-revision", "0", "--operation", "verify-worker-return", "--issue", "41", "--expected-head", expectedHead, "--worker-receipt", receiptFile], ROOT);
  };
  return { root, repo, base, head, draft, packet, packetFile, receiptFile, ledgerFile, state, disposition, finalize, verify };
}

test("finalizer and Controller accept a contract-backed expectation update in both phases", (t) => {
  for (const phase of ["implementation", "correction"]) {
    const f = fixture(t, { phase });
    const result = f.finalize();
    assert.equal(result.status, 0, result.stderr);
    const accepted = f.verify();
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(JSON.parse(accepted.stdout).baseSha, f.base);
    assert.equal(JSON.parse(accepted.stdout).permittedNextTransition, "push-candidate");
  }
});

test("typed receipts reject malformed evidence and inconsistent terminal results without replacing draft", (t) => {
  const f = fixture(t);
  for (const invalid of [null, "pass", {}, { ...evidence(), command: " " }, { ...evidence(), requiredBoundary: null }, { ...evidence(), result: { status: "passed", exitCode: 1 } }, { ...evidence(), result: { status: "failed", exitCode: 0 } }, { ...evidence(), command: null, result: { status: "not-run", exitCode: null } }, { ...evidence(), references: [null] }]) {
    const draft = { ...f.draft, tests: [invalid] };
    assert.notEqual(f.finalize(draft).status, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.receiptFile, "utf8")), draft);
    assert.equal(f.verify(draft).status, 30);
  }
  const legacy = { ...f.draft, schemaVersion: 1 };
  assert.match(f.finalize(legacy).stderr, /fresh typed-evidence receipt/);
});

test("evidence references fail closed on traversal, unresolved lines, symlink escape, and oversize files without executing content", (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, "outside.txt"), "outside\n");
  fs.symlinkSync(path.join(f.root, "outside.txt"), path.join(f.repo, "sdlc-scratch/escape.txt"));
  fs.mkdirSync(path.join(f.root, "outside-dir"));
  fs.writeFileSync(path.join(f.root, "outside-dir/output.txt"), "outside\n");
  fs.symlinkSync(path.join(f.root, "outside-dir"), path.join(f.repo, "sdlc-scratch/escape-dir"));
  write(f.repo, "sdlc-scratch/large.txt", "x".repeat(1024 * 1024 + 1));
  for (const ref of [{ path: "../outside.txt" }, { path: path.join(f.root, "outside.txt") }, { path: "missing.txt" }, { path: "sdlc-scratch/check.txt", startLine: 999999 }, { path: "sdlc-scratch/check.txt", endLine: 2 }, { path: "sdlc-scratch/escape.txt" }, { path: "sdlc-scratch/escape-dir/output.txt" }, { path: "sdlc-scratch/large.txt" }]) {
    const draft = { ...f.draft, tests: [{ ...evidence(), references: [ref] }] };
    assert.notEqual(f.finalize(draft).status, 0, JSON.stringify(ref));
    assert.equal(f.verify(draft).status, 30);
  }
  const sentinel = path.join(f.root, "should-not-exist");
  write(f.repo, "sdlc-scratch/instructions.mjs", `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(sentinel)}, 'executed');\n`);
  const draft = { ...f.draft, tests: [{ ...evidence(), command: `node sdlc-scratch/instructions.mjs`, references: [{ path: "sdlc-scratch/instructions.mjs" }] }] };
  assert.equal(f.finalize(draft).status, 0);
  assert.equal(f.verify().status, 0);
  assert.equal(fs.existsSync(sentinel), false);
});

test("Controller independently rejects omitted census, substituted base, invented path, and tier downgrade even with recomputed hashes", (t) => {
  const f = fixture(t);
  const cases = [
    [{ ...f.draft, verificationChanges: [] }, /omits changed file/],
    [{ ...f.draft, verificationBaseSha: f.head, verificationChanges: [] }, /verification base/],
    [{ ...f.draft, verificationChanges: [f.disposition("tests/domain.test.mjs"), f.disposition("contract.md", "A")] }, /exact changed path\/status/],
    [{ ...f.draft, reviewTier: "trivial" }, /at least standard/],
    [{ ...f.draft, verificationChanges: [...f.draft.verificationChanges, ...f.draft.verificationChanges] }, /duplicate path/],
  ];
  for (const [draft, message] of cases) {
    assert.match(f.finalize(draft).stderr, message);
    const result = f.verify(draft);
    assert.equal(result.status, 30, result.stderr);
    assert.match(result.stderr, message);
  }
  f.state.localAudit = { engine: null, headSha: null, status: "pending", completedAt: null, promptSha256: null, exitCode: null };
  fs.writeFileSync(f.ledgerFile, JSON.stringify(f.state));
  assert.notEqual(f.verify(f.draft).status, 0, "standard review evidence must still be required");
});

test("standard review rejects an inline audit and preserves valid Codex ancestor audit coverage during correction", (t) => {
  const f = fixture(t, { phase: "correction" });
  assert.equal(f.finalize().status, 0);
  f.state.localAudit.engine = "inline";
  fs.writeFileSync(f.ledgerFile, JSON.stringify(f.state));
  const inline = f.verify();
  assert.equal(inline.status, 30, inline.stderr);
  assert.match(inline.stderr, /require Codex local audit provenance/);
  f.state.localAudit.engine = "codex";
  f.state.localAudit.headSha = f.base;
  writeAudit(f.repo, f.base, f.state.localAudit.promptSha256);
  fs.writeFileSync(f.ledgerFile, JSON.stringify(f.state));
  const ancestor = f.verify();
  assert.equal(ancestor.status, 0, ancestor.stderr);
  assert.equal(JSON.parse(ancestor.stdout).permittedNextTransition, "push-candidate");
});

test("deletions, renames, runner configuration, snapshots and CI changes require dispositions", (t) => {
  const f = fixture(t, { extra(repo) {
    fs.renameSync(path.join(repo, "fixtures/old.json"), path.join(repo, "fixtures/new.json"));
    write(repo, "package.json", '{"scripts":{"test":"node --test tests/*.test.mjs"}}\n');
    write(repo, ".github/workflows/check.yml", "name: checks\n");
    write(repo, "__snapshots__/retention.snap", "24 hours\n");
  } });
  const added = [f.disposition("fixtures/old.json", "D"), f.disposition("fixtures/new.json", "A"), f.disposition("package.json", "A"), f.disposition(".github/workflows/check.yml", "A"), f.disposition("__snapshots__/retention.snap", "A")];
  const draft = { ...f.draft, verificationChanges: [...f.draft.verificationChanges, ...added] };
  for (const omit of added) {
    const missing = { ...draft, verificationChanges: draft.verificationChanges.filter((entry) => entry.path !== omit.path) };
    assert.match(f.finalize(missing).stderr, /omits changed file/);
    assert.equal(f.verify(missing).status, 30);
  }
  assert.equal(f.finalize(draft).status, 0);
  assert.equal(f.verify().status, 0);
});

test("custom verification paths can be declared only from the exact diff and receive minimum standard review", (t) => {
  const f = fixture(t, { changes: false, extra(repo) { write(repo, "assurance/custom.mjs", "export const expectedHours = 12;\n"); } });
  const draft = { ...f.draft, verificationChanges: [f.disposition("assurance/custom.mjs", "A")] };
  assert.equal(f.finalize(draft).status, 0);
  assert.equal(f.verify().status, 0);
  assert.match(f.finalize({ ...draft, reviewTier: "trivial" }).stderr, /at least standard/);
  assert.match(f.finalize({ ...draft, verificationChanges: [f.disposition("domain.mjs")] }).stderr, /exact changed path\/status/);
});

test("correction census and closure keep their owner schema and reject inconsistent surface identities", (t) => {
  const f = fixture(t, { phase: "correction" });
  for (const draft of [{ ...f.draft, surfaceClosure: [{ ...surface(), id: "other" }] }, { ...f.draft, findingClosure: [{ finding: "anchor", rootCause: "cause", affectedSurfaceIds: ["unknown"] }] }, { ...f.draft, prSurfaceCensus: [null] }, { ...f.draft, surfaceClosure: [surface(), surface()] }]) {
    assert.notEqual(f.finalize(draft).status, 0);
    assert.equal(f.verify(draft).status, 30);
  }
  f.packet.expectedBaseOrReviewedHead = "main";
  fs.writeFileSync(f.packetFile, JSON.stringify(f.packet));
  assert.match(f.finalize().stderr, /expectedBaseOrReviewedHead/);
});

test("target ref advancement retains full-PR merge-base census and policy removal blocks a return", (t) => {
  const f = fixture(t);
  git(f.repo, "checkout", "main");
  write(f.repo, "unrelated.md", "target advanced\n");
  git(f.repo, "add", "unrelated.md");
  git(f.repo, "commit", "-m", "advance target");
  git(f.repo, "checkout", "feature");
  assert.equal(f.finalize().status, 0);
  assert.equal(f.verify().status, 0);
  const rules = fs.readFileSync(RULES, "utf8");
  for (const [label, invalid] of [
    ["removed", "## Code Review Rules\n\n<!-- test-integrity:v1 -->\n"],
    ["commented", rules.split("\n").map((line) => line.startsWith("- TI-") ? `<!-- ${line} -->` : line).join("\n")],
    ["indented", rules.split("\n").map((line) => line.startsWith("- TI-") ? `    ${line}` : line).join("\n")],
  ]) {
    write(f.repo, "AGENTS.md", invalid);
    git(f.repo, "add", "AGENTS.md");
    git(f.repo, "commit", "-m", `${label} review safeguards`);
    const head = git(f.repo, "rev-parse", "HEAD");
    const draft = { ...f.draft, localCommitSha: head };
    const finalized = f.finalize(draft);
    assert.notEqual(finalized.status, 0, `${label} policy was finalized`);
    assert.match(finalized.stderr, /review policy|TI-01|AGENTS.md/i);
    const verified = f.verify(draft, head);
    assert.equal(verified.status, 30, verified.stderr);
    assert.match(verified.stderr, /review policy|TI-01|AGENTS.md/i);
  }
});
