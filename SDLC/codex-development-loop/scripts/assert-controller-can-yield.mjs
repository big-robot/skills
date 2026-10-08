#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return result;
}

try {
  const argv = process.argv.slice(2);
  if (argv.length !== 2 || argv[0] !== "--file" || !path.isAbsolute(argv[1])) {
    throw new Error("Usage: node assert-controller-can-yield.mjs --file <absolute-ledger-path>");
  }
  const file = path.resolve(argv[1]);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const validation = run(process.execPath, [path.join(scriptDir, "validate-ledger.mjs"), "--file", file]);
  if (validation.status !== 0) throw new Error(`Ledger validation failed:\n${validation.stdout.trim()}`);
  const ledger = JSON.parse(fs.readFileSync(file, "utf8"));
  const errors = [];

  if (ledger.continuationMode === "controller-turn") {
    errors.push("controller-turn must remain open; complete foreground work or establish a safe continuation before yielding");
  }
  if (ledger.continuationMode === "heartbeat") {
    const verifiedAt = Date.parse(ledger.heartbeatVerifiedAt);
    if (!Number.isFinite(verifiedAt) || Date.now() - verifiedAt > 5 * 60 * 1000 || verifiedAt > Date.now() + 60 * 1000) {
      errors.push("heartbeat readback must be verified within five minutes before yielding");
    }
    const latest = ledger.codexReviewRequests.at(-1);
    if (!latest) {
      errors.push("heartbeat requires an exact-head Codex review request");
    } else {
      const head = run("git", ["rev-parse", "HEAD"], { cwd: ledger.currentCheckout });
      if (head.status !== 0) throw new Error(head.stderr.trim() || "could not resolve checkout HEAD");
      if (head.stdout.trim() !== latest.headSha) errors.push("heartbeat review request does not match checkout HEAD");
      const audit = run(process.execPath, [
        path.join(scriptDir, "assert-local-audit-covered.mjs"), "--file", file, "--head-sha", latest.headSha,
      ]);
      if (audit.status !== 0) errors.push("heartbeat local audit does not cover the requested head");
    }
  }

  const result = { ok: errors.length === 0, file, continuationMode: ledger.continuationMode, errors };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (errors.length > 0) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
