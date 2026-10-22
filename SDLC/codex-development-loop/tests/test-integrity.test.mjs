import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { receiptHash } from "../scripts/worker-receipt.mjs";
import { createReviewAuditReceipt, MAX_REVIEW_AUDIT_BYTES, serializeReviewAudit, sha256 } from "../scripts/review-audit-receipt.mjs";
import { validateReceiptReferences } from "../scripts/verification-integrity.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SCRIPTS = path.join(ROOT, "scripts");
const CONTRACT = fileURLToPath(new URL("../references/worker-contracts.md", import.meta.url));
const RULES = path.join(ROOT, "../shared/templates/agents-code-review-rules.md");

test("both phase-specific Worker receipt instructions require the supported schema", () => {
  const contract = fs.readFileSync(path.join(SCRIPTS, "../references/worker-contracts.md"), "utf8");
  const versions = [...contract.matchAll(/^- `schemaVersion: (\d+)`/gm)].map((match) => Number(match[1]));
  assert.equal(versions.length, 2, "shared and correction instructions each declare their version");
  assert.deepEqual(versions, [2, 2]);
});

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

function writeAudit(repo, head, promptSha256, { message = "No findings.", codexBin = fs.realpathSync(process.execPath), treeSha = git(repo, "rev-parse", `${head}^{tree}`) } = {}) {
  const transcript = `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: message } })}\n${JSON.stringify({ type: "turn.completed" })}\n`;
  const receipt = createReviewAuditReceipt({
    baseRef: "main", baseSha: head, headSha: head, treeSha,
    briefSha256: promptSha256, inputSha256: sha256(`${promptSha256}:${head}`),
    codexBin, codexVersion: "codex-cli fixture",
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
  const packet = { issueUrl: "https://github.com/acme/repo/issues/41", prUrl: "https://github.com/acme/repo/pull/42", checkout: repo, branch: "feature", phase, expectedBaseOrReviewedHead: `main ${base}`, ...(phase === "correction" ? { expectedReviewedHead: base } : {}), workerContractPath: CONTRACT, runtime: { nodeBin: process.execPath, codexBin: fs.realpathSync(process.execPath), codexVersion: "codex-cli fixture" }, receiptPath: receiptFile, localCommitAuthority: true, externalMutationProhibited: true };
  fs.writeFileSync(packetFile, JSON.stringify(packet));
  const state = ledger(repo, head);
  state.phase = phase;
  state.runtime = { ...packet.runtime };
  writeAudit(repo, head, state.localAudit.promptSha256);
  write(repo, "sdlc-scratch/ledgers/pr-42.json", JSON.stringify(state));
  const disposition = (file, status = "M") => ({ path: file, status, disposition: status === "A" ? "added" : status === "D" ? "replaced" : "retained", reason: "Approved retention contract update; retained public-export protection", contractRefs: [{ path: "contract.md", startLine: 1 }], proof: [evidence()] });
  const draft = { schemaVersion: 2, outcome: "ready-to-push", phase, reviewTier: changes || extra ? "standard" : "trivial", localCommitSha: head, verificationBaseSha: base, verificationChanges: changes ? [disposition("tests/domain.test.mjs")] : [], ...(phase === "implementation" ? { acceptanceEvidence: [evidence()], riskEvidence: [], surfaceClosure: [], tests: [evidence()], localReview: [{ ...evidence(), references: [{ path: "sdlc-scratch/audits/review.jsonl", kind: "guarded-audit" }] }] } : { checks: [evidence()], prSurfaceCensus: [{ surfaceId: "retention", owningBoundary: "domain.mjs public export", changedProductionSymbols: ["hours"], historicalFindingAnchors: [], effectiveInputs: [] }], findingClosure: [{ finding: "live review anchor", rootCause: "old contractual duration", affectedSurfaceIds: ["retention"] }], surfaceClosure: [surface()] }) };
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

test("legacy Claude audit remains readable and unchanged but cannot become fresh nontrivial receipt provenance", (t) => {
  for (const phase of ["implementation", "correction"]) {
    const f = fixture(t, { phase });
    f.state.localAudit.engine = "claude";
    fs.writeFileSync(f.ledgerFile, JSON.stringify(f.state));
    const original = fs.readFileSync(f.ledgerFile, "utf8");
    const validated = run(process.execPath, [path.join(SCRIPTS, "validate-ledger.mjs"), "--file", f.ledgerFile], ROOT);
    assert.equal(validated.status, 0, validated.stderr);
    const rejected = f.verify(f.draft);
    assert.equal(rejected.status, 30, rejected.stderr);
    assert.match(rejected.stderr, /legacy.*fresh.*run/i);
    assert.equal(fs.readFileSync(f.ledgerFile, "utf8"), original);
  }
});

test("large guarded audit references preserve hash, runtime, tree, ancestry and size boundaries", (t) => {
  const f = fixture(t, { phase: "correction" });
  f.packet.runtime.codexBin = fs.realpathSync(process.execPath);
  f.packet.runtime.codexVersion = "codex-cli fixture";
  f.state.runtime = { ...f.packet.runtime };
  f.state.localAudit.headSha = f.base;
  fs.writeFileSync(f.packetFile, JSON.stringify(f.packet));
  fs.writeFileSync(f.ledgerFile, JSON.stringify(f.state));
  const options = { message: "review detail ".repeat(90000), codexBin: f.packet.runtime.codexBin };
  writeAudit(f.repo, f.base, f.state.localAudit.promptSha256, options);
  const audit = path.join(f.repo, "sdlc-scratch/audits/review.jsonl");
  const original = fs.readFileSync(audit, "utf8");
  assert.ok(Buffer.byteLength(original) > 1024 * 1024);
  const draft = { ...f.draft, localReview: [{ ...evidence(), references: [{ path: "sdlc-scratch/audits/review.jsonl", startLine: 1, endLine: 3 }] }] };
  assert.equal(f.finalize(draft).status, 0);
  assert.equal(f.verify().status, 0);
  const reject = (body = draft) => {
    assert.notEqual(f.finalize(body).status, 0);
    assert.equal(f.verify(body).status, 30);
  };
  fs.writeFileSync(audit, original.replace("review detail", "edited detail"));
  reject();
  writeAudit(f.repo, f.base, f.state.localAudit.promptSha256, { ...options, codexBin: "/unbound/codex" });
  reject();
  writeAudit(f.repo, f.base, f.state.localAudit.promptSha256, { ...options, treeSha: "b".repeat(40) });
  reject();
  git(f.repo, "checkout", "--orphan", "other");
  git(f.repo, "add", ".");
  git(f.repo, "commit", "-m", "divergent audit");
  const divergent = git(f.repo, "rev-parse", "HEAD");
  git(f.repo, "checkout", "feature");
  writeAudit(f.repo, divergent, f.state.localAudit.promptSha256, options);
  reject();
  fs.writeFileSync(audit, original);
  write(f.repo, "sdlc-scratch/ordinary.jsonl", original);
  reject({ ...draft, localReview: [{ ...evidence(), references: [{ path: "sdlc-scratch/ordinary.jsonl" }] }] });
  fs.truncateSync(audit, MAX_REVIEW_AUDIT_BYTES + 1);
  reject();
});

test("repeated audit references perform one unique file validation per call and still check every line range", (t) => {
  const f = fixture(t, { phase: "correction" });
  const runtime = { ...f.packet.runtime, codexBin: fs.realpathSync(process.execPath), codexVersion: "codex-cli fixture" };
  writeAudit(f.repo, f.base, f.state.localAudit.promptSha256, { message: "review detail ".repeat(90000), codexBin: runtime.codexBin });
  const audit = fs.realpathSync(path.join(f.repo, "sdlc-scratch/audits/review.jsonl"));
  const other = path.join(path.dirname(audit), "other.jsonl");
  const original = fs.readFileSync(audit, "utf8");
  fs.writeFileSync(other, original);
  const repeated = Array.from({ length: 40 }, (_, index) => ({ ...evidence(), references: [{ path: "sdlc-scratch/audits/review.jsonl", ...(index === 0 ? {} : { startLine: 1, endLine: 3 }) }] }));
  const receipt = { ...f.draft, localReview: repeated };
  const reads = new Map();
  const bytes = new Map();
  const gitCalls = [];
  const realRead = fs.readFileSync;
  const realSpawn = childProcess.spawnSync;
  t.mock.method(fs, "readFileSync", (...args) => {
    const value = realRead(...args);
    const file = typeof args[0] === "string" ? path.resolve(args[0]) : null;
    if (file === audit || file === other) {
      reads.set(file, (reads.get(file) ?? 0) + 1);
      bytes.set(file, (bytes.get(file) ?? 0) + Buffer.byteLength(value));
    }
    return value;
  });
  t.mock.method(childProcess, "spawnSync", (...args) => {
    if (args[0] === "git") gitCalls.push(args[1]);
    return realSpawn(...args);
  });
  syncBuiltinESMExports();
  try {
    validateReceiptReferences(receipt, f.repo, { runtime });
    assert.equal(reads.get(audit), 1, "duplicate evidence must not reread the complete audit");
    assert.equal(bytes.get(audit), Buffer.byteLength(original));
    assert.equal(gitCalls.length, 2, "ancestry and tree inspection run once for the unique audit");

    reads.clear(); bytes.clear(); gitCalls.length = 0;
    const laterInvalid = { ...receipt, localReview: [...repeated, { ...evidence(), references: [{ path: "sdlc-scratch/audits/review.jsonl", startLine: 4 }] }] };
    assert.throws(() => validateReceiptReferences(laterInvalid, f.repo, { runtime }), /line range is unresolved/);
    assert.equal(reads.get(audit), 1, "cached line counts still reject a later invalid range");
    assert.equal(gitCalls.length, 2);

    reads.clear(); bytes.clear(); gitCalls.length = 0;
    const twoUnique = { ...receipt, localReview: [...repeated, ...repeated.map((entry) => ({ ...entry, references: [{ path: "sdlc-scratch/audits/other.jsonl", startLine: 1, endLine: 3 }] }))] };
    validateReceiptReferences(twoUnique, f.repo, { runtime });
    assert.deepEqual([...reads], [[audit, 1], [other, 1]], "each distinct audit must receive its own validation");
    assert.equal(gitCalls.length, 4);

    reads.clear(); bytes.clear(); gitCalls.length = 0;
    fs.writeFileSync(audit, original.replace("review detail", "edited detail"));
    assert.throws(() => validateReceiptReferences(receipt, f.repo, { runtime }), /transcript hash is invalid/);
    assert.equal(reads.get(audit), 1, "a later invocation must reread changed evidence");
    fs.writeFileSync(audit, original);
    fs.writeFileSync(other, original.replace("review detail", "edited detail"));
    assert.throws(() => validateReceiptReferences(twoUnique, f.repo, { runtime }), /transcript hash is invalid/, "a distinct invalid audit cannot reuse the first audit's proof");
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test("pytest hooks and coverage exclusion configuration require complete dispositions and standard review", (t) => {
  const files = ["conftest.py", "app/conftest.py", ".coveragerc", "app/.coveragerc", "codecov.yml", ".codecov.yaml", ".coveralls.yml", ".simplecov", ".simplecov.rb", "coverage.config.mjs", "c8.config.js"];
  const f = fixture(t, { changes: false, extra(repo) { for (const file of files) write(repo, file, "# verification configuration\n"); } });
  const draft = { ...f.draft, verificationChanges: files.map((file) => f.disposition(file, "A")) };
  for (const file of files) {
    const omitted = { ...draft, verificationChanges: draft.verificationChanges.filter((entry) => entry.path !== file) };
    assert.match(f.finalize(omitted).stderr, /omits changed file/, file);
    assert.equal(f.verify(omitted).status, 30, file);
  }
  assert.equal(f.finalize(draft).status, 0);
  assert.equal(f.verify().status, 0);
  assert.match(f.finalize({ ...draft, reviewTier: "trivial" }).stderr, /at least standard/);
  assert.equal(f.verify({ ...draft, reviewTier: "trivial" }).status, 30);
});

test("local GitHub action definitions and supporting code require complete CI dispositions", (t) => {
  const files = [".github/actions/quality/action.yml", ".github/actions/check/action.yaml", ".github/actions/quality/index.js", ".github/actions/quality/lib/run.mjs", ".github/actions/quality/scripts/check.sh", ".github/actions/quality/Dockerfile"];
  const f = fixture(t, { changes: false, extra(repo) { for (const file of files) write(repo, file, "# checked-in CI action fixture\n"); } });
  const draft = { ...f.draft, verificationChanges: files.map((file) => f.disposition(file, "A")) };
  for (const file of files) {
    const omitted = { ...draft, verificationChanges: draft.verificationChanges.filter((entry) => entry.path !== file) };
    assert.match(f.finalize(omitted).stderr, /omits changed file/, file);
    assert.equal(f.verify(omitted).status, 30, file);
  }
  assert.equal(f.finalize(draft).status, 0);
  assert.equal(f.verify().status, 0);
  assert.match(f.finalize({ ...draft, reviewTier: "trivial" }).stderr, /at least standard/);
});

test("small nontrivial implementation review evidence must bind the guarded authoritative audit", (t) => {
  const f = fixture(t);
  f.packet.runtime.codexBin = fs.realpathSync(process.execPath);
  f.packet.runtime.codexVersion = "codex-cli fixture";
  f.state.runtime = { ...f.packet.runtime };
  fs.writeFileSync(f.packetFile, JSON.stringify(f.packet));
  fs.writeFileSync(f.ledgerFile, JSON.stringify(f.state));
  writeAudit(f.repo, f.head, f.state.localAudit.promptSha256, { codexBin: f.packet.runtime.codexBin });
  const ordinary = { ...f.draft, localReview: [evidence()] };
  assert.notEqual(f.finalize(ordinary).status, 0, "an unrelated passing file cannot replace guarded review proof");
  assert.equal(f.verify(ordinary).status, 30);
  const ref = { path: "sdlc-scratch/audits/review.jsonl", kind: "guarded-audit" };
  const guarded = { ...evidence(), references: [ref] };
  write(f.repo, "sdlc-scratch/audits/brief.md", "ordinary review preparation notes\n");
  const draft = { ...f.draft, localReview: [guarded, evidence(), { ...evidence(), references: [{ path: "sdlc-scratch/audits/brief.md" }] }] };
  assert.equal(f.finalize(draft).status, 0);
  assert.equal(f.verify().status, 0);
  for (const status of ["failed", "not-run"]) {
    const entry = { ...guarded, result: status === "failed" ? { status, exitCode: 1 } : { status, exitCode: null, reason: "not performed" } };
    const wrongStatus = { ...draft, localReview: [entry, evidence()] };
    assert.notEqual(f.finalize(wrongStatus).status, 0);
    assert.equal(f.verify(wrongStatus).status, 30);
  }
  const wrongRole = { ...draft, tests: [guarded], localReview: [{ ...evidence(), references: [{ path: ref.path }] }] };
  assert.notEqual(f.finalize(wrongRole).status, 0);
  assert.equal(f.verify(wrongRole).status, 30);
  for (const kind of ["ordinary", "", null]) {
    const invalidKind = { ...draft, localReview: [{ ...guarded, references: [{ ...ref, kind }] }] };
    assert.match(f.finalize(invalidKind).stderr, /kind must be guarded-audit or omitted/);
    assert.equal(f.verify(invalidKind).status, 30);
  }
  const audit = path.join(f.repo, ref.path);
  const contents = fs.readFileSync(audit, "utf8");
  fs.writeFileSync(audit, contents.replace("No findings.", "Bad findings"));
  const promoted = { ...draft, acceptanceEvidence: [{ ...evidence(), references: [{ path: ref.path, startLine: 1 }] }] };
  assert.notEqual(f.finalize(promoted).status, 0, "ordinary cache metadata cannot suppress later guarded validation");
  assert.equal(f.verify(promoted).status, 30);
  fs.writeFileSync(audit, contents);
  write(f.repo, "sdlc-scratch/audits/other.output", contents);
  const unrelated = { ...draft, localReview: [{ ...guarded, references: [{ path: "sdlc-scratch/audits/other.output", kind: "guarded-audit" }] }] };
  assert.equal(f.finalize(unrelated).status, 0, "finalizer verifies arbitrary-named guarded output using packet provenance");
  const rejected = f.verify(unrelated);
  assert.equal(rejected.status, 30);
  assert.match(rejected.stderr, /Controller audit provenance/);
  write(f.repo, "sdlc-scratch/relocated.output", contents);
  const relocated = { ...draft, localReview: [{ ...guarded, references: [{ path: "sdlc-scratch/relocated.output", kind: "guarded-audit" }] }] };
  assert.notEqual(f.finalize(relocated).status, 0);
  assert.equal(f.verify(relocated).status, 30);

  writeAudit(f.repo, f.head, f.state.localAudit.promptSha256, { codexBin: f.packet.runtime.codexBin, message: "review detail ".repeat(90000) });
  const inferredLarge = { ...draft, localReview: [{ ...guarded, references: [{ path: ref.path }] }] };
  assert.equal(f.finalize(inferredLarge).status, 0, "existing unmarked large audit proof retains compatibility");
  assert.equal(f.verify().status, 0);
});

test("correction guarded checks verify small ancestor audits without requiring localReview", (t) => {
  const f = fixture(t, { phase: "correction" });
  f.state.localAudit.headSha = f.base;
  fs.writeFileSync(f.ledgerFile, JSON.stringify(f.state));
  writeAudit(f.repo, f.base, f.state.localAudit.promptSha256);
  const ref = { path: "sdlc-scratch/audits/review.jsonl", kind: "guarded-audit" };
  const draft = { ...f.draft, checks: [{ ...evidence(), references: [ref] }] };
  assert.equal(Object.hasOwn(draft, "localReview"), false);
  assert.equal(f.finalize(draft).status, 0);
  assert.equal(f.verify().status, 0);
  const file = path.join(f.repo, ref.path);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("No findings.", "Bad findings"));
  assert.match(f.finalize(draft).stderr, /transcript hash is invalid/);
  assert.equal(f.verify(draft).status, 30);
});

test("trivial inline review still accepts ordinary references with no Codex runtime", (t) => {
  const f = fixture(t, { changes: false });
  f.packet.runtime.codexBin = null;
  f.packet.runtime.codexVersion = null;
  f.state.runtime = { ...f.packet.runtime };
  f.state.localAudit.engine = "inline";
  fs.writeFileSync(f.packetFile, JSON.stringify(f.packet));
  fs.writeFileSync(f.ledgerFile, JSON.stringify(f.state));
  const draft = { ...f.draft, localReview: [evidence()] };
  assert.equal(f.finalize(draft).status, 0);
  assert.equal(f.verify().status, 0);
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
    ...["pre", "code", "script", "textarea", "template"].map((tag) => [tag, `<${tag}>\n${rules}\n</${tag}>`]),
    ...["pre", "code", "template"].flatMap((tag) => [
      [`nested-${tag}`, `<${tag}>\n<${tag}>Example</${tag}>\n${rules}\n</${tag}>`],
      [`quoted-${tag}`, `<${tag} title="</${tag}>">\n${rules}\n</${tag}>`],
    ]),
    ["listing", `<listing>\n${rules}\n</listing>`],
    ["backtick-fence-suffix", `\`\`\`md\n\`\`\`still-code\n${rules}\n\`\`\``],
    ["tilde-fence-suffix", `~~~md\n~~~still-code\n${rules}\n~~~`],
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
  for (const mention of ["Mention `<pre>`.", "Mention ``<pre> `and` <code>``.", "Mention \\<pre> and \\<template>."]) {
    write(f.repo, "AGENTS.md", `${mention}\n\n${rules}`);
    git(f.repo, "add", "AGENTS.md");
    git(f.repo, "commit", "-m", "retain governing rules after literal tag mention");
    const head = git(f.repo, "rev-parse", "HEAD");
    const draft = { ...f.draft, localCommitSha: head };
    const finalized = f.finalize(draft);
    assert.equal(finalized.status, 0, finalized.stderr);
    const verified = f.verify(draft, head);
    assert.equal(verified.status, 0, verified.stderr);
  }
});
