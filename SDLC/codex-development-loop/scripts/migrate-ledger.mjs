import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parsePositiveNumber(value, flag) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${flag} must be positive`);
  return number;
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error("Usage: node migrate-ledger.mjs --file <path> --base-ref <ref> --worktree-kind <kind> --current-checkout <path> [--continuation-mode <mode> --continuation-reason <reason> --phase <phase>] [heartbeat readback options]");
    }
    if (values.has(flag)) throw new Error(`duplicate option: ${flag}`);
    values.set(flag, value);
  }

  const required = ["--file", "--base-ref", "--worktree-kind", "--current-checkout"];
  for (const flag of required) if (!values.has(flag)) throw new Error(`${flag} is required`);
  const allowed = new Set([...required, "--continuation-mode", "--continuation-reason", "--phase", "--cadence-minutes", "--max-idle-minutes", "--ack-timeout-minutes", "--target-thread-id", "--prompt-sha256", "--verified-at"]);
  for (const flag of values.keys()) if (!allowed.has(flag)) throw new Error(`unknown option: ${flag}`);

  const file = path.resolve(values.get("--file"));
  const currentCheckout = values.get("--current-checkout");
  if (!path.isAbsolute(currentCheckout)) throw new Error("--current-checkout must be absolute");
  const worktreeKind = values.get("--worktree-kind");
  if (!new Set(["codex-managed", "manual"]).has(worktreeKind)) throw new Error("--worktree-kind must be codex-managed or manual");

  const watcherFlags = ["--cadence-minutes", "--max-idle-minutes", "--ack-timeout-minutes"];
  const watcherFlagCount = watcherFlags.filter((flag) => values.has(flag)).length;
  if (watcherFlagCount !== 0 && watcherFlagCount !== watcherFlags.length) {
    throw new Error("all watcher policy options must be supplied together");
  }
  const watcherPolicy = watcherFlagCount === 0
    ? null
    : {
        cadenceMinutes: parsePositiveNumber(values.get("--cadence-minutes"), "--cadence-minutes"),
        maxIdleMinutes: parsePositiveNumber(values.get("--max-idle-minutes"), "--max-idle-minutes"),
        acknowledgementTimeoutMinutes: parsePositiveNumber(values.get("--ack-timeout-minutes"), "--ack-timeout-minutes"),
      };

  const continuationMode = values.get("--continuation-mode") ?? null;
  if (continuationMode !== null && !new Set(["controller-turn", "needs-user", "terminal"]).has(continuationMode)) {
    throw new Error("--continuation-mode must be controller-turn, needs-user, or terminal");
  }
  const continuationReason = values.get("--continuation-reason") ?? null;
  if (new Set(["needs-user", "terminal"]).has(continuationMode) && !continuationReason?.trim()) {
    throw new Error("--continuation-reason is required for needs-user or terminal migration");
  }
  if ((continuationMode === null || continuationMode === "controller-turn") && continuationReason !== null) {
    throw new Error("--continuation-reason is allowed only with needs-user or terminal migration");
  }
  const phase = values.get("--phase") ?? null;
  const foregroundPhases = new Set(["implementation", "local-review", "awaiting-github-review", "correction", "ready"]);
  if (phase !== null && !foregroundPhases.has(phase)) throw new Error("--phase is invalid");
  const heartbeatBinding = values.has("--target-thread-id") || values.has("--prompt-sha256") || values.has("--verified-at")
    ? {
        targetThreadId: values.get("--target-thread-id"),
        promptSha256: values.get("--prompt-sha256"),
        verifiedAt: values.get("--verified-at"),
      }
    : null;
  if (heartbeatBinding && (!heartbeatBinding.targetThreadId || !/^[0-9a-f]{64}$/.test(heartbeatBinding.promptSha256 ?? "") ||
      !Number.isFinite(Date.parse(heartbeatBinding.verifiedAt ?? "")))) {
    throw new Error("complete valid heartbeat readback options are required together");
  }

  return { file, baseRef: values.get("--base-ref"), worktreeKind, currentCheckout, watcherPolicy, continuationMode, continuationReason, phase, heartbeatBinding };
}

function atomicWrite(file, contents, mode) {
  const temporary = `${file}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporary, contents, { mode });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function validate(file) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  return spawnSync(process.execPath, [path.join(scriptDir, "validate-ledger.mjs"), "--file", file], { encoding: "utf8" });
}

const V6_FIELDS = new Set([
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

const REMOVED_FIELDS = [
  "activeWorkerHeadSha",
  "processedReviewThreads",
  "resolvedReviewThreadIds",
  "materialFailures",
  "deferredFindings",
  "dismissedFingerprints",
  "reviewCycleCount",
  "taskArtifactPaths",
];

function assertKnownLegacyFields(ledger) {
  const known = new Set([...V6_FIELDS, ...REMOVED_FIELDS, "heartbeatAutomationId", "followUpMode", "followUpFailure"]);
  const unknown = Object.keys(ledger).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new Error(`legacy ledger contains unknown fields; reconcile manually: ${unknown.join(", ")}`);
  }
}

function pendingAudit() {
  return {
    engine: null,
    headSha: null,
    status: "pending",
    completedAt: null,
    promptSha256: null,
    exitCode: null,
  };
}

try {
  const options = parseArgs(process.argv.slice(2));
  const original = fs.readFileSync(options.file, "utf8");
  const ledger = JSON.parse(original);

  if (ledger.schemaVersion === 6) {
    const result = validate(options.file);
    if (result.status !== 0) throw new Error(`existing schema-v6 ledger is invalid:\n${result.stdout.trim()}`);
    process.stdout.write(`${JSON.stringify({ ok: true, migrated: false, file: options.file }, null, 2)}\n`);
  } else {
    if (!new Set([1, 2, 3, 4, 5]).has(ledger.schemaVersion)) throw new Error("only schema-version-1 through schema-version-5 ledgers can be migrated");
    assertKnownLegacyFields(ledger);
    if (ledger.schemaVersion < 3 && Object.hasOwn(ledger, "localAudit")) {
      throw new Error("legacy ledger already contains localAudit; reconcile it manually");
    }
    if (ledger.schemaVersion === 1) {
      if (Object.hasOwn(ledger, "scheduledTaskId")) throw new Error("schema-v1 ledger contains both scheduling field generations; reconcile it manually");
      if (!(ledger.heartbeatAutomationId === null || typeof ledger.heartbeatAutomationId === "string")) {
        throw new Error("heartbeatAutomationId must be null or string");
      }
      if (ledger.heartbeatAutomationId !== null && options.watcherPolicy === null) {
        throw new Error("watcher policy options are required when heartbeatAutomationId is set");
      }
      if (ledger.heartbeatAutomationId === null && options.watcherPolicy !== null) {
        throw new Error("watcher policy options require a non-null heartbeatAutomationId");
      }
    } else if (Object.hasOwn(ledger, "heartbeatAutomationId")) {
      throw new Error("legacy ledger contains both scheduling field generations; reconcile it manually");
    }
    if (ledger.schemaVersion >= 2) {
      const conflicts = [
        ["baseRef", options.baseRef],
        ["worktreeKind", options.worktreeKind],
        ["currentCheckout", options.currentCheckout],
      ].filter(([key, value]) => Object.hasOwn(ledger, key) && ledger[key] !== value);
      if (conflicts.length > 0) {
        throw new Error(`legacy ledger conflicts with migration binding: ${conflicts.map(([key]) => key).join(", ")}`);
      }
    }

    const sourceScheduledTaskId = ledger.schemaVersion === 1 ? ledger.heartbeatAutomationId : ledger.scheduledTaskId;
    const sourceHeartbeat = ledger.continuationMode === "heartbeat" || ledger.followUpMode === "heartbeat" || sourceScheduledTaskId != null;
    const sourceWatcherPolicy = ledger.schemaVersion === 1 ? options.watcherPolicy : ledger.watcherPolicy;
    const resolvedContinuationMode = ledger.schemaVersion === 5 ? ledger.continuationMode : options.continuationMode;
    const prePrHold = ledger.prUrl === null && resolvedContinuationMode === "needs-user";
    if (prePrHold && !new Set(["implementation", "local-review"]).has(options.phase)) {
      throw new Error("pre-PR needs-user migration requires --phase implementation or local-review after live-state reconciliation");
    }
    if (sourceHeartbeat) {
      if (ledger.activeWorkerThreadId != null) throw new Error("legacy heartbeat state cannot contain an active Worker; reconcile it manually");
      if (sourceScheduledTaskId == null || sourceWatcherPolicy == null) {
        throw new Error("legacy heartbeat state is missing watcher identity or policy");
      }
      if (options.heartbeatBinding === null) throw new Error("active legacy heartbeat requires verified scheduler readback options");
    } else if (resolvedContinuationMode === null) {
      throw new Error("non-heartbeat legacy state is ambiguous; supply --continuation-mode after reconciling live task, Worker, watcher, branch, and ledger state");
    } else if (resolvedContinuationMode !== "controller-turn" && ledger.activeWorkerThreadId != null) {
      throw new Error(`reconcile active Worker ${ledger.activeWorkerThreadId} before migrating to ${resolvedContinuationMode}`);
    } else if (resolvedContinuationMode === "controller-turn" && options.phase === null) {
      throw new Error("controller-turn migration requires --phase after live-state reconciliation");
    }

    const priorVersion = ledger.schemaVersion;
    const backup = `${options.file}.v${priorVersion}.bak`;
    const mode = fs.statSync(options.file).mode;
    const descriptor = fs.openSync(backup, "wx", mode);
    try {
      fs.writeFileSync(descriptor, original);
    } finally {
      fs.closeSync(descriptor);
    }

    const migrated = {
      ...ledger,
      schemaVersion: 6,
      revision: 0,
      baseRef: ledger.baseRef ?? options.baseRef,
      worktreeKind: ledger.worktreeKind ?? options.worktreeKind,
      currentCheckout: ledger.currentCheckout ?? options.currentCheckout,
      activeWorkerThreadId: ledger.activeWorkerThreadId ?? null,
      codexReviewRequests: ledger.codexReviewRequests ?? [],
      pendingReviewRequest: ledger.pendingReviewRequest ?? null,
      expectedChecks: ledger.expectedChecks,
      runtime: ledger.runtime ?? { nodeBin: null, codexBin: null, codexVersion: null },
      userAmendments: ledger.userAmendments ?? [],
      localAudit: priorVersion >= 3 ? ledger.localAudit : pendingAudit(),
    };
    if (priorVersion === 1) {
      migrated.scheduledTaskId = ledger.heartbeatAutomationId;
      migrated.watcherPolicy = options.watcherPolicy;
      migrated.waitingSince = null;
    }
    const legacyHeartbeat = migrated.continuationMode === "heartbeat" || migrated.followUpMode === "heartbeat" || migrated.scheduledTaskId != null;
    if (legacyHeartbeat) {
      if (migrated.activeWorkerThreadId !== null) throw new Error("legacy heartbeat state cannot contain an active Worker; reconcile it manually");
      if (migrated.scheduledTaskId === null || migrated.watcherPolicy === null) {
        throw new Error("legacy heartbeat state is missing watcher identity or policy");
      }
      migrated.continuationMode = "heartbeat";
      migrated.continuationReason = null;
      migrated.waitingSince ??= migrated.codexReviewRequests.at(-1)?.requestedAt ?? new Date().toISOString();
      migrated.phase = "awaiting-github-review";
      migrated.heartbeatTargetThreadId = options.heartbeatBinding.targetThreadId;
      migrated.heartbeatPromptSha256 = options.heartbeatBinding.promptSha256;
      migrated.heartbeatVerifiedAt = options.heartbeatBinding.verifiedAt;
    } else {
      const continuationMode = resolvedContinuationMode;
      const continuationReason = ledger.schemaVersion === 5 ? ledger.continuationReason : options.continuationReason;
      if (continuationMode === null) {
        throw new Error("non-heartbeat legacy state is ambiguous; supply --continuation-mode after reconciling live task, Worker, watcher, branch, and ledger state");
      }
      migrated.continuationMode = continuationMode;
      migrated.continuationReason = continuationReason?.trim() ?? null;
      migrated.scheduledTaskId = null;
      migrated.watcherPolicy = null;
      migrated.waitingSince = null;
      migrated.heartbeatTargetThreadId = null;
      migrated.heartbeatPromptSha256 = null;
      migrated.heartbeatVerifiedAt = null;
      migrated.phase = continuationMode === "controller-turn" || prePrHold ? options.phase : continuationMode;
    }
    delete migrated.heartbeatAutomationId;
    delete migrated.followUpMode;
    delete migrated.followUpFailure;
    for (const field of REMOVED_FIELDS) delete migrated[field];

    atomicWrite(options.file, `${JSON.stringify(migrated, null, 2)}\n`, mode);
    const result = validate(options.file);
    if (result.status !== 0) {
      atomicWrite(options.file, original, mode);
      throw new Error(`migration failed validation; original restored:\n${result.stdout.trim()}`);
    }
    process.stdout.write(`${JSON.stringify({ ok: true, migrated: true, file: options.file, backup }, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
