#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isValidManualReviewBasis, validateLedger } from "./validate-ledger.mjs";
import { SHA_RE, validateWorkerReceiptShape } from "./worker-receipt.mjs";
import { isReviewRequestBody, reviewRequestBody } from "./review-request.mjs";
import { automaticReviewEvidence, readReviewSnapshot } from "./watch-pr.mjs";

const OPERATIONS = new Set(["verify-worker-return", "adopt-review", "request-review", "reconcile-review-request", "classify-review", "merge-child", "prepare-parent-approval", "merge-parent"]);
const EXIT = { ready: 0, waiting: 10, human: 20, conflict: 30, tool: 40 };
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function fail(message, code = EXIT.conflict) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined || values.has(flag)) fail("Invalid or duplicate option");
    values.set(flag, value);
  }
  const allowed = new Set(["--repo", "--ledger", "--expected-revision", "--operation", "--issue", "--pr", "--expected-head", "--worker-receipt", "--approval-head", "--manual-review-basis"]);
  for (const flag of values.keys()) if (!allowed.has(flag)) fail(`unknown option: ${flag}`);
  for (const flag of ["--repo", "--ledger", "--expected-revision", "--operation", "--issue"]) if (!values.has(flag)) fail(`${flag} is required`);
  const repo = path.resolve(values.get("--repo"));
  const ledger = values.get("--ledger");
  if (!path.isAbsolute(ledger)) fail("--ledger must be absolute");
  const operation = values.get("--operation");
  if (!OPERATIONS.has(operation)) fail("--operation is invalid");
  const manualReviewBasis = values.get("--manual-review-basis");
  if (values.has("--manual-review-basis") && (operation !== "request-review" || !isValidManualReviewBasis(manualReviewBasis))) {
    fail("--manual-review-basis is request-review-only and must be nonblank and no larger than 1024 UTF-8 bytes");
  }
  const revision = Number(values.get("--expected-revision"));
  const issue = Number(values.get("--issue"));
  if (!Number.isSafeInteger(revision) || revision < 0) fail("--expected-revision is invalid");
  if (!Number.isSafeInteger(issue) || issue <= 0) fail("--issue is invalid");
  const pr = values.has("--pr") ? Number(values.get("--pr")) : null;
  if (pr !== null && (!Number.isSafeInteger(pr) || pr <= 0)) fail("--pr is invalid");
  const expectedHead = values.get("--expected-head") ?? null;
  if (expectedHead !== null && !SHA_RE.test(expectedHead)) fail("--expected-head must be a full lowercase SHA");
  return { repo, ledger: path.resolve(ledger), manualReviewBasis, operation, revision, issue, pr, expectedHead, workerReceipt: values.get("--worker-receipt"), approvalHead: values.get("--approval-head") };
}

function run(command, args, cwd, code = EXIT.tool) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) fail(result.error?.message || result.stderr.trim() || `${command} failed`, code);
  return result.stdout.trim();
}

function readLedger(options) {
  const stat = fs.lstatSync(options.ledger);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("ledger must be a regular non-symlink file");
  run(process.execPath, [path.join(scriptDir, "validate-ledger.mjs"), "--file", options.ledger], options.repo);
  const ledger = JSON.parse(fs.readFileSync(options.ledger, "utf8"));
  if (ledger.revision !== options.revision) fail(`revision conflict: expected ${options.revision}, found ${ledger.revision}`);
  if (ledger.issueNumber !== options.issue) fail("issue does not match ledger");
  if (options.pr !== null && !ledger.prUrl.endsWith(`/pull/${options.pr}`)) fail("PR does not match ledger");
  return ledger;
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

function verifyWorkerReceipt(options, ledger) {
  if (ledger.continuationMode !== "controller-turn") fail("Worker return verification requires controller-turn ownership");
  if (!options.workerReceipt || !path.isAbsolute(options.workerReceipt)) fail("--worker-receipt must be absolute");
  const stat = fs.lstatSync(options.workerReceipt);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) fail("worker receipt must be a regular file no larger than 64 KiB");
  const receipt = JSON.parse(fs.readFileSync(options.workerReceipt, "utf8"));
  let suppliedHash;
  try {
    validateWorkerReceiptShape(receipt, { expectedPhase: ledger.phase });
    suppliedHash = receipt.receiptSha256;
  } catch (error) {
    fail(error.message);
  }
  const head = run("git", ["rev-parse", "HEAD"], options.repo);
  if (fs.realpathSync(options.repo) !== fs.realpathSync(ledger.currentCheckout)) fail("repository does not match ledger currentCheckout");
  const branch = run("git", ["branch", "--show-current"], options.repo);
  if (branch !== ledger.branch) fail("live branch does not match ledger branch");
  if (head !== receipt.localCommitSha || (options.expectedHead && head !== options.expectedHead)) fail("worker receipt does not match live HEAD");
  if (run("git", ["status", "--porcelain"], options.repo)) fail("worktree is not clean");
  if (receipt.reviewTier !== "trivial") {
    run(process.execPath, [path.join(scriptDir, "assert-local-audit-covered.mjs"), "--file", options.ledger, "--head-sha", head], options.repo);
  }
  return baseReceipt(options, ledger, { headSha: head, classification: "ready", permittedNextTransition: "push-candidate", workerReceiptSha256: suppliedHash });
}

function githubRepo(ledger) {
  const match = ledger.prUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+$/);
  if (!match) fail("ledger prUrl must be a canonical github.com URL");
  return match[1];
}

function ghJson(args, cwd) {
  const ghBin = process.env.CODEX_DEVELOPMENT_LOOP_TEST === "1" && process.env.CDL_GH_BIN ? process.env.CDL_GH_BIN : "gh";
  return JSON.parse(run(ghBin, args, cwd));
}

function prSnapshot(options, ledger) {
  if (options.pr === null || !options.expectedHead) fail("operation requires --pr and --expected-head");
  const repo = githubRepo(ledger);
  const pr = ghJson(["pr", "view", String(options.pr), "--repo", repo, "--json", "number,state,headRefName,headRefOid,baseRefName,baseRefOid,mergeable,mergedAt,url,statusCheckRollup"], options.repo);
  if (pr.number !== options.pr || pr.headRefOid !== options.expectedHead) fail("pull request head or identity drifted");
  const expectedBase = ledger.mergePolicy === "auto-child" ? ledger.parentBranch : ledger.baseRef.replace(/^origin\//, "");
  if (pr.headRefName !== ledger.branch || pr.baseRefName !== expectedBase) fail("pull request branch or target drifted");
  return { repo, pr };
}

function baseReceipt(options, ledger, extra = {}) {
  return {
    operation: options.operation,
    ledgerRevision: ledger.revision,
    issue: options.issue,
    pr: options.pr,
    baseRef: ledger.baseRef,
    baseSha: null,
    headSha: options.expectedHead,
    checks: "unknown",
    review: "unknown",
    unresolvedThreads: null,
    missingDispositions: null,
    mergeability: "unknown",
    classification: "needs-human",
    permittedNextTransition: null,
    ...extra,
  };
}

function classify(options, ledger) {
  const { pr } = prSnapshot(options, ledger);
  const request = ledger.codexReviewRequests.at(-1);
  if (ledger.automaticReview ? ledger.automaticReview.headSha !== options.expectedHead
    : !request || request.headSha !== options.expectedHead || !/^\d+$/.test(String(request.commentId))) {
    fail("latest review request is not bound to the expected head");
  }
  const result = spawnSync(process.execPath, [path.join(scriptDir, "watch-pr.mjs"), "--file", options.ledger, "--once"], { cwd: options.repo, encoding: "utf8" });
  if (![0, 2].includes(result.status)) fail(result.stderr.trim() || "review classification failed", EXIT.tool);
  const state = JSON.parse(result.stdout.trim());
  const mapping = {
    clean: ["ready", "ready-for-merge"], dispositions_complete: ["ready", "ready-for-merge"], findings: ["correction-required", "disposition-or-correction"],
    pending: ["still-waiting", "wait"], acknowledged: ["still-waiting", "wait"], github_unavailable: ["still-waiting", "retry-watch"],
    checks_failed: ["needs-human", "repair-checks"], ambiguous: ["needs-human", "inspect-evidence"], head_drift: ["needs-human", "reconcile-head"],
    pr_closed: ["needs-human", "reconcile-pr"], pr_merged: ["needs-human", "reconcile-merge"],
  };
  const [classification, next] = mapping[state.state] ?? ["needs-human", "inspect-evidence"];
  const receipt = baseReceipt(options, ledger, {
    baseSha: pr.baseRefOid ?? null,
    headSha: state.observedHeadSha ?? options.expectedHead,
    checks: ["clean", "dispositions_complete", "findings"].includes(state.state) ? "passing" : state.state === "checks_failed" ? "failing" : "pending-or-unknown",
    review: state.state === "clean" ? "clean-exact-head" : state.state === "dispositions_complete" ? "dispositions-complete-exact-head" : state.state === "findings" ? "findings-exact-head" : state.state,
    unresolvedThreads: state.unresolvedThreads ?? null,
    missingDispositions: state.missingDispositions ?? null,
    mergeability: String(pr.mergeable ?? "unknown").toLowerCase(),
    classification,
    permittedNextTransition: next,
  });
  return { receipt, exitCode: classification === "ready" ? EXIT.ready : classification === "still-waiting" ? EXIT.waiting : EXIT.human };
}

function transitionLedger(options, to, extra) {
  const args = [path.join(scriptDir, "transition-ledger.mjs"), "--file", options.ledger, "--to", to, "--expected-revision", String(options.revision), ...extra];
  return JSON.parse(run(process.execPath, args, options.repo));
}

function acquireLedgerLock(options) {
  const lock = `${options.ledger}.lock`;
  let descriptor;
  try {
    descriptor = fs.openSync(lock, "wx", 0o600);
  } catch (error) {
    fail(error.code === "EEXIST" ? "ledger lock is already owned by another Controller" : error.message, EXIT.tool);
  }
  return () => {
    fs.closeSync(descriptor);
    fs.rmSync(lock, { force: true });
  };
}

function readLockedLedger(options, expectedLedger) {
  const stat = fs.lstatSync(options.ledger);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("ledger must be a regular non-symlink file");
  run(process.execPath, [path.join(scriptDir, "validate-ledger.mjs"), "--file", options.ledger], options.repo);
  const ledger = JSON.parse(fs.readFileSync(options.ledger, "utf8"));
  if (ledger.revision !== options.revision) fail(`revision conflict: expected ${options.revision}, found ${ledger.revision}`);
  if (ledger.issueNumber !== options.issue || ledger.prUrl !== expectedLedger.prUrl || ledger.branch !== expectedLedger.branch) {
    fail("ledger identity drifted while acquiring review-request ownership");
  }
  return { ledger, mode: stat.mode & 0o777 };
}

function validateCandidate(options, ledger) {
  const errors = validateLedger(options.ledger, ledger);
  if (errors.length) fail(`candidate ledger is invalid: ${errors.join("; ")}`);
}

function assertReviewOwnership(options, ledger) {
  if (ledger.activeWorkerThreadId !== null) {
    fail("reconcile native terminal Worker state, task, branch, tree and commits, then use transition-ledger --clear-worker true before requesting review");
  }
  if (ledger.continuationMode !== "controller-turn") fail("review requests require controller-turn ownership");
  validateCandidate(options, { ...ledger, phase: "awaiting-github-review" });
}

function writeLockedLedger(options, ledger, mode, expectedOnDiskRevision) {
  validateCandidate(options, ledger);
  const onDisk = JSON.parse(fs.readFileSync(options.ledger, "utf8"));
  if (onDisk.revision !== expectedOnDiskRevision) {
    fail(`revision conflict while holding review-request ownership: expected ${expectedOnDiskRevision}, found ${onDisk.revision}`);
  }
  atomicWrite(options.ledger, `${JSON.stringify(ledger, null, 2)}\n`, mode);
  return JSON.parse(fs.readFileSync(options.ledger, "utf8"));
}

function reviewRequestReadback(options, repo, pending) {
  if (!pending.commentId) fail("pending review request has no remote comment ID; use reconcile-review-request", EXIT.tool);
  const readback = ghJson(["api", `repos/${repo}/issues/comments/${pending.commentId}`], options.repo);
  if (String(readback.id) !== String(pending.commentId)
    || !isReviewRequestBody(readback.body, pending.operationId)
    || readback.user?.login !== pending.actorLogin
    || !Number.isFinite(Date.parse(readback.created_at ?? ""))) {
    fail("review request readback failed", EXIT.tool);
  }
  return readback;
}

function reviewWaitingReceipt(options, ledger, pr, commentId) {
  return baseReceipt(options, ledger, { ledgerRevision: ledger.revision, baseSha: pr.baseRefOid ?? null, headSha: pr.headRefOid, mergeability: String(pr.mergeable ?? "unknown").toLowerCase(), classification: "still-waiting", permittedNextTransition: "watch-review", reviewRequestCommentId: String(commentId) });
}

function discoverReview(options, ledger, repo) {
  const snapshot = readReviewSnapshot({ repository: repo, prNumber: options.pr, expectedHeadSha: options.expectedHead,
    checkout: ledger.currentCheckout, expectedChecks: ledger.expectedChecks });
  if (snapshot.githubError) fail(`automatic review discovery failed: ${snapshot.githubError}`, EXIT.tool);
  if (snapshot.state !== "OPEN" || snapshot.headSha !== options.expectedHead) fail("pull request head or state drifted during review discovery");
  if (snapshot.observedPrNumber !== options.pr || snapshot.observedPrUrl !== ledger.prUrl) fail("pull request identity drifted during review discovery");
  const expectedBase = ledger.mergePolicy === "auto-child" ? ledger.parentBranch : ledger.baseRef.replace(/^origin\//, "");
  if (snapshot.headRefName !== ledger.branch || snapshot.baseRefName !== expectedBase
    || snapshot.baseRepositoryNameWithOwner !== repo) fail("pull request branch or target drifted during review discovery");
  const evidence = automaticReviewEvidence(snapshot);
  if (evidence.state === "unknown") fail("automatic review evidence is incomplete or ambiguous; inspect evidence before requesting review", EXIT.human);
  return { snapshot, evidence };
}

// Caller owns the ledger lock; request-review reuses adoption without reacquiring it.
function adoptLockedReview(options, ledger, mode, actor, snapshot, evidence) {
  ledger.automaticReview = { headSha: options.expectedHead, dispositionActorLogin: actor.login,
    observedAt: snapshot.observedAt, evidenceRef: evidence.evidenceRef };
  ledger.phase = "awaiting-github-review";
  ledger.revision += 1;
  const persisted = writeLockedLedger(options, ledger, mode, options.revision);
  return classify({ ...options, revision: persisted.revision }, persisted);
}

function adoptReview(options, initialLedger) {
  const release = acquireLedgerLock(options);
  try {
    const { ledger, mode } = readLockedLedger(options, initialLedger);
    assertReviewOwnership(options, ledger);
    const { repo, pr } = prSnapshot(options, ledger);
    if (pr.state !== "OPEN") fail("review adoption requires an open pull request");
    if (ledger.pendingReviewRequest) fail("pending review request requires reconcile-review-request before adoption", EXIT.tool);
    const { snapshot, evidence } = discoverReview(options, ledger, repo);
    if (evidence.state === "absent") {
      return { receipt: baseReceipt(options, ledger, { classification: "still-waiting", review: "no-current-head-evidence",
        permittedNextTransition: "discover-review" }), exitCode: EXIT.waiting };
    }
    const actor = ghJson(["api", "user"], options.repo);
    if (typeof actor.login !== "string" || !actor.login.trim()) fail("review disposition actor identity is unavailable", EXIT.tool);
    const current = prSnapshot(options, ledger);
    if (current.pr.state !== "OPEN") fail("review adoption requires an open pull request");
    return adoptLockedReview(options, ledger, mode, actor, snapshot, evidence);
  } finally {
    release();
  }
}

function finalizePendingReview(options, repo, pr, ledger, mode) {
  assertReviewOwnership(options, ledger);
  const pending = ledger.pendingReviewRequest;
  const readback = reviewRequestReadback(options, repo, pending);
  ({ pr } = prSnapshot(options, ledger));
  if (pr.state !== "OPEN") fail("review request requires an open pull request");
  if (ledger.codexReviewRequests.some((entry) => entry.headSha === pending.headSha)) fail("exact head already has a review request");
  ledger.codexReviewRequests.push({ headSha: pending.headSha, commentId: String(readback.id), requestedAt: readback.created_at, eyesConfirmed: false,
    ...(pending.manualReviewBasis !== undefined ? { manualReviewBasis: pending.manualReviewBasis } : {}) });
  ledger.pendingReviewRequest = null;
  ledger.automaticReview = null;
  ledger.phase = "awaiting-github-review";
  ledger.revision += 1;
  const persisted = writeLockedLedger(options, ledger, mode, ledger.revision - 1);
  if (persisted.codexReviewRequests.at(-1)?.commentId !== String(readback.id) || persisted.pendingReviewRequest !== null) {
    fail("review-request ledger readback failed", EXIT.tool);
  }
  return reviewWaitingReceipt(options, persisted, pr, readback.id);
}

function requestReview(options, initialLedger) {
  const release = acquireLedgerLock(options);
  try {
    const { ledger, mode } = readLockedLedger(options, initialLedger);
    assertReviewOwnership(options, ledger);
    const { repo, pr } = prSnapshot(options, ledger);
    if (pr.state !== "OPEN") fail("review request requires an open pull request");
    if (ledger.codexReviewRequests.some((entry) => entry.headSha === options.expectedHead)) fail("exact head already has a review request");
    if (ledger.pendingReviewRequest) fail("pending review request requires reconcile-review-request before any retry", EXIT.tool);
    const actor = ghJson(["api", "user"], options.repo);
    if (typeof actor.login !== "string" || actor.login.trim().length === 0) fail("review-request actor identity is unavailable", EXIT.tool);
    const beforePost = prSnapshot(options, ledger);
    if (beforePost.pr.state !== "OPEN") fail("review request requires an open pull request");
    readLockedLedger(options, ledger);
    // This is the last remote read before persisting POST intent and issuing the request.
    const { snapshot, evidence } = discoverReview(options, ledger, repo);
    if (evidence.state !== "absent") return adoptLockedReview(options, ledger, mode, actor, snapshot, evidence);
    if (options.manualReviewBasis === undefined) {
      fail("absent review evidence requires --manual-review-basis attesting source-backed trigger inapplicability or reconciled recovery", EXIT.human);
    }
    ledger.pendingReviewRequest = {
      manualReviewBasis: options.manualReviewBasis,
      headSha: options.expectedHead,
      operationId: randomUUID(),
      actorLogin: actor.login,
      requestedAt: new Date().toISOString(),
      state: "posting",
    };
    ledger.revision += 1;
    let persisted = writeLockedLedger(options, ledger, mode, options.revision);
    readLockedLedger({ ...options, revision: persisted.revision }, persisted);
    const created = ghJson(["api", `repos/${repo}/issues/${options.pr}/comments`, "--method", "POST", "-f", `body=${reviewRequestBody(persisted.pendingReviewRequest.operationId)}`], options.repo);
    if (!/^\d+$/.test(String(created.id))) fail("review request POST did not return a numeric comment ID", EXIT.tool);
    persisted.pendingReviewRequest = { ...persisted.pendingReviewRequest, state: "posted", commentId: String(created.id) };
    persisted.revision += 1;
    persisted = writeLockedLedger(options, persisted, mode, persisted.revision - 1);
    return { receipt: finalizePendingReview(options, repo, pr, persisted, mode), exitCode: EXIT.ready };
  } finally {
    release();
  }
}

function reconcileReviewRequest(options, initialLedger) {
  const release = acquireLedgerLock(options);
  try {
    const { ledger, mode } = readLockedLedger(options, initialLedger);
    const { repo, pr } = prSnapshot(options, ledger);
    const pending = ledger.pendingReviewRequest;
    if (!pending) {
      const completed = ledger.codexReviewRequests.at(-1);
      if (ledger.phase !== "awaiting-github-review" || !completed || completed.headSha !== options.expectedHead) {
        fail("no pending or completed review request is bound to the expected head");
      }
      const actor = ghJson(["api", "user"], options.repo);
      const readback = reviewRequestReadback(options, repo, { commentId: completed.commentId, actorLogin: actor.login });
      if (!actor.login || readback.created_at !== completed.requestedAt) fail("completed review request readback failed", EXIT.tool);
      const current = prSnapshot(options, ledger);
      if (current.pr.state !== "OPEN") fail("review request requires an open pull request");
      readLockedLedger(options, ledger);
      return reviewWaitingReceipt(options, ledger, current.pr, completed.commentId);
    }
    if (pending.headSha !== options.expectedHead) fail("no pending review request is bound to the expected head");
    assertReviewOwnership(options, ledger);
    if (pending.state === "posting") {
      const comments = ghJson(["api", `repos/${repo}/issues/${options.pr}/comments?per_page=100`], options.repo);
      if (!Array.isArray(comments)) fail("review-request reconciliation did not return a comment list", EXIT.tool);
      const matches = comments.filter((comment) => comment.user?.login === pending.actorLogin
        && isReviewRequestBody(comment.body, pending.operationId)
        && Number.isFinite(Date.parse(comment.created_at ?? "")));
      if (matches.length !== 1) fail("pending review request remains uncertain; no retry POST is permitted", EXIT.tool);
      ledger.pendingReviewRequest = { ...pending, state: "posted", commentId: String(matches[0].id) };
      ledger.revision += 1;
      return finalizePendingReview(options, repo, pr, writeLockedLedger(options, ledger, mode, ledger.revision - 1), mode);
    }
    return finalizePendingReview(options, repo, pr, ledger, mode);
  } finally {
    release();
  }
}

function expectedLifecycleLabel(ledger, terminalMerge) {
  return terminalMerge && ledger.runMode === "parent-ticket" ? "in-progress" : "ready-for-agent";
}

function issueSnapshot(options, repo) {
  const issue = ghJson(["issue", "view", String(options.issue), "--repo", repo, "--json", "number,state,url,labels"], options.repo);
  if (issue.number !== options.issue || !Array.isArray(issue.labels)) fail("issue identity or labels are unavailable", EXIT.tool);
  return issue;
}

function completeIssue(options, repo, expectedLabel) {
  let issue = issueSnapshot(options, repo);
  if (issue.state !== "CLOSED") run(process.env.CODEX_DEVELOPMENT_LOOP_TEST === "1" && process.env.CDL_GH_BIN ? process.env.CDL_GH_BIN : "gh", ["issue", "close", String(options.issue), "--repo", repo], options.repo);
  issue = issueSnapshot(options, repo);
  if (issue.labels.some((label) => label.name === expectedLabel)) {
    run(process.env.CODEX_DEVELOPMENT_LOOP_TEST === "1" && process.env.CDL_GH_BIN ? process.env.CDL_GH_BIN : "gh", ["issue", "edit", String(options.issue), "--repo", repo, "--remove-label", expectedLabel], options.repo);
  }
  issue = issueSnapshot(options, repo);
  if (issue.state !== "CLOSED") fail("issue closure readback failed", EXIT.tool);
  if (issue.labels.some((label) => label.name === expectedLabel)) fail(`issue lifecycle label ${expectedLabel} was not removed`, EXIT.tool);
  return issue;
}

function merge(options, ledger, terminalMerge) {
  const { repo, pr } = prSnapshot(options, ledger);
  if (terminalMerge) {
    if (ledger.mergePolicy !== "explicit-terminal" || options.approvalHead !== options.expectedHead) fail("parent merge requires explicit approval bound to the exact head");
  } else if (ledger.mergePolicy !== "auto-child" || pr.baseRefName !== ledger.parentBranch) {
    fail("child merge policy or target is invalid");
  }
  const lifecycleLabel = expectedLifecycleLabel(ledger, terminalMerge);
  const issueBeforeMerge = issueSnapshot(options, repo);
  if (issueBeforeMerge.state !== "OPEN") fail("issue must remain open before merge");
  if (!issueBeforeMerge.labels.some((label) => label.name === lifecycleLabel)) fail(`issue is missing lifecycle label ${lifecycleLabel}`);
  const ready = classify(options, ledger);
  if (ready.receipt.classification !== "ready") fail("pull request is not ready to merge");
  const ghBin = process.env.CODEX_DEVELOPMENT_LOOP_TEST === "1" && process.env.CDL_GH_BIN ? process.env.CDL_GH_BIN : "gh";
  run(ghBin, ["pr", "merge", String(options.pr), "--repo", repo, "--merge", "--match-head-commit", options.expectedHead], options.repo);
  const merged = ghJson(["pr", "view", String(options.pr), "--repo", repo, "--json", "number,state,headRefName,headRefOid,baseRefName,baseRefOid,mergeable,mergedAt,url,statusCheckRollup"], options.repo);
  if (!merged.mergedAt && merged.state !== "MERGED") fail("merge readback did not confirm merged state", EXIT.tool);
  const baseRef = ghJson(["api", `repos/${repo}/git/ref/heads/${pr.baseRefName}`], options.repo);
  const baseSha = baseRef.object?.sha;
  if (!SHA_RE.test(baseSha)) fail("base ref readback did not return a full SHA", EXIT.tool);
  const comparison = ghJson(["api", `repos/${repo}/compare/${options.expectedHead}...${baseSha}`], options.repo);
  if (!new Set(["ahead", "identical"]).has(comparison.status) || comparison.merge_base_commit?.sha !== options.expectedHead) {
    fail("merged head is not contained in the target base", EXIT.tool);
  }
  completeIssue(options, repo, lifecycleLabel);
  const transitioned = terminalMerge
    ? transitionLedger(options, "needs-user", ["--reason", "terminal merge verified; cleanup selection required"])
    : transitionLedger(options, "terminal", ["--reason", "verified child merge"]);
  return baseReceipt(options, ledger, {
    ledgerRevision: transitioned.revision,
    baseSha,
    headSha: options.expectedHead,
    checks: "passing",
    review: "clean-exact-head",
    unresolvedThreads: 0,
    mergeability: "merged",
    classification: "ready",
    permittedNextTransition: terminalMerge ? "request-cleanup" : "advance-child",
    lifecycleLabelRemoved: lifecycleLabel,
  });
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (!fs.statSync(options.repo).isDirectory()) fail("--repo must be a directory");
  const ledger = readLedger(options);
  let result;
  let exitCode = EXIT.ready;
  if (options.operation === "verify-worker-return") result = verifyWorkerReceipt(options, ledger);
  else if (options.operation === "adopt-review") ({ receipt: result, exitCode } = adoptReview(options, ledger));
  else if (options.operation === "request-review") ({ receipt: result, exitCode } = requestReview(options, ledger));
  else if (options.operation === "reconcile-review-request") result = reconcileReviewRequest(options, ledger);
  else if (options.operation === "classify-review") ({ receipt: result, exitCode } = classify(options, ledger));
  else if (options.operation === "prepare-parent-approval") {
    if (ledger.mergePolicy !== "explicit-terminal") fail("parent approval requires explicit-terminal merge policy");
    const classified = classify(options, ledger);
    if (classified.receipt.classification !== "ready") fail("parent is not ready for approval", EXIT.human);
    result = { ...classified.receipt, permittedNextTransition: "ask-exact-head-merge-approval" };
  } else if (options.operation === "merge-child") result = merge(options, ledger, false);
  else result = merge(options, ledger, true);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = exitCode;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = error.exitCode ?? EXIT.tool;
}
