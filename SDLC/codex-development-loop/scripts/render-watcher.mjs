import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--state-file") {
    throw new Error("Usage: node render-watcher.mjs --state-file <absolute-ledger-path>");
  }
  if (!path.isAbsolute(argv[1])) throw new Error("--state-file must be absolute");
  return argv[1];
}

try {
  const stateFile = parseArgs(process.argv.slice(2));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const validator = path.join(scriptDir, "validate-ledger.mjs");
  const validation = spawnSync(process.execPath, [validator, "--file", stateFile], { encoding: "utf8" });
  if (validation.status !== 0) throw new Error(`Ledger validation failed:\n${validation.stdout.trim()}`);
  const template = fs.readFileSync(path.join(scriptDir, "..", "assets", "scheduled-pr-watcher.txt"), "utf8");
  const ledger = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const shellQuote = (value) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const rendered = template
    .replaceAll("{{NODE_BIN}}", () => shellQuote(ledger.runtime.nodeBin ?? process.execPath))
    .replaceAll("{{WATCH_PR_SCRIPT}}", () => shellQuote(path.join(scriptDir, "watch-pr.mjs")))
    .replaceAll("{{STATE_FILE}}", () => shellQuote(stateFile));
  if (/\{\{[^}]+\}\}/.test(rendered)) throw new Error("Watcher template contains unresolved placeholders");
  process.stdout.write(rendered.endsWith("\n") ? rendered : `${rendered}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
