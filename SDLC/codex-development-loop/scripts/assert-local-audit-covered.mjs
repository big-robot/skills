#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyReviewAudit } from "./review-audit-receipt.mjs";

function parseArgs(argv) {
  if (argv.length !== 4 || argv[0] !== "--file" || argv[2] !== "--head-sha" || !path.isAbsolute(argv[1])) {
    throw new Error("Usage: node assert-local-audit-covered.mjs --file <absolute-ledger-path> --head-sha <full-current-pr-head-sha>");
  }
  if (!/^[0-9a-f]{40}$/.test(argv[3])) throw new Error("--head-sha must be a full lowercase commit SHA");
  return { file: path.resolve(argv[1]), prHead: argv[3] };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw new Error(`${path.basename(command)} failed to start: ${result.error.message}`);
  return result;
}

function verifyCodexTranscript(ledger, localAudit) {
  if (!localAudit.outputFile) throw new Error("completed Codex localAudit requires outputFile");
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
}

try {
  const { file, prHead } = parseArgs(process.argv.slice(2));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const validation = run(process.execPath, [path.join(scriptDir, "validate-ledger.mjs"), "--file", file]);
  if (validation.status !== 0) throw new Error(`Ledger validation failed:\n${validation.stdout.trim()}`);

  const ledger = JSON.parse(fs.readFileSync(file, "utf8"));
  const head = run("git", ["rev-parse", "HEAD"], { cwd: ledger.currentCheckout });
  if (head.status !== 0) throw new Error(head.stderr.trim() || "could not resolve current checkout HEAD");
  const currentHead = head.stdout.trim();
  const { localAudit } = ledger;
  const completed = new Set(["clean", "findings"]).has(localAudit.status) && localAudit.headSha !== null;

  let proofValid = true;
  let proofError = null;
  if (completed && localAudit.engine === "codex") {
    try {
      verifyCodexTranscript(ledger, localAudit);
    } catch (error) {
      proofValid = false;
      proofError = error.message;
    }
  }

  let ancestor = false;
  if (completed) {
    const ancestry = run("git", ["merge-base", "--is-ancestor", localAudit.headSha, currentHead], { cwd: ledger.currentCheckout });
    ancestor = ancestry.status === 0;
    if (ancestry.status !== 0 && ancestry.status !== 1) {
      proofValid = false;
      proofError = ancestry.stderr.trim() || "could not verify local audit ancestry";
    }
  }

  const covered = completed && prHead === currentHead && ancestor && proofValid;
  const result = {
    ok: covered,
    currentHead,
    prHead,
    auditHead: localAudit.headSha,
    auditStatus: localAudit.status,
    ancestor,
    proofValid,
    proofError,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!covered) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
