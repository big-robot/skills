import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const template = fileURLToPath(new URL("../../shared/templates/agents-code-review-rules.md", import.meta.url));
const contract = "test-integrity:v1";

const containers = new Set(["pre", "code", "listing", "template"]);

function htmlTagAt(source, offset) {
  const start = /^<(\/?)(pre|code|listing|template|script|style|textarea|xmp|iframe|noembed|noframes|plaintext)(?=[\s/>]|$)/i.exec(source.slice(offset));
  if (!start) return null;
  let quote = null;
  for (let cursor = offset + start[0].length; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (quote !== null) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === ">") return { name: start[2].toLowerCase(), closing: start[1] === "/", end: cursor + 1 };
  }
  // An unfinished literal container cannot expose governing instructions.
  return { name: start[2].toLowerCase(), closing: start[1] === "/", end: source.length };
}

function codeSpanEnd(source, offset, lineEnd) {
  let length = 1;
  while (source[offset + length] === "`") length += 1;
  let cursor = offset + length;
  while (cursor < lineEnd) {
    const next = source.indexOf("`", cursor);
    if (next < 0 || next >= lineEnd) return null;
    let run = 1;
    while (source[next + run] === "`") run += 1;
    if (run === length) return next + run;
    cursor = next + run;
  }
  return null;
}

// Ignore literal/raw HTML examples as well as Markdown code examples.
function reviewSection(markdown) {
  const source = markdown.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => comment === `<!-- ${contract} -->` ? comment : "");
  const sections = [];
  let fence = null;
  const stack = [];
  let rawText = null;
  let skipUntil = 0;
  let offset = 0;
  let active = null;
  for (const line of source.split("\n")) {
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    offset = lineEnd + 1;
    let hidden = stack.length > 0 || rawText !== null || lineStart < skipUntil;
    if (!hidden) {
      const boundary = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (boundary) {
        if (fence === null) fence = { character: boundary[1][0], length: boundary[1].length };
        else if (boundary[1][0] === fence.character && boundary[1].length >= fence.length
          && /^[ \t]*$/.test(line.slice(boundary[0].length).replace(/\r$/, ""))) fence = null;
        continue;
      }
      if (fence !== null || /^(?: {4}| {0,3}\t)/.test(line)) continue;
    }
    let cursor = Math.max(lineStart, skipUntil);
    while (cursor < lineEnd) {
      if (rawText !== null) {
        hidden = true;
        if (rawText === "plaintext") break;
        const tag = source[cursor] === "<" && source[cursor + 1] === "/" ? htmlTagAt(source, cursor) : null;
        if (tag?.closing && tag.name === rawText) {
          rawText = null;
          skipUntil = tag.end;
          cursor = tag.end;
        } else cursor += 1;
        continue;
      }
      if (stack.length === 0) {
        if (source[cursor] === "\\") { cursor += 2; continue; }
        if (source[cursor] === "`") {
          const end = codeSpanEnd(source, cursor, lineEnd);
          if (end !== null) { cursor = end; continue; }
          while (source[cursor] === "`") cursor += 1;
          continue;
        }
      }
      const tag = source[cursor] === "<" ? htmlTagAt(source, cursor) : null;
      if (tag === null) { cursor += 1; continue; }
      hidden = true;
      skipUntil = tag.end;
      cursor = tag.end;
      if (tag.closing) {
        if (stack.at(-1) === tag.name) stack.pop();
      } else if (containers.has(tag.name)) stack.push(tag.name);
      else rawText = tag.name;
    }
    if (hidden) continue;
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
