import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { MAX_REVIEW_AUDIT_BYTES, verifyReviewAudit } from "./review-audit-receipt.mjs";

const SHA = /^[0-9a-f]{40}$/;
const EVIDENCE_KEYS = ["acceptanceEvidence", "riskEvidence", "tests", "localReview", "checks"];
const MAX_REFERENCE_BYTES = 1024 * 1024;
export const MAX_VERIFICATION_CHANGES = 256;
export const MAX_WORKER_RECEIPT_BYTES = 64 * 1024;

function capacityError(actual, limit, unit) {
  return new Error(`VERIFICATION CAPACITY: ${actual} ${unit} exceed ${limit}. Preserve the complete sanitized inventory and evidence; ask the Controller to replan within existing approved unit and publication authority. Do not omit or truncate evidence, split scope autonomously, use TEST CONFLICT, or return stopped. An indivisible unit requires a reviewed transport redesign before implementation.`);
}

export function assertVerificationCountCapacity(count) {
  if (count > MAX_VERIFICATION_CHANGES) throw capacityError(count, MAX_VERIFICATION_CHANGES, "verification changes");
}

export function assertReceiptByteCapacity(bytes) {
  if (bytes > MAX_WORKER_RECEIPT_BYTES) throw capacityError(bytes, MAX_WORKER_RECEIPT_BYTES, "UTF-8 receipt bytes");
}

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
  keys(ref, ["path", "startLine", "endLine", "kind"], label);
  if (ref.kind !== undefined && ref.kind !== "guarded-audit") throw new Error(`${label}.kind must be guarded-audit or omitted`);
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
  if (!Array.isArray(receipt.verificationChanges)) throw new Error("worker receipt verificationChanges must be a bounded array");
  assertVerificationCountCapacity(receipt.verificationChanges.length);
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

function referenceLineCount(contents) {
  let count = contents.endsWith("\n") ? 0 : 1;
  let offset = -1;
  while ((offset = contents.indexOf("\n", offset + 1)) !== -1) count += 1;
  return count;
}

export function validateReceiptReferences(receipt, repo, { runtime = null, localAudit = null } = {}) {
  const checkout = fs.realpathSync(repo);
  const validated = new Map();
  const all = [];
  for (const key of EVIDENCE_KEYS) for (const entry of receipt[key] ?? []) {
    all.push(...entry.references.map((ref) => ({ ref, role: key, passed: entry.result.status === "passed" })));
  }
  for (const change of receipt.verificationChanges) {
    all.push(...change.contractRefs.map((ref) => ({ ref, role: "contract", passed: false })));
    for (const entry of change.proof) all.push(...entry.references.map((ref) => ({ ref, role: "proof", passed: entry.result.status === "passed" })));
  }
  let guardedLocalReview = false;
  for (const { ref, role, passed } of all) {
    const file = path.resolve(checkout, ref.path);
    const resolved = fs.realpathSync(file);
    const relative = path.relative(checkout, resolved);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error(`evidence reference escapes checkout: ${ref.path}`);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw new Error(`evidence reference must be a nonempty regular non-symlink file: ${ref.path}`);
    const identity = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    let metadata = validated.get(resolved);
    if (metadata && metadata.identity !== identity) throw new Error(`evidence reference changed during validation: ${ref.path}`);
    const guarded = ref.kind === "guarded-audit" || stat.size > MAX_REFERENCE_BYTES;
    if (guarded) {
      const auditRoot = path.join(checkout, "sdlc-scratch", "audits");
      if (stat.size > MAX_REVIEW_AUDIT_BYTES || path.dirname(file) !== auditRoot || resolved !== file
        || fs.realpathSync(auditRoot) !== auditRoot || !fs.lstatSync(auditRoot).isDirectory()) {
        throw new Error(`guarded audit reference must be bounded and directly under the real audit directory: ${ref.path}`);
      }
    }
    if (!metadata) {
      metadata = { identity, lineCount: null, guardedVerified: false };
      validated.set(resolved, metadata);
    }
    if (guarded && !metadata.guardedVerified) {
      if (typeof runtime?.codexBin !== "string" || typeof runtime?.codexVersion !== "string" || !runtime.codexVersion.trim()) {
        throw new Error("guarded audit reference requires the pinned Codex runtime");
      }
      if (localAudit !== null && (localAudit.engine !== "codex" || path.resolve(checkout, localAudit.outputFile ?? "") !== file)) {
        throw new Error("guarded audit reference does not match Controller audit provenance");
      }
      const contents = fs.readFileSync(file, "utf8");
      const { receipt: audit } = verifyReviewAudit(contents, { codexBin: runtime.codexBin, codexVersion: runtime.codexVersion,
        ...(localAudit === null ? {} : { headSha: localAudit.headSha, promptSha256: localAudit.promptSha256, exitCode: localAudit.exitCode }) });
      if (JSON.stringify(audit.command) !== JSON.stringify(["exec", "--ephemeral", "--sandbox", "read-only", "review", "--json", "-"])) {
        throw new Error("guarded audit reference lacks the guarded review command");
      }
      git(repo, ["merge-base", "--is-ancestor", audit.headSha, receipt.localCommitSha]);
      if (git(repo, ["rev-parse", `${audit.headSha}^{tree}`]).trim() !== audit.treeSha) throw new Error("guarded audit reference tree does not match its audited commit");
      metadata.lineCount = referenceLineCount(contents);
      metadata.guardedVerified = true;
    }
    // Only metadata survives this iteration; stronger roles promote ordinary cache entries.
    if (role === "localReview" && passed && guarded && metadata.guardedVerified) guardedLocalReview = true;
    if (ref.startLine !== undefined) {
      metadata.lineCount ??= referenceLineCount(fs.readFileSync(file, "utf8"));
      if ((ref.endLine ?? ref.startLine) > metadata.lineCount) throw new Error(`evidence reference line range is unresolved: ${ref.path}`);
    }
  }
  if (receipt.phase === "implementation" && receipt.reviewTier !== "trivial" && !guardedLocalReview) {
    throw new Error("nontrivial implementation requires passed localReview evidence referencing a guarded audit; mark small audit references kind: guarded-audit");
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
// Keep each supported ecosystem's manifests, runners and resolved-dependency
// inputs together. Names match at any depth, independently of project roots.
export const CONVENTIONAL_VERIFICATION_FILES = Object.freeze(Object.fromEntries(Object.entries({
  javascript: ["package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"],
  python: ["noxfile.py", "pyproject.toml", "poetry.lock", "pdm.lock", "uv.lock", "Pipfile", "Pipfile.lock", "setup.cfg", "setup.py", "requirements.txt", "requirements.in", "tox.ini", "pytest.ini", "conftest.py"],
  rust: ["Cargo.toml", "Cargo.lock"],
  go: ["go.mod", "go.sum", "go.work", "go.work.sum"],
  ruby: ["Gemfile", "Gemfile.lock", "Rakefile"],
  maven: ["pom.xml"],
  gradle: ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts", "gradle.lockfile"],
  automation: ["Makefile", "justfile", "Taskfile.yml", "Taskfile.yaml"],
}).map(([ecosystem, files]) => [ecosystem, Object.freeze(files)])));
const conventionalVerificationNames = new Set(Object.values(CONVENTIONAL_VERIFICATION_FILES).flat().map((file) => file.toLowerCase()));
export const CONVENTIONAL_VERIFICATION_DIRECTORIES = Object.freeze(["test", "tests", "spec", "specs", "__tests__", "fixture", "fixtures", "__fixtures__", "snapshot", "snapshots", "__snapshots__", "testdata", "__mocks__"]);
export const CONVENTIONAL_CI_PATHS = Object.freeze({
  files: Object.freeze([".gitlab-ci.yml", ".gitlab-ci.yaml", "Jenkinsfile", "azure-pipelines.yml", "azure-pipelines.yaml", ".travis.yml", ".travis.yaml", "bitbucket-pipelines.yml", ".drone.yml", ".cirrus.yml", "appveyor.yml", ".appveyor.yml", ".woodpecker.yml", ".woodpecker.yaml"]),
  directories: Object.freeze([".github/workflows", ".github/actions", ".circleci", ".buildkite", ".husky", ".woodpecker", ".semaphore", ".teamcity"]),
});
const verificationDirectories = new Set(CONVENTIONAL_VERIFICATION_DIRECTORIES);
const ciNames = new Set(CONVENTIONAL_CI_PATHS.files.map((file) => file.toLowerCase()));

export function isVerificationPath(file) {
  const lower = file.toLowerCase();
  return lower.split("/").some((component) => verificationDirectories.has(component) || /^[^/]+-snapshots$/.test(component))
    || /(^|\/)(?:tests?|specs?|__tests__|fixtures?|__fixtures__|snapshots?|__snapshots__)(\/|[._-])/i.test(file)
    || /(?:^|[./_-])(?:test|spec|fixture|snapshot)(?:[._-]|$)/i.test(path.basename(file))
    || ciNames.has(path.basename(lower))
    || CONVENTIONAL_CI_PATHS.directories.some((directory) => `/${lower}/`.includes(`/${directory}/`))
    || conventionalVerificationNames.has(path.basename(file).toLowerCase())
    || /^requirements(?:[._-][^/]*)?\.(?:txt|in)$/i.test(path.basename(file))
    || /(^|\/)requirements\/.+\.(?:txt|in)$/i.test(file)
    || /(^|\/)gradle\/dependency-locks\/.+\.lockfile$/i.test(file)
    || /(^|\/)(?:vitest|vite|jest|playwright|cypress|karma|nyc|c8|coverage|ava|mocha|tap|webdriver|wdio|jasmine|testcafe|wallaby|rollup|webpack|babel|eslint|tsconfig)(?:\.|$)/i.test(path.basename(file))
    || /(^|\/)\.(?:mocharc|nycrc|taprc|c8rc|coveragerc|simplecov)(?:\.|$)/i.test(file)
    || /(^|\/)\.?(?:codecov|coveralls)\.ya?ml$/i.test(file);
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
  assertVerificationCountCapacity([...changed.keys()].filter(isVerificationPath).length);
  const declared = new Set();
  for (const entry of receipt.verificationChanges) {
    if (changed.get(entry.path) !== entry.status) throw new Error(`verification disposition is not an exact changed path/status: ${entry.path}`);
    declared.add(entry.path);
  }
  for (const file of changed.keys()) if (isVerificationPath(file) && !declared.has(file)) throw new Error(`verification census omits changed file: ${file}`);
  if (declared.size && receipt.reviewTier === "trivial") throw new Error("verification changes require at least standard local review");
  return { baseSha, changedFiles: [...changed].map(([file, status]) => ({ path: file, status })), verificationFiles: [...declared] };
}
