import { createHash } from "node:crypto";

export const SHA_RE = /^[0-9a-f]{40}$/;

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function receiptHash(receipt) {
  const unhashed = { ...receipt };
  delete unhashed.receiptSha256;
  return createHash("sha256").update(canonical(unhashed)).digest("hex");
}

export function validateWorkerReceiptShape(receipt, { expectedPhase = null, requireHash = true } = {}) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("worker receipt must be a JSON object");
  if (receipt.schemaVersion !== 1 || receipt.outcome !== "ready-to-push") throw new Error("worker receipt schema or outcome is invalid");
  if (!new Set(["implementation", "correction"]).has(receipt.phase)) throw new Error("worker receipt phase is invalid");
  if (expectedPhase !== null && receipt.phase !== expectedPhase) throw new Error("worker receipt phase does not match expected phase");
  if (!new Set(["trivial", "standard", "large-complex"]).has(receipt.reviewTier)) throw new Error("worker receipt reviewTier is invalid");
  if (!SHA_RE.test(receipt.localCommitSha)) throw new Error("worker receipt localCommitSha is invalid");

  const requiredArrays = receipt.phase === "implementation"
    ? ["acceptanceEvidence", "riskEvidence", "surfaceClosure", "tests", "localReview"]
    : ["checks", "prSurfaceCensus", "findingClosure", "surfaceClosure"];
  for (const key of requiredArrays) if (!Array.isArray(receipt[key])) throw new Error(`worker receipt ${key} must be an array`);
  const requiredNonempty = receipt.phase === "implementation"
    ? ["acceptanceEvidence", "tests", "localReview"]
    : ["checks", "prSurfaceCensus", "surfaceClosure"];
  for (const key of requiredNonempty) if (receipt[key].length === 0) throw new Error(`worker receipt ${key} is incomplete`);

  if (Object.hasOwn(receipt, "incidentalFindings")) {
    if (!Array.isArray(receipt.incidentalFindings)) throw new Error("worker receipt incidentalFindings must be an array");
    const ids = new Set();
    for (const finding of receipt.incidentalFindings) {
      if (!finding || typeof finding !== "object" || Array.isArray(finding)) throw new Error("worker receipt incidentalFindings entries must be objects");
      for (const [key, maxBytes] of [["id", 64], ["summary", 1024]]) {
        if (typeof finding[key] !== "string" || !finding[key].trim() || Buffer.byteLength(finding[key], "utf8") > maxBytes) {
          throw new Error(`worker receipt incidentalFindings ${key} must be nonblank and no larger than ${maxBytes} UTF-8 bytes`);
        }
      }
      if (ids.has(finding.id)) throw new Error("worker receipt incidentalFindings contains a duplicate id");
      ids.add(finding.id);
      if (typeof finding.sourceSha !== "string" || !SHA_RE.test(finding.sourceSha)) throw new Error("worker receipt incidentalFindings sourceSha is invalid");
      if (finding.status !== "suspected" && finding.status !== "confirmed") throw new Error("worker receipt incidentalFindings status is invalid");
      if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) throw new Error("worker receipt incidentalFindings evidence must be a nonempty array");
      for (const evidence of finding.evidence) {
        if (typeof evidence !== "string" || !evidence.trim() || Buffer.byteLength(evidence, "utf8") > 1024) {
          throw new Error("worker receipt incidentalFindings evidence must contain nonblank strings no larger than 1024 UTF-8 bytes");
        }
      }
    }
  }

  const actualHash = receiptHash(receipt);
  if (requireHash) {
    if (!/^[0-9a-f]{64}$/.test(receipt.receiptSha256 || "")) throw new Error("worker receipt hash is invalid");
    if (receipt.receiptSha256 !== actualHash) throw new Error("worker receipt hash mismatch");
  } else if (Object.hasOwn(receipt, "receiptSha256")) {
    throw new Error("draft worker receipt must omit receiptSha256");
  }
  return actualHash;
}
