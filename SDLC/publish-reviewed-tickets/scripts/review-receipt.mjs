#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RECEIPT_NAME = "review-receipt.json";
const MANIFEST_NAME = "publication-manifest.json";
const STATE_NAME = "publication-state.json";
const SHA256 = /^[0-9a-f]{64}$/;
const SHA1 = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[^/\s]+\/[^/\s]+$/;
const SLICE_ID = /^S\d{2,}$/;
const ACCEPTANCE_ID = /^AC-\d{2,}$/;
const VERIFICATION_ID = /^V-\d{2,}$/;
const SCAFFOLD_PLACEHOLDER = /<(?:owner\/repository|[a-z][a-z -]*(?:issue|title|outcome|command|criterion|sha|ref|number|body|verification|repository)[a-z -]*)>/i;

function problem(message) { throw new Error(message); }
function fail(message) { process.stderr.write(`${message}\n`); process.exitCode = 1; }
function hash(data) { return crypto.createHash("sha256").update(data).digest("hex"); }

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) problem(`${label} must be a non-empty string`);
  if (SCAFFOLD_PLACEHOLDER.test(value) || /\{\{[^{}]+\}\}/.test(value)) problem(`${label} contains an unresolved placeholder`);
  return value;
}
function requireArray(value, label) { if (!Array.isArray(value)) problem(`${label} must be an array`); return value; }
function requireUnique(values, label) { if (new Set(values).size !== values.length) problem(`${label} contains duplicates`); }
function requirePlainObject(value, label) { if (!value || typeof value !== "object" || Array.isArray(value)) problem(`${label} must be an object`); return value; }

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || !["check", "create", "verify", "render"].includes(command)) problem("Usage: review-receipt.mjs <check|create|verify|render> (--bundle-dir|--candidate-dir) <path> --repo-root <path> [--github-repo owner/repo --base-ref ref]");
  const args = { command };
  const allowed = new Set(command === "render" ? ["bundle-dir"] : ["bundle-dir", "candidate-dir", "repo-root", "github-repo", "base-ref"]);
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index]; const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined || !allowed.has(key.slice(2)) || Object.hasOwn(args, key.slice(2))) problem(`Invalid argument near ${key ?? "<end>"}`);
    args[key.slice(2)] = value;
  }
  if (command === "render" && !args["bundle-dir"]) problem("render requires --bundle-dir");
  if (command !== "render" && Boolean(args["bundle-dir"]) === Boolean(args["candidate-dir"])) problem("Specify exactly one of --bundle-dir or --candidate-dir");
  args.mode = args["bundle-dir"] ? "delivery-bundle" : "standalone-ticket";
  args.artifactDir = args["bundle-dir"] ?? args["candidate-dir"];
  return args;
}

function git(repoRoot, args) {
  try { return execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch (error) { problem(`git ${args.join(" ")} failed: ${error?.stderr?.toString().trim() || error.message}`); }
}
function normalizeGitHubRepository(remote) {
  const trimmed = remote.trim().replace(/\.git$/, "");
  const scpMatch = trimmed.match(/^git@github\.com:([^/]+\/.+)$/);
  if (scpMatch) return scpMatch[1];
  const urlMatch = trimmed.match(/^(?:https?:\/\/|ssh:\/\/git@)github\.com\/([^/]+\/.+)$/);
  if (urlMatch) return urlMatch[1];
  problem(`Remote is not a recognized GitHub repository URL: ${remote}`);
}
async function requirePlainDirectory(target, label) {
  const stat = await fs.lstat(target).catch(() => null);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) problem(`${label} must be a non-symlink directory: ${target}`);
  return fs.realpath(target);
}
async function requirePlainFile(target, label) {
  const stat = await fs.lstat(target).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) problem(`${label} must be a non-symlink regular file: ${target}`);
}
async function readJson(target, label) {
  await requirePlainFile(target, label);
  try { return JSON.parse(await fs.readFile(target, "utf8")); }
  catch (error) { problem(`${label} is not valid JSON: ${error.message}`); }
}
function requireExactlyOnce(content, token, label) {
  const first = content.indexOf(token);
  if (first < 0 || content.indexOf(token, first + token.length) >= 0) problem(`${label} must contain exactly one ${token}`);
  return first;
}
function requireOrdered(content, tokens, label) {
  let cursor = -1;
  for (const token of tokens) { const next = content.indexOf(token, cursor + 1); if (next < 0) problem(`${label} is missing ${token}`); cursor = next; }
}
function bounded(content, start, end, label) {
  const startIndex = requireExactlyOnce(content, start, label); const endIndex = requireExactlyOnce(content, end, label);
  if (endIndex <= startIndex) problem(`${label} has out-of-order ${start}`);
  return content.slice(startIndex + start.length, endIndex).replace(/^\r?\n|\r?\n$/g, "");
}
function escapedCell(value) { return value.replaceAll("|", "\\|").replaceAll("\n", " "); }

function topologicalSlices(slices) {
  const byId = new Map(slices.map((slice) => [slice.id, slice])); const remaining = new Set(byId.keys()); const ordered = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter((id) => byId.get(id).blockedBy.every((blocker) => !remaining.has(blocker))).sort();
    if (ready.length === 0) problem("Slice blocker graph contains a cycle");
    for (const id of ready) { remaining.delete(id); ordered.push(byId.get(id)); }
  }
  return ordered;
}
function validateTarget(target, repository) {
  requirePlainObject(target, "manifest target");
  if (target.kind === "create-new") return;
  if (target.kind !== "existing-issue") problem("manifest target kind must be create-new or existing-issue");
  const match = requireString(target.url, "manifest target URL").match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/([1-9]\d*)$/i);
  if (!match) problem("manifest target URL must be an exact GitHub issue URL");
  if (match[1].toLowerCase() !== repository.toLowerCase()) problem("manifest target URL repository does not match manifest repository");
  if (target.digest !== undefined && !SHA256.test(target.digest)) problem("manifest target digest must be a SHA-256 hash");
}
function validateVerification(verification, label) {
  if (verification.length === 0) problem(`${label} must not be empty`);
  const ids = verification.map((item) => requireString(item?.id, `${label} ID`));
  if (ids.some((id) => !VERIFICATION_ID.test(id))) problem(`${label} IDs must use V-NN format`);
  requireUnique(ids, `${label} IDs`);
  for (const item of verification) { requireString(item.command, `${label} ${item.id} command`); requireString(item.description, `${label} ${item.id} description`); }
  return verification;
}

function validateManifest(manifest, mode) {
  requirePlainObject(manifest, "publication manifest");
  if (manifest.schemaVersion !== 1) problem("publication manifest schemaVersion must be 1");
  if (manifest.kind !== mode) problem(`publication manifest kind must be ${mode}`);
  const repository = requireString(manifest.repository, "manifest repository");
  if (!REPOSITORY.test(repository)) problem("manifest repository must be owner/repository");
  requirePlainObject(manifest.base, "manifest base"); requireString(manifest.base.ref, "manifest base ref");
  if (!SHA1.test(manifest.base.sha ?? "")) problem("manifest base SHA must be a 40-character commit SHA");
  validateTarget(manifest.target, repository);
  if (mode === "standalone-ticket") {
    if (manifest.target.kind === "existing-issue" && !SHA256.test(manifest.target.digest ?? "")) problem("existing standalone target requires a live issue digest");
    requirePlainObject(manifest.candidate, "standalone candidate"); requireString(manifest.candidate.title, "standalone candidate title");
    if (!SHA256.test(manifest.candidate.bodySha256 ?? "")) problem("standalone candidate bodySha256 must be a SHA-256 hash");
    validateVerification(requireArray(manifest.verification, "standalone verification"), "standalone verification");
    return { repository, orderedSlices: [] };
  }
  requirePlainObject(manifest.parent, "manifest parent"); requireString(manifest.parent.title, "manifest parent title");
  const slices = requireArray(manifest.slices, "manifest slices"); if (slices.length < 2) problem("Delivery Bundle mode requires at least two slices");
  const ids = slices.map((slice) => requireString(slice?.id, "slice ID"));
  if (ids.some((id) => !SLICE_ID.test(id))) problem("slice IDs must use SNN format"); requireUnique(ids, "slice IDs");
  const sliceIds = new Set(ids); const verificationIds = new Set();
  for (const slice of slices) {
    requirePlainObject(slice, `slice ${slice.id}`); requireString(slice.title, `slice ${slice.id} title`); requireString(slice.outcome, `slice ${slice.id} outcome`);
    const blockers = requireArray(slice.blockedBy, `slice ${slice.id} blockedBy`); requireUnique(blockers, `slice ${slice.id} blockedBy`);
    for (const blocker of blockers) { if (!sliceIds.has(blocker)) problem(`slice ${slice.id} has an unknown blocker ${blocker}`); if (blocker === slice.id) problem(`slice ${slice.id} cannot block itself`); }
    for (const verification of validateVerification(requireArray(slice.verification, `slice ${slice.id} verification`), `slice ${slice.id} verification`)) {
      if (verificationIds.has(verification.id)) problem(`verification ID ${verification.id} is declared more than once`); verificationIds.add(verification.id);
    }
  }
  const acceptance = requireArray(manifest.acceptance, "manifest acceptance"); if (acceptance.length === 0) problem("manifest acceptance must not be empty");
  const acceptanceIds = acceptance.map((item) => requireString(item?.id, "acceptance criterion ID"));
  if (acceptanceIds.some((id) => !ACCEPTANCE_ID.test(id))) problem("acceptance criterion IDs must use AC-NN format"); requireUnique(acceptanceIds, "acceptance criterion IDs");
  const bySlice = new Map(slices.map((slice) => [slice.id, slice]));
  for (const criterion of acceptance) {
    if (!sliceIds.has(criterion.owner)) problem(`acceptance criterion ${criterion.id} has no known primary owner`);
    const verification = requireArray(criterion.verification, `acceptance criterion ${criterion.id} verification`);
    if (verification.length === 0) problem(`acceptance criterion ${criterion.id} has no explicit verification mapping`); requireUnique(verification, `acceptance criterion ${criterion.id} verification`);
    const ownerVerification = new Set(bySlice.get(criterion.owner).verification.map((item) => item.id));
    for (const id of verification) if (!ownerVerification.has(id)) problem(`acceptance criterion ${criterion.id} verification ${id} is not owned by ${criterion.owner}`);
  }
  return { repository, orderedSlices: topologicalSlices(slices) };
}

function renderOwnershipTable(manifest) {
  const slices = new Map(manifest.slices.map((slice) => [slice.id, slice]));
  return ["| Criterion | Primary slice | Verification |", "| --- | --- | --- |", ...manifest.acceptance.map((criterion) => {
    const definitions = new Map(slices.get(criterion.owner).verification.map((item) => [item.id, item]));
    const commands = criterion.verification.map((id) => `\`${id}\`: ${escapedCell(definitions.get(id).command)}`).join("<br>");
    return `| ${criterion.id} | ${criterion.owner} | ${commands} |`;
  })].join("\n");
}
function renderGraphTable(manifest) {
  const owned = new Map(manifest.slices.map((slice) => [slice.id, []])); for (const criterion of manifest.acceptance) owned.get(criterion.owner).push(criterion.id);
  return ["| Slice | Title | Independently testable outcome | Blocked by | Owns parent criteria |", "| --- | --- | --- | --- | --- |", ...topologicalSlices(manifest.slices).map((slice) => `| ${slice.id} | ${escapedCell(slice.title)} | ${escapedCell(slice.outcome)} | ${slice.blockedBy.length ? slice.blockedBy.join(", ") : "None"} | ${owned.get(slice.id).join(", ") || "None"} |`)].join("\n");
}
function requireGenerated(content, start, end, expected, label) { if (bounded(content, start, end, label) !== expected) problem(`${label} must be generated exactly from publication-manifest.json`); }
function replaceGenerated(content, start, end, generated, label) {
  const startIndex = requireExactlyOnce(content, start, label); const endIndex = requireExactlyOnce(content, end, label);
  if (endIndex <= startIndex) problem(`${label} has out-of-order ${start}`);
  return `${content.slice(0, startIndex + start.length)}\n${generated}\n${content.slice(endIndex)}`;
}
function hasScaffoldPlaceholder(content) {
  return SCAFFOLD_PLACEHOLDER.test(content.replace(/<!--[^]*?-->/g, "").replace(/\{\{(?:PARENT|S\d{2,})\}\}/g, ""));
}
function extractAcceptance(content, label) {
  const ids = [...content.matchAll(/^- \[ \] (AC-\d{2,}):/gm)].map((match) => match[1]);
  requireUnique(ids, `${label} acceptance criteria`);
  return ids;
}
function requireSameIds(actual, expected, label) {
  if (actual.length !== expected.length || actual.some((id) => !expected.includes(id))) problem(`${label} does not match publication-manifest.json`);
}
function section(content, heading, nextHeading, label) {
  const start = content.indexOf(`${heading}\n`); const end = content.indexOf(`\n${nextHeading}`, start + heading.length);
  if (start < 0 || end < 0) problem(`${label} is missing ${heading}`);
  return content.slice(start + heading.length, end).trim();
}

function validateBundleStructure(bundleContent, slices, manifest) {
  requireOrdered(bundleContent, ["# Delivery Bundle:", "## Bundle Metadata", "## Parent Issue", "### Title", "<!-- BEGIN PARENT BODY -->", "<!-- END PARENT BODY -->", "## Parent Acceptance Ownership", "## Dependency Graph", "## Publication Contract"], "bundle.md");
  requireExactlyOnce(bundleContent, "<!-- BEGIN PARENT BODY -->", "bundle.md"); requireExactlyOnce(bundleContent, "<!-- END PARENT BODY -->", "bundle.md");
  if (!bundleContent.includes(`- GitHub repository: \`${manifest.repository}\``) || !bundleContent.includes(`- Base ref: \`${manifest.base.ref}\``) || !bundleContent.includes(`- Base SHA: \`${manifest.base.sha}\``)) problem("bundle.md metadata does not match publication-manifest.json identity");
  const target = manifest.target.kind === "create-new" ? "create new" : manifest.target.url;
  if (!bundleContent.includes(`- Parent target: \`${target}\``)) problem("bundle.md parent target does not match publication-manifest.json");
  if (bounded(bundleContent, "### Title", "<!-- BEGIN PARENT BODY -->", "bundle.md").trim() !== manifest.parent.title) problem("bundle.md parent title does not match publication-manifest.json");
  const parentBody = bounded(bundleContent, "<!-- BEGIN PARENT BODY -->", "<!-- END PARENT BODY -->", "bundle.md");
  requireSameIds(extractAcceptance(parentBody, "bundle.md"), manifest.acceptance.map((criterion) => criterion.id), "bundle.md parent acceptance criteria");
  if (hasScaffoldPlaceholder(bundleContent)) problem("bundle.md contains an unresolved placeholder");
  requireGenerated(bundleContent, "<!-- BEGIN GENERATED PARENT ACCEPTANCE OWNERSHIP -->", "<!-- END GENERATED PARENT ACCEPTANCE OWNERSHIP -->", renderOwnershipTable(manifest), "Parent Acceptance Ownership");
  requireGenerated(bundleContent, "<!-- BEGIN GENERATED DEPENDENCY GRAPH -->", "<!-- END GENERATED DEPENDENCY GRAPH -->", renderGraphTable(manifest), "Dependency Graph");
  const fileIds = new Set(slices.map(({ id }) => id));
  if (fileIds.size !== manifest.slices.length || [...fileIds].some((id) => !manifest.slices.some((slice) => slice.id === id))) problem("slice files do not match publication-manifest.json slice IDs");
  const byId = new Map(manifest.slices.map((slice) => [slice.id, slice]));
  for (const { id, content } of slices) {
    const slice = byId.get(id); if (!slice) problem(`${id}.md is not declared by publication-manifest.json`);
    const escapedTitle = slice.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`^# ${id} — ${escapedTitle}$`, "m").test(content)) problem(`${id}.md title does not match publication-manifest.json`);
    requireOrdered(content, ["<!-- BEGIN ISSUE BODY -->", "## Parent", "## Outcome", "## Source Map", "## Files And Symbols", "## Implementation Steps", "## Behavior, Invariants, Edge Cases, And Source Assumptions", "## Acceptance Criteria", "## Tests And Verification", "## Security And Privacy", "## Explicitly Out Of Scope", "## Blocked By", "<!-- END ISSUE BODY -->"], `${id}.md`);
    requireExactlyOnce(content, "<!-- BEGIN ISSUE BODY -->", `${id}.md`); requireExactlyOnce(content, "<!-- END ISSUE BODY -->", `${id}.md`);
    if (!content.includes("{{PARENT}}")) problem(`${id}.md must contain {{PARENT}}`);
    for (const match of content.matchAll(/\{\{([^{}]+)\}\}/g)) if (match[1] !== "PARENT" && !fileIds.has(match[1])) problem(`${id}.md contains undeclared reference token {{${match[1]}}}`);
    const expectedOwned = manifest.acceptance.filter((criterion) => criterion.owner === id).map((criterion) => criterion.id);
    requireSameIds(extractAcceptance(section(content, "## Acceptance Criteria", "## Tests And Verification", `${id}.md`), `${id}.md`), expectedOwned, `${id}.md acceptance criteria`);
    const blockedByEnd = content.includes("\n## Downstream Handoff\n") ? "## Downstream Handoff" : "<!-- END ISSUE BODY -->";
    const blockedBy = [...section(content, "## Blocked By", blockedByEnd, `${id}.md`).matchAll(/\{\{(S\d{2,})\}\}/g)].map((match) => match[1]);
    requireUnique(blockedBy, `${id}.md blockers`);
    requireSameIds(blockedBy, slice.blockedBy, `${id}.md Blocked By`);
    if (slice.blockedBy.length === 0 && !/^None\.?$/.test(section(content, "## Blocked By", blockedByEnd, `${id}.md`))) problem(`${id}.md Blocked By must say None for an unblocked slice`);
    if (hasScaffoldPlaceholder(content)) problem(`${id}.md contains an unresolved placeholder`);
  }
}
function parseCandidate(content) {
  const title = bounded(content, "<!-- BEGIN CANDIDATE TITLE -->", "<!-- END CANDIDATE TITLE -->", "candidate.md").trim();
  const body = bounded(content, "<!-- BEGIN ISSUE BODY -->", "<!-- END ISSUE BODY -->", "candidate.md");
  requireString(title, "candidate title"); requireString(body, "candidate body"); return { title, body };
}

async function collectArtifact(artifactDir, mode) {
  const allowed = mode === "delivery-bundle" ? new Set(["bundle.md", "slices", MANIFEST_NAME, RECEIPT_NAME, STATE_NAME]) : new Set(["candidate.md", MANIFEST_NAME, RECEIPT_NAME]);
  const unexpected = (await fs.readdir(artifactDir)).filter((entry) => !allowed.has(entry)); if (unexpected.length > 0) problem(`Unexpected ${mode} entries: ${unexpected.sort().join(", ")}`);
  const manifestPath = path.join(artifactDir, MANIFEST_NAME); const manifest = await readJson(manifestPath, MANIFEST_NAME); validateManifest(manifest, mode);
  if (mode === "standalone-ticket") {
    const candidatePath = path.join(artifactDir, "candidate.md"); await requirePlainFile(candidatePath, "candidate.md"); const candidateData = await fs.readFile(candidatePath); const candidate = parseCandidate(candidateData.toString("utf8"));
    if (candidate.title !== manifest.candidate.title) problem("candidate.md title does not match publication-manifest.json");
    if (hash(candidate.body) !== manifest.candidate.bodySha256) problem("candidate.md body hash does not match publication-manifest.json");
    return { manifest, files: [{ path: "candidate.md", sha256: hash(candidateData) }, { path: MANIFEST_NAME, sha256: hash(await fs.readFile(manifestPath)) }] };
  }
  const bundlePath = path.join(artifactDir, "bundle.md"); const slicesDir = path.join(artifactDir, "slices"); await requirePlainFile(bundlePath, "bundle.md"); await requirePlainDirectory(slicesDir, "slices");
  const sliceEntries = (await fs.readdir(slicesDir)).sort(); for (const entry of sliceEntries) { if (!/^S\d{2,}\.md$/.test(entry)) problem(`Invalid slice filename: ${entry}`); await requirePlainFile(path.join(slicesDir, entry), entry); }
  const bundleContent = await fs.readFile(bundlePath, "utf8"); const slices = await Promise.all(sliceEntries.map(async (entry) => ({ id: entry.slice(0, -3), content: await fs.readFile(path.join(slicesDir, entry), "utf8") })));
  validateBundleStructure(bundleContent, slices, manifest);
  const relativePaths = [MANIFEST_NAME, "bundle.md", ...sliceEntries.map((entry) => `slices/${entry}`)]; const files = await Promise.all(relativePaths.map(async (relativePath) => ({ path: relativePath, sha256: hash(await fs.readFile(path.join(artifactDir, relativePath))) })));
  return { manifest, files };
}
async function resolveRepository(repoRootInput) {
  if (!repoRootInput) problem("--repo-root is required"); const repoRoot = await requirePlainDirectory(path.resolve(repoRootInput), "repo root"); const resolvedTop = await fs.realpath(git(repoRoot, ["rev-parse", "--show-toplevel"]));
  if (resolvedTop !== repoRoot) problem(`--repo-root must be the Git repository root: ${resolvedTop}`);
  const remotes = git(repoRoot, ["remote"]).split("\n").filter(Boolean);
  if (remotes.length === 0) problem("Repository has no configured Git remote");
  if (!remotes.includes("origin") && remotes.length !== 1) problem("Repository remote is ambiguous: multiple remotes are configured without origin");
  const remoteName = remotes.includes("origin") ? "origin" : remotes[0];
  return { repoRoot, remoteName, githubRepo: normalizeGitHubRepository(git(repoRoot, ["remote", "get-url", remoteName])) };
}
function validateRuntimeIdentity(manifest, repository, expectedRepository, expectedBaseRef) {
  if (expectedRepository && manifest.repository.toLowerCase() !== expectedRepository.toLowerCase()) problem(`Manifest repository mismatch: ${manifest.repository}, requested ${expectedRepository}`);
  if (expectedBaseRef && manifest.base.ref !== expectedBaseRef) problem(`Manifest base ref mismatch: ${manifest.base.ref}, requested ${expectedBaseRef}`);
  if (repository.githubRepo.toLowerCase() !== manifest.repository.toLowerCase()) problem(`Repository mismatch: ${repository.remoteName} is ${repository.githubRepo}, manifest is ${manifest.repository}`);
  const baseSha = git(repository.repoRoot, ["rev-parse", "--verify", `${manifest.base.ref}^{commit}`]).toLowerCase(); if (baseSha !== manifest.base.sha) problem(`Reviewed base moved: ${manifest.base.ref} is ${baseSha}, manifest is ${manifest.base.sha}`);
}
function validateReceiptShape(receipt, mode) {
  if (receipt?.schemaVersion !== 2 || receipt?.verdict !== "deterministically-valid") problem("Receipt is not a schema-v2 deterministic-valid verdict"); if (receipt.mode !== mode) problem("Receipt mode does not match artifact mode");
  if (!receipt.repository || !REPOSITORY.test(receipt.repository.github ?? "")) problem("Receipt repository is invalid"); if (!receipt.repository.baseRef || !SHA1.test(receipt.repository.baseSha ?? "")) problem("Receipt base identity is invalid"); if (!SHA256.test(receipt.manifestSha256 ?? "")) problem("Receipt manifest identity is invalid");
  if (!Array.isArray(receipt.files) || receipt.files.length < 2) problem("Receipt file set is invalid"); for (const file of receipt.files) if (typeof file?.path !== "string" || !SHA256.test(file?.sha256 ?? "")) problem("Receipt contains an invalid file entry");
}
async function checkArtifact(args) {
  const artifactDir = await requirePlainDirectory(path.resolve(args.artifactDir), `${args.mode} directory`);
  const { manifest, files } = await collectArtifact(artifactDir, args.mode);
  const repository = await resolveRepository(args["repo-root"]);
  validateRuntimeIdentity(manifest, repository, args["github-repo"], args["base-ref"]);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: args.mode, repository: { github: manifest.repository, baseRef: manifest.base.ref, baseSha: manifest.base.sha }, files: files.length, validation: "deterministic-only", sourceReview: "not-assessed" })}\n`);
}
async function createReceipt(args) {
  if (!args["github-repo"] || !args["base-ref"]) problem("create requires --repo-root, --github-repo, and --base-ref"); if (!REPOSITORY.test(args["github-repo"])) problem("--github-repo must be owner/repository");
  const artifactDir = await requirePlainDirectory(path.resolve(args.artifactDir), `${args.mode} directory`); const { manifest, files } = await collectArtifact(artifactDir, args.mode); const repository = await resolveRepository(args["repo-root"]); validateRuntimeIdentity(manifest, repository, args["github-repo"], args["base-ref"]);
  const receipt = { schemaVersion: 2, verdict: "deterministically-valid", mode: args.mode, createdAt: new Date().toISOString(), repository: { github: manifest.repository, baseRef: manifest.base.ref, baseSha: manifest.base.sha }, manifestSha256: hash(await fs.readFile(path.join(artifactDir, MANIFEST_NAME))), files };
  const output = path.join(artifactDir, RECEIPT_NAME); await fs.writeFile(`${output}.tmp-${process.pid}`, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 }); await fs.rename(`${output}.tmp-${process.pid}`, output); process.stdout.write(`${JSON.stringify(receipt)}\n`);
}
async function renderBundle(args) {
  const bundleDir = await requirePlainDirectory(path.resolve(args["bundle-dir"]), "bundle directory");
  const manifest = await readJson(path.join(bundleDir, MANIFEST_NAME), MANIFEST_NAME);
  validateManifest(manifest, "delivery-bundle");
  const bundlePath = path.join(bundleDir, "bundle.md"); await requirePlainFile(bundlePath, "bundle.md");
  const current = await fs.readFile(bundlePath, "utf8");
  const ownership = replaceGenerated(current, "<!-- BEGIN GENERATED PARENT ACCEPTANCE OWNERSHIP -->", "<!-- END GENERATED PARENT ACCEPTANCE OWNERSHIP -->", renderOwnershipTable(manifest), "Parent Acceptance Ownership");
  const rendered = replaceGenerated(ownership, "<!-- BEGIN GENERATED DEPENDENCY GRAPH -->", "<!-- END GENERATED DEPENDENCY GRAPH -->", renderGraphTable(manifest), "Dependency Graph");
  if (rendered !== current) {
    const temporary = `${bundlePath}.tmp-${process.pid}`;
    await fs.writeFile(temporary, rendered, { mode: 0o600 });
    await fs.rename(temporary, bundlePath);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, rendered: ["Parent Acceptance Ownership", "Dependency Graph"] })}\n`);
}
async function verifyReceipt(args) {
  const artifactDir = await requirePlainDirectory(path.resolve(args.artifactDir), `${args.mode} directory`); const receipt = await readJson(path.join(artifactDir, RECEIPT_NAME), RECEIPT_NAME); validateReceiptShape(receipt, args.mode);
  const { manifest, files } = await collectArtifact(artifactDir, args.mode); const repository = await resolveRepository(args["repo-root"]); validateRuntimeIdentity(manifest, repository, args["github-repo"], args["base-ref"]);
  if (receipt.repository.github.toLowerCase() !== manifest.repository.toLowerCase() || receipt.repository.baseRef !== manifest.base.ref || receipt.repository.baseSha !== manifest.base.sha) problem("Receipt identity does not match publication manifest");
  if (receipt.manifestSha256 !== hash(await fs.readFile(path.join(artifactDir, MANIFEST_NAME)))) problem("Publication manifest does not match the receipt"); if (JSON.stringify(receipt.files) !== JSON.stringify(files)) problem("Reviewed artifact files do not match the receipt");
  process.stdout.write(`${JSON.stringify({ ok: true, mode: args.mode, repository: receipt.repository, files: files.length })}\n`);
}

export { renderGraphTable, renderOwnershipTable, validateManifest };
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { const args = parseArgs(process.argv.slice(2)); if (args.command === "check") await checkArtifact(args); else if (args.command === "create") await createReceipt(args); else if (args.command === "render") await renderBundle(args); else await verifyReceipt(args); }
  catch (error) { fail(error.message); }
}
