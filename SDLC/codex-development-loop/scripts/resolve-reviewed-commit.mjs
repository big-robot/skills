import path from "node:path";
import { resolveReviewedCommit } from "./reviewed-commit-resolution.mjs";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(
        "Usage: node resolve-reviewed-commit.mjs --repo <path> --current-head <full-sha> --reviewed-commit <sha-or-unique-prefix>",
      );
    }
    args[key.slice(2)] = value;
  }
  return args;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const repo = path.resolve(args.repo || "");
  const currentHead = (args["current-head"] || "").toLowerCase();
  const reviewedCommit = (args["reviewed-commit"] || "").toLowerCase();

  if (!/^[0-9a-f]{40}$/.test(currentHead)) {
    throw new Error("--current-head must be a full 40-character hexadecimal commit SHA");
  }
  if (!/^[0-9a-f]{7,40}$/.test(reviewedCommit)) {
    throw new Error("--reviewed-commit must be a 7-40 character hexadecimal commit SHA");
  }

  const resolved = resolveReviewedCommit(repo, currentHead, reviewedCommit);
  if (resolved.status === "unavailable") {
    throw new Error("reviewed commit is not uniquely resolvable in this repository");
  }
  const matches = resolved.status === "match";
  process.stdout.write(`${JSON.stringify({
    ok: matches,
    currentHead,
    reviewedCommit,
    resolvedReviewedCommit: resolved.resolvedReviewedCommit,
    matches,
  }, null, 2)}\n`);
  if (!matches) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
