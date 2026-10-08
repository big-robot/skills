#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { readSessionUsage, sessionInterval } from "./session-usage.mjs";
import { reviewUsageEvidence } from "./token-usage.mjs";
import { verifyReviewAudit } from "./review-audit-receipt.mjs";
import {
  addTokenUsage,
  normalizeTokenUsage,
  usageOrNull,
  zeroTokenUsage,
} from "./token-usage.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_FILES = 20_000;
const MAX_META_BYTES = 1024 * 1024;
const PHASES = new Set(["implementation", "verification", "local-review", "github-review", "correction", "integration", "terminal", "unassigned"]);
const MAX_CHECKPOINTS = 64;
const MAX_AUDIT_BYTES = 64 * 1024 * 1024;
const MAX_AGENTS = 256;
const MAX_DEPTH = 8;
const BASELINE_REASON_CODES = new Set([
  "controller_session_unavailable",
  "controller_session_ambiguous",
  "controller_usage_unavailable",
  "session_source_unavailable",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parsePairs(argv, allowed, required) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined || values.has(flag)) throw new Error("invalid or duplicate option");
    if (!allowed.has(flag)) throw new Error(`unknown option: ${flag}`);
    values.set(flag, value);
  }
  for (const flag of required) if (!values.has(flag)) throw new Error(`${flag} is required`);
  return values;
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive safe integer`);
  return parsed;
}

function absolutePath(value, label) {
  if (!path.isAbsolute(value || "")) throw new Error(`${label} must be absolute`);
  return path.resolve(value);
}

function assertRealDirectory(directory, label) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory, not a symlink`);
  }
  return fs.realpathSync(directory);
}

function validateLedgerPath(file, rootIssueNumber, { mustExist }) {
  const resolved = absolutePath(file, "--file");
  const ledgerDir = path.dirname(resolved);
  const scratchDir = path.dirname(ledgerDir);
  if (path.basename(ledgerDir) !== "ledgers" || path.basename(scratchDir) !== "sdlc-scratch") {
    throw new Error("usage ledger must be directly under sdlc-scratch/ledgers");
  }
  assertRealDirectory(scratchDir, "sdlc-scratch");
  const realLedgerDir = assertRealDirectory(ledgerDir, "sdlc-scratch/ledgers");
  if (!new RegExp(`^run-${rootIssueNumber}-usage\\.json$`).test(path.basename(resolved))) {
    throw new Error("usage ledger filename does not match the root issue number");
  }
  const canonical = path.join(realLedgerDir, path.basename(resolved));
  if (mustExist) {
    const stat = fs.lstatSync(canonical);
    if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(canonical) !== canonical) {
      throw new Error("usage ledger must be a regular non-symlink file");
    }
  } else if (fs.existsSync(canonical)) throw new Error("usage ledger already exists");
  return canonical;
}

function readFirstLine(file) {
  const descriptor = fs.openSync(file, "r");
  try {
    const chunks = [];
    let size = 0;
    while (size < MAX_META_BYTES) {
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_META_BYTES - size));
      const count = fs.readSync(descriptor, buffer, 0, buffer.length, size);
      if (count === 0) break;
      const chunk = buffer.subarray(0, count);
      const newline = chunk.indexOf(0x0a);
      chunks.push(newline === -1 ? chunk : chunk.subarray(0, newline));
      size += newline === -1 ? count : newline + 1;
      if (newline !== -1) return Buffer.concat(chunks).toString("utf8");
    }
    if (size >= MAX_META_BYTES) throw new Error("session metadata line exceeds limit");
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    fs.closeSync(descriptor);
  }
}

function sessionMeta(file) {
  try {
    const event = JSON.parse(readFirstLine(file));
    if (event?.type !== "session_meta" || !isPlainObject(event.payload) || !UUID.test(event.payload.id || "")) return null;
    const spawn = isPlainObject(event.payload.source) ? event.payload.source?.subagent?.thread_spawn : null;
    return {
      id: event.payload.id,
      timestamp: event.payload.timestamp,
      file,
      threadSource: event.payload.thread_source,
      parentThreadId: isPlainObject(spawn) ? spawn.parent_thread_id : null,
      role: isPlainObject(spawn) ? spawn.agent_role : null,
    };
  } catch {
    return null;
  }
}

function sessionFiles(roots) {
  const files = [];
  for (const root of roots) {
    if (!path.isAbsolute(root)) throw new Error("session roots must be absolute");
    let rootStat;
    try {
      rootStat = fs.lstatSync(root);
    } catch {
      throw new Error("session root is unavailable");
    }
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new Error("session roots must be real directories, not symlinks");
    }
    const stack = [{ directory: fs.realpathSync(root), depth: 0 }];
    while (stack.length > 0) {
      const { directory, depth } = stack.pop();
      if (depth > MAX_DEPTH) continue;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (files.length >= MAX_FILES) throw new Error("session file limit exceeded");
        const candidate = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          if (entry.name.endsWith(".jsonl")) throw new Error("session JSONL must not be a symlink");
          continue;
        }
        if (entry.isDirectory()) stack.push({ directory: candidate, depth: depth + 1 });
        else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(candidate);
      }
    }
  }
  return files;
}


function metasById(files) {
  const byId = new Map();
  for (const file of files) {
    const meta = sessionMeta(file);
    if (!meta) continue;
    const entries = byId.get(meta.id) ?? [];
    entries.push(meta);
    byId.set(meta.id, entries);
  }
  return byId;
}

function descendants(byId, controllerThreadId, startedAt, cutoff) {
  const selected = [];
  const selectedIds = new Set([controllerThreadId]);
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    let added = 0;
    for (const [id, entries] of byId) {
      if (selectedIds.has(id) || entries.length === 0) continue;
      const meta = entries[0];
      if (meta.threadSource !== "subagent" || !selectedIds.has(meta.parentThreadId)) continue;
      if (!new Set(["worker", "explorer"]).has(meta.role)) continue;
      const timestamp = Date.parse(meta.timestamp);
      if (!Number.isFinite(timestamp) || timestamp < startedAt || timestamp > cutoff) continue;
      selectedIds.add(id);
      selected.push({ id, role: meta.role, entries });
      added += 1;
      if (selected.length > MAX_AGENTS) throw new Error("agent count limit exceeded");
    }
    if (added === 0) break;
  }
  return selected;
}

function validateUsageLedger(ledger) {
  if (!isPlainObject(ledger) || ledger.type !== "cdl.run_usage" || ![1, 2].includes(ledger.schemaVersion)) throw new Error("usage ledger schema is invalid");
  const allowed = new Set(["type", "schemaVersion", "revision", "controllerThreadId", "runMode", "rootIssueNumber", "startedAt", "baselineStatus", "baselineUsage", "baselineReasonCode", "baselineSource", "localReviews", "checkpoints"]);
  for (const key of Object.keys(ledger)) if (!allowed.has(key)) throw new Error(`usage ledger field ${key} is not allowed`);
  if (!Number.isSafeInteger(ledger.revision) || ledger.revision < 0) throw new Error("usage ledger revision is invalid");
  if (!UUID.test(ledger.controllerThreadId || "")) throw new Error("usage ledger Controller thread ID is invalid");
  if (!new Set(["single-ticket", "parent-ticket"]).has(ledger.runMode)) throw new Error("usage ledger run mode is invalid");
  if (!Number.isSafeInteger(ledger.rootIssueNumber) || ledger.rootIssueNumber <= 0) throw new Error("usage ledger root issue number is invalid");
  timestampOption(ledger.startedAt);
  if (!new Set(["complete", "unavailable"]).has(ledger.baselineStatus)) throw new Error("usage ledger baseline status is invalid");
  if (ledger.baselineSource !== undefined && !["modern", "legacy", "unavailable"].includes(ledger.baselineSource)) throw new Error("usage ledger baseline source is invalid");
  if (ledger.baselineStatus === "complete") {
    normalizeTokenUsage(ledger.baselineUsage);
    if (ledger.baselineReasonCode !== null) throw new Error("complete baseline must not have a reason code");
  } else if (ledger.baselineUsage !== null || !BASELINE_REASON_CODES.has(ledger.baselineReasonCode)) {
    throw new Error("unavailable baseline must have a bounded reason code");
  }
  if (!Array.isArray(ledger.localReviews)) throw new Error("usage ledger localReviews must be an array");
  if (ledger.schemaVersion === 2) {
    if (!Array.isArray(ledger.checkpoints) || ledger.checkpoints.length > MAX_CHECKPOINTS) throw new Error("usage checkpoints are invalid");
    let previous = ledger.startedAt;
    for (const checkpoint of ledger.checkpoints) {
      validateCheckpoint(checkpoint);
      if (checkpoint.startedAt !== previous || Date.parse(checkpoint.cutoffAt) < Date.parse(previous)) throw new Error("usage checkpoint interval is invalid");
      previous = checkpoint.cutoffAt;
    }
  } else if (ledger.checkpoints !== undefined) throw new Error("v1 ledger cannot contain checkpoints");
  const receipts = new Set();
  const units = new Set();
  for (const review of ledger.localReviews) {
    if (!isPlainObject(review)) throw new Error("usage ledger local review is invalid");
    const keys = Object.keys(review).sort().join(",");
    if (keys !== "headSha,issueNumber,receiptSha256,status,usage" && keys !== "headSha,issueNumber,receiptSha256,recordedAt,responseCount,status,usage") throw new Error("usage ledger local review fields are invalid");
    if (!Number.isSafeInteger(review.issueNumber) || review.issueNumber <= 0 || !SHA.test(review.headSha || "") || !SHA256.test(review.receiptSha256 || "")) {
      throw new Error("usage ledger local review identity is invalid");
    }
    if (!new Set(["complete", "unavailable"]).has(review.status)) throw new Error("usage ledger local review status is invalid");
    if (review.status === "complete") normalizeTokenUsage(review.usage);
    else if (review.usage !== null) throw new Error("unavailable local review usage must be null");
    if (review.recordedAt != null) timestampOption(review.recordedAt);
    if (review.recordedAt !== undefined && !(review.responseCount === null || Number.isSafeInteger(review.responseCount) && review.responseCount >= 0)) throw new Error("local review telemetry metadata is invalid");
    const unit = `${review.issueNumber}:${review.headSha}`;
    if (receipts.has(review.receiptSha256) || units.has(unit)) throw new Error("usage ledger contains duplicate local review evidence");
    receipts.add(review.receiptSha256);
    units.add(unit);
  }
  return ledger;
}

function readLedger(file) {
  const provisional = JSON.parse(fs.readFileSync(file, "utf8"));
  const resolved = validateLedgerPath(file, provisional.rootIssueNumber, { mustExist: true });
  return { file: resolved, ledger: validateUsageLedger(provisional) };
}

function atomicCreate(file, value) {
  const descriptor = fs.openSync(file, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, value);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function atomicReplace(file, value, mode) {
  const temporary = `${file}.tmp-${process.pid}`;
  try {
    const descriptor = fs.openSync(temporary, "wx", mode);
    try {
      fs.writeFileSync(descriptor, value);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function rootsFrom(values) {
  return [
    absolutePath(values.get("--active-sessions-root"), "--active-sessions-root"),
    absolutePath(values.get("--archived-sessions-root"), "--archived-sessions-root"),
  ];
}

async function initialize(argv) {
  const required = new Set(["--file", "--controller-thread-id", "--run-mode", "--root-issue-number", "--active-sessions-root", "--archived-sessions-root"]);
  const values = parsePairs(argv, new Set([...required, "--started-at"]), required);
  const controllerThreadId = values.get("--controller-thread-id");
  if (!UUID.test(controllerThreadId || "")) throw new Error("--controller-thread-id must be a UUID");
  const runMode = values.get("--run-mode");
  if (!new Set(["single-ticket", "parent-ticket"]).has(runMode)) throw new Error("--run-mode is invalid");
  const rootIssueNumber = positiveInteger(values.get("--root-issue-number"), "--root-issue-number");
  const file = validateLedgerPath(values.get("--file"), rootIssueNumber, { mustExist: false });
  const startedAt = timestampOption(values.get("--started-at") ?? new Date().toISOString());
  let baselineUsage = null;
  let baselineSource = "unavailable";
  let baselineReasonCode = "controller_session_unavailable";
  try {
    const byId = metasById(sessionFiles(rootsFrom(values)));
    const controllerEntries = byId.get(controllerThreadId) ?? [];
    if (controllerEntries.length === 1) {
      const data = await readSessionUsage(controllerEntries[0].file, controllerThreadId);
      // Keep a legacy launch snapshot for v1-compatible fallback only. Modern
      // records are always reconstructed against the explicit timestamp window.
      const modern = sessionInterval(data, -Infinity, Date.parse(startedAt));
      baselineUsage = modern.provenance === "modern-reconciled" ? modern.usage
        : data.legacy.filter((record) => record.time <= Date.parse(startedAt)).sort((a, b) => a.time - b.time).at(-1)?.usage ?? null;
      baselineSource = baselineUsage === null ? "unavailable" : modern.provenance === "modern-reconciled" ? "modern" : "legacy";
      if (baselineUsage !== null) baselineReasonCode = null;
      else baselineReasonCode = "controller_usage_unavailable";
    } else if (controllerEntries.length > 1) baselineReasonCode = "controller_session_ambiguous";
  } catch {
    baselineReasonCode = "session_source_unavailable";
  }
  const ledger = validateUsageLedger({
    type: "cdl.run_usage",
    schemaVersion: 2,
    revision: 0,
    controllerThreadId,
    runMode,
    rootIssueNumber,
    startedAt,
    baselineStatus: baselineUsage === null ? "unavailable" : "complete",
    baselineUsage,
    baselineSource,
    baselineReasonCode,
    localReviews: [],
    checkpoints: [],
  });
  atomicCreate(file, `${JSON.stringify(ledger, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, baselineStatus: ledger.baselineStatus, revision: 0 })}\n`);
}

function recordReview(argv) {
  const allowed = new Set(["--file", "--expected-revision", "--audit", "--issue-number", "--head-sha"]);
  const values = parsePairs(argv, allowed, allowed);
  const { file, ledger } = readLedger(values.get("--file"));
  const expectedRevision = Number(values.get("--expected-revision"));
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || ledger.revision !== expectedRevision) throw new Error("usage ledger revision conflict");
  const issueNumber = positiveInteger(values.get("--issue-number"), "--issue-number");
  const headSha = values.get("--head-sha");
  if (!SHA.test(headSha || "")) throw new Error("--head-sha must be a full lowercase commit SHA");
  const suppliedAudit = absolutePath(values.get("--audit"), "--audit");
  const auditStat = fs.lstatSync(suppliedAudit);
  if (!auditStat.isFile() || auditStat.isSymbolicLink() || auditStat.size > MAX_AUDIT_BYTES) {
    throw new Error("audit must be a bounded regular non-symlink file");
  }
  const audit = fs.realpathSync(suppliedAudit);
  const { receipt, transcript } = verifyReviewAudit(fs.readFileSync(audit, "utf8"), { headSha });
  const existingReceipt = ledger.localReviews.find((review) => review.receiptSha256 === receipt.receiptSha256);
  if (existingReceipt) {
    if (existingReceipt.issueNumber !== issueNumber || existingReceipt.headSha !== headSha) {
      throw new Error("local review receipt is already bound to a different issue or head");
    }
    process.stdout.write(`${JSON.stringify({ ok: true, changed: false, revision: ledger.revision })}\n`);
    return;
  }
  if (ledger.localReviews.some((review) => review.issueNumber === issueNumber && review.headSha === headSha)) {
    throw new Error("a different local review is already recorded for this issue and head");
  }
  const evidence = reviewUsageEvidence(transcript);
  // A hash-valid old receipt alone cannot prove telemetry, including zero.
  const usage = receipt.usage !== null && evidence.usage !== null
    && JSON.stringify(normalizeTokenUsage(receipt.usage)) === JSON.stringify(evidence.usage) ? evidence.usage : null;
  const updated = {
    ...ledger,
    revision: ledger.revision + 1,
    localReviews: [...ledger.localReviews, {
      issueNumber,
      headSha,
      receiptSha256: receipt.receiptSha256,
      recordedAt: typeof receipt.usageCapturedAt === "string" && Number.isFinite(Date.parse(receipt.usageCapturedAt)) ? new Date(receipt.usageCapturedAt).toISOString() : null,
      responseCount: usage === null ? null : evidence.responseCount,
      status: usage === null ? "unavailable" : "complete",
      usage,
    }],
  };
  validateUsageLedger(updated);
  const lock = `${file}.lock`;
  let lockDescriptor;
  try {
    lockDescriptor = fs.openSync(lock, "wx", 0o600);
    const current = readLedger(file).ledger;
    if (current.revision !== ledger.revision) throw new Error("usage ledger changed before update");
    atomicReplace(file, `${JSON.stringify(updated, null, 2)}\n`, 0o600);
    validateUsageLedger(JSON.parse(fs.readFileSync(file, "utf8")));
  } finally {
    if (lockDescriptor !== undefined) {
      fs.closeSync(lockDescriptor);
      fs.rmSync(lock, { force: true });
    }
  }
  process.stdout.write(`${JSON.stringify({ ok: true, changed: true, revision: updated.revision })}\n`);
}

function timestampOption(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("usage timestamp must be an explicit UTC ISO timestamp");
  return new Date(value).toISOString();
}

function validateCheckpoint(value) {
  if (!isPlainObject(value) || Object.keys(value).sort().join(",") !== "cutoffAt,freshInputTokens,lastObservedAt,phase,reasonCodes,responseCount,startedAt,status,usage") throw new Error("usage checkpoint fields are invalid");
  if (!PHASES.has(value.phase) || !["complete", "partial", "unavailable"].includes(value.status)) throw new Error("usage checkpoint status is invalid");
  timestampOption(value.startedAt); timestampOption(value.cutoffAt);
  if (value.lastObservedAt !== null) timestampOption(value.lastObservedAt);
  if (value.responseCount !== null && (!Number.isSafeInteger(value.responseCount) || value.responseCount < 0)) throw new Error("usage checkpoint response count is invalid");
  if (value.usage !== null) {
    if (!isPlainObject(value.usage) || Object.keys(value.usage).sort().join(",") !== "cachedInputTokens,inputTokens,outputTokens,reasoningOutputTokens,totalTokens") throw new Error("usage checkpoint counter fields are invalid");
    normalizeTokenUsage(value.usage);
    if (value.freshInputTokens !== value.usage.inputTokens - value.usage.cachedInputTokens) throw new Error("usage checkpoint fresh input is invalid");
  } else if (value.freshInputTokens !== null) throw new Error("unavailable usage must have unknown fresh input");
  if (!Array.isArray(value.reasonCodes) || value.reasonCodes.length > 32 || value.reasonCodes.some((reason) => !REASONS.has(reason))) throw new Error("usage checkpoint reason codes are invalid");
}

const REASONS = new Set([
  "controller_usage_unavailable", "agent_usage_unavailable", "session_source_unavailable", "local_review_usage_unavailable", "local_review_time_unavailable", "local_review_zero_coverage_unverified",
  "usage_identity_conflict", "modern_usage_invalid", "response_usage_conflict", "telemetry_line_invalid", "legacy_usage_invalid", "telemetry_line_oversized", "session_read_unavailable",
  "modern_timestamp_unavailable", "embedded_response_unattributed", "cumulative_disagreement", "cumulative_unverified", "legacy_cumulative_only", "baseline_unavailable", "cumulative_regressed", "modern_coverage_incomplete", "legacy_counter_conflict",
]);

function category(evidence, discovered = true) {
  const available = evidence.filter((entry) => entry.usage !== null);
  const usage = !discovered ? null : evidence.length === 0 ? zeroTokenUsage() : usageOrNull(available.map((entry) => entry.usage));
  return {
    participantCount: discovered ? evidence.length : null,
    unavailableCount: discovered ? evidence.length - available.length : null,
    usage,
    responseCount: !discovered || evidence.some((entry) => entry.responseCount === null) ? null : evidence.reduce((sum, entry) => sum + entry.responseCount, 0),
    freshInputTokens: usage === null ? null : usage.inputTokens - usage.cachedInputTokens,
  };
}

function combine(ledger, sources, start, cutoff) {
  const reasons = new Set();
  const empty = { usage: null, responseCount: null, provenance: "unavailable", lastObservedAt: null, reasonCodes: [] };
  let controller = empty;
  const workers = [], explorers = [];
  if (!sources.discovered) reasons.add("session_source_unavailable");
  else {
    if (sources.controller !== null) controller = sessionInterval(sources.controller, start, cutoff, {
      baseline: (ledger.schemaVersion === 1 || ledger.baselineSource === "legacy") && ledger.baselineStatus === "complete" ? ledger.baselineUsage : null, baselineAt: Date.parse(ledger.startedAt),
    });
    if (controller.usage === null) reasons.add("controller_usage_unavailable");
    for (const agent of sources.agents) {
      const evidence = agent.data === null ? empty : sessionInterval(agent.data, start, cutoff, { bornAt: Date.parse(agent.meta.timestamp) });
      if (evidence.usage === null) reasons.add("agent_usage_unavailable");
      (agent.role === "worker" ? workers : explorers).push(evidence);
    }
  }
  const local = [];
  for (const review of ledger.localReviews) {
    // v1 receipts have no timestamp; retain their existence without pretending
    // their totals belong in a requested historical interval.
    if (review.recordedAt == null) {
      reasons.add("local_review_time_unavailable");
      local.push(empty);
    } else if (Date.parse(review.recordedAt) > start && Date.parse(review.recordedAt) <= cutoff) {
      local.push({ usage: review.usage, responseCount: review.responseCount ?? null });
      if (review.usage === null) reasons.add("local_review_usage_unavailable");
      else if (normalizeTokenUsage(review.usage).totalTokens === 0) reasons.add("local_review_zero_coverage_unverified");
    }
  }
  for (const entry of [controller, ...workers, ...explorers]) for (const code of entry.reasonCodes) reasons.add(code);
  const workerCategory = category(workers, sources.discovered);
  const explorerCategory = category(explorers, sources.discovered);
  const localReviews = category(local);
  const usageCategories = [controller, workerCategory, explorerCategory, localReviews];
  const known = usageCategories.flatMap((entry) => entry.usage === null ? [] : [entry.usage]);
  const observed = [controller, ...workers, ...explorers].flatMap((entry) => entry.lastObservedAt === null ? [] : [entry.lastObservedAt]).sort();
  const total = usageOrNull(known);
  return {
    status: reasons.size === 0 ? "complete" : known.length > 0 ? "partial" : "unavailable",
    lastObservedAt: observed.at(-1) ?? null,
    controller: { usage: controller.usage, responseCount: controller.responseCount, freshInputTokens: controller.usage === null ? null : controller.usage.inputTokens - controller.usage.cachedInputTokens, provenance: controller.provenance },
    workers: workerCategory, explorers: explorerCategory, localReviews, total,
    responseCount: usageCategories.some((entry) => entry.responseCount === null) ? null : usageCategories.reduce((sum, entry) => sum + entry.responseCount, 0),
    freshInputTokens: total === null ? null : total.inputTokens - total.cachedInputTokens,
    reasonCodes: [...reasons].sort(),
  };
}

function writeSummary(file, ledgerFile, result) {
  const resolved = absolutePath(file, "--summary-file");
  const directory = assertRealDirectory(path.dirname(resolved), "summary directory");
  const canonical = path.join(directory, path.basename(resolved));
  const worktree = fs.realpathSync(path.resolve(path.dirname(ledgerFile), "../.."));
  if (canonical === worktree || canonical.startsWith(`${worktree}${path.sep}`)) throw new Error("summary must be outside the worktree so cleanup can retain it");
  atomicCreate(canonical, `${JSON.stringify(result, null, 2)}\n`);
}

async function report(argv, operation) {
  const required = new Set(["--file", "--active-sessions-root", "--archived-sessions-root"]);
  const allowed = new Set([...required, "--cutoff", "--phase", "--summary-file"]);
  if (operation === "checkpoint") { required.add("--expected-revision"); required.add("--phase"); allowed.add("--expected-revision"); }
  const values = parsePairs(argv, allowed, required);
  const { file, ledger } = readLedger(values.get("--file"));
  const cutoffAt = timestampOption(values.get("--cutoff") ?? new Date().toISOString());
  const cutoff = Date.parse(cutoffAt), start = Date.parse(ledger.startedAt);
  const phaseName = values.get("--phase") ?? "unassigned";
  if (!PHASES.has(phaseName)) throw new Error("unsupported usage phase");
  if (cutoff < start) throw new Error("usage cutoff precedes run start");
  const checkpoints = ledger.checkpoints ?? [];
  const phaseStart = checkpoints.at(-1)?.cutoffAt ?? ledger.startedAt;
  if (cutoff < Date.parse(phaseStart)) throw new Error("usage cutoff precedes last checkpoint");
  if (operation === "checkpoint" && (Number(values.get("--expected-revision")) !== ledger.revision || checkpoints.length >= MAX_CHECKPOINTS)) throw new Error("usage checkpoint revision conflict or limit reached");
  const sources = { discovered: false, controller: null, agents: [] };
  try {
    const byId = metasById(sessionFiles(rootsFrom(values)));
    const entries = byId.get(ledger.controllerThreadId) ?? [];
    if (entries.length === 1) sources.controller = await readSessionUsage(entries[0].file, ledger.controllerThreadId);
    const agents = descendants(byId, ledger.controllerThreadId, start, cutoff);
    for (const agent of agents) sources.agents.push({ role: agent.role, meta: agent.entries[0], data: agent.entries.length === 1 ? await readSessionUsage(agent.entries[0].file, agent.id) : null });
    sources.discovered = true;
  } catch { /* Explicit-root discovery failure is diagnostic only. */ }
  const cumulative = combine(ledger, sources, start, cutoff);
  const interval = combine(ledger, sources, Date.parse(phaseStart), cutoff);
  const phase = {
    phase: phaseName, startedAt: phaseStart, cutoffAt, status: interval.status,
    usage: interval.total, freshInputTokens: interval.freshInputTokens, responseCount: interval.responseCount,
    lastObservedAt: interval.lastObservedAt, reasonCodes: interval.reasonCodes,
  };
  validateCheckpoint(phase);
  const result = {
    schemaVersion: 2, ...cumulative, startedAt: ledger.startedAt, cutoffAt,
    capturedAt: new Date().toISOString(),
    cutoff: "response completion / review runner capture timestamps in (startedAt, cutoffAt]; unreported in-flight usage is excluded",
    phase, checkpoints,
    exclusions: ["github_codex_review", "cleanup_execution", "final_response", "tool_and_service_costs", "not_yet_emitted_usage"],
  };
  if (operation === "checkpoint") {
    const updated = { ...ledger, schemaVersion: 2,
      baselineSource: ledger.schemaVersion === 1 ? ledger.baselineStatus === "complete" ? "legacy" : "unavailable" : ledger.baselineSource ?? "unavailable",
      revision: ledger.revision + 1, checkpoints: [...checkpoints, phase] };
    validateUsageLedger(updated);
    const lock = `${file}.lock`;
    let descriptor;
    try {
      descriptor = fs.openSync(lock, "wx", 0o600);
      if (readLedger(file).ledger.revision !== ledger.revision) throw new Error("usage ledger changed before checkpoint");
      atomicReplace(file, `${JSON.stringify(updated, null, 2)}\n`, 0o600);
    } finally { if (descriptor !== undefined) { fs.closeSync(descriptor); fs.rmSync(lock, { force: true }); } }
    result.revision = updated.revision;
  }
  if (values.has("--summary-file")) {
    result.summaryStatus = "retained";
    result.summaryReasonCode = null;
    try { writeSummary(values.get("--summary-file"), file, result); }
    catch {
      result.summaryStatus = "unavailable";
      result.summaryReasonCode = "summary_export_failed";
      process.stderr.write("usage summary export unavailable\n");
      process.exitCode = 1;
    }
  }
  // The bounded result remains available even when durable export fails.
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function main() {
  const [operation, ...argv] = process.argv.slice(2);
  if (operation === "init") await initialize(argv);
  else if (operation === "record-review") recordReview(argv);
  else if (operation === "report" || operation === "checkpoint") await report(argv, operation);
  else throw new Error("Usage: run-usage.mjs <init|record-review|report|checkpoint> [options]");
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
