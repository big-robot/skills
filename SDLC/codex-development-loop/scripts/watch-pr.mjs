#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveReviewedCommit } from "./reviewed-commit-resolution.mjs";
import { isReviewRequestBody } from "./review-request.mjs";

const SHA_RE = /^[0-9a-f]{40}$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const CODEX_LOGIN = "chatgpt-codex-connector";
const TERMINAL = new Set([
  "clean", "dispositions_complete", "findings", "checks_failed", "head_drift", "ambiguous", "pr_closed", "pr_merged",
]);

const QUERY = String.raw`
query WatchPullRequest($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number
      url
      headRefName
      baseRefName
      baseRepository { nameWithOwner }
      state
      mergedAt
      headRefOid
      reactions(first: 100) {
        pageInfo { hasNextPage }
        nodes { content createdAt user { login } }
      }
      comments(last: 100) {
        pageInfo { hasPreviousPage }
        nodes {
          databaseId url body createdAt
          author { login }
          reactions(first: 100, content: EYES) {
            pageInfo { hasNextPage }
            nodes { user { login } }
          }
        }
      }
      reviews(last: 100) {
        pageInfo { hasPreviousPage }
        nodes { id fullDatabaseId url state body submittedAt commit { oid } author { login } }
      }
      reviewThreads(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          id isResolved
          comments(first: 100) {
            pageInfo { hasNextPage }
            nodes { id fullDatabaseId url body createdAt commit { oid } originalCommit { oid } pullRequestReview { id } author { login } }
          }
        }
      }
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100) {
                pageInfo { hasNextPage }
                nodes {
                  __typename
                  ... on CheckRun { name status conclusion detailsUrl }
                  ... on StatusContext { context state targetUrl }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) fail(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (new Set(["once", "watch"]).has(key)) {
      if (flags[key]) fail(`Duplicate --${key}`);
      flags[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--") || Object.hasOwn(flags, key)) fail(`Missing or duplicate --${key}`);
    flags[key] = value;
    index += 1;
  }
  const allowed = new Set(["file", "repo", "pr", "head", "request-comment-id", "checkout", "once", "watch", "interval-seconds", "max-idle-seconds"]);
  for (const key of Object.keys(flags)) if (!allowed.has(key)) fail(`Unknown --${key}`);
  if (Boolean(flags.once) === Boolean(flags.watch)) fail("Choose exactly one of --once or --watch");
  let repo = flags.repo;
  let pr = flags.pr;
  let head = flags.head;
  let requestCommentId = flags["request-comment-id"];
  let checkout = flags.checkout;
  let expectedChecks = null;
  let automaticReview = null;
  if (flags.file) {
    if ([repo, pr, head, requestCommentId, checkout].some(Boolean)) fail("--file cannot be combined with explicit PR binding options");
    if (!path.isAbsolute(flags.file)) fail("--file must be absolute");
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const validation = spawnSync(process.execPath, [path.join(scriptDir, "validate-ledger.mjs"), "--file", flags.file], { encoding: "utf8" });
    if (validation.status !== 0) fail(`Ledger validation failed:\n${validation.stdout.trim()}`);
    const ledger = JSON.parse(fs.readFileSync(flags.file, "utf8"));
    const match = ledger.prUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)$/);
    if (!match) fail("ledger prUrl must be a canonical github.com pull-request URL");
    const request = ledger.codexReviewRequests.at(-1);
    automaticReview = ledger.automaticReview ?? null;
    repo = match[1];
    pr = match[2];
    head = automaticReview?.headSha ?? request?.headSha;
    requestCommentId = automaticReview ? null : request?.commentId;
    checkout = ledger.currentCheckout;
    expectedChecks = ledger.expectedChecks ?? null;
  } else {
    for (const key of ["repo", "pr", "head", "request-comment-id"]) if (!flags[key]) fail(`Missing --${key}`);
    expectedChecks = null;
  }
  if (!REPO_RE.test(repo)) fail("--repo must be owner/name");
  if (!SHA_RE.test(head)) fail("--head must be a full lowercase commit SHA");
  if (!/^\d+$/.test(String(pr)) || Number(pr) <= 0) fail("--pr must be a positive integer");
  if (!automaticReview && (!/^\d+$/.test(String(requestCommentId)) || Number(requestCommentId) <= 0)) {
    fail("--request-comment-id must be a positive numeric GitHub comment ID");
  }
  if (checkout !== undefined && (!path.isAbsolute(checkout) || !fs.existsSync(checkout))) fail("--checkout must be an existing absolute path");
  const intervalSeconds = Number(flags["interval-seconds"] ?? 120);
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 5 || intervalSeconds > 3600) {
    fail("--interval-seconds must be an integer from 5 through 3600");
  }
  const maxIdleSeconds = Number(flags["max-idle-seconds"] ?? 3600);
  if (!Number.isInteger(maxIdleSeconds) || maxIdleSeconds < intervalSeconds || maxIdleSeconds > 86400) {
    fail("--max-idle-seconds must be an integer from the polling interval through 86400");
  }
  return {
    repository: repo,
    prNumber: Number(pr),
    expectedHeadSha: head,
    requestCommentId: Number(requestCommentId),
    checkout: checkout ?? null,
    expectedChecks,
    automaticReview,
    mode: flags.once ? "once" : "watch",
    intervalSeconds,
    maxIdleSeconds,
  };
}

function timestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function base(snapshot, state, extra = {}) {
  return {
    state,
    repository: snapshot.repository,
    prNumber: snapshot.prNumber,
    expectedHeadSha: snapshot.expectedHeadSha,
    observedHeadSha: snapshot.headSha ?? null,
    observedAt: snapshot.observedAt,
    unresolvedThreads: knownThreadCount(snapshot),
    missingDispositions: null,
    ...extra,
  };
}

function checkState(check) {
  if (check.type === "CheckRun") {
    if (check.status !== "COMPLETED") return "pending";
    if (["SUCCESS", "SKIPPED", "NEUTRAL"].includes(check.conclusion)) return "passed";
    if (["ACTION_REQUIRED", "CANCELLED", "FAILURE", "STARTUP_FAILURE", "STALE", "TIMED_OUT"].includes(check.conclusion)) return "failed";
    return "unknown";
  }
  if (check.type === "StatusContext") {
    if (check.state === "SUCCESS") return "passed";
    if (["EXPECTED", "PENDING"].includes(check.state)) return "pending";
    if (["ERROR", "FAILURE"].includes(check.state)) return "failed";
  }
  return "unknown";
}

function parseReviewedSha(body) {
  if ((body?.match(/\*\*Reviewed commit:\*\*/gi) ?? []).length !== 1) return null;
  return body.match(/\*\*Reviewed commit:\*\*\s*`([0-9a-f]{7,40})`/i)?.[1]?.toLowerCase() ?? null;
}

function reviewedShaMatchesExpected(body, expectedHeadSha, resolutions = {}) {
  const reviewedSha = parseReviewedSha(body);
  if (reviewedSha === expectedHeadSha) return true;
  return reviewedSha !== null && resolutions[reviewedSha] === expectedHeadSha;
}

function reviewSummary(body) {
  if (!String(body ?? "").includes("<!-- codex-pull-request-review-summary -->")) return null;
  const rows = String(body).split("\n").filter((line) => /^\|[^|]*\*\*Code Review\*\*\s*\|/.test(line));
  if (rows.length !== 1) return { invalid: true };
  const cells = rows[0].split("|").map((cell) => cell.trim());
  const token = cells[3]?.match(/^`([0-9a-f]{7,40})`$/)?.[1];
  const completed = /\*\*Completed\*\*/.test(cells[2] ?? "");
  const pending = /\*\*(?:In progress|In Progress|Running|Queued|Pending)\*\*/.test(cells[2] ?? "");
  const failed = /\*\*(?:Failed|Cancelled|Canceled)\*\*/.test(cells[2] ?? "");
  const completedAt = cells[2]?.match(/<relative-time datetime="([^"]+)">/)?.[1];
  if (!token || (!completed && !pending && !failed) || (completed && timestamp(completedAt) === null)) return { invalid: true };
  return { token, completed, pending, failed, completedAt };
}

// Discovery never interprets a PR reaction alone as commit-bound review evidence.
export function automaticReviewEvidence(snapshot) {
  if (snapshot.githubError || snapshot.incompleteEvidence?.length || snapshot.headSha !== snapshot.expectedHeadSha
    || knownThreadCount(snapshot) === null) return { state: "unknown" };
  const trusted = (item) => item.authorLogin === CODEX_LOGIN;
  const currentReviews = (snapshot.reviews ?? []).filter((item) => trusted(item) && item.commitSha === snapshot.expectedHeadSha
    && ["APPROVED", "COMMENTED", "CHANGES_REQUESTED"].includes(item.state));
  const currentCleanComments = (snapshot.comments ?? []).filter((item) => {
    if (!trusted(item) || !/Codex Review:\s*Didn't find any major issues/i.test(item.body ?? "")) return false;
    const token = parseReviewedSha(item.body);
    return token !== null && (snapshot.expectedHeadSha.startsWith(token)
      || snapshot.reviewedCommitResolutions?.[token] === snapshot.expectedHeadSha);
  });
  const inline = (snapshot.threads ?? []).flatMap((thread) => thread.comments ?? []).filter((item) => trusted(item)
    && (item.originalCommitSha ?? item.commitSha) === snapshot.expectedHeadSha);
  if (currentReviews.some((item) => timestamp(item.submittedAt) === null)
    || currentCleanComments.some((item) => timestamp(item.createdAt) === null
      || !reviewedShaMatchesExpected(item.body, snapshot.expectedHeadSha, snapshot.reviewedCommitResolutions))
    || inline.some((item) => timestamp(item.createdAt) === null)) return { state: "unknown" };
  const reviews = currentReviews;
  const cleanComments = currentCleanComments;
  const summaries = (snapshot.comments ?? []).filter(trusted).map((comment) => ({ comment, summary: reviewSummary(comment.body) }))
    .filter(({ summary }) => summary !== null);
  const bound = summaries.filter(({ summary }) => !summary.invalid && (summary.token === snapshot.expectedHeadSha
    || snapshot.reviewedCommitResolutions?.[summary.token] === snapshot.expectedHeadSha));
  if (summaries.some(({ summary }) => summary.invalid || (summary.token.length < 40
    && snapshot.expectedHeadSha.startsWith(summary.token) && snapshot.reviewedCommitResolutions?.[summary.token] !== snapshot.expectedHeadSha))) {
    return { state: "unknown" };
  }
  const latest = bound.at(-1);
  const reactions = snapshot.prReactions;
  if (latest?.summary.completed && !Array.isArray(reactions)) return { state: "unknown" };
  const summaryClean = latest?.summary.completed && reactions?.some((reaction) => [CODEX_LOGIN, `${CODEX_LOGIN}[bot]`].includes(reaction.authorLogin)
    && reaction.content === "THUMBS_UP" && timestamp(reaction.createdAt) !== null
    && timestamp(reaction.createdAt) >= timestamp(latest.summary.completedAt));
  const evidence = reviews.at(-1) ?? cleanComments.at(-1) ?? inline.at(-1) ?? (latest?.summary.failed ? null : latest?.comment);
  if (!evidence) return { state: "absent" };
  if (typeof evidence.url !== "string" || !evidence.url.startsWith(`https://github.com/${snapshot.repository}/pull/${snapshot.prNumber}#`)) {
    return { state: "unknown" };
  }
  return { state: "available", evidenceRef: evidence.url, summaryClean: Boolean(summaryClean),
    summaryRef: latest?.comment.url ?? null, pending: Boolean(latest && !summaryClean), summaryPending: Boolean(latest?.summary.pending) };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function findingFingerprint(finding, identity = finding.id) {
  return sha256(`${identity}\n${finding.commitSha}\n${finding.body ?? ""}`);
}

function parseDispositions(body) {
  const matches = String(body ?? "").matchAll(/<!--\s*cdl-disposition\s+finding=([^\s]+)\s+head=([0-9a-f]{40})\s+source-sha256=([0-9a-f]{64})\s+evidence-ref=(\S+)\s+evidence-sha256=([0-9a-f]{64})\s*-->/gi);
  return [...matches].map((match) => ({
    findingId: match[1], headSha: match[2].toLowerCase(), sourceSha256: match[3].toLowerCase(),
    evidenceRef: match[4], evidenceSha256: match[5].toLowerCase(),
  }));
}

function knownThreadCount(snapshot) {
  if (!Array.isArray(snapshot.threads) || snapshot.threads.some((thread) => typeof thread?.isResolved !== "boolean")
    || snapshot.incompleteEvidence?.some((reason) => /review-thread pagination/.test(reason))) return null;
  return snapshot.threads.filter((thread) => !thread.isResolved).length;
}

function databaseIdentity(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === "string" && /^[1-9][0-9]*$/.test(value) ? value : null;
}

function findingIdentities(item) {
  // Full database IDs arrive as decimal strings; never round numbers or decode node IDs.
  const databaseId = databaseIdentity(item.fullDatabaseId ?? item.databaseId);
  return [...new Set([item.id, databaseId].filter((id) => typeof id === "string" && id.length > 0))];
}

function fetchedIdentity(item) {
  for (const field of ["fullDatabaseId", "databaseId"]) {
    if (item[field] !== undefined && item[field] !== null && databaseIdentity(item[field]) === null) {
      throw new Error("finding database identity is malformed or unsafe");
    }
  }
  if (item.fullDatabaseId != null && item.databaseId != null
    && databaseIdentity(item.fullDatabaseId) !== databaseIdentity(item.databaseId)) {
    throw new Error("finding database identities conflict");
  }
  return { id: item.id, fullDatabaseId: databaseIdentity(item.fullDatabaseId ?? item.databaseId) };
}

function expectedCheckState(snapshot) {
  const contract = snapshot.expectedChecks;
  if (!contract) return { state: "unknown", reason: "expected check contract is unavailable" };
  if (contract.mode === "none") {
    const evidenceFields = ["source", "authorizedBy"].filter((key) => Object.hasOwn(contract, key));
    return evidenceFields.length > 0 && evidenceFields.every((key) => typeof contract[key] === "string" && contract[key].trim().length > 0)
      ? { state: "ready" }
      : { state: "unknown", reason: "no-CI check contract evidence is missing or invalid" };
  }
  if (contract.mode !== "required" || !Array.isArray(contract.names) || contract.names.length === 0
    || contract.names.some((name) => typeof name !== "string" || name.trim().length === 0)
    || new Set(contract.names).size !== contract.names.length
    || typeof contract.source !== "string" || contract.source.trim().length === 0) {
    return { state: "unknown", reason: "expected check contract is invalid" };
  }
  const checksByName = new Map(snapshot.checks.map((check) => [check.name, check]));
  const missing = contract.names.filter((name) => !checksByName.has(name));
  if (missing.length > 0) return { state: "pending", missing };
  const unsuitable = contract.names.filter((name) => checkState(checksByName.get(name)) !== "passed" || checksByName.get(name).conclusion !== "SUCCESS" && checksByName.get(name).type === "CheckRun");
  if (unsuitable.length > 0) return { state: "pending", missing: unsuitable };
  return { state: "ready" };
}

export function classifySnapshot(snapshot) {
  if (!SHA_RE.test(snapshot.expectedHeadSha)) fail("expectedHeadSha must be a full lowercase commit SHA");
  if (snapshot.githubError) return base(snapshot, "github_unavailable", { error: snapshot.githubError });
  if (snapshot.state === "MERGED" || snapshot.mergedAt) return base(snapshot, "pr_merged");
  if (snapshot.state !== "OPEN") return base(snapshot, "pr_closed", { prState: snapshot.state });
  if (snapshot.headSha !== snapshot.expectedHeadSha) return base(snapshot, "head_drift");
  if (snapshot.incompleteEvidence?.length) return base(snapshot, "ambiguous", { reasons: snapshot.incompleteEvidence });

  if (knownThreadCount(snapshot) === null) return base(snapshot, "ambiguous", { reasons: ["review-thread state is unavailable or malformed"] });

  const request = snapshot.request;
  const automatic = snapshot.automaticReview;
  const discovery = automatic ? automaticReviewEvidence(snapshot) : null;
  const expectedPrefix = `https://github.com/${snapshot.repository}/pull/${snapshot.prNumber}#`;
  if (automatic ? automatic.headSha !== snapshot.expectedHeadSha || !automatic.dispositionActorLogin || discovery.state !== "available"
    : !request || request.id !== snapshot.requestCommentId || !isReviewRequestBody(request.body) ||
      !request.url?.startsWith(expectedPrefix) || timestamp(request.createdAt) === null) {
    return base(snapshot, "ambiguous", { reasons: ["review request identity is missing or invalid"] });
  }

  if (!Array.isArray(snapshot.checks)) return base(snapshot, "ambiguous", { reasons: ["check rollup is unavailable"] });
  const observed = snapshot.checks;
  const failedChecks = [...new Set(observed.filter((check) => checkState(check) === "failed").map((check) => check.name))];
  if (failedChecks.length > 0) return base(snapshot, "checks_failed", { failedChecks });
  const unknownChecks = [...new Set(observed.filter((check) => checkState(check) === "unknown").map((check) => check.name))];
  if (unknownChecks.length > 0) return base(snapshot, "ambiguous", { reasons: unknownChecks.map((name) => `check state is unknown: ${name}`) });
  const pendingChecks = [...new Set(observed.filter((check) => checkState(check) === "pending").map((check) => check.name))];
  if (pendingChecks.length > 0) return base(snapshot, "pending", { pendingChecks });
  const expected = expectedCheckState(snapshot);
  if (expected.state === "unknown") return base(snapshot, "ambiguous", { reasons: [expected.reason] });
  if (expected.state === "pending") return base(snapshot, "pending", { pendingChecks: expected.missing });

  const requestTime = automatic ? 0 : timestamp(request.createdAt);
  const afterRequest = (value) => timestamp(value) !== null && timestamp(value) >= requestTime;
  const malformedCodexEvidence = [...(snapshot.reviews ?? []), ...(snapshot.comments ?? [])]
    .filter((item) => item.authorLogin === CODEX_LOGIN)
    .some((item) => timestamp(item.submittedAt ?? item.createdAt) === null);
  if (malformedCodexEvidence) return base(snapshot, "ambiguous", { reasons: ["Codex evidence has an invalid timestamp"] });
  const codexReviews = (snapshot.reviews ?? []).filter((review) =>
    review.authorLogin === CODEX_LOGIN && review.commitSha === snapshot.expectedHeadSha && afterRequest(review.submittedAt));
  const findings = codexReviews.filter((review) => ["COMMENTED", "CHANGES_REQUESTED"].includes(review.state));
  const cleanReviews = codexReviews.filter((review) => review.state === "APPROVED");
  const unresolvedReviewBinding = (snapshot.comments ?? []).some((comment) => {
    const token = parseReviewedSha(comment.body);
    return comment.authorLogin === CODEX_LOGIN && afterRequest(comment.createdAt)
      && /Codex Review:\s*Didn't find any major issues/i.test(comment.body ?? "")
      && token !== null && token.length < 40 && snapshot.reviewedCommitResolutions?.[token] !== snapshot.expectedHeadSha
      && (!automatic || snapshot.expectedHeadSha.startsWith(token));
  });
  if (unresolvedReviewBinding) return base(snapshot, "ambiguous", { reasons: ["reviewed commit abbreviation is not uniquely resolved against the bound checkout"] });
  const cleanComments = (snapshot.comments ?? []).filter((comment) =>
    comment.authorLogin === CODEX_LOGIN && afterRequest(comment.createdAt) &&
    /Codex Review:\s*Didn't find any major issues/i.test(comment.body ?? "") &&
    reviewedShaMatchesExpected(comment.body, snapshot.expectedHeadSha, snapshot.reviewedCommitResolutions));
  const unresolvedThreads = (snapshot.threads ?? []).filter((thread) => !thread.isResolved);
  const automaticInline = automatic ? (snapshot.threads ?? []).flatMap((thread) => thread.comments ?? [])
    .filter((comment) => comment.authorLogin === CODEX_LOGIN
      && (comment.originalCommitSha ?? comment.commitSha) === snapshot.expectedHeadSha) : [];

  if ((findings.length > 0 || automaticInline.length > 0) && (cleanReviews.length > 0 || cleanComments.length > 0 || discovery?.summaryClean)) {
    return base(snapshot, "ambiguous", { reasons: ["conflicting exact-head Codex results"] });
  }
  if (findings.length > 0 || automaticInline.length > 0) {
    const findingReviewIds = new Set(findings.map((review) => review.id));
    const reviewFindings = findings.map((review) => ({
      ...review, id: review.id, ref: review.url ?? review.id, commitSha: review.commitSha, body: review.body, submittedAt: review.submittedAt,
    }));
    const inlineFindings = (snapshot.threads ?? []).flatMap((thread) => thread.comments ?? [])
      .filter((comment) => comment.authorLogin === CODEX_LOGIN && (automatic || findingReviewIds.has(comment.reviewId))
        && (comment.originalCommitSha ?? comment.commitSha) === snapshot.expectedHeadSha)
      .map((comment) => ({ ...comment, id: comment.id, ref: comment.url ?? comment.id, commitSha: snapshot.expectedHeadSha, body: comment.body, submittedAt: comment.createdAt }));
    const allFindings = [...reviewFindings, ...inlineFindings];
    if (allFindings.some((finding) => typeof finding.id !== "string" || finding.id.length === 0 || typeof finding.body !== "string" || timestamp(finding.submittedAt) === null)) {
      return base(snapshot, "ambiguous", { reasons: ["finding identity or current source text is unavailable"] });
    }
    const identityOwners = new Map();
    for (const item of [...(snapshot.reviews ?? []), ...(snapshot.threads ?? []).flatMap((thread) => thread.comments ?? [])]) {
      for (const identity of findingIdentities(item)) {
        const owners = identityOwners.get(identity) ?? new Set();
        owners.add(item.id);
        identityOwners.set(identity, owners);
      }
    }
    const dispositionActor = automatic?.dispositionActorLogin ?? request?.authorLogin;
    const dispositions = [...(snapshot.comments ?? []), ...(snapshot.threads ?? []).flatMap((thread) => thread.comments ?? [])]
      .filter((comment) => typeof dispositionActor === "string" && dispositionActor.length > 0
        && comment.authorLogin === dispositionActor && timestamp(comment.createdAt) !== null)
      .flatMap((comment) => parseDispositions(comment.body).map((disposition) => ({ ...comment, disposition })));
    const matches = (finding, comment) => {
      const disposition = comment.disposition;
      return findingIdentities(finding).includes(disposition.findingId)
        && identityOwners.get(disposition.findingId)?.size === 1
        && disposition.headSha === snapshot.expectedHeadSha
        && disposition.sourceSha256 === findingFingerprint(finding, disposition.findingId)
        && timestamp(comment.createdAt) >= timestamp(finding.submittedAt);
    };
    const missingDispositions = allFindings.filter((finding) => !dispositions.some((comment) => matches(finding, comment)));
    const findingRefs = [...new Set(allFindings.map((finding) => finding.ref))];
    if (unresolvedThreads.length === 0 && missingDispositions.length === 0) {
      if (discovery?.summaryPending) return base(snapshot, "acknowledged");
      return base(snapshot, "dispositions_complete", {
        evidenceRefs: [...new Set(dispositions.filter((comment) => allFindings.some((finding) => matches(finding, comment)))
          .map((comment) => comment.url ?? comment.id))],
        findingRefs,
        missingDispositions: 0,
      });
    }
    return base(snapshot, "findings", { findingRefs, missingDispositions: missingDispositions.length });
  }
  if (discovery?.pending) return base(snapshot, "acknowledged");
  if (cleanReviews.length > 0 || cleanComments.length > 0 || discovery?.summaryClean) {
    if (unresolvedThreads.length > 0) return base(snapshot, "ambiguous", { reasons: ["unresolved review threads remain"] });
    return base(snapshot, "clean", {
      evidenceRef: cleanReviews.at(-1)?.url ?? cleanComments.at(-1)?.url ?? discovery?.summaryRef ?? null,
      missingDispositions: 0,
    });
  }

  const acknowledged = discovery?.pending || request?.eyeReactionLogins?.includes(CODEX_LOGIN);
  return base(snapshot, acknowledged ? "acknowledged" : "pending");
}

function ghJson(args) {
  const ghBin = process.env.CODEX_DEVELOPMENT_LOOP_TEST === "1" && process.env.CDL_GH_BIN ? process.env.CDL_GH_BIN : "gh";
  const result = spawnSync(ghBin, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || `gh ${args[0]} failed`);
  return JSON.parse(result.stdout);
}

function normalizeCheck(node) {
  if (node.__typename === "CheckRun") {
    return {
      type: "CheckRun", name: node.name, status: node.status, conclusion: node.conclusion, url: node.detailsUrl,
    };
  }
  return { type: "StatusContext", name: node.context, state: node.state, url: node.targetUrl };
}

function requireFetchedConnection(connection, completenessFlag, label) {
  if (!connection || typeof connection !== "object" || Array.isArray(connection)
    || typeof connection.pageInfo?.[completenessFlag] !== "boolean" || !Array.isArray(connection.nodes)
    || connection.nodes.some((node) => !node || typeof node !== "object" || Array.isArray(node))) {
    throw new Error(`${label} connection is malformed or has unknown pagination`);
  }
}

function fetchSnapshot(options) {
  const [owner, name] = options.repository.split("/");
  const observedAt = new Date().toISOString();
  try {
    const response = ghJson([
      "api", "graphql",
      "-f", `query=${QUERY}`,
      "-F", `owner=${owner}`,
      "-F", `name=${name}`,
      "-F", `number=${options.prNumber}`,
    ]);
    if (response.errors?.length) throw new Error("GitHub GraphQL returned errors");
    const pr = response.data?.repository?.pullRequest;
    if (!pr) throw new Error("pull request is unavailable");
    requireFetchedConnection(pr.comments, "hasPreviousPage", "comments");
    requireFetchedConnection(pr.reviews, "hasPreviousPage", "reviews");
    requireFetchedConnection(pr.reviewThreads, "hasNextPage", "review threads");
    requireFetchedConnection(pr.reactions, "hasNextPage", "PR reactions");
    for (const comment of pr.comments.nodes) requireFetchedConnection(comment.reactions, "hasNextPage", "comment reactions");
    for (const thread of pr.reviewThreads.nodes) requireFetchedConnection(thread.comments, "hasNextPage", "thread comments");
    if (pr.reactions.nodes.some((reaction) => typeof reaction.content !== "string" || !reaction.content.trim()
      || typeof reaction.createdAt !== "string" || !Number.isFinite(Date.parse(reaction.createdAt))
      || typeof reaction.user?.login !== "string" || !reaction.user.login.trim())) {
      throw new Error("PR reactions contain malformed evidence");
    }
    const incompleteEvidence = [];
    if (pr.comments.pageInfo.hasPreviousPage) incompleteEvidence.push("comment pagination is incomplete");
    if (pr.reviews.pageInfo.hasPreviousPage) incompleteEvidence.push("review pagination is incomplete");
    if (pr.reviewThreads.pageInfo.hasNextPage) incompleteEvidence.push("review-thread pagination is incomplete");
    if (pr.reviewThreads.nodes.some((thread) => thread.comments.pageInfo.hasNextPage)) incompleteEvidence.push("thread-comment pagination is incomplete");
    if (pr.reactions?.pageInfo?.hasNextPage) incompleteEvidence.push("PR-reaction pagination is incomplete");
    const headCommit = pr.commits?.nodes?.[0]?.commit;
    const hasKnownEmptyRollup = headCommit !== null && typeof headCommit === "object"
      && Object.hasOwn(headCommit, "statusCheckRollup") && headCommit.statusCheckRollup === null;
    const contexts = headCommit?.statusCheckRollup?.contexts;
    const validContexts = contexts !== null && typeof contexts === "object"
      && contexts.pageInfo !== null && typeof contexts.pageInfo === "object"
      && typeof contexts.pageInfo.hasNextPage === "boolean" && Array.isArray(contexts.nodes);
    if (contexts !== undefined && contexts !== null && !validContexts) incompleteEvidence.push("check rollup is malformed");
    if (validContexts && contexts.pageInfo.hasNextPage) incompleteEvidence.push("check pagination is incomplete");
    const comments = pr.comments.nodes.map((comment) => ({
      id: comment.databaseId,
      url: comment.url,
      body: comment.body,
      createdAt: comment.createdAt,
      authorLogin: comment.author?.login ?? null,
      eyeReactionLogins: comment.reactions.nodes.map((reaction) => reaction.user?.login).filter(Boolean),
      reactionsHaveNextPage: comment.reactions.pageInfo.hasNextPage,
    }));
    const request = comments.find((comment) => comment.id === options.requestCommentId) ?? null;
    if (request?.reactionsHaveNextPage) incompleteEvidence.push("request-reaction pagination is incomplete");
    return {
      repository: options.repository,
      prNumber: options.prNumber,
      expectedHeadSha: options.expectedHeadSha,
      requestCommentId: options.requestCommentId,
      observedAt,
      observedPrNumber: pr.number,
      observedPrUrl: pr.url,
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
      baseRepositoryNameWithOwner: pr.baseRepository?.nameWithOwner ?? null,
      state: pr.state,
      mergedAt: pr.mergedAt,
      headSha: pr.headRefOid,
      incompleteEvidence,
      request,
      automaticReview: options.automaticReview ?? null,
      prReactions: Array.isArray(pr.reactions?.nodes) && typeof pr.reactions?.pageInfo?.hasNextPage === "boolean"
        ? pr.reactions.nodes.map((reaction) => ({ content: reaction.content, createdAt: reaction.createdAt, authorLogin: reaction.user?.login ?? null })) : null,
      comments,
      reviews: pr.reviews.nodes.map((review) => ({
        ...fetchedIdentity(review), url: review.url, state: review.state, body: review.body, submittedAt: review.submittedAt,
        commitSha: review.commit?.oid ?? null, authorLogin: review.author?.login ?? null,
      })),
      threads: pr.reviewThreads.nodes.map((thread) => ({
        id: thread.id,
        isResolved: thread.isResolved,
        comments: thread.comments.nodes.map((comment) => ({
          ...fetchedIdentity(comment), url: comment.url, body: comment.body, createdAt: comment.createdAt, authorLogin: comment.author?.login ?? null,
          commitSha: comment.commit?.oid ?? null, originalCommitSha: comment.originalCommit?.oid ?? null,
          reviewId: comment.pullRequestReview?.id ?? null,
        })),
      })),
      checks: hasKnownEmptyRollup ? [] : validContexts ? contexts.nodes.map(normalizeCheck) : null,
      expectedChecks: options.expectedChecks,
    };
  } catch (error) {
    return {
      repository: options.repository,
      prNumber: options.prNumber,
      expectedHeadSha: options.expectedHeadSha,
      requestCommentId: options.requestCommentId,
      observedAt,
      githubError: error.message,
    };
  }
}

function bindReviewedCommitResolutions(snapshot, checkout) {
  const resolutions = {};
  for (const comment of snapshot.comments ?? []) {
    if (comment.authorLogin !== CODEX_LOGIN) continue;
    const tokens = [parseReviewedSha(comment.body), reviewSummary(comment.body)?.token].filter(Boolean);
    for (const token of tokens) {
      if (token.length === 40) continue;
      if (!checkout) {
        resolutions[token] = null;
        continue;
      }
      try {
        const resolved = resolveReviewedCommit(checkout, snapshot.expectedHeadSha, token);
        resolutions[token] = resolved.status === "match" ? snapshot.expectedHeadSha : null;
      } catch {
        resolutions[token] = null;
      }
    }
  }
  return { ...snapshot, reviewedCommitResolutions: resolutions };
}

export function readReviewSnapshot(options) {
  return bindReviewedCommitResolutions(fetchSnapshot(options), options.checkout);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let priorState = null;
  const startedAt = Date.now();
  while (true) {
    const result = classifySnapshot(readReviewSnapshot(options));
    if (options.mode === "once" || result.state !== priorState || TERMINAL.has(result.state)) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
    if (options.mode === "once") {
      if (result.state === "github_unavailable") process.exitCode = 2;
      return;
    }
    if (TERMINAL.has(result.state)) return;
    if (Date.now() - startedAt >= options.maxIdleSeconds * 1000) {
      process.stdout.write(`${JSON.stringify({ ...result, state: "ambiguous", reasons: ["continuous review watch exceeded its maximum idle window"] })}\n`);
      return;
    }
    priorState = result.state;
    await sleep(options.intervalSeconds * 1000);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
});
