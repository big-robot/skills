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

test("launch preflight ignores raw HTML examples but accepts a separate governing section", (t) => {
  const { repo, invoke } = fixture(t);
  const file = path.join(repo, "AGENTS.md");
  const examples = [
    `<pre>\n${template}\n</pre>`, `<code>\n${template}\n</code>`,
    `<PRE class="example">\n<code>\n${template}\n</code>\n</PRE>`,
    `<pre\n class="example">\n${template}\n</pre>`,
    ...["script", "style", "textarea", "xmp", "iframe", "noembed", "noframes", "template"].map((tag) => `<${tag}>\n${template}\n</${tag}>`),
  ];
  for (const example of examples) {
    fs.writeFileSync(file, example);
    const rejected = invoke();
    assert.equal(rejected.status, 1, example.slice(0, 40));
    assert.equal(JSON.parse(rejected.stdout).reviewPolicy.ok, false);
    fs.writeFileSync(file, `${example}\n\n${template}`);
    const accepted = invoke();
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(JSON.parse(accepted.stdout).reviewPolicy.ruleIds.length, 6);
  }
  fs.writeFileSync(file, `<plaintext>\n${template}\n</plaintext>\n${template}`);
  assert.equal(invoke().status, 1, "plaintext consumes the remainder even after a closing token");
});

test("review policy cannot be supplied by a root AGENTS symlink", (t) => {
  const { repo, invoke } = fixture(t);
  fs.writeFileSync(path.join(repo, "other.md"), template);
  fs.symlinkSync("other.md", path.join(repo, "AGENTS.md"));
  const result = invoke();
  assert.equal(result.status, 1, result.stderr);
  assert.match(JSON.parse(result.stdout).reviewPolicy.errors.join(" "), /non-symlink/);
});

test("launch scanner preserves literal tag mentions and nested or quoted HTML scope", (t) => {
  const { repo, invoke } = fixture(t);
  const file = path.join(repo, "AGENTS.md");
  for (const mention of [
    "Mention the literal `<pre>` tag in documentation.",
    "Mention the literal ``<pre> `and` <code>`` tags.",
    "Mention the escaped \\<pre> and \\<template> tags.",
    "Mention `</pre>` and ``<template title=\"</template>\">``.",
    "Mention the literal `<plaintext>` tag.",
    "Mention the custom <pre-example> tag.",
  ]) {
    fs.writeFileSync(file, `${mention}\n\n${template}`);
    const result = invoke();
    assert.equal(result.status, 0, `${mention}: ${result.stderr || result.stdout}`);
  }
  for (const tag of ["pre", "code", "template"]) {
    for (const example of [
      `<${tag}>\n<${tag}>Example</${tag}>\n${template}\n</${tag}>`,
      `<${tag} title="</${tag}>">\n${template}\n</${tag}>`,
      `<${tag}\n title='</${tag}>'>\n${template}\n</${tag}>`,
    ]) {
      fs.writeFileSync(file, example);
      const rejected = invoke();
      assert.equal(rejected.status, 1, example.slice(0, 60));
      fs.writeFileSync(file, `${example}\n\n${template}`);
      const accepted = invoke();
      assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);
    }
  }
  fs.writeFileSync(file, `<script>\n<pre title="</pre>">\n${template}\n</script>`);
  assert.equal(invoke().status, 1, "raw text ignores other container tokens");
});

test("closing fences require matching runs and ASCII space or tab suffixes", (t) => {
  const { repo, invoke } = fixture(t);
  const file = path.join(repo, "AGENTS.md");
  for (const character of ["`", "~"]) {
    const open = character.repeat(4);
    for (const invalidClose of [`${open}still-code`, `${open} md`, `${open}\u00a0`, character.repeat(3), "    " + open, (character === "`" ? "~" : "`").repeat(4)]) {
      fs.writeFileSync(file, `${open}md\n${invalidClose}\n${template}\n${open}\n`);
      const rejected = invoke();
      assert.equal(rejected.status, 1, JSON.stringify(invalidClose));
      assert.equal(JSON.parse(rejected.stdout).reviewPolicy.ok, false);
    }
    for (const close of [open, `  ${open} \t`, `${open}${character}\t `]) {
      fs.writeFileSync(file, `${open}md\nexample\n${close}\n${template}`);
      const accepted = invoke();
      assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);
    }
  }
});

test("listing examples cannot supply rules and literal listing mentions remain harmless", (t) => {
  const { repo, invoke } = fixture(t);
  const file = path.join(repo, "AGENTS.md");
  for (const example of [`<listing>\n${template}\n</listing>`, `<LISTING title="</listing>">\n<listing>example</listing>\n${template}\n</LISTING>`]) {
    fs.writeFileSync(file, example);
    assert.equal(invoke().status, 1);
    fs.writeFileSync(file, `${example}\n\n${template}`);
    assert.equal(invoke().status, 0);
  }
  fs.writeFileSync(file, `Mention \`<listing>\` and \\<listing> literally.\n\n${template}`);
  assert.equal(invoke().status, 0);
});
