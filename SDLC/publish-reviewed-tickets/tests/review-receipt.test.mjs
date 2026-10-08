import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const RECEIPT = fileURLToPath(new URL("../scripts/review-receipt.mjs", import.meta.url));

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function receipt(args) {
  return spawnSync(process.execPath, [RECEIPT, ...args], { encoding: "utf8" });
}

function bundleArgs({ repo, bundle }) {
  return ["create", "--bundle-dir", bundle, "--repo-root", repo, "--github-repo", "big-robot/example", "--base-ref", "main"];
}

function issueBody(id) {
  const acceptance = id === "S01" ? "AC-01" : "AC-02";
  const blockers = id === "S01" ? "None." : "{{S01}}";
  return `<!-- BEGIN ISSUE BODY -->

## Parent

{{PARENT}}

## Outcome

Deliver ${id} behavior.

## Source Map

- src/${id}.mjs

## Files And Symbols

- ${id}

## Implementation Steps

- Implement ${id}.

## Behavior, Invariants, Edge Cases, And Source Assumptions

- Preserve the reviewed behavior.

## Acceptance Criteria

- [ ] ${acceptance}: ${id} works.

## Tests And Verification

- Run the mapped command.

## Security And Privacy

- No sensitive data.

## Explicitly Out Of Scope

- Unrelated work.

## Blocked By

${blockers}

## Downstream Handoff

- Ready for the next slice.

<!-- END ISSUE BODY -->
`;
}

function graphTable() {
  return `| Slice | Title | Independently testable outcome | Blocked by | Owns parent criteria |
| --- | --- | --- | --- | --- |
| S01 | Prepare contract | Contract validation succeeds. | None | AC-01 |
| S02 | Publish contract | Receipt verification succeeds. | S01 | AC-02 |`;
}

function ownershipTable() {
  return `| Criterion | Primary slice | Verification |
| --- | --- | --- |
| AC-01 | S01 | \`V-01\`: node --test tests/s01.test.mjs |
| AC-02 | S02 | \`V-02\`: node --test tests/s02.test.mjs |`;
}

function bundleMarkdown(baseSha) {
  return `# Delivery Bundle: publication contract

## Bundle Metadata

- Mode: \`delivery-bundle\`
- GitHub repository: \`big-robot/example\`
- Parent target: \`create new\`
- Base ref: \`main\`
- Base SHA: \`${baseSha}\`
- Manifest: \`publication-manifest.json\` is the canonical machine-readable publication contract.

## Parent Issue

### Title

Publish reviewed contract

<!-- BEGIN PARENT BODY -->

## Context And Outcome

Publish the reviewed contract.

## Product Decisions And Invariants

- Preserve exact identity.

## Acceptance Criteria

- [ ] AC-01: Contract validates.
- [ ] AC-02: Receipt verifies.

## Explicitly Out Of Scope

- GitHub writes.

## Security And Privacy

- No credentials.

## Integrated Verification Contract

- Run mapped checks.

## Reviewed Execution Baseline

- GitHub repository: \`big-robot/example\`
- Base ref: \`main\`
- Base SHA: \`${baseSha}\`

<!-- END PARENT BODY -->

## Parent Acceptance Ownership

<!-- BEGIN GENERATED PARENT ACCEPTANCE OWNERSHIP -->
${ownershipTable()}
<!-- END GENERATED PARENT ACCEPTANCE OWNERSHIP -->

## Dependency Graph

<!-- BEGIN GENERATED DEPENDENCY GRAPH -->
${graphTable()}
<!-- END GENERATED DEPENDENCY GRAPH -->

## Publication Contract

- Permitted unresolved references: \`{{PARENT}}\` and declared \`{{SNN}}\` tokens only.
`;
}

function manifest(baseSha) {
  return {
    schemaVersion: 1,
    kind: "delivery-bundle",
    repository: "big-robot/example",
    base: { ref: "main", sha: baseSha },
    target: { kind: "create-new" },
    parent: { title: "Publish reviewed contract" },
    slices: [
      { id: "S01", title: "Prepare contract", outcome: "Contract validation succeeds.", blockedBy: [], verification: [{ id: "V-01", command: "node --test tests/s01.test.mjs", description: "Validates the contract." }] },
      { id: "S02", title: "Publish contract", outcome: "Receipt verification succeeds.", blockedBy: ["S01"], verification: [{ id: "V-02", command: "node --test tests/s02.test.mjs", description: "Verifies the receipt." }] },
    ],
    acceptance: [
      { id: "AC-01", owner: "S01", verification: ["V-01"] },
      { id: "AC-02", owner: "S02", verification: ["V-02"] },
    ],
  };
}

async function repoFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "reviewed-ticket-bundle-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repo = path.join(root, "repo");
  await fs.mkdir(repo);
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "receipt-test@example.com"]);
  git(repo, ["config", "user.name", "Receipt Test"]);
  git(repo, ["remote", "add", "origin", "https://github.com/big-robot/example.git"]);
  await fs.writeFile(path.join(repo, "README.md"), "baseline\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "baseline"]);
  return { root, repo, baseSha: git(repo, ["rev-parse", "main"]) };
}

async function fixture(t) {
  const target = await repoFixture(t);
  const bundle = path.join(target.root, "delivery-bundle");
  await fs.mkdir(path.join(bundle, "slices"), { recursive: true });
  await fs.writeFile(path.join(bundle, "publication-manifest.json"), `${JSON.stringify(manifest(target.baseSha), null, 2)}\n`);
  await fs.writeFile(path.join(bundle, "bundle.md"), bundleMarkdown(target.baseSha));
  await fs.writeFile(path.join(bundle, "slices/S01.md"), `# S01 — Prepare contract\n\n${issueBody("S01")}`);
  await fs.writeFile(path.join(bundle, "slices/S02.md"), `# S02 — Publish contract\n\n${issueBody("S02")}`);
  return { ...target, bundle };
}

async function writeManifest(target, value) {
  await fs.writeFile(path.join(target.bundle, "publication-manifest.json"), `${JSON.stringify(value, null, 2)}\n`);
}

async function standaloneFixture(t, publicationTarget = { kind: "create-new" }) {
  const target = await repoFixture(t);
  const candidateDir = path.join(target.root, "standalone");
  await fs.mkdir(candidateDir);
  const body = "## Outcome\n\nPublish one exact issue.\n";
  const candidate = `<!-- BEGIN CANDIDATE TITLE -->
Publish standalone ticket
<!-- END CANDIDATE TITLE -->

<!-- BEGIN ISSUE BODY -->
${body}<!-- END ISSUE BODY -->
`;
  const standaloneManifest = {
    schemaVersion: 1,
    kind: "standalone-ticket",
    repository: "big-robot/example",
    base: { ref: "main", sha: target.baseSha },
    target: publicationTarget,
    candidate: { title: "Publish standalone ticket", bodySha256: sha256(body.trimEnd()) },
    verification: [{ id: "V-01", command: "node --test tests/standalone.test.mjs", description: "Checks the candidate." }],
  };
  await fs.writeFile(path.join(candidateDir, "candidate.md"), candidate);
  await fs.writeFile(path.join(candidateDir, "publication-manifest.json"), `${JSON.stringify(standaloneManifest, null, 2)}\n`);
  return { ...target, candidateDir };
}

async function snapshot(directory) {
  const entries = [];
  async function visit(current, relative = "") {
    for (const name of (await fs.readdir(current)).sort()) {
      const file = path.join(current, name);
      const entry = path.join(relative, name);
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) entries.push([entry, "symlink", await fs.readlink(file)]);
      else if (stat.isDirectory()) { entries.push([entry, "directory"]); await visit(file, entry); }
      else entries.push([entry, "file", (await fs.readFile(file)).toString("base64")]);
    }
  }
  await visit(directory);
  return entries;
}

test("check validates unreceipted bundles and new candidates without changing any bytes", async (t) => {
  for (const mode of ["bundle", "candidate"]) {
    await t.test(mode, async (t) => {
      const target = mode === "bundle" ? await fixture(t) : await standaloneFixture(t);
      const artifactDir = target.bundle ?? target.candidateDir;
      const before = await snapshot(target.root);
      const checked = receipt(["check", `--${mode}-dir`, artifactDir, "--repo-root", target.repo, "--github-repo", "big-robot/example", "--base-ref", "main"]);
      assert.equal(checked.status, 0, checked.stderr);
      assert.deepEqual(JSON.parse(checked.stdout), {
        ok: true,
        mode: mode === "bundle" ? "delivery-bundle" : "standalone-ticket",
        repository: { github: "big-robot/example", baseRef: "main", baseSha: target.baseSha },
        files: mode === "bundle" ? 4 : 2,
        validation: "deterministic-only",
        sourceReview: "not-assessed",
      });
      await assert.rejects(fs.access(path.join(artifactDir, "review-receipt.json")), { code: "ENOENT" });
      assert.deepEqual(await snapshot(target.root), before);
    });
  }
});

test("check rejects malformed bundle contracts and identity drift without mutations", async (t) => {
  const cases = [
    ["acceptance", /no known primary owner/, async (target) => {
      const value = manifest(target.baseSha); value.acceptance[0].owner = "S99"; await writeManifest(target, value);
    }],
    ["manifest", /schemaVersion must be 1/, async (target) => {
      const value = manifest(target.baseSha); value.schemaVersion = 99; await writeManifest(target, value);
    }],
    ["body", /missing ## Tests And Verification/, async (target) => {
      const file = path.join(target.bundle, "slices/S02.md");
      await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("## Tests And Verification\n", ""));
    }],
    ["graph", /contains a cycle/, async (target) => {
      const value = manifest(target.baseSha); value.slices[0].blockedBy = ["S02"]; await writeManifest(target, value);
    }],
    ["generated tables", /generated exactly/, async (target) => {
      const file = path.join(target.bundle, "bundle.md");
      await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace(ownershipTable(), ""));
    }],
    ["moved base", /Reviewed base moved/, async (target) => {
      await fs.appendFile(path.join(target.repo, "README.md"), "advanced\n");
      git(target.repo, ["add", "README.md"]); git(target.repo, ["commit", "-m", "advance base"]);
    }],
    ["repository", /Repository mismatch/, async (target) => {
      git(target.repo, ["remote", "set-url", "origin", "https://github.com/other/repository.git"]);
    }],
    ["symlink", /non-symlink regular file/, async (target) => {
      const file = path.join(target.bundle, "slices/S02.md"); await fs.rm(file);
      await fs.symlink(path.join(target.bundle, "slices/S01.md"), file);
    }],
  ];
  for (const [name, error, mutate] of cases) {
    await t.test(name, async (t) => {
      const target = await fixture(t);
      await mutate(target);
      const before = await snapshot(target.root);
      const checked = receipt(["check", "--bundle-dir", target.bundle, "--repo-root", target.repo]);
      assert.notEqual(checked.status, 0);
      assert.match(checked.stderr, error);
      assert.equal(checked.stdout, "");
      assert.deepEqual(await snapshot(target.root), before);
    });
  }
});

test("check preserves an existing receipt on success and candidate failure", async (t) => {
  const target = await standaloneFixture(t);
  const args = ["--candidate-dir", target.candidateDir, "--repo-root", target.repo];
  assert.equal(receipt(["create", ...args, "--github-repo", "big-robot/example", "--base-ref", "main"]).status, 0);
  const receiptBefore = await fs.readFile(path.join(target.candidateDir, "review-receipt.json"));
  const before = await snapshot(target.root);
  const checked = receipt(["check", ...args]);
  assert.equal(checked.status, 0, checked.stderr);
  assert.deepEqual(await snapshot(target.root), before);

  const file = path.join(target.candidateDir, "candidate.md");
  await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("Publish one exact issue.", "Changed candidate body."));
  const changed = await snapshot(target.root);
  const invalid = receipt(["check", ...args]);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /body hash does not match/);
  assert.deepEqual(await snapshot(target.root), changed);
  assert.deepEqual(await fs.readFile(path.join(target.candidateDir, "review-receipt.json")), receiptBefore);
});

test("check retains repository-root and explicit identity argument guards", async (t) => {
  const target = await fixture(t);
  const args = ["check", "--bundle-dir", target.bundle];
  await fs.mkdir(path.join(target.repo, "nested"));
  const before = await snapshot(target.root);
  for (const [extra, error] of [
    [[], /--repo-root is required/],
    [["--repo-root", path.join(target.repo, "nested")], /must be the Git repository root/],
    [["--repo-root", target.repo, "--github-repo", "other/repository"], /Manifest repository mismatch/],
    [["--repo-root", target.repo, "--base-ref", "other"], /Manifest base ref mismatch/],
  ]) {
    const checked = receipt([...args, ...extra]);
    assert.notEqual(checked.status, 0);
    assert.match(checked.stderr, error);
  }
  assert.deepEqual(await snapshot(target.root), before);
});

test("review receipt binds a deterministic manifest, complete bundle, and exact base", async (t) => {
  const target = await fixture(t);
  const created = receipt(bundleArgs(target));
  assert.equal(created.status, 0, created.stderr);
  const parsed = JSON.parse(created.stdout);
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.verdict, "deterministically-valid");
  assert.equal(parsed.manifestSha256, sha256(await fs.readFile(path.join(target.bundle, "publication-manifest.json"))));
  assert.deepEqual(parsed.files.map((file) => file.path), ["publication-manifest.json", "bundle.md", "slices/S01.md", "slices/S02.md"]);

  const verified = receipt(["verify", "--bundle-dir", target.bundle, "--repo-root", target.repo]);
  assert.equal(verified.status, 0, verified.stderr);
  assert.deepEqual(JSON.parse(verified.stdout), { ok: true, mode: "delivery-bundle", repository: parsed.repository, files: 4 });
});

test("review receipt supports a sole named remote without changing Git configuration", async (t) => {
  const target = await fixture(t);
  git(target.repo, ["remote", "rename", "origin", "website"]);
  const configPath = path.join(target.repo, ".git/config");
  const configBefore = await fs.readFile(configPath, "utf8");

  const created = receipt(bundleArgs(target));
  assert.equal(created.status, 0, created.stderr);
  const verified = receipt(["verify", "--bundle-dir", target.bundle, "--repo-root", target.repo]);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).repository.github, "big-robot/example");
  assert.equal(await fs.readFile(configPath, "utf8"), configBefore);

  git(target.repo, ["remote", "set-url", "website", "https://github.com/example/other.git"]);
  for (const command of ["create", "verify"]) {
    const result = receipt([command, ...bundleArgs(target).slice(1)]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Repository mismatch/);
  }
});

test("review receipt rejects missing or ambiguous remotes and retains origin identity checks", async (t) => {
  const target = await fixture(t);
  git(target.repo, ["remote", "remove", "origin"]);
  let result = receipt(bundleArgs(target));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no configured Git remote/);

  git(target.repo, ["remote", "add", "website", "https://github.com/big-robot/example.git"]);
  git(target.repo, ["remote", "add", "upstream", "https://github.com/example/other.git"]);
  result = receipt(bundleArgs(target));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ambiguous.*remote|remote.*ambiguous/i);
  await assert.rejects(fs.access(path.join(target.bundle, "review-receipt.json")), { code: "ENOENT" });

  git(target.repo, ["remote", "rename", "upstream", "origin"]);
  result = receipt(bundleArgs(target));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Repository mismatch: origin/);
});

test("render fills only deterministic table regions before receipt creation", async (t) => {
  const target = await fixture(t);
  const bundlePath = path.join(target.bundle, "bundle.md");
  const source = await fs.readFile(bundlePath, "utf8");
  await fs.writeFile(bundlePath, source.replace(ownershipTable(), "").replace(graphTable(), ""));
  const rendered = receipt(["render", "--bundle-dir", target.bundle]);
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.deepEqual(JSON.parse(rendered.stdout), { ok: true, rendered: ["Parent Acceptance Ownership", "Dependency Graph"] });
  assert.equal(await fs.readFile(bundlePath, "utf8"), source);
  const invalidFlag = receipt(["render", "--bundle-dir", target.bundle, "--unexpected", "value"]);
  assert.notEqual(invalidFlag.status, 0);
  assert.match(invalidFlag.stderr, /Invalid argument/);
});

test("review receipt rejects content and generated-table drift", async (t) => {
  const target = await fixture(t);
  assert.equal(receipt(bundleArgs(target)).status, 0);
  await fs.appendFile(path.join(target.bundle, "slices/S01.md"), "changed\n");
  let verified = receipt(["verify", "--bundle-dir", target.bundle, "--repo-root", target.repo]);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /artifact files do not match/);

  const drift = await fixture(t);
  const bundlePath = path.join(drift.bundle, "bundle.md");
  await fs.writeFile(bundlePath, (await fs.readFile(bundlePath, "utf8")).replace("Prepare contract | Contract", "Tampered title | Contract"));
  const created = receipt(bundleArgs(drift));
  assert.notEqual(created.status, 0);
  assert.match(created.stderr, /generated exactly/);
});

test("review receipt rejects moved base, identity drift, and symlinked content", async (t) => {
  const target = await fixture(t);
  assert.equal(receipt(bundleArgs(target)).status, 0);
  await fs.appendFile(path.join(target.repo, "README.md"), "advanced\n");
  git(target.repo, ["add", "README.md"]);
  git(target.repo, ["commit", "-m", "advance base"]);
  let verified = receipt(["verify", "--bundle-dir", target.bundle, "--repo-root", target.repo]);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /Reviewed base moved/);

  const identity = await fixture(t);
  const mismatched = receipt(["create", "--bundle-dir", identity.bundle, "--repo-root", identity.repo, "--github-repo", "other/repository", "--base-ref", "main"]);
  assert.notEqual(mismatched.status, 0);
  assert.match(mismatched.stderr, /Manifest repository mismatch/);

  const targetDrift = await fixture(t);
  const targetManifest = manifest(targetDrift.baseSha);
  targetManifest.target = { kind: "existing-issue", url: "https://github.com/big-robot/example/issues/42" };
  await writeManifest(targetDrift, targetManifest);
  const targetResult = receipt(bundleArgs(targetDrift));
  assert.notEqual(targetResult.status, 0);
  assert.match(targetResult.stderr, /parent target does not match/);

  const symlink = await fixture(t);
  await fs.rm(path.join(symlink.bundle, "slices/S02.md"));
  await fs.symlink(path.join(symlink.bundle, "slices/S01.md"), path.join(symlink.bundle, "slices/S02.md"));
  const created = receipt(bundleArgs(symlink));
  assert.notEqual(created.status, 0);
  assert.match(created.stderr, /non-symlink regular file/);
});

test("review receipt rejects incomplete bodies, cycles, missing owners, and placeholders", async (t) => {
  const incomplete = await fixture(t);
  const slicePath = path.join(incomplete.bundle, "slices/S02.md");
  await fs.writeFile(slicePath, (await fs.readFile(slicePath, "utf8")).replace("## Tests And Verification\n", ""));
  let result = receipt(bundleArgs(incomplete));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /S02\.md is missing ## Tests And Verification/);

  const cyclic = await fixture(t);
  const cycleManifest = manifest(cyclic.baseSha);
  cycleManifest.slices[0].blockedBy = ["S02"];
  await writeManifest(cyclic, cycleManifest);
  result = receipt(bundleArgs(cyclic));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /contains a cycle/);

  const owner = await fixture(t);
  const ownerManifest = manifest(owner.baseSha);
  ownerManifest.acceptance[1].owner = "S99";
  await writeManifest(owner, ownerManifest);
  result = receipt(bundleArgs(owner));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no known primary owner/);

  const placeholders = await fixture(t);
  const placeholderManifest = manifest(placeholders.baseSha);
  placeholderManifest.slices[0].outcome = "<independently testable outcome>";
  await writeManifest(placeholders, placeholderManifest);
  result = receipt(bundleArgs(placeholders));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unresolved placeholder/);
});

test("standalone receipt binds candidate title, body, target digest, and base through the CLI", async (t) => {
  const target = await standaloneFixture(t, { kind: "existing-issue", url: "https://github.com/big-robot/example/issues/42", digest: "a".repeat(64) });
  const { candidateDir } = target;
  const create = ["create", "--candidate-dir", candidateDir, "--repo-root", target.repo, "--github-repo", "big-robot/example", "--base-ref", "main"];
  const created = receipt(create);
  assert.equal(created.status, 0, created.stderr);
  const verified = receipt(["verify", "--candidate-dir", candidateDir, "--repo-root", target.repo]);
  assert.equal(verified.status, 0, verified.stderr);
  await fs.appendFile(path.join(candidateDir, "candidate.md"), "drift\n");
  const drift = receipt(["verify", "--candidate-dir", candidateDir, "--repo-root", target.repo]);
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /artifact files do not match/);
});
