#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  createReviewAuditReceipt,
  serializeReviewAudit,
  sha256,
} from "./review-audit-receipt.mjs";
import { compactTokenUsage, reviewUsageEvidence } from "./token-usage.mjs";

const MAX_BUFFER = 64 * 1024 * 1024;
const REVIEW_COMMAND = ["exec", "--ephemeral", "--sandbox", "read-only", "review", "--json", "-"];

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!new Set(["--repo", "--base-ref", "--brief", "--output", "--codex-bin", "--expected-codex-version"]).has(flag) || !value) {
      throw new Error("Usage: node run-codex-review.mjs --repo <absolute-repo> --base-ref <ref> --brief <path> --output <path> --codex-bin <absolute-path> --expected-codex-version <version>");
    }
    if (values.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
    values.set(flag, value);
  }
  if (values.size !== 6 || !path.isAbsolute(values.get("--repo")) || !path.isAbsolute(values.get("--codex-bin"))) {
    throw new Error("Usage: node run-codex-review.mjs --repo <absolute-repo> --base-ref <ref> --brief <path> --output <path> --codex-bin <absolute-path> --expected-codex-version <version>");
  }
  const repo = fs.realpathSync(path.resolve(values.get("--repo")));
  if (!fs.statSync(repo).isDirectory()) throw new Error("--repo must be a directory");
  const codexBin = fs.realpathSync(path.resolve(values.get("--codex-bin")));
  const codexStat = fs.lstatSync(codexBin);
  if (!codexStat.isFile() || codexStat.isSymbolicLink()) throw new Error("--codex-bin must resolve to a regular file");
  fs.accessSync(codexBin, fs.constants.X_OK);
  return {
    repo,
    baseRef: values.get("--base-ref"),
    brief: values.get("--brief"),
    output: values.get("--output"),
    codexBin,
    expectedCodexVersion: values.get("--expected-codex-version"),
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: MAX_BUFFER, ...options });
  if (result.error) throw new Error(`${path.basename(command)} failed to start: ${result.error.message}`);
  return result;
}

function git(repo, args) {
  const result = run("git", args, { cwd: repo });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args[0]} failed`);
  return result.stdout.trim();
}

function resolveAuditPath(repo, supplied, label) {
  const resolved = path.resolve(repo, supplied);
  const auditRoot = path.join(repo, "sdlc-scratch", "audits");
  const rootStat = fs.lstatSync(auditRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || fs.realpathSync(auditRoot) !== auditRoot) {
    throw new Error("<repo>/sdlc-scratch/audits must be a real directory, not a symlink");
  }
  if (path.dirname(resolved) !== auditRoot) {
    throw new Error(`${label} must resolve directly under <repo>/sdlc-scratch/audits`);
  }
  return resolved;
}

function assertRegularFile(file, label) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(file) !== file) {
    throw new Error(`${label} must be a regular file, not a symlink`);
  }
}

function sanitizeAuditText(value) {
  return value
    .replace(/([?&][A-Za-z0-9_-]*(?:api[_-]?key|access[_-]?token|auth(?:orization)?|token|secret|password|passwd|signature|sig|credential)[A-Za-z0-9_-]*=)[^&#\s"'<>]+/gi, "$1[REDACTED]")
    .replace(/((?:authorization|x-api-key|api-key)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]");
}

function reportedUsage(stdout) {
  const { usage } = reviewUsageEvidence(stdout);
  return usage === null ? null : compactTokenUsage(usage);
}

function writeAtomic(file, value) {
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) {
    throw new Error("output must not be a symlink");
  }
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  try {
    fs.writeFileSync(temporary, value, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

try {
  const { repo, baseRef, brief, output, codexBin, expectedCodexVersion } = parseArgs(process.argv.slice(2));
  const briefFile = resolveAuditPath(repo, brief, "brief");
  const outputFile = resolveAuditPath(repo, output, "output");
  if (briefFile === outputFile) throw new Error("brief and output must be different files");
  assertRegularFile(briefFile, "brief");

  const statusBefore = git(repo, ["status", "--porcelain"]);
  if (statusBefore) throw new Error("implementation tree must be clean before local review");
  const before = {
    baseSha: git(repo, ["rev-parse", "--verify", "--end-of-options", `${baseRef}^{commit}`]),
    headSha: git(repo, ["rev-parse", "HEAD"]),
    treeSha: git(repo, ["rev-parse", "HEAD^{tree}"]),
  };
  const briefBytes = fs.readFileSync(briefFile);
  if (briefBytes.length === 0) throw new Error("review brief must not be empty");
  const promptSha256 = sha256(briefBytes);
  const briefText = briefBytes.toString("utf8");
  const taggedPrompt = `CDL_REVIEW_BRIEF_SHA256: ${promptSha256}\nCDL_REVIEW_BASE_SHA: ${before.baseSha}\nCDL_REVIEW_HEAD_SHA: ${before.headSha}\n\nReview only the committed diff from the exact base SHA to the exact HEAD SHA above. Inspect only the repository context needed to validate that diff. Follow the supplied review brief below. Do not edit files.\n\n${briefText}`;
  const inputSha256 = sha256(taggedPrompt);
  const version = run(codexBin, ["--version"], { cwd: repo });
  if (version.status !== 0) throw new Error(version.stderr.trim() || "pinned Codex CLI version check failed");
  const codexVersion = version.stdout.trim();
  if (codexVersion !== expectedCodexVersion) {
    throw new Error(`pinned Codex CLI version changed: expected ${expectedCodexVersion}, found ${codexVersion || "empty"}`);
  }
  const review = run(codexBin, REVIEW_COMMAND, {
    cwd: repo,
    input: taggedPrompt,
    env: process.env,
  });
  const transcriptStdout = review.stdout ?? "";
  const rawTranscript = `${transcriptStdout}${transcriptStdout && review.stderr ? "\n" : ""}${review.stderr || ""}`;
  const sanitizedTranscript = sanitizeAuditText(rawTranscript);
  if (review.status !== 0) {
    writeAtomic(outputFile, sanitizedTranscript);
    throw new Error(`local review exited nonzero (${review.status ?? "signal"})`);
  }

  const after = {
    baseSha: git(repo, ["rev-parse", "--verify", "--end-of-options", `${baseRef}^{commit}`]),
    headSha: git(repo, ["rev-parse", "HEAD"]),
    treeSha: git(repo, ["rev-parse", "HEAD^{tree}"]),
    promptSha256: sha256(fs.readFileSync(briefFile)),
    clean: git(repo, ["status", "--porcelain"]) === "",
  };
  if (before.baseSha !== after.baseSha || before.headSha !== after.headSha || before.treeSha !== after.treeSha
    || promptSha256 !== after.promptSha256 || !after.clean) {
    writeAtomic(outputFile, sanitizedTranscript);
    throw new Error("local review provenance changed while review was running");
  }

  const usage = reportedUsage(review.stdout || "");
  const normalizedTranscript = sanitizedTranscript.endsWith("\n") ? sanitizedTranscript : `${sanitizedTranscript}\n`;
  writeAtomic(outputFile, normalizedTranscript);
  const receipt = createReviewAuditReceipt({
    baseRef,
    ...before,
    briefSha256: promptSha256,
    inputSha256,
    codexBin,
    codexVersion,
    command: REVIEW_COMMAND,
    exitCode: review.status,
    transcript: normalizedTranscript,
    usage,
    usageCapturedAt: new Date().toISOString(),
  });
  writeAtomic(outputFile, serializeReviewAudit(normalizedTranscript, receipt));

  process.stdout.write(`${JSON.stringify({
    ok: true,
    baseRef,
    ...before,
    promptSha256,
    inputSha256,
    codexBin,
    codexVersion,
    receiptSha256: receipt.receiptSha256,
    exitCode: review.status,
    outputFile: path.relative(repo, outputFile),
    usage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
