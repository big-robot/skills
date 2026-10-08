#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const QUERY = `
query ReviewThreads($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number
      state
      headRefOid
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(last: 1) {
            nodes { databaseId url }
          }
        }
      }
    }
  }
}`;

function usage() {
  return "Usage: node assert-review-threads-resolved.mjs --repo <owner/name> --pr <number> [--gh-bin <path>]";
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || values.has(key)) throw new Error(usage());
    values.set(key, value);
  }
  for (const key of values.keys()) {
    if (!["--repo", "--pr", "--gh-bin"].includes(key)) throw new Error(`unknown option: ${key}\n${usage()}`);
  }
  const repository = values.get("--repo") || "";
  const match = /^([^/\s]+)\/([^/\s]+)$/u.exec(repository);
  if (!match) throw new Error("--repo must be owner/name");
  const pr = Number(values.get("--pr"));
  if (!Number.isSafeInteger(pr) || pr <= 0) throw new Error("--pr must be a positive integer");
  const ghBin = values.get("--gh-bin") || "gh";
  if (values.has("--gh-bin") && process.env.CODEX_DEVELOPMENT_LOOP_TEST !== "1") {
    throw new Error("--gh-bin is test-only");
  }
  return { owner: match[1], name: match[2], repository, pr, ghBin };
}

function graphql(args, after) {
  const command = [
    "api", "graphql",
    "-f", `query=${QUERY}`,
    "-f", `owner=${args.owner}`,
    "-f", `name=${args.name}`,
    "-F", `number=${args.pr}`,
  ];
  if (after !== null) command.push("-f", `after=${after}`);
  const result = spawnSync(args.ghBin, command, { encoding: "utf8" });
  if (result.error) throw new Error(`gh failed to start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr.trim() || "GitHub review-thread query failed");
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("GitHub review-thread query returned invalid JSON");
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const threads = [];
  let after = null;
  let pullRequest = null;
  do {
    const response = graphql(args, after);
    pullRequest = response?.data?.repository?.pullRequest;
    if (!pullRequest) throw new Error(`pull request not found: ${args.repository}#${args.pr}`);
    const connection = pullRequest.reviewThreads;
    if (!connection || !Array.isArray(connection.nodes)) throw new Error("GitHub response omitted reviewThreads");
    threads.push(...connection.nodes);
    after = connection.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
    if (connection.pageInfo?.hasNextPage && !after) throw new Error("GitHub review-thread pagination omitted endCursor");
  } while (after !== null);

  const unresolved = threads.filter((thread) => thread.isResolved !== true).map((thread) => ({
    id: thread.id,
    outdated: thread.isOutdated === true,
    path: thread.path ?? null,
    line: thread.line ?? null,
    latestCommentId: thread.comments?.nodes?.[0]?.databaseId ?? null,
    latestCommentUrl: thread.comments?.nodes?.[0]?.url ?? null,
  }));
  const output = {
    ok: unresolved.length === 0,
    repository: args.repository,
    pr: args.pr,
    state: pullRequest.state,
    headSha: pullRequest.headRefOid,
    threadCount: threads.length,
    unresolvedCount: unresolved.length,
    unresolved,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.ok) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
