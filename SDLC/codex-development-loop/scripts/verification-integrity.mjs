import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SHA = /^[0-9a-f]{40}$/;
const EVIDENCE_KEYS = ["acceptanceEvidence", "riskEvidence", "tests", "localReview", "checks"];
const MAX_REFERENCE_BYTES = 1024 * 1024;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function text(value, label, max = 4096) {
  if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value) > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) {
    throw new Error(`${label} must be nonblank bounded text (maximum ${max} UTF-8 bytes)`);
  }
}

function keys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label} field ${key} is invalid`);
}

function relativePath(value, label) {
  text(value, label, 1024);
  if (path.isAbsolute(value) || value.includes("\\") || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${label} must be a checkout-relative path without traversal`);
  }
}

function reference(ref, label) {
  object(ref, label);
  keys(ref, ["path", "startLine", "endLine"], label);
  relativePath(ref.path, `${label}.path`);
  if (ref.startLine !== undefined && (!Number.isSafeInteger(ref.startLine) || ref.startLine < 1)) throw new Error(`${label}.startLine is invalid`);
  if (ref.endLine !== undefined && (ref.startLine === undefined || !Number.isSafeInteger(ref.endLine) || ref.endLine < ref.startLine)) throw new Error(`${label}.endLine is invalid`);
}

function references(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) throw new Error(`${label} must contain 1 to 16 references`);
  value.forEach((ref, index) => reference(ref, `${label}[${index}]`));
}

export function validateEvidenceEntry(entry, label = "worker receipt evidence") {
  object(entry, label);
  keys(entry, ["claim", "command", "result", "requiredBoundary", "exercisedBoundary", "references"], label);
  for (const key of ["claim", "requiredBoundary", "exercisedBoundary"]) text(entry[key], `${label}.${key}`);
  object(entry.result, `${label}.result`);
  keys(entry.result, ["status", "exitCode", "reason"], `${label}.result`);
  const { status, exitCode, reason } = entry.result;
  if (!["passed", "failed", "not-run"].includes(status)) throw new Error(`${label}.result.status is invalid`);
  if (status === "not-run") {
    if (exitCode !== null) throw new Error(`${label} not-run result requires null exitCode`);
    text(reason, `${label}.result.reason`);
    if (entry.command !== null) text(entry.command, `${label}.command`);
  } else {
    text(entry.command, `${label}.command`);
    if (!Number.isInteger(exitCode) || (status === "passed" ? exitCode !== 0 : exitCode < 1 || exitCode > 255)) {
      throw new Error(`${label}.result.exitCode does not match status`);
    }
    if (reason !== undefined) text(reason, `${label}.result.reason`);
  }
  references(entry.references, `${label}.references`);
}

function facts(value, label, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > 256) throw new Error(`${label} must be a bounded ${allowEmpty ? "" : "nonempty "}array`);
  value.forEach((fact, index) => text(fact, `${label}[${index}]`));
}

export function validateSurfaceClosure(receipt) {
  const closureIds = new Set();
  receipt.surfaceClosure.forEach((surface, index) => {
    const label = `worker receipt surfaceClosure[${index}]`;
    object(surface, label);
    keys(surface, ["id", "boundary", "inventoryEvidence", "invariants", "coverageProof", "introducedBehaviorProof"], label);
    text(surface.id, `${label}.id`, 128);
    text(surface.boundary, `${label}.boundary`);
    if (closureIds.has(surface.id)) throw new Error("worker receipt surfaceClosure contains duplicate id");
    closureIds.add(surface.id);
    for (const key of ["inventoryEvidence", "invariants", "coverageProof", "introducedBehaviorProof"]) facts(surface[key], `${label}.${key}`);
  });
  if (receipt.phase !== "correction") return;
  const censusIds = new Set();
  receipt.prSurfaceCensus.forEach((surface, index) => {
    const label = `worker receipt prSurfaceCensus[${index}]`;
    object(surface, label);
    keys(surface, ["surfaceId", "owningBoundary", "changedProductionSymbols", "historicalFindingAnchors", "effectiveInputs"], label);
    text(surface.surfaceId, `${label}.surfaceId`, 128);
    text(surface.owningBoundary, `${label}.owningBoundary`);
    if (censusIds.has(surface.surfaceId)) throw new Error("worker receipt prSurfaceCensus contains duplicate surfaceId");
    censusIds.add(surface.surfaceId);
    for (const key of ["changedProductionSymbols", "historicalFindingAnchors", "effectiveInputs"]) facts(surface[key], `${label}.${key}`, true);
  });
  if (censusIds.size !== closureIds.size || [...censusIds].some((id) => !closureIds.has(id))) throw new Error("worker receipt census and closure surface IDs must match exactly");
  const findings = new Set();
  receipt.findingClosure.forEach((finding, index) => {
    const label = `worker receipt findingClosure[${index}]`;
    object(finding, label);
    keys(finding, ["finding", "rootCause", "affectedSurfaceIds"], label);
    text(finding.finding, `${label}.finding`);
    text(finding.rootCause, `${label}.rootCause`);
    if (findings.has(finding.finding)) throw new Error("worker receipt findingClosure contains duplicate finding");
    findings.add(finding.finding);
    facts(finding.affectedSurfaceIds, `${label}.affectedSurfaceIds`);
    if (new Set(finding.affectedSurfaceIds).size !== finding.affectedSurfaceIds.length || finding.affectedSurfaceIds.some((id) => !censusIds.has(id))) throw new Error("worker receipt findingClosure references unknown or duplicate surface IDs");
  });
}

export function validateVerificationShape(receipt) {
  if (!SHA.test(receipt.verificationBaseSha || "")) throw new Error("worker receipt verificationBaseSha must be a full lowercase SHA");
  if (!Array.isArray(receipt.verificationChanges) || receipt.verificationChanges.length > 256) throw new Error("worker receipt verificationChanges must be a bounded array");
  const seen = new Set();
  receipt.verificationChanges.forEach((change, index) => {
    const label = `worker receipt verificationChanges[${index}]`;
    object(change, label);
    keys(change, ["path", "status", "disposition", "reason", "contractRefs", "proof"], label);
    relativePath(change.path, `${label}.path`);
    if (seen.has(change.path)) throw new Error("worker receipt verificationChanges contains a duplicate path");
    seen.add(change.path);
    if (!["A", "M", "D", "T"].includes(change.status)) throw new Error(`${label}.status is invalid`);
    if (!["added", "retained", "replaced", "removed"].includes(change.disposition)) throw new Error(`${label}.disposition is invalid`);
    if ((change.status === "A" && change.disposition !== "added") || (change.status === "D" && !["removed", "replaced"].includes(change.disposition))) {
      throw new Error(`${label}.disposition does not match change status`);
    }
    text(change.reason, `${label}.reason`);
    references(change.contractRefs, `${label}.contractRefs`);
    if (!Array.isArray(change.proof) || change.proof.length === 0 || change.proof.length > 16) throw new Error(`${label}.proof must contain 1 to 16 evidence entries`);
    change.proof.forEach((entry, i) => validateEvidenceEntry(entry, `${label}.proof[${i}]`));
    if (!change.proof.some((entry) => entry.result.status === "passed")) throw new Error(`${label}.proof requires passed retained or replacement verification`);
  });
}

export function validateReceiptReferences(receipt, repo) {
  const checkout = fs.realpathSync(repo);
  const all = [];
  for (const key of EVIDENCE_KEYS) for (const entry of receipt[key] ?? []) all.push(...entry.references);
  for (const change of receipt.verificationChanges) {
    all.push(...change.contractRefs);
    for (const entry of change.proof) all.push(...entry.references);
  }
  for (const ref of all) {
    const file = path.resolve(checkout, ref.path);
    const resolved = fs.realpathSync(file);
    const relative = path.relative(checkout, resolved);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error(`evidence reference escapes checkout: ${ref.path}`);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > MAX_REFERENCE_BYTES) throw new Error(`evidence reference must be a nonempty regular file no larger than 1 MiB: ${ref.path}`);
    if (ref.startLine !== undefined) {
      const lines = fs.readFileSync(file, "utf8").split("\n");
      const count = lines.length - (lines.at(-1) === "" ? 1 : 0);
      if ((ref.endLine ?? ref.startLine) > count) throw new Error(`evidence reference line range is unresolved: ${ref.path}`);
    }
  }
}

function git(repo, args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr.trim() || "verification Git inspection failed");
  return result.stdout;
}

export function parseApprovedBase(value) {
  if (typeof value !== "string" || !/^[^\s\x00-\x1f]+ [0-9a-f]{40}$/.test(value) || value.startsWith("-")) {
    throw new Error("worker expectedBaseOrReviewedHead must be '<ref> <full lowercase SHA>'; obtain a fresh Controller-approved packet");
  }
  return value.split(" ")[1];
}

export function verificationBase(repo, baseRefOrSha, headSha) {
  // Resolve refs as revisions, never as options, shell text, hooks, or linked instructions.
  const base = git(repo, ["rev-parse", "--verify", "--end-of-options", `${baseRefOrSha}^{commit}`]).trim();
  if (!SHA.test(base) || !SHA.test(headSha)) throw new Error("verification base or candidate SHA is invalid");
  return git(repo, ["merge-base", base, headSha]).trim();
}

// Conservative conventional-layout detector. Custom paths can be declared in the
// receipt; the Controller still inspects the complete diff for semantic omissions.
export function isVerificationPath(file) {
  return /(^|\/)(?:tests?|specs?|__tests__|fixtures?|__fixtures__|snapshots?|__snapshots__)(\/|[._-])/i.test(file)
    || /(?:^|[./_-])(?:test|spec|fixture|snapshot)(?:[._-]|$)/i.test(path.basename(file))
    || /(^|\/)(?:\.github\/workflows|\.circleci|\.buildkite|\.husky)(\/|$)/i.test(file)
    || /(^|\/)(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Makefile|justfile|Taskfile\.ya?ml|\.gitlab-ci\.ya?ml|Jenkinsfile|azure-pipelines\.ya?ml|tox\.ini|pytest\.ini|pyproject\.toml|setup\.cfg|Cargo\.toml|go\.mod|Gemfile|Rakefile|pom\.xml|build\.gradle(?:\.kts)?)$/i.test(file)
    || /(^|\/)(?:vitest|vite|jest|playwright|cypress|karma|nyc|ava|mocha|tap|webdriver|wdio|jasmine|testcafe|wallaby|rollup|webpack|babel|eslint|tsconfig)(?:\.|$)/i.test(path.basename(file))
    || /(^|\/)\.(?:mocharc|nycrc|taprc|c8rc)(?:\.|$)/i.test(file);
}

export function reconcileVerificationChanges(receipt, repo, baseSha) {
  if (receipt.verificationBaseSha !== baseSha) throw new Error("worker receipt verification base does not match independently derived merge-base; obtain fresh evidence");
  const fields = git(repo, ["diff", "--no-ext-diff", "--no-renames", "--name-status", "-z", baseSha, receipt.localCommitSha, "--"]).split("\0");
  fields.pop();
  const changed = new Map();
  for (let i = 0; i < fields.length; i += 2) {
    if (!["A", "M", "D", "T"].includes(fields[i]) || !fields[i + 1]) throw new Error("unsupported verification diff status");
    changed.set(fields[i + 1], fields[i]);
  }
  const declared = new Set();
  for (const entry of receipt.verificationChanges) {
    if (changed.get(entry.path) !== entry.status) throw new Error(`verification disposition is not an exact changed path/status: ${entry.path}`);
    declared.add(entry.path);
  }
  for (const file of changed.keys()) if (isVerificationPath(file) && !declared.has(file)) throw new Error(`verification census omits changed file: ${file}`);
  if (declared.size && receipt.reviewTier === "trivial") throw new Error("verification changes require at least standard local review");
  return { baseSha, changedFiles: [...changed].map(([file, status]) => ({ path: file, status })), verificationFiles: [...declared] };
}
