import { spawnSync } from "node:child_process";

const FULL_SHA_RE = /^[0-9a-f]{40}$/;
const REVIEWED_SHA_RE = /^[0-9a-f]{7,40}$/;

function runGit(repo, args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  return {
    ok: result.status === 0,
    stdout: result.stdout.trim().toLowerCase(),
    stderr: result.stderr.trim(),
  };
}

export function resolveReviewedCommit(repo, currentHead, reviewedCommit) {
  const expected = String(currentHead ?? "").toLowerCase();
  const token = String(reviewedCommit ?? "").toLowerCase();
  if (!FULL_SHA_RE.test(expected)) throw new Error("current head must be a full 40-character hexadecimal commit SHA");
  if (!REVIEWED_SHA_RE.test(token)) throw new Error("reviewed commit must be a 7-40 character hexadecimal commit SHA");

  const current = runGit(repo, ["rev-parse", "--verify", `${expected}^{commit}`]);
  if (!current.ok || current.stdout !== expected) {
    return { status: "unavailable", currentHead: expected, reviewedCommit: token, resolvedReviewedCommit: null };
  }
  const reviewed = runGit(repo, ["rev-parse", "--verify", `${token}^{commit}`]);
  if (!reviewed.ok || !FULL_SHA_RE.test(reviewed.stdout)) {
    return { status: "unavailable", currentHead: expected, reviewedCommit: token, resolvedReviewedCommit: null };
  }
  return {
    status: reviewed.stdout === expected ? "match" : "mismatch",
    currentHead: expected,
    reviewedCommit: token,
    resolvedReviewedCommit: reviewed.stdout,
  };
}
