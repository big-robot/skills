import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../", import.meta.url));

function relocated(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cdl-portable-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const skill = path.join(root, "installed skill's $(printf unsafe)");
  fs.cpSync(source, skill, { recursive: true, filter: (entry) => entry !== path.join(source, "tests") });
  const invoke = (script, args) => spawnSync(process.execPath, [path.join(skill, "scripts", script), ...args], { cwd: root, encoding: "utf8" });
  return { root, skill, invoke };
}

test("relocated dispatch accepts only its own canonical regular Worker contract", (t) => {
  const f = relocated(t);
  const contract = path.join(f.skill, "references/worker-contracts.md");
  const packetFile = path.join(f.root, "packet.json");
  const packet = {
    issueUrl: "https://github.example.test/acme/repo/issues/1",
    checkout: f.root,
    branch: "feature",
    expectedBaseOrReviewedHead: "a".repeat(40),
    phase: "implementation",
    localCommitAuthority: true,
    externalMutationProhibited: true,
    workerContractPath: contract,
    runtime: { nodeBin: null, codexBin: null, codexVersion: null },
    receiptPath: path.join(os.tmpdir(), path.basename(f.root), "receipt.json"),
  };
  const validate = () => {
    fs.writeFileSync(packetFile, JSON.stringify(packet));
    return f.invoke("validate-agent-spawn.mjs", ["--role", "worker", "--fork-turns", "none", "--agent-type", "worker", "--packet", packetFile]);
  };
  const accepted = validate();
  assert.equal(accepted.status, 0, accepted.stderr);
  packet.workerContractPath = path.join(f.root, "other-contract.md");
  fs.copyFileSync(contract, packet.workerContractPath);
  let result = validate();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workerContractPath must equal/);
  packet.workerContractPath = contract;
  fs.unlinkSync(contract);
  fs.symlinkSync(path.join(f.root, "other-contract.md"), contract);
  result = validate();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /regular non-symlink file/);
});

test("relocated watcher emits an executable command with quoted installed and state paths", (t) => {
  const f = relocated(t);
  const worktree = path.join(f.root, "workspace's $(printf unsafe)");
  const stateFile = path.join(worktree, "sdlc-scratch/ledgers/pr-41.json");
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const ledger = {
    schemaVersion: 6, revision: 0, phase: "implementation", runMode: "single-ticket",
    mergePolicy: "explicit-terminal", issueUrl: "https://github.example.test/acme/repo/issues/41",
    issueNumber: 41, prUrl: "https://github.example.test/acme/repo/pull/42", branch: "feature",
    baseRef: "origin/main", worktree, worktreeKind: "manual", currentCheckout: worktree,
    scheduledTaskId: null, heartbeatTargetThreadId: null, heartbeatPromptSha256: null,
    heartbeatVerifiedAt: null, watcherPolicy: null, continuationMode: "controller-turn",
    continuationReason: null, waitingSince: null,
    runtime: { nodeBin: process.execPath, codexBin: null, codexVersion: null }, userAmendments: [],
    localAudit: { engine: null, headSha: null, status: "pending", completedAt: null, promptSha256: null, exitCode: null },
    activeWorkerThreadId: null, codexReviewRequests: [], pendingReviewRequest: null,
    expectedChecks: { mode: "none", authorizedBy: "portable test fixture" },
  };
  fs.writeFileSync(stateFile, JSON.stringify(ledger));
  const rendered = f.invoke("render-watcher.mjs", ["--state-file", stateFile]);
  assert.equal(rendered.status, 0, rendered.stderr);
  const command = rendered.stdout.match(/^Run `([^`]+)`/)[1];
  // Replace only the relocated watcher with an inert argv recorder; no GitHub access.
  fs.writeFileSync(path.join(f.skill, "scripts/watch-pr.mjs"), "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
  const executed = spawnSync("sh", ["-c", command], { cwd: f.root, encoding: "utf8" });
  assert.equal(executed.status, 0, executed.stderr);
  assert.deepEqual(JSON.parse(executed.stdout), ["--file", stateFile, "--once"]);
});
