import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import commonmark from "./vendor/commonmark/commonmark-0.31.2.cjs";

const template = fileURLToPath(new URL("../../shared/templates/agents-code-review-rules.md", import.meta.url));
const contract = "test-integrity:v1";

const containers = new Set(["pre", "code", "listing", "template"]);
const rawTextTags = new Set(["script", "style", "textarea", "xmp", "iframe", "noembed", "noframes", "plaintext"]);

// This is a literal-HTML safety supplement, not a second Markdown parser or DOM.
// Feed only HTML nodes selected by CommonMark; text and code never enter it.
function literalHTMLContext() {
  const stack = [];
  let opaque = null;
  let pending = "";
  let malformed = false;
  let transitions = 0;
  const markupEnd = (source, offset) => {
    let quote = null;
    for (let cursor = offset; cursor < source.length; cursor += 1) {
      const character = source[cursor];
      if (quote !== null) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") quote = character;
      else if (character === ">") return cursor + 1;
    }
    return null;
  };
  const tagAt = (source, offset) => {
    const match = /^<(\/?)([A-Za-z][A-Za-z0-9-]*)(?=[\t\n\f\r />]|$)/.exec(source.slice(offset));
    if (match === null) return null;
    const end = markupEnd(source, offset + match[0].length);
    return end === null ? { unfinished: true } : { name: match[2].toLowerCase(), closing: match[1] === "/", end };
  };
  return {
    get visible() { return !malformed && stack.length === 0 && opaque === null && pending === ""; },
    get transitions() { return transitions; },
    consume(literal) {
      const source = pending + literal;
      pending = "";
      let cursor = 0;
      while (cursor < source.length) {
        if (opaque === "plaintext") return;
        if (opaque !== null) {
          const close = new RegExp("</" + opaque + "(?=[\\t\\n\\f\\r />]|$)", "ig");
          close.lastIndex = cursor;
          const match = close.exec(source);
          if (match === null) return;
          const tag = tagAt(source, match.index);
          if (tag.unfinished) { pending = source.slice(match.index); return; }
          opaque = null;
          transitions += 1;
          cursor = tag.end;
          continue;
        }
        const next = source.indexOf("<", cursor);
        if (next === -1) return;
        cursor = next;
        const rest = source.slice(cursor);
        if (rest.startsWith("<!-->")) { cursor += 5; continue; }
        if (rest.startsWith("<!--->")) { cursor += 6; continue; }
        if (/^<![A-Z]/i.test(rest) && !rest.startsWith("<![CDATA[")) {
          const end = markupEnd(source, cursor + 2);
          if (end === null) { pending = rest; return; }
          cursor = end;
          continue;
        }
        const special = rest.startsWith("<!--") ? [4, "-->"] : rest.startsWith("<![CDATA[") ? [9, "]]>"]
          : rest.startsWith("<?") ? [2, "?>"] : null;
        if (special !== null) {
          const end = source.indexOf(special[1], cursor + special[0]);
          if (end === -1) { pending = rest; return; }
          cursor = end + special[1].length;
          continue;
        }
        const tag = tagAt(source, cursor);
        if (tag === null) { cursor += 1; continue; }
        if (tag.unfinished) { pending = rest; transitions += 1; return; }
        cursor = tag.end;
        if (tag.closing) {
          if (stack.at(-1) === tag.name) { stack.pop(); transitions += 1; }
          else if (containers.has(tag.name) && stack.length > 0) malformed = true;
        } else if (containers.has(tag.name)) {
          stack.push(tag.name);
          transitions += 1;
        } else if (rawTextTags.has(tag.name)) {
          opaque = tag.name;
          transitions += 1;
        }
      }
    },
  };
}

// The parser decides all Markdown block/inline precedence. Only root document
// headings and actual list-item paragraphs can supply the versioned core.
function reviewSection(markdown) {
  const lines = markdown.split(/\r?\n/);
  const document = new commonmark.Parser().parse(markdown);
  const context = literalHTMLContext();
  const sections = [];
  const paragraphs = new Map();
  let active = null;
  const walker = document.walker();
  let event;
  while ((event = walker.next()) !== null) {
    const { node, entering } = event;
    if (entering && node.type === "heading" && node.parent === document && node.level <= 2 && context.visible) {
      const line = lines[node.sourcepos[0][0] - 1];
      active = node.level === 2 && /^ {0,3}## Code Review Rules(?:[ \t]+#+)?[ \t]*$/.test(line) ? [] : null;
      if (active !== null) sections.push(active);
    } else if (entering && (node.type === "html_block" || node.type === "html_inline")) {
      const visible = context.visible;
      context.consume(node.literal);
      if (visible && context.visible && active !== null && node.parent === document
        && node.type === "html_block" && node.literal.trim() === "<!-- " + contract + " -->") active.push(node.literal.trim());
    } else if (node.type === "paragraph" && node.parent?.type === "item" && node.parent.firstChild === node && node.parent.parent?.parent === document) {
      if (entering && context.visible && active !== null) paragraphs.set(node, { section: active, transitions: context.transitions });
      else if (!entering) {
        const start = paragraphs.get(node);
        if (start && context.visible && start.transitions === context.transitions) start.section.push(lines[node.parent.sourcepos[0][0] - 1]);
        paragraphs.delete(node);
      }
    }
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
