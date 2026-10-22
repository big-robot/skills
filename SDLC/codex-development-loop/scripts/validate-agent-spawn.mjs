#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WORKER_KEYS = new Set([
  "issueUrl", "prUrl", "checkout", "branch", "expectedBaseOrReviewedHead",
  "expectedReviewedHead", "phase", "localCommitAuthority", "externalMutationProhibited",
  "workerContractPath", "runtime", "receiptPath",
]);
const EXPLORER_KEYS = new Set(["task", "checkout", "readOnly"]);

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined || values.has(flag)) throw new Error("Invalid or duplicate option");
    values.set(flag, value);
  }
  for (const flag of ["--role", "--fork-turns", "--agent-type", "--packet"]) {
    if (!values.has(flag)) throw new Error(`${flag} is required`);
  }
  if (values.size !== 4) throw new Error("Unknown option");
  const role = values.get("--role");
  if (!new Set(["worker", "explorer"]).has(role)) throw new Error("--role must be worker or explorer");
  if (values.get("--fork-turns") !== "none") throw new Error("fork_turns must equal none");
  if (values.get("--agent-type") !== role) throw new Error(`agent_type must equal ${role}`);
  const packet = values.get("--packet");
  if (!path.isAbsolute(packet)) throw new Error("--packet must be absolute");
  return { role, packet };
}

function regularPrivateFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("packet must be a regular non-symlink file");
  if (stat.size > 16 * 1024) throw new Error("packet exceeds 16 KiB");
}

try {
  const { role, packet } = parseArgs(process.argv.slice(2));
  regularPrivateFile(packet);
  const value = JSON.parse(fs.readFileSync(packet, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("packet must be a JSON object");
  const allowed = role === "worker" ? WORKER_KEYS : EXPLORER_KEYS;
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`packet field ${key} is not allowed for ${role}`);
  for (const forbidden of ["ledger", "history", "controllerHistory", "findings", "githubMutationAuthority"]) {
    if (Object.hasOwn(value, forbidden)) throw new Error(`packet field ${forbidden} is prohibited`);
  }
  if (role === "worker") {
    for (const key of ["checkout", "branch", "phase", "localCommitAuthority", "externalMutationProhibited", "workerContractPath", "runtime", "receiptPath"]) {
      if (!Object.hasOwn(value, key)) throw new Error(`worker packet requires ${key}`);
    }
    if (!path.isAbsolute(value.checkout)) throw new Error("worker checkout must be absolute");
    if (!new Set(["implementation", "correction"]).has(value.phase)) throw new Error("worker phase is invalid");
    if (value.localCommitAuthority !== true || value.externalMutationProhibited !== true) {
      throw new Error("worker authority flags must be true");
    }
    const expectedContract = fileURLToPath(new URL("../references/worker-contracts.md", import.meta.url));
    if (value.workerContractPath !== expectedContract) throw new Error(`worker workerContractPath must equal ${expectedContract}`);
    const contractStat = fs.lstatSync(value.workerContractPath);
    if (!contractStat.isFile() || contractStat.isSymbolicLink()) throw new Error("worker workerContractPath must be a regular non-symlink file");
    if (!value.runtime || typeof value.runtime !== "object" || Array.isArray(value.runtime)) throw new Error("worker runtime must be an object");
    for (const key of Object.keys(value.runtime)) {
      if (!new Set(["nodeBin", "codexBin", "codexVersion"]).has(key)) throw new Error(`worker runtime field ${key} is not allowed`);
    }
    for (const key of ["nodeBin", "codexBin", "codexVersion"]) {
      if (!Object.hasOwn(value.runtime, key)) throw new Error(`worker runtime requires ${key}`);
    }
    if (!(value.runtime.nodeBin === null || (typeof value.runtime.nodeBin === "string" && path.isAbsolute(value.runtime.nodeBin)))) {
      throw new Error("worker runtime.nodeBin must be null or an absolute path");
    }
    if (value.runtime.nodeBin !== null) {
      const nodeStat = fs.lstatSync(value.runtime.nodeBin);
      if (!nodeStat.isFile() || nodeStat.isSymbolicLink()) throw new Error("worker runtime.nodeBin must be a regular non-symlink file");
    }
    const codexRuntimeAbsent = value.runtime.codexBin === null && value.runtime.codexVersion === null;
    const codexRuntimePresent = typeof value.runtime.codexBin === "string" && path.isAbsolute(value.runtime.codexBin)
      && typeof value.runtime.codexVersion === "string" && value.runtime.codexVersion.trim().length > 0;
    if (!codexRuntimeAbsent && !codexRuntimePresent) {
      throw new Error("worker runtime codexBin and codexVersion must both be null or pinned values");
    }
    if (codexRuntimePresent) {
      const codexStat = fs.lstatSync(value.runtime.codexBin);
      if (!codexStat.isFile() || codexStat.isSymbolicLink()) throw new Error("worker runtime.codexBin must be a regular non-symlink file");
      fs.accessSync(value.runtime.codexBin, fs.constants.X_OK);
    }
    if (typeof value.receiptPath !== "string" || !path.isAbsolute(value.receiptPath)) throw new Error("worker receiptPath must be absolute");
    const relativeToTemp = path.relative(path.resolve(os.tmpdir()), path.resolve(value.receiptPath));
    if (relativeToTemp.startsWith("..") || path.isAbsolute(relativeToTemp) || relativeToTemp.length === 0) {
      throw new Error("worker receiptPath must be inside the OS temporary directory");
    }
    if (fs.existsSync(value.receiptPath)) {
      const receiptStat = fs.lstatSync(value.receiptPath);
      if (!receiptStat.isFile() || receiptStat.isSymbolicLink()) throw new Error("worker receiptPath must resolve to a regular non-symlink file");
    }
    if (value.phase === "implementation" && (!value.issueUrl || !value.expectedBaseOrReviewedHead)) {
      throw new Error("implementation packet requires issueUrl and expectedBaseOrReviewedHead");
    }
    if (value.phase === "correction" && (!value.prUrl || !value.expectedReviewedHead)) {
      throw new Error("correction packet requires prUrl and expectedReviewedHead");
    }
  } else {
    if (typeof value.task !== "string" || !value.task.trim()) throw new Error("explorer packet requires a bounded task");
    if (!path.isAbsolute(value.checkout)) throw new Error("explorer checkout must be absolute");
    if (value.readOnly !== true) throw new Error("explorer packet must set readOnly true");
  }
  process.stdout.write(`${JSON.stringify({ ok: true, role, forkTurns: "none", agentType: role })}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
