#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateLedger } from "./validate-ledger.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export function parseOptions(argv, allowed, required) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.includes(flag) || value === undefined || Object.hasOwn(args, flag) || !value.trim()) {
      throw new Error(`invalid, duplicate, or missing option: ${flag}`);
    }
    args[flag] = value;
  }
  for (const flag of required) if (!Object.hasOwn(args, flag)) throw new Error(`${flag} is required`);
  return args;
}

export function githubIdentity(value, kind) {
  const match = value?.match(new RegExp(`^https://github\\.com/([A-Za-z0-9_-]+/[A-Za-z0-9_.-]+)/${kind}/([1-9][0-9]*)$`));
  if (!match || !Number.isSafeInteger(Number(match[2]))) throw new Error(`expected a canonical github.com ${kind} URL`);
  return { repository: match[1], number: Number(match[2]) };
}

export function livePreflight(repo, kind, baseRef, expectedHead, expectedBranch) {
  if (!/^[0-9a-f]{40}$/.test(expectedHead)) throw new Error("--expected-head must be a full lowercase SHA");
  const result = spawnSync(process.execPath, [path.join(scriptDir, "preflight.mjs"), "--repo", repo, "--kind", kind, "--base-ref", baseRef], { encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`preflight failed: ${result.error?.message || result.stderr || result.stdout}`);
  const live = JSON.parse(result.stdout);
  if (!live.ok || live.runtime.ok !== true) throw new Error("preflight runtime is not verified");
  if (live.detached || live.branch !== expectedBranch) throw new Error("live branch does not match expected branch");
  if (live.head !== expectedHead) throw new Error("live HEAD does not match expected HEAD");
  if (live.dirty) throw new Error("worktree is not clean");
  if (!live.baseExists) throw new Error("base ref does not exist");
  return live;
}

export function assertSafeLedgerPath(file, worktree) {
  const root = fs.realpathSync(worktree);
  if (path.dirname(file) !== path.join(root, "sdlc-scratch", "ledgers") || !/^pr-[1-9][0-9]*\.json$/.test(path.basename(file))) {
    throw new Error("ledger must be a pr-<number>.json file directly inside worktree/sdlc-scratch/ledgers");
  }
  for (const directory of [path.join(root, "sdlc-scratch"), path.dirname(file)]) {
    try {
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("ledger directories must be real directories, not symlinks");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const ignored = spawnSync("git", ["check-ignore", "--quiet", "--no-index", file], { cwd: root, encoding: "utf8" });
  if (ignored.status !== 0) throw new Error("ledger path must already be git-ignored");
}

export function assertValid(file, ledger) {
  const errors = validateLedger(file, ledger);
  if (errors.length) throw new Error(`invalid ledger: ${errors.join("; ")}`);
}

export function writeLedger(file, ledger, { exclusive = false, mode = 0o600 } = {}) {
  const temporary = `${file}.tmp-${randomUUID()}`;
  let created = false;
  try {
    const descriptor = fs.openSync(temporary, "wx", mode);
    created = true;
    try {
      fs.writeFileSync(descriptor, `${JSON.stringify(ledger, null, 2)}\n`);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    // Hard-link publication is atomic and refuses to replace an existing file.
    if (exclusive) fs.linkSync(temporary, file);
    else fs.renameSync(temporary, file);
  } finally {
    if (created) fs.rmSync(temporary, { force: true });
  }
}

function main() {
  const required = ["--repo", "--kind", "--base-ref", "--issue-url", "--expected-head", "--expected-branch"];
  const args = parseOptions(process.argv.slice(2), [...required, "--parent-issue-url", "--parent-branch"], required);
  const issue = githubIdentity(args["--issue-url"], "issues");
  const parent = args["--parent-issue-url"] ? githubIdentity(args["--parent-issue-url"], "issues") : null;
  if (Boolean(parent) !== Boolean(args["--parent-branch"])) throw new Error("parent issue URL and parent branch must be supplied together");
  if (parent && parent.repository !== issue.repository) throw new Error("parent issue must belong to the same repository");
  const live = livePreflight(args["--repo"], args["--kind"], args["--base-ref"], args["--expected-head"], args["--expected-branch"]);
  if (args["--kind"] === "manual" && live.checkoutKind !== "linked") {
    throw new Error("manual initialization requires an isolated linked Git worktree");
  }
  const worktree = fs.realpathSync(live.repo);
  const file = path.join(worktree, "sdlc-scratch", "ledgers", `pr-${issue.number}.json`);
  const ledger = {
    schemaVersion: 6, revision: 0, phase: "implementation",
    runMode: parent ? "parent-ticket" : "single-ticket",
    mergePolicy: parent && parent.number !== issue.number ? "auto-child" : "explicit-terminal",
    issueUrl: args["--issue-url"], issueNumber: issue.number,
    ...(parent ? { parentIssueUrl: args["--parent-issue-url"], parentIssueNumber: parent.number, parentBranch: args["--parent-branch"] } : {}),
    prUrl: null, branch: live.branch, baseRef: live.baseRef, worktree,
    worktreeKind: live.worktreeKind, currentCheckout: worktree,
    runtime: { nodeBin: live.runtime.nodeBin ?? process.execPath, codexBin: live.runtime.codexBin, codexVersion: live.runtime.codexVersion },
    activeWorkerThreadId: null, scheduledTaskId: null, heartbeatTargetThreadId: null,
    heartbeatPromptSha256: null, heartbeatVerifiedAt: null, watcherPolicy: null,
    continuationMode: "controller-turn", continuationReason: null, waitingSince: null,
    localAudit: { engine: null, headSha: null, status: "pending", completedAt: null, promptSha256: null, exitCode: null, outputFile: null },
    codexReviewRequests: [], pendingReviewRequest: null, automaticReview: null, userAmendments: [],
  };
  assertValid(file, ledger);
  assertSafeLedgerPath(file, worktree);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeLedger(file, ledger, { exclusive: true });
  process.stdout.write(`${JSON.stringify({ ok: true, file, revision: 0, headSha: live.head })}\n`);
}

const invokedDirectly = process.argv[1] && fs.existsSync(process.argv[1])
  && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (invokedDirectly) try { main(); } catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
