#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { assertSafeLedgerPath, assertValid, githubIdentity, livePreflight, parseOptions, writeLedger } from "./init-ledger.mjs";

try {
  const required = ["--file", "--pr-url", "--expected-revision", "--expected-head"];
  const args = parseOptions(process.argv.slice(2), required, required);
  const file = args["--file"];
  if (!path.isAbsolute(file)) throw new Error("--file must be absolute");
  if (!/^(0|[1-9][0-9]*)$/.test(args["--expected-revision"])) throw new Error("--expected-revision must be a non-negative safe integer");
  const revision = Number(args["--expected-revision"]);
  if (!Number.isSafeInteger(revision)) throw new Error("--expected-revision must be a non-negative safe integer");
  const pr = githubIdentity(args["--pr-url"], "pull");
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("ledger must be a regular non-symlink file");
  const original = fs.readFileSync(file, "utf8");
  const ledger = JSON.parse(original);
  assertValid(file, ledger);
  assertSafeLedgerPath(file, ledger.worktree);
  if (ledger.revision !== revision) throw new Error(`revision conflict: expected ${revision}, found ${ledger.revision}`);
  if (ledger.prUrl !== null) throw new Error("ledger already has a bound PR");
  if (ledger.continuationMode !== "controller-turn") throw new Error("PR binding requires controller-turn ownership");
  if (ledger.activeWorkerThreadId !== null) throw new Error("reconcile active Worker before binding PR");
  if (githubIdentity(ledger.issueUrl, "issues").repository !== pr.repository) throw new Error("PR must belong to the issue repository");
  const ghBin = process.env.CODEX_DEVELOPMENT_LOOP_TEST === "1" && process.env.CDL_GH_BIN ? process.env.CDL_GH_BIN : "gh";
  const remote = spawnSync(ghBin, ["pr", "view", String(pr.number), "--repo", pr.repository,
    "--json", "number,url,state,headRefName,headRefOid,baseRefName"], { cwd: ledger.currentCheckout, encoding: "utf8" });
  if (remote.error || remote.status !== 0) throw new Error(`PR readback failed: ${remote.error?.message || remote.stderr.trim()}`);
  const snapshot = JSON.parse(remote.stdout);
  const expectedBase = ledger.mergePolicy === "auto-child" ? ledger.parentBranch : ledger.baseRef.replace(/^origin\//, "");
  if (snapshot?.number !== pr.number || snapshot.url !== args["--pr-url"]) throw new Error("PR readback identity does not match supplied URL");
  if (snapshot.state !== "OPEN") throw new Error("PR must be OPEN before binding");
  if (snapshot.headRefName !== ledger.branch || snapshot.headRefOid !== args["--expected-head"]) throw new Error("PR readback head does not match ledger branch and expected HEAD");
  if (snapshot.baseRefName !== expectedBase) throw new Error("PR readback base branch does not match ledger");
  const live = livePreflight(ledger.currentCheckout, ledger.worktreeKind, ledger.baseRef, args["--expected-head"], ledger.branch);
  if (fs.realpathSync(live.repo) !== fs.realpathSync(ledger.worktree)) throw new Error("current checkout does not match ledger worktree");
  const runtime = { nodeBin: live.runtime.nodeBin ?? process.execPath, codexBin: live.runtime.codexBin, codexVersion: live.runtime.codexVersion };
  for (const key of Object.keys(runtime)) if (runtime[key] !== ledger.runtime[key]) throw new Error(`pinned runtime ${key} drifted`);
  const updated = { ...ledger, prUrl: args["--pr-url"], revision: revision + 1 };
  assertValid(file, updated);
  const lock = `${file}.lock`;
  let descriptor;
  try {
    descriptor = fs.openSync(lock, "wx", 0o600);
    const currentStat = fs.lstatSync(file);
    if (!currentStat.isFile() || currentStat.isSymbolicLink() || fs.readFileSync(file, "utf8") !== original) throw new Error("ledger changed before binding PR");
    writeLedger(file, updated, { mode: stat.mode & 0o777 });
  } finally {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
      fs.unlinkSync(lock);
    }
  }
  process.stdout.write(`${JSON.stringify({ ok: true, file, prUrl: updated.prUrl, revision: updated.revision })}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
