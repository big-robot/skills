import { createHash } from "node:crypto";

import { validateReceiptTokenUsage } from "./token-usage.mjs";

export const REVIEW_RECEIPT_TYPE = "cdl.review_receipt";

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function completedReview(transcript) {
  let hasAgentMessage = false;
  let hasTurnCompletion = false;
  for (const line of transcript.split("\n")) {
    try {
      const event = JSON.parse(line);
      if (event?.type === "item.completed" && event?.item?.type === "agent_message"
        && typeof event.item.text === "string") hasAgentMessage = true;
      if (event?.type === "turn.completed") hasTurnCompletion = true;
    } catch {
      // Sanitized stderr and warnings may be non-JSON.
    }
  }
  return hasAgentMessage && hasTurnCompletion;
}

export function createReviewAuditReceipt({
  baseRef,
  baseSha,
  headSha,
  treeSha,
  briefSha256,
  inputSha256,
  codexBin,
  codexVersion,
  command,
  exitCode,
  transcript,
  usage,
  usageCapturedAt,
}) {
  if (!completedReview(transcript)) throw new Error("local review did not return a completed agent result");
  const body = {
    type: REVIEW_RECEIPT_TYPE,
    schemaVersion: 1,
    baseRef,
    baseSha,
    headSha,
    treeSha,
    briefSha256,
    inputSha256,
    codexBin,
    codexVersion,
    command,
    exitCode,
    transcriptSha256: sha256(transcript),
    usage: validateReceiptTokenUsage(usage),
    ...(usageCapturedAt === undefined ? {} : { usageCapturedAt }),
  };
  return { ...body, receiptSha256: sha256(canonical(body)) };
}

export function serializeReviewAudit(transcript, receipt) {
  const normalized = transcript.endsWith("\n") ? transcript : `${transcript}\n`;
  return `${normalized}${JSON.stringify(receipt)}\n`;
}

export function verifyReviewAudit(contents, expected = {}) {
  if (!contents.endsWith("\n")) throw new Error("localAudit output must end with a newline");
  const end = contents.length - 1;
  const receiptStart = contents.lastIndexOf("\n", end - 1) + 1;
  if (receiptStart <= 0) throw new Error("localAudit output lacks runner receipt");
  const transcript = contents.slice(0, receiptStart);
  let receipt;
  try {
    receipt = JSON.parse(contents.slice(receiptStart, end));
  } catch {
    throw new Error("localAudit runner receipt is not valid JSON");
  }
  if (receipt?.type !== REVIEW_RECEIPT_TYPE || receipt.schemaVersion !== 1) {
    throw new Error("localAudit output lacks a supported runner receipt");
  }
  const receiptSha256 = receipt.receiptSha256;
  const body = { ...receipt };
  delete body.receiptSha256;
  if (!SHA256.test(receiptSha256 || "") || sha256(canonical(body)) !== receiptSha256) {
    throw new Error("localAudit runner receipt hash is invalid");
  }
  for (const [field, value] of [
    ["baseSha", receipt.baseSha],
    ["headSha", receipt.headSha],
    ["treeSha", receipt.treeSha],
  ]) {
    if (!COMMIT_SHA.test(value || "")) throw new Error(`localAudit runner receipt ${field} is invalid`);
  }
  for (const [field, value] of [
    ["briefSha256", receipt.briefSha256],
    ["inputSha256", receipt.inputSha256],
    ["transcriptSha256", receipt.transcriptSha256],
  ]) {
    if (!SHA256.test(value || "")) throw new Error(`localAudit runner receipt ${field} is invalid`);
  }
  if (receipt.transcriptSha256 !== sha256(transcript)) throw new Error("localAudit transcript hash is invalid");
  if (!completedReview(transcript)) throw new Error("localAudit transcript lacks a completed agent result");
  validateReceiptTokenUsage(receipt.usage);
  if (receipt.exitCode !== 0) throw new Error("localAudit runner receipt exitCode must equal zero");
  if (!Array.isArray(receipt.command) || receipt.command.length === 0
    || receipt.command.some((part) => typeof part !== "string" || !part)) {
    throw new Error("localAudit runner receipt command is invalid");
  }
  if (typeof receipt.codexBin !== "string" || !receipt.codexBin.startsWith("/")) {
    throw new Error("localAudit runner receipt codexBin is invalid");
  }
  if (typeof receipt.codexVersion !== "string" || !receipt.codexVersion.trim()) {
    throw new Error("localAudit runner receipt codexVersion is invalid");
  }
  const bindings = {
    promptSha256: "briefSha256",
    headSha: "headSha",
    exitCode: "exitCode",
    codexBin: "codexBin",
    codexVersion: "codexVersion",
  };
  for (const [expectedField, receiptField] of Object.entries(bindings)) {
    if (expected[expectedField] !== undefined && expected[expectedField] !== null
      && receipt[receiptField] !== expected[expectedField]) {
      throw new Error(`localAudit runner receipt ${receiptField} does not match ledger`);
    }
  }
  return { transcript, receipt };
}
