import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--file") {
    throw new Error("Usage: node validate-ledger.mjs --file <absolute-ledger-path>");
  }
  return path.resolve(argv[1]);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isValidManualReviewBasis(value) {
  return typeof value === "string" && value.trim().length > 0 && Buffer.byteLength(value, "utf8") <= 1024;
}

function findPlaceholder(value, trail = "ledger") {
  if (typeof value === "string" && (/<[^>]+>/.test(value) || /\{\{[^}]+\}\}/.test(value))) {
    return trail;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findPlaceholder(value[index], `${trail}[${index}]`);
      if (found) return found;
    }
  } else if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const found = findPlaceholder(child, `${trail}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

function rejectUnknownKeys(value, allowed, label, errors) {
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${label}.${key} is not allowed`);
  }
}

export function validateLedger(file, ledger) {
  const errors = [];
  if (!isPlainObject(ledger)) return ["ledger must be an object"];
  const allowedFields = new Set([
    "schemaVersion",
    "revision",
    "phase",
    "runMode",
    "mergePolicy",
    "issueUrl",
    "issueNumber",
    "parentIssueUrl",
    "parentIssueNumber",
    "parentBranch",
    "prUrl",
    "branch",
    "baseRef",
    "worktree",
    "worktreeKind",
    "currentCheckout",
    "activeWorkerThreadId",
    "scheduledTaskId",
    "heartbeatTargetThreadId",
    "heartbeatPromptSha256",
    "heartbeatVerifiedAt",
    "watcherPolicy",
    "continuationMode",
    "continuationReason",
    "waitingSince",
    "localAudit",
    "codexReviewRequests",
    "pendingReviewRequest",
    "automaticReview",
    "expectedChecks",
    "runtime",
    "userAmendments",
  ]);
  for (const key of Object.keys(ledger)) {
    if (!allowedFields.has(key)) errors.push(`${key} is not allowed in schema v6`);
  }

  if (ledger.schemaVersion !== 6) errors.push("schemaVersion must equal 6");
  if (!Number.isSafeInteger(ledger.revision) || ledger.revision < 0) errors.push("revision must be a non-negative safe integer");
  const phases = new Set(["implementation", "local-review", "awaiting-github-review", "correction", "ready", "needs-user", "terminal"]);
  if (!phases.has(ledger.phase)) errors.push("phase is invalid");
  if (!new Set(["codex-managed", "manual"]).has(ledger.worktreeKind)) errors.push("worktreeKind is invalid");
  if (!path.isAbsolute(ledger.worktree || "")) errors.push("worktree must be absolute");
  if (!path.isAbsolute(ledger.currentCheckout || "")) errors.push("currentCheckout must be absolute");
  if (typeof ledger.branch !== "string" || ledger.branch.length === 0) errors.push("branch is required");
  if (typeof ledger.baseRef !== "string" || ledger.baseRef.length === 0) errors.push("baseRef is required");
  if (ledger.prUrl === null) {
    if (!new Set(["implementation", "local-review"]).has(ledger.phase)) {
      errors.push("prUrl may be null only during implementation or local-review");
    }
    if (!new Set(["controller-turn", "needs-user"]).has(ledger.continuationMode)
      || !Array.isArray(ledger.codexReviewRequests) || ledger.codexReviewRequests.length !== 0
      || (ledger.pendingReviewRequest !== undefined && ledger.pendingReviewRequest !== null)
      || (ledger.automaticReview !== undefined && ledger.automaticReview !== null)) {
      errors.push("pre-PR ledger requires controller-turn or needs-user ownership and no GitHub review state");
    }
  } else if (typeof ledger.prUrl !== "string"
    || !/^https:\/\/[a-z0-9]+(?:[.-][a-z0-9]+)*\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/.test(ledger.prUrl)) {
    errors.push("prUrl must be a canonical HTTPS pull request URL or null before PR creation");
  }
  if (ledger.runMode !== undefined && !new Set(["single-ticket", "parent-ticket"]).has(ledger.runMode)) {
    errors.push("runMode must be single-ticket or parent-ticket");
  }
  if (ledger.mergePolicy !== undefined && !new Set(["explicit-terminal", "auto-child"]).has(ledger.mergePolicy)) {
    errors.push("mergePolicy must be explicit-terminal or auto-child");
  }
  if (ledger.runMode !== undefined) {
    if (typeof ledger.issueUrl !== "string" || ledger.issueUrl.length === 0) errors.push("issueUrl is required when runMode is set");
    if (!Number.isSafeInteger(ledger.issueNumber) || ledger.issueNumber <= 0) errors.push("issueNumber must be positive when runMode is set");
    if (ledger.runMode === "single-ticket" && ledger.mergePolicy !== "explicit-terminal") {
      errors.push("single-ticket mode requires explicit-terminal mergePolicy");
    }
    if (ledger.runMode === "single-ticket") {
      for (const field of ["parentIssueUrl", "parentIssueNumber", "parentBranch"]) {
        if (Object.hasOwn(ledger, field)) errors.push(`${field} must be absent in single-ticket mode`);
      }
    }
    if (ledger.runMode === "parent-ticket") {
      if (typeof ledger.parentIssueUrl !== "string" || ledger.parentIssueUrl.length === 0) errors.push("parentIssueUrl is required in parent-ticket mode");
      if (!Number.isSafeInteger(ledger.parentIssueNumber) || ledger.parentIssueNumber <= 0) errors.push("parentIssueNumber must be positive in parent-ticket mode");
      if (typeof ledger.parentBranch !== "string" || ledger.parentBranch.length === 0) errors.push("parentBranch is required in parent-ticket mode");
      if (!new Set(["explicit-terminal", "auto-child"]).has(ledger.mergePolicy)) errors.push("parent-ticket mode requires mergePolicy");
      else if (Number.isSafeInteger(ledger.issueNumber) && Number.isSafeInteger(ledger.parentIssueNumber)) {
        const isFinalParentPr = ledger.issueNumber === ledger.parentIssueNumber;
        if (isFinalParentPr && ledger.mergePolicy !== "explicit-terminal") {
          errors.push("final parent PR requires explicit-terminal mergePolicy");
        }
        if (!isFinalParentPr && ledger.mergePolicy !== "auto-child") {
          errors.push("parent child PR requires auto-child mergePolicy");
        }
        if (!isFinalParentPr && ledger.baseRef !== ledger.parentBranch) {
          errors.push("parent child PR baseRef must equal parentBranch");
        }
      }
    }
  }
  if (!(ledger.activeWorkerThreadId === null
    || (typeof ledger.activeWorkerThreadId === "string" && ledger.activeWorkerThreadId.trim().length > 0))) {
    errors.push("activeWorkerThreadId must be null or a non-empty string");
  }
  if (!(ledger.scheduledTaskId === null || (typeof ledger.scheduledTaskId === "string" && ledger.scheduledTaskId.length > 0))) errors.push("scheduledTaskId must be null or a non-empty string");
  if (!(ledger.heartbeatTargetThreadId === null || (typeof ledger.heartbeatTargetThreadId === "string" && ledger.heartbeatTargetThreadId.length > 0))) {
    errors.push("heartbeatTargetThreadId must be null or a non-empty string");
  }
  if (!(ledger.heartbeatPromptSha256 === null || (typeof ledger.heartbeatPromptSha256 === "string" && /^[0-9a-f]{64}$/.test(ledger.heartbeatPromptSha256)))) {
    errors.push("heartbeatPromptSha256 must be null or a lowercase SHA-256 digest");
  }
  if (!(ledger.heartbeatVerifiedAt === null || (typeof ledger.heartbeatVerifiedAt === "string" && Number.isFinite(Date.parse(ledger.heartbeatVerifiedAt))))) {
    errors.push("heartbeatVerifiedAt must be null or an ISO timestamp");
  }
  if (ledger.watcherPolicy === null) {
    if (ledger.scheduledTaskId !== null) errors.push("watcherPolicy is required when scheduledTaskId is set");
  } else if (isPlainObject(ledger.watcherPolicy)) {
    rejectUnknownKeys(
      ledger.watcherPolicy,
      new Set(["cadenceMinutes", "maxIdleMinutes", "acknowledgementTimeoutMinutes"]),
      "watcherPolicy",
      errors,
    );
    const { cadenceMinutes, maxIdleMinutes, acknowledgementTimeoutMinutes } = ledger.watcherPolicy;
    if (!(Number.isFinite(cadenceMinutes) && cadenceMinutes > 0)) errors.push("cadenceMinutes must be positive");
    if (!(Number.isFinite(maxIdleMinutes) && maxIdleMinutes > cadenceMinutes)) errors.push("maxIdleMinutes must exceed cadenceMinutes");
    if (!(Number.isFinite(acknowledgementTimeoutMinutes) && acknowledgementTimeoutMinutes > 0)) errors.push("acknowledgementTimeoutMinutes must be positive");
  } else errors.push("watcherPolicy must be null or an object");
  if (!new Set(["controller-turn", "heartbeat", "needs-user", "terminal"]).has(ledger.continuationMode)) {
    errors.push("continuationMode must be controller-turn, heartbeat, needs-user, or terminal");
  }
  if (!(ledger.continuationReason === null || typeof ledger.continuationReason === "string")) {
    errors.push("continuationReason must be null or string");
  }
  if (ledger.continuationMode === "controller-turn") {
    if (ledger.scheduledTaskId !== null) errors.push("controller-turn requires scheduledTaskId to be null");
    if (ledger.watcherPolicy !== null) errors.push("controller-turn requires watcherPolicy to be null");
    if (ledger.continuationReason !== null) errors.push("controller-turn requires continuationReason to be null");
    if (ledger.waitingSince !== null) errors.push("controller-turn requires waitingSince to be null");
    if (ledger.heartbeatTargetThreadId !== null || ledger.heartbeatPromptSha256 !== null || ledger.heartbeatVerifiedAt !== null) {
      errors.push("controller-turn requires heartbeat readback fields to be null");
    }
    if (ledger.phase === "awaiting-github-review" && ledger.activeWorkerThreadId !== null) {
      errors.push("continuous GitHub review watching cannot have activeWorkerThreadId");
    }
    if (ledger.phase === "ready" && ledger.activeWorkerThreadId !== null) errors.push("ready phase cannot have activeWorkerThreadId");
  }
  if (ledger.continuationMode === "heartbeat") {
    if (!(typeof ledger.scheduledTaskId === "string" && ledger.scheduledTaskId.length > 0)) errors.push("heartbeat continuation requires scheduledTaskId");
    if (!isPlainObject(ledger.watcherPolicy)) errors.push("heartbeat continuation requires watcherPolicy");
    if (ledger.activeWorkerThreadId !== null) errors.push("heartbeat continuation cannot have activeWorkerThreadId");
    if (ledger.continuationReason !== null) errors.push("heartbeat continuation cannot have continuationReason");
    if (!(typeof ledger.waitingSince === "string" && Number.isFinite(Date.parse(ledger.waitingSince)))) {
      errors.push("heartbeat continuation requires waitingSince");
    }
    if (typeof ledger.heartbeatTargetThreadId !== "string") errors.push("heartbeat continuation requires heartbeatTargetThreadId");
    if (typeof ledger.heartbeatPromptSha256 !== "string") errors.push("heartbeat continuation requires heartbeatPromptSha256");
    if (typeof ledger.heartbeatVerifiedAt !== "string") errors.push("heartbeat continuation requires heartbeatVerifiedAt");
    if (ledger.phase !== "awaiting-github-review") errors.push("heartbeat continuation requires awaiting-github-review phase");
  }
  if (new Set(["needs-user", "terminal"]).has(ledger.continuationMode)) {
    if (ledger.scheduledTaskId !== null) errors.push(`${ledger.continuationMode} requires scheduledTaskId to be null`);
    if (ledger.watcherPolicy !== null) errors.push(`${ledger.continuationMode} requires watcherPolicy to be null`);
    if (ledger.activeWorkerThreadId !== null) errors.push(`${ledger.continuationMode} requires activeWorkerThreadId to be null`);
    if (typeof ledger.continuationReason !== "string" || ledger.continuationReason.trim().length === 0) {
      errors.push(`${ledger.continuationMode} continuation requires continuationReason`);
    }
    if (ledger.waitingSince !== null) errors.push(`${ledger.continuationMode} requires waitingSince to be null`);
    if (ledger.heartbeatTargetThreadId !== null || ledger.heartbeatPromptSha256 !== null || ledger.heartbeatVerifiedAt !== null) {
      errors.push(`${ledger.continuationMode} requires heartbeat readback fields to be null`);
    }
  }
  const prePrHold = ledger.prUrl === null && new Set(["implementation", "local-review"]).has(ledger.phase);
  if (ledger.continuationMode === "needs-user" && ledger.phase !== "needs-user" && !prePrHold) {
    errors.push("needs-user continuation requires needs-user phase or a saved pre-PR implementation/local-review phase");
  }
  if (ledger.continuationMode === "terminal" && ledger.phase !== "terminal") errors.push("terminal continuation requires terminal phase");
  if (!(ledger.waitingSince === null || (typeof ledger.waitingSince === "string" && Number.isFinite(Date.parse(ledger.waitingSince))))) {
    errors.push("waitingSince must be null or an ISO timestamp");
  }
  if (!Array.isArray(ledger.codexReviewRequests)) errors.push("codexReviewRequests must be an array");
  if (Object.hasOwn(ledger, "expectedChecks")) {
    if (!isPlainObject(ledger.expectedChecks)) {
      errors.push("expectedChecks must be an object");
    } else if (ledger.expectedChecks.mode === "required") {
      rejectUnknownKeys(ledger.expectedChecks, new Set(["mode", "names", "source"]), "expectedChecks", errors);
      if (!Array.isArray(ledger.expectedChecks.names) || ledger.expectedChecks.names.length === 0
        || ledger.expectedChecks.names.some((name) => typeof name !== "string" || name.trim().length === 0)
        || new Set(ledger.expectedChecks.names).size !== ledger.expectedChecks.names.length) {
        errors.push("expectedChecks.names must be a non-empty unique string array for required checks");
      }
      if (typeof ledger.expectedChecks.source !== "string" || ledger.expectedChecks.source.trim().length === 0) {
        errors.push("expectedChecks.source is required for required checks");
      }
    } else if (ledger.expectedChecks.mode === "none") {
      rejectUnknownKeys(ledger.expectedChecks, new Set(["mode", "source", "authorizedBy"]), "expectedChecks", errors);
      const evidenceFields = ["source", "authorizedBy"].filter((key) => Object.hasOwn(ledger.expectedChecks, key));
      if (evidenceFields.length === 0) {
        errors.push("expectedChecks.source is required for a no-CI contract (legacy authorizedBy is also accepted)");
      }
      for (const key of evidenceFields) {
        if (typeof ledger.expectedChecks[key] !== "string" || ledger.expectedChecks[key].trim().length === 0) {
          errors.push(`expectedChecks.${key} must be a non-empty evidence reference`);
        }
      }
    } else {
      errors.push("expectedChecks.mode must be required or none");
    }
  }
  if (Object.hasOwn(ledger, "pendingReviewRequest") && ledger.pendingReviewRequest !== null) {
    const pending = ledger.pendingReviewRequest;
    if (!isPlainObject(pending)) {
      errors.push("pendingReviewRequest must be null or an object");
    } else {
      rejectUnknownKeys(
        pending,
        new Set(["headSha", "operationId", "actorLogin", "requestedAt", "state", "commentId", "manualReviewBasis"]),
        "pendingReviewRequest",
        errors,
      );
      if (Object.hasOwn(pending, "manualReviewBasis") && !isValidManualReviewBasis(pending.manualReviewBasis)) {
        errors.push("pendingReviewRequest.manualReviewBasis must be nonblank and no larger than 1024 UTF-8 bytes");
      }
      if (!/^[0-9a-f]{40}$/.test(pending.headSha || "")) errors.push("pendingReviewRequest.headSha must be a full lowercase commit SHA");
      if (typeof pending.operationId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(pending.operationId)) {
        errors.push("pendingReviewRequest.operationId must be a UUID");
      }
      if (typeof pending.actorLogin !== "string" || pending.actorLogin.trim().length === 0) errors.push("pendingReviewRequest.actorLogin is required");
      if (!(typeof pending.requestedAt === "string" && Number.isFinite(Date.parse(pending.requestedAt)))) {
        errors.push("pendingReviewRequest.requestedAt must be an ISO timestamp");
      }
      if (!new Set(["posting", "posted"]).has(pending.state)) errors.push("pendingReviewRequest.state must be posting or posted");
      if (pending.state === "posting" && Object.hasOwn(pending, "commentId")) errors.push("posting pendingReviewRequest cannot contain commentId");
      if (pending.state === "posted" && !((typeof pending.commentId === "string" && /^\d+$/.test(pending.commentId))
        || (Number.isSafeInteger(pending.commentId) && pending.commentId > 0))) {
        errors.push("posted pendingReviewRequest.commentId must be a numeric GitHub identifier");
      }
    }
  }
  if (!Array.isArray(ledger.userAmendments)) errors.push("userAmendments must be an array");
  if (Array.isArray(ledger.userAmendments)) {
    for (const [index, amendment] of ledger.userAmendments.entries()) {
      if (typeof amendment !== "string" || amendment.trim().length === 0) {
        errors.push(`userAmendments[${index}] must be a non-empty string`);
      }
    }
  }
  if (!isPlainObject(ledger.runtime)) errors.push("runtime must be an object");
  else {
    rejectUnknownKeys(ledger.runtime, new Set(["nodeBin", "codexBin", "codexVersion"]), "runtime", errors);
    if (!(ledger.runtime.nodeBin === null || (typeof ledger.runtime.nodeBin === "string" && path.isAbsolute(ledger.runtime.nodeBin)))) {
      errors.push("runtime.nodeBin must be null or an absolute path");
    }
    const codexBin = ledger.runtime.codexBin ?? null;
    const codexVersion = ledger.runtime.codexVersion ?? null;
    const codexRuntimeAbsent = codexBin === null && codexVersion === null;
    const codexRuntimePresent = typeof codexBin === "string" && path.isAbsolute(codexBin)
      && typeof codexVersion === "string" && codexVersion.trim().length > 0;
    if (!codexRuntimeAbsent && !codexRuntimePresent) {
      errors.push("runtime.codexBin and runtime.codexVersion must both be null or pinned values");
    }
  }

  if (!isPlainObject(ledger.localAudit)) {
    errors.push("localAudit must be an object");
  } else {
    rejectUnknownKeys(
      ledger.localAudit,
      new Set(["engine", "headSha", "status", "completedAt", "promptSha256", "exitCode", "outputFile"]),
      "localAudit",
      errors,
    );
    const { engine, headSha, status, completedAt, promptSha256, exitCode, outputFile } = ledger.localAudit;
    const statuses = new Set(["pending", "running", "findings", "clean", "stale", "blocked"]);
    if (!(engine === null || new Set(["codex", "claude", "inline"]).has(engine))) {
      errors.push("localAudit.engine must be null, codex, legacy claude, or inline");
    }
    if (!(headSha === null || (typeof headSha === "string" && /^[0-9a-f]{40}$/.test(headSha)))) {
      errors.push("localAudit.headSha must be null or a full lowercase commit SHA");
    }
    if (!statuses.has(status)) errors.push("localAudit.status is invalid");
    if (!(completedAt === null || (typeof completedAt === "string" && Number.isFinite(Date.parse(completedAt))))) {
      errors.push("localAudit.completedAt must be null or an ISO timestamp");
    }
    if (!(promptSha256 === null || (typeof promptSha256 === "string" && /^[0-9a-f]{64}$/.test(promptSha256)))) {
      errors.push("localAudit.promptSha256 must be null or a lowercase SHA-256 digest");
    }
    if (!(exitCode === null || (Number.isInteger(exitCode) && exitCode >= 0))) {
      errors.push("localAudit.exitCode must be null or a non-negative integer");
    }
    if (!(outputFile === undefined || outputFile === null
      || (typeof outputFile === "string" && !path.isAbsolute(outputFile) && outputFile.startsWith("sdlc-scratch/")))) {
      errors.push("localAudit.outputFile must be a repo-relative sdlc-scratch path when present");
    }
    if (status === "pending") {
      if (completedAt !== null) errors.push("pending localAudit cannot have completedAt");
      if (exitCode !== null) errors.push("pending localAudit cannot have exitCode");
    }
    if (status === "running") {
      if (engine === null || headSha === null || promptSha256 === null) {
        errors.push("running localAudit requires engine, headSha, and promptSha256");
      }
      if (completedAt !== null || exitCode !== null) errors.push("running localAudit cannot be completed");
    }
    if (new Set(["findings", "clean"]).has(status)) {
      if (engine === null || headSha === null || completedAt === null || promptSha256 === null || exitCode === null) {
        errors.push(`${status} localAudit requires complete audit provenance`);
      }
      if (engine === "codex" && !outputFile) errors.push(`${status} Codex localAudit requires outputFile`);
    }
    if (status === "stale" && headSha === null) errors.push("stale localAudit requires its previously audited headSha");
    if (status === "blocked" && headSha === null) errors.push("blocked localAudit requires the attempted headSha");
  }

  const placeholder = findPlaceholder(ledger);
  if (placeholder) errors.push(`unresolved placeholder at ${placeholder}`);

  if (ledger.automaticReview !== undefined && ledger.automaticReview !== null) {
    const automatic = ledger.automaticReview;
    if (!isPlainObject(automatic)) errors.push("automaticReview must be null or an object");
    else {
      rejectUnknownKeys(automatic, new Set(["headSha", "dispositionActorLogin", "observedAt", "evidenceRef"]), "automaticReview", errors);
      if (!/^[0-9a-f]{40}$/.test(automatic.headSha ?? "")) errors.push("automaticReview.headSha must be a full lowercase commit SHA");
      if (typeof automatic.dispositionActorLogin !== "string" || !automatic.dispositionActorLogin.trim()) errors.push("automaticReview.dispositionActorLogin is required");
      if (typeof automatic.observedAt !== "string" || !Number.isFinite(Date.parse(automatic.observedAt))) errors.push("automaticReview.observedAt must be an ISO timestamp");
      if (typeof automatic.evidenceRef !== "string" || !automatic.evidenceRef.startsWith(`${ledger.prUrl}#`)) errors.push("automaticReview.evidenceRef must belong to the bound PR");
    }
  }

  const seenHeads = new Set();
  for (const [index, request] of (Array.isArray(ledger.codexReviewRequests) ? ledger.codexReviewRequests : []).entries()) {
    if (!isPlainObject(request)) {
      errors.push(`codexReviewRequests[${index}] is incomplete`);
      continue;
    }
    rejectUnknownKeys(
      request,
      new Set(["headSha", "commentId", "requestedAt", "eyesConfirmed", "manualReviewBasis"]),
      `codexReviewRequests[${index}]`,
      errors,
    );
    if (Object.hasOwn(request, "manualReviewBasis") && !isValidManualReviewBasis(request.manualReviewBasis)) {
      errors.push(`codexReviewRequests[${index}].manualReviewBasis must be nonblank and no larger than 1024 UTF-8 bytes`);
    }
    if (!/^[0-9a-f]{40}$/.test(request.headSha || "")) errors.push(`codexReviewRequests[${index}].headSha must be a full lowercase commit SHA`);
    if (!((typeof request.commentId === "string" && request.commentId.trim().length > 0)
      || (Number.isSafeInteger(request.commentId) && request.commentId > 0))) {
      errors.push(`codexReviewRequests[${index}].commentId must be an actual GitHub identifier`);
    }
    if (!(typeof request.requestedAt === "string" && Number.isFinite(Date.parse(request.requestedAt)))) {
      errors.push(`codexReviewRequests[${index}].requestedAt must be an ISO timestamp`);
    }
    if (typeof request.eyesConfirmed !== "boolean") errors.push(`codexReviewRequests[${index}].eyesConfirmed must be boolean`);
    if (seenHeads.has(request.headSha)) errors.push(`duplicate Codex review request for ${request.headSha}`);
    seenHeads.add(request.headSha);
  }

  if (path.isAbsolute(ledger.worktree || "")) {
    const ledgerRoot = path.join(path.resolve(ledger.worktree), "sdlc-scratch", "ledgers");
    if (!(file === ledgerRoot || file.startsWith(`${ledgerRoot}${path.sep}`))) errors.push("ledger file must be inside worktree/sdlc-scratch/ledgers");
  }
  if (!/^pr-\d+\.json$/.test(path.basename(file))) errors.push("ledger filename must be pr-<number>.json");

  return errors;
}

const invokedDirectly = process.argv[1] && fs.existsSync(process.argv[1])
  && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (invokedDirectly) try {
  const file = parseArgs(process.argv.slice(2));
  const ledger = JSON.parse(fs.readFileSync(file, "utf8"));
  const errors = validateLedger(file, ledger);
  process.stdout.write(`${JSON.stringify({ ok: errors.length === 0, file, errors }, null, 2)}\n`);
  if (errors.length > 0) process.exitCode = 1;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, errors: [error.message] }, null, 2)}\n`);
  process.exitCode = 1;
}
