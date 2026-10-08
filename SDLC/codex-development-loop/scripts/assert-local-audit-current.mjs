#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyReviewAudit } from "./review-audit-receipt.mjs";

function parseArgs(argv) {
  if (argv.length !== 4 || argv[0] !== "--file" || argv[2] !== "--head-sha" || !path.isAbsolute(argv[1])) {
    throw new Error("Usage: node assert-local-audit-current.mjs --file <absolute-ledger-path> --head-sha <full-current-pr-head-sha>");
  }
  if (!/^[0-9a-f]{40}$/.test(argv[3])) throw new Error("--head-sha must be a full lowercase commit SHA");
  return { file: path.resolve(argv[1]), prHead: argv[3] };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw new Error(`${path.basename(command)} failed to start: ${result.error.message}`);
  return result;
}

try {
  const { file, prHead } = parseArgs(process.argv.slice(2));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const validation = run(process.execPath, [path.join(scriptDir, "validate-ledger.mjs"), "--file", file]);
  if (validation.status !== 0) throw new Error(`Ledger validation failed:\n${validation.stdout.trim()}`);

  const ledger = JSON.parse(fs.readFileSync(file, "utf8"));
  const currentHeadResult = run("git", ["rev-parse", "HEAD"], { cwd: ledger.currentCheckout });
  if (currentHeadResult.status !== 0) {
    throw new Error(currentHeadResult.stderr.trim() || "could not resolve current checkout HEAD");
  }
  const currentHead = currentHeadResult.stdout.trim();
  const { localAudit } = ledger;
  let proofCurrent = true;
  let proofError = null;
  if (localAudit.status === "clean" && localAudit.engine === "codex") {
    try {
      if (!localAudit.outputFile) throw new Error("clean Codex localAudit requires outputFile");
      const checkout = fs.realpathSync(ledger.currentCheckout);
      const outputFile = path.resolve(checkout, localAudit.outputFile);
      const auditRoot = path.join(checkout, "sdlc-scratch", "audits");
      const rootStat = fs.lstatSync(auditRoot);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || fs.realpathSync(auditRoot) !== auditRoot) {
        throw new Error("localAudit audit directory must be a real directory");
      }
      if (path.dirname(outputFile) !== auditRoot) throw new Error("localAudit outputFile must be directly under sdlc-scratch/audits");
      const stat = fs.lstatSync(outputFile);
      if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(outputFile) !== outputFile) {
        throw new Error("localAudit outputFile must be a regular file");
      }
      const transcript = fs.readFileSync(outputFile, "utf8");
      verifyReviewAudit(transcript, {
        promptSha256: localAudit.promptSha256,
        headSha: localAudit.headSha,
        exitCode: localAudit.exitCode,
        codexBin: ledger.runtime.codexBin,
        codexVersion: ledger.runtime.codexVersion,
      });
    } catch (error) {
      proofCurrent = false;
      proofError = error.message;
    }
  }
  const current = localAudit.status === "clean" && localAudit.headSha === currentHead
    && prHead === currentHead && proofCurrent;
  const result = {
    ok: current,
    currentHead,
    prHead,
    auditHead: localAudit.headSha,
    auditStatus: localAudit.status,
    proofCurrent,
    proofError,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!current) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
