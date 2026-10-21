import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const preflight = path.join(root, "scripts/preflight.mjs");
const template = fs.readFileSync(path.join(root, "../shared/templates/agents-code-review-rules.md"), "utf8");

function fixture(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "review-policy-"));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git("init", "-b", "main");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "base");
  const invoke = (...extra) => spawnSync(process.execPath, [preflight, "--repo", repo, "--kind", "manual", "--base-ref", "main", ...extra], { cwd: repo, encoding: "utf8" });
  return { repo, invoke };
}

test("launch preflight requires the complete versioned review contract and reports remediation", (t) => {
  const { repo, invoke } = fixture(t);
  const file = path.join(repo, "AGENTS.md");
  for (const source of [null, "## Review guidelines\n- Check tests.\n", "## Code Review Rules\n<!-- test-integrity:v1 -->\n", `\`\`\`md\n${template}\n\`\`\`\n`, template.replace(/^- TI-04:.*$/m, "- TI-04: Tests are good."), template.replace(/(^- TI-01:)/m, "<!--\n$1").replace(/(TI-06:.*)$/m, "$1\n-->"), ...["    ", " \t", "  \t", "   \t"].map((indent) => template.replace(/^- TI-/gm, `${indent}- TI-`))]) {
    if (source === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, source);
    const before = source === null ? null : fs.readFileSync(file, "utf8");
    const result = invoke();
    assert.equal(result.status, 1, result.stderr);
    const state = JSON.parse(result.stdout);
    assert.equal(state.ok, false);
    assert.equal(state.reviewPolicy.ok, false);
    assert.equal(state.reviewPolicy.path, "AGENTS.md");
    assert.match(state.reviewPolicy.remediation, /complete Code Review Rules section/);
    assert.equal(source === null ? fs.existsSync(file) : fs.readFileSync(file, "utf8"), source === null ? false : before);
  }
  fs.writeFileSync(file, `${template}\n### Product rules\n- Preserve authorization before writes.\n`);
  const accepted = invoke();
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).reviewPolicy.ruleIds.length, 6);
});

test("missing review rules stop launch before GitHub inspection", (t) => {
  const { repo, invoke } = fixture(t);
  const called = path.join(repo, "called.txt");
  const stub = path.join(repo, "gh-stub.mjs");
  fs.writeFileSync(stub, `#!/usr/bin/env node\nimport fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(called)}, 'called'); process.exit(1);\n`, { mode: 0o755 });
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).stdout.trim();
  const result = spawnSync(process.execPath, [preflight, "--repo", repo, "--kind", "manual", "--base-ref", "main", "--issue-url", "https://github.com/example/repo/issues/1", "--delivery-branch", "feature", "--expected-base-sha", head], {
    cwd: repo, encoding: "utf8", env: { ...process.env, CODEX_DEVELOPMENT_LOOP_TEST: "1", CDL_GH_BIN: stub },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(fs.existsSync(called), false);
  assert.equal(JSON.parse(result.stdout).reviewPolicy.ok, false);
});

test("review policy cannot be supplied by a root AGENTS symlink", (t) => {
  const { repo, invoke } = fixture(t);
  fs.writeFileSync(path.join(repo, "other.md"), template);
  fs.symlinkSync("other.md", path.join(repo, "AGENTS.md"));
  const result = invoke();
  assert.equal(result.status, 1, result.stderr);
  assert.match(JSON.parse(result.stdout).reviewPolicy.errors.join(" "), /non-symlink/);
});
