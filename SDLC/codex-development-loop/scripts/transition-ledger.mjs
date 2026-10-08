#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined || values.has(flag)) throw new Error("Invalid or duplicate option");
    values.set(flag, value);
  }
  for (const flag of ["--file", "--to", "--expected-revision"]) if (!values.has(flag)) throw new Error(`${flag} is required`);
  const allowed = new Set([
    "--file", "--to", "--expected-revision", "--phase", "--worker-thread-id", "--clear-worker", "--scheduled-task-id", "--cadence-minutes",
    "--max-idle-minutes", "--ack-timeout-minutes", "--waiting-since", "--target-thread-id", "--prompt-sha256", "--verified-at", "--reason",
  ]);
  for (const flag of values.keys()) if (!allowed.has(flag)) throw new Error(`unknown option: ${flag}`);
  const file = values.get("--file");
  if (!path.isAbsolute(file)) throw new Error("--file must be absolute");
  const to = values.get("--to");
  if (!new Set(["controller-turn", "heartbeat", "needs-user", "terminal"]).has(to)) throw new Error("--to is invalid");
  const expectedRevision = Number(values.get("--expected-revision"));
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("--expected-revision must be a non-negative safe integer");
  const phases = new Set(["implementation", "local-review", "awaiting-github-review", "correction", "ready"]);
  if (values.has("--phase") && !phases.has(values.get("--phase"))) throw new Error("--phase is invalid for controller-turn");
  if (values.has("--clear-worker") && values.get("--clear-worker") !== "true") throw new Error("--clear-worker accepts only true");
  if (values.has("--worker-thread-id") && values.has("--clear-worker")) {
    throw new Error("--worker-thread-id and --clear-worker are mutually exclusive");
  }
  const modeFlags = new Set(to === "controller-turn"
    ? ["--file", "--to", "--expected-revision", "--phase", "--worker-thread-id", "--clear-worker"]
    : to === "heartbeat"
      ? ["--file", "--to", "--expected-revision", "--scheduled-task-id", "--cadence-minutes", "--max-idle-minutes", "--ack-timeout-minutes", "--waiting-since", "--target-thread-id", "--prompt-sha256", "--verified-at"]
      : ["--file", "--to", "--expected-revision", "--reason"]);
  for (const flag of values.keys()) if (!modeFlags.has(flag)) throw new Error(`${flag} is not allowed for ${to}`);
  return { file: path.resolve(file), to, expectedRevision, values };
}

function positive(values, flag) {
  const value = Number(values.get(flag));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${flag} must be positive`);
  return value;
}

function runValidator(file) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  return spawnSync(process.execPath, [path.join(scriptDir, "validate-ledger.mjs"), "--file", file], { encoding: "utf8" });
}

function atomicWrite(file, contents, mode) {
  const temporary = `${file}.tmp-${process.pid}`;
  try {
    const descriptor = fs.openSync(temporary, "wx", mode);
    try {
      fs.writeFileSync(descriptor, contents);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

try {
  const { file, to, expectedRevision, values } = parseArgs(process.argv.slice(2));
  const lock = `${file}.lock`;
  let lockDescriptor;
  try {
    lockDescriptor = fs.openSync(lock, "wx", 0o600);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("ledger must be a regular non-symlink file");
  const sourceValidation = runValidator(file);
  if (sourceValidation.status !== 0) throw new Error(`source ledger is invalid:\n${sourceValidation.stdout.trim()}`);
  const original = fs.readFileSync(file, "utf8");
  const ledger = JSON.parse(original);
  if (ledger.revision !== expectedRevision) throw new Error(`revision conflict: expected ${expectedRevision}, found ${ledger.revision}`);

  if (to !== "controller-turn" && ledger.activeWorkerThreadId !== null) {
    throw new Error(`reconcile active Worker ${ledger.activeWorkerThreadId} before entering ${to}`);
  }
  const resumingPrePrHold = ledger.prUrl === null && ledger.continuationMode === "needs-user" && to === "controller-turn";
  if (resumingPrePrHold && values.has("--phase") && values.get("--phase") !== ledger.phase) {
    throw new Error("resume must retain the saved pre-PR phase; change phase in a subsequent foreground transition");
  }

  ledger.continuationMode = to;
  ledger.continuationReason = null;
  ledger.scheduledTaskId = null;
  ledger.watcherPolicy = null;
  ledger.waitingSince = null;
  ledger.heartbeatTargetThreadId = null;
  ledger.heartbeatPromptSha256 = null;
  ledger.heartbeatVerifiedAt = null;

  if (to === "controller-turn") {
    if (values.has("--phase")) ledger.phase = values.get("--phase");
    if (values.has("--worker-thread-id")) ledger.activeWorkerThreadId = values.get("--worker-thread-id");
    if (values.has("--clear-worker")) ledger.activeWorkerThreadId = null;
  } else if (to === "heartbeat") {
    const required = ["--scheduled-task-id", "--cadence-minutes", "--max-idle-minutes", "--ack-timeout-minutes", "--target-thread-id", "--prompt-sha256", "--verified-at"];
    for (const flag of required) if (!values.has(flag)) throw new Error(`${flag} is required for heartbeat`);
    ledger.scheduledTaskId = values.get("--scheduled-task-id");
    ledger.watcherPolicy = {
      cadenceMinutes: positive(values, "--cadence-minutes"),
      maxIdleMinutes: positive(values, "--max-idle-minutes"),
      acknowledgementTimeoutMinutes: positive(values, "--ack-timeout-minutes"),
    };
    ledger.waitingSince = values.get("--waiting-since") ?? new Date().toISOString();
    ledger.heartbeatTargetThreadId = values.get("--target-thread-id");
    ledger.heartbeatPromptSha256 = values.get("--prompt-sha256");
    ledger.heartbeatVerifiedAt = values.get("--verified-at");
    ledger.phase = "awaiting-github-review";
  } else {
    const reason = values.get("--reason");
    if (!reason?.trim()) throw new Error(`--reason is required for ${to}`);
    ledger.continuationReason = reason.trim();
    if (!(to === "needs-user" && ledger.prUrl === null)) ledger.phase = to;
  }

  ledger.revision += 1;

  const mode = stat.mode & 0o777;
  atomicWrite(file, `${JSON.stringify(ledger, null, 2)}\n`, mode);
  const result = runValidator(file);
  if (result.status !== 0) {
    atomicWrite(file, original, mode);
    throw new Error(`transition failed validation; original restored:\n${result.stdout.trim()}`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, file, continuationMode: to, revision: ledger.revision }, null, 2)}\n`);
  } finally {
    if (lockDescriptor !== undefined) {
      fs.closeSync(lockDescriptor);
      fs.rmSync(lock, { force: true });
    }
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
