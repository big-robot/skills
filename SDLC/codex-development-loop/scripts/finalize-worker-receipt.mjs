#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validateWorkerReceiptShape } from "./worker-receipt.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined || values.has(flag)) throw new Error("Invalid or duplicate option");
    values.set(flag, value);
  }
  for (const flag of ["--repo", "--packet"]) if (!values.has(flag)) throw new Error(`${flag} is required`);
  if (values.size !== 2) throw new Error("Unknown option");
  for (const flag of ["--repo", "--packet"]) {
    if (!path.isAbsolute(values.get(flag))) throw new Error(`${flag} must be absolute`);
  }
  return {
    repo: path.resolve(values.get("--repo")),
    packet: path.resolve(values.get("--packet")),
  };
}

function regularFile(file, label, maxSize) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  if (stat.size > maxSize) throw new Error(`${label} is too large`);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr.trim() || `${command} failed`);
  return result.stdout.trim();
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
  const options = parseArgs(process.argv.slice(2));
  if (!fs.statSync(options.repo).isDirectory()) throw new Error("--repo must be a directory");
  regularFile(options.packet, "worker packet", 16 * 1024);

  run(process.execPath, [
    path.join(scriptDir, "validate-agent-spawn.mjs"),
    "--role", "worker",
    "--fork-turns", "none",
    "--agent-type", "worker",
    "--packet", options.packet,
  ], options.repo);

  const packet = JSON.parse(fs.readFileSync(options.packet, "utf8"));
  options.receipt = path.resolve(packet.receiptPath);
  regularFile(options.receipt, "draft worker receipt", 64 * 1024);
  if (fs.realpathSync(options.repo) !== fs.realpathSync(packet.checkout)) throw new Error("repository does not match worker packet checkout");
  if (packet.runtime.nodeBin !== null && fs.realpathSync(process.execPath) !== fs.realpathSync(packet.runtime.nodeBin)) {
    throw new Error("receipt finalizer is not running under the packet-bound Node runtime");
  }

  const receipt = JSON.parse(fs.readFileSync(options.receipt, "utf8"));
  const hash = validateWorkerReceiptShape(receipt, { expectedPhase: packet.phase, requireHash: false });
  const head = run("git", ["rev-parse", "HEAD"], options.repo);
  const branch = run("git", ["branch", "--show-current"], options.repo);
  if (head !== receipt.localCommitSha) throw new Error("worker receipt does not match live HEAD");
  if (branch !== packet.branch) throw new Error("live branch does not match worker packet branch");
  if (run("git", ["status", "--porcelain"], options.repo)) throw new Error("worktree is not clean");

  const finalized = { ...receipt, receiptSha256: hash };
  const serialized = `${JSON.stringify(finalized, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > 64 * 1024) throw new Error("finalized worker receipt is too large");
  atomicWrite(options.receipt, serialized, 0o600);
  validateWorkerReceiptShape(JSON.parse(fs.readFileSync(options.receipt, "utf8")), { expectedPhase: packet.phase });
  process.stdout.write(`${JSON.stringify(finalized)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
