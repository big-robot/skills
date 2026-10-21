import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const template = fileURLToPath(new URL("../../shared/templates/agents-code-review-rules.md", import.meta.url));
const contract = "test-integrity:v1";

// Ignore examples in fenced code. A pasted example is not a governing section.
function reviewSection(markdown) {
  const lines = markdown.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => comment === `<!-- ${contract} -->` ? comment : "").split(/\r?\n/);
  const sections = [];
  let fence = null;
  let active = null;
  for (const line of lines) {
    const boundary = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (boundary) {
      if (fence === null) fence = { character: boundary[1][0], length: boundary[1].length };
      else if (boundary[1][0] === fence.character && boundary[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (/^(?: {4}| {0,3}\t)/.test(line)) continue;
    if (/^ {0,3}#{1,2}\s/.test(line)) {
      active = /^ {0,3}## Code Review Rules\s*#*\s*$/.test(line) ? [] : null;
      if (active) sections.push(active);
    } else if (active !== null) active.push(line);
  }
  if (sections.length !== 1) throw new Error("require exactly one governing ## Code Review Rules section");
  return sections[0];
}

const normalized = (value) => value.trim().replace(/\s+/g, " ");

export function inspectReviewPolicy(root) {
  const file = path.join(root, "AGENTS.md");
  const result = { ok: false, contract, path: "AGENTS.md", ruleIds: [], errors: [] };
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) {
      throw new Error("AGENTS.md must be a regular non-symlink file no larger than 64 KiB");
    }
    const source = fs.readFileSync(file, "utf8");
    const canonical = reviewSection(fs.readFileSync(template, "utf8"));
    const section = reviewSection(source).map(normalized);
    if (!section.includes(`<!-- ${contract} -->`)) throw new Error(`missing <!-- ${contract} -->`);
    const required = canonical.filter((line) => /^- TI-\d{2}:/.test(line));
    if (required.length !== 6) throw new Error("installed review template has an invalid core rule set");
    for (const rule of required) {
      const id = rule.match(/TI-\d{2}/)[0];
      if (section.filter((line) => line === normalized(rule)).length !== 1) {
        result.errors.push(`missing or changed core rule ${id}`);
      } else result.ruleIds.push(id);
    }
    result.sha256 = createHash("sha256").update(source).digest("hex");
    result.ok = result.errors.length === 0;
  } catch (error) {
    result.errors.push(`${file}: ${error.message}`);
  }
  if (!result.ok) result.remediation = `Add the complete Code Review Rules section from ${template} to ${file}; preserve the versioned core rules and add repository rules below them. No files were changed.`;
  return result;
}

export function assertReviewPolicy(root) {
  const result = inspectReviewPolicy(root);
  if (!result.ok) throw new Error(`Review contract missing or invalid: ${result.errors.join("; ")}. ${result.remediation}`);
  return result;
}
