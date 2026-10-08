import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  const allowed = new Set(["repo", "kind", "base-ref", "issue-url", "delivery-branch", "expected-base-sha"]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || !allowed.has(key.slice(2)) || Object.hasOwn(args, key.slice(2))) {
      throw new Error("Usage: node preflight.mjs --repo <path> --kind <codex-managed|manual> [--base-ref <ref>] [--issue-url <GitHub issue URL> --delivery-branch <branch> --expected-base-sha <40-char SHA>]");
    }
    args[key.slice(2)] = value;
  }
  const launchFlags = ["issue-url", "delivery-branch", "expected-base-sha"];
  if (launchFlags.some((key) => Object.hasOwn(args, key)) && !launchFlags.every((key) => Object.hasOwn(args, key))) {
    throw new Error("--issue-url, --delivery-branch, and --expected-base-sha must be supplied together");
  }
  return args;
}

function gh(cwd, args) {
  const bin = process.env.CODEX_DEVELOPMENT_LOOP_TEST === "1" && process.env.CDL_GH_BIN ? process.env.CDL_GH_BIN : "gh";
  const result = spawnSync(bin, args, { cwd, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr.trim() || `gh ${args[0]} failed`);
  return JSON.parse(result.stdout);
}

function githubIssue(value) {
  const url = new URL(value);
  const match = /^\/([^/]+)\/([^/]+)\/issues\/(\d+)$/.exec(url.pathname);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash || !match || Number(match[3]) <= 0) {
    throw new Error("--issue-url must be a canonical github.com issue URL");
  }
  return { owner: match[1], name: match[2], number: Number(match[3]), url: url.href };
}

function worktreeOwners(root, branch) {
  const lines = git(root, ["worktree", "list", "--porcelain"]).stdout.split("\n");
  const owners = [];
  let worktree = null;
  for (const line of lines) {
    if (line.startsWith("worktree ")) worktree = line.slice(9);
    else if (line === `branch refs/heads/${branch}` && worktree !== null) owners.push(worktree);
  }
  return owners;
}

function launchReceipt(root, args, base) {
  const issue = githubIssue(args["issue-url"]);
  const branch = args["delivery-branch"];
  if (!git(root, ["check-ref-format", "--branch", branch], { allowFailure: true }).ok) {
    throw new Error("--delivery-branch is not a valid Git branch");
  }
  const expectedBaseSha = args["expected-base-sha"];
  if (!/^[0-9a-f]{40}$/.test(expectedBaseSha)) throw new Error("--expected-base-sha must be a full lowercase commit SHA");
  const baseBranch = (args["base-ref"] || "origin/main").replace(/^origin\//, "");
  if (!git(root, ["check-ref-format", "--branch", baseBranch], { allowFailure: true }).ok) {
    throw new Error("--base-ref must name a branch for launch preflight");
  }
  const remoteBase = git(root, ["ls-remote", "--heads", "origin", `refs/heads/${baseBranch}`]).stdout;
  const remoteBaseSha = remoteBase ? remoteBase.split(/\s+/)[0] : null;
  const repo = `${issue.owner}/${issue.name}`;
  const data = gh(root, ["issue", "view", String(issue.number), "--repo", repo, "--json", "number,state,title,body,labels,assignees,url"]);
  if (data.number !== issue.number || data.url !== issue.url) throw new Error("live issue identity does not match --issue-url");
  const graph = gh(root, ["api", "graphql", "-f", "query=query($owner:String!, $name:String!, $number:Int!) { repository(owner:$owner,name:$name) { issue(number:$number) { number parent { number } blockedBy(first:100) { nodes { number } pageInfo { hasNextPage } } subIssues(first:100) { nodes { number blockedBy(first:100) { nodes { number } pageInfo { hasNextPage } } } pageInfo { hasNextPage } } } } }", "-f", `owner=${issue.owner}`, "-f", `name=${issue.name}`, "-F", `number=${issue.number}`]).data?.repository?.issue;
  if (graph?.number !== issue.number) throw new Error("native issue relationship readback is unavailable");
  const openPrs = gh(root, ["pr", "list", "--repo", repo, "--state", "open", "--head", branch, "--json", "number,headRefName,baseRefName,url"]);
  if (!Array.isArray(openPrs)) throw new Error("open PR readback is unavailable");
  const remoteBranch = git(root, ["ls-remote", "--heads", "origin", `refs/heads/${branch}`]);
  const body = typeof data.body === "string" ? data.body : "";
  const verificationHeadings = body.split("\n")
    .map((line) => /^#{1,6}\s+(.+?)\s*$/.exec(line)?.[1] ?? null)
    .filter((heading) => heading !== null && /acceptance|verif|test/i.test(heading));
  const labels = Array.isArray(data.labels) ? data.labels.map((label) => label.name).filter((name) => typeof name === "string") : [];
  const assignees = Array.isArray(data.assignees) ? data.assignees.map((person) => person.login).filter((name) => typeof name === "string") : [];
  return {
    issue: {
      url: issue.url,
      number: issue.number,
      title: data.title,
      state: data.state,
      labels,
      assignees,
      body: Buffer.byteLength(body) <= 16 * 1024 ? body : null,
      bodyBytes: Buffer.byteLength(body),
      bodySha256: createHash("sha256").update(body).digest("hex"),
      bodyRequiresSeparateRead: Buffer.byteLength(body) > 16 * 1024,
    },
    relationships: {
      parentNumber: graph.parent?.number ?? null,
      blockerNumbers: graph.blockedBy?.nodes?.map((blocker) => blocker.number) ?? [],
      blockersTruncated: graph.blockedBy?.pageInfo?.hasNextPage ?? true,
      subIssueNumbers: graph.subIssues?.nodes?.map((child) => child.number) ?? [],
      subIssueBlockers: graph.subIssues?.nodes?.map((child) => ({ number: child.number, blockerNumbers: child.blockedBy?.nodes?.map((blocker) => blocker.number) ?? [], truncated: child.blockedBy?.pageInfo?.hasNextPage ?? true })) ?? [],
      subIssuesTruncated: graph.subIssues?.pageInfo?.hasNextPage ?? true,
    },
    deliveryBranch: branch,
    localBranchExists: git(root, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { allowFailure: true }).ok,
    remoteBranchExists: remoteBranch.stdout.length > 0,
    worktreeOwners: worktreeOwners(root, branch),
    openPrsForBranch: openPrs,
    baseSha: base.ok ? base.stdout : null,
    expectedBaseSha,
    baseMatchesExpected: base.ok && base.stdout === expectedBaseSha,
    remoteBaseSha,
    remoteBaseMatchesExpected: remoteBaseSha === expectedBaseSha,
    verificationHeadings,
    semanticContractReviewRequired: true,
    issueWidePrOwnershipCheckRequired: true,
    nativeTaskOwnershipCheckRequired: true,
  };
}

function git(cwd, args, { allowFailure = false, trim = true } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return {
    ok: result.status === 0,
    stdout: trim ? result.stdout.trim() : result.stdout,
    stderr: result.stderr.trim(),
  };
}

function resolveGitPath(root, value) {
  return path.resolve(root, value);
}

function readExactNodePin(root) {
  for (const filename of [".nvmrc", ".node-version"]) {
    const file = path.join(root, filename);
    if (!fs.existsSync(file)) continue;
    const value = fs.readFileSync(file, "utf8").trim().replace(/^v/, "");
    if (!/^\d+\.\d+\.\d+$/.test(value)) {
      return { source: filename, required: value, enforceable: false };
    }
    return { source: filename, required: value, enforceable: true };
  }
  return null;
}

function findPinnedNode(required) {
  const candidates = [];
  if (process.env.NVM_DIR) candidates.push(path.join(process.env.NVM_DIR, "versions", "node", `v${required}`, "bin", "node"));
  candidates.push(path.join(os.homedir(), ".nvm", "versions", "node", `v${required}`, "bin", "node"));
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.realpathSync(candidate);
    } catch {
      // Try the next known runtime location.
    }
  }
  return null;
}

function executable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function findCodexBin() {
  const candidates = [];
  if (process.env.CODEX_APP_TOOLS_PIPE_PATH && process.platform === "darwin") {
    candidates.push("/Applications/ChatGPT.app/Contents/Resources/codex");
  }
  for (const directory of (process.env.PATH || "").split(path.delimiter).filter(Boolean)) {
    candidates.push(path.join(directory, process.platform === "win32" ? "codex.exe" : "codex"));
  }
  for (const candidate of candidates) {
    if (!executable(candidate)) continue;
    return fs.realpathSync(candidate);
  }
  return null;
}

function resolveCodexRuntime() {
  const codexBin = findCodexBin();
  if (codexBin === null) return { codexBin: null, codexVersion: null };
  const result = spawnSync(codexBin, ["--version"], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.trim()) return { codexBin: null, codexVersion: null };
  return { codexBin, codexVersion: result.stdout.trim() };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const repo = path.resolve(args.repo || ".");
  const worktreeKind = args.kind;
  const baseRef = args["base-ref"] || "origin/main";

  if (!new Set(["codex-managed", "manual"]).has(worktreeKind)) {
    throw new Error("--kind must be codex-managed or manual");
  }

  const root = git(repo, ["rev-parse", "--show-toplevel"]).stdout;
  const nodePin = readExactNodePin(root);
  const currentNode = process.version.replace(/^v/, "");
  const nodeRuntime = nodePin
    ? {
        source: nodePin.source,
        requiredNode: nodePin.required,
        currentNode,
        enforceable: nodePin.enforceable,
        ok: nodePin.enforceable ? currentNode === nodePin.required : null,
        nodeBin: nodePin.enforceable ? findPinnedNode(nodePin.required) : null,
      }
    : {
        source: null,
        requiredNode: null,
        currentNode,
        enforceable: false,
        ok: true,
        nodeBin: process.execPath,
      };
  const runtime = { ...nodeRuntime, ...resolveCodexRuntime() };
  const gitDir = resolveGitPath(root, git(root, ["rev-parse", "--git-dir"]).stdout);
  const gitCommonDir = resolveGitPath(root, git(root, ["rev-parse", "--git-common-dir"]).stdout);
  const branchResult = git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true });
  const head = git(root, ["rev-parse", "HEAD"]).stdout;
  const status = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { trim: false }).stdout;
  const dirtyEntries = status
    .split("\0")
    .filter(Boolean)
    .filter((entry) => /^(..|\?\?) /.test(entry))
    .map((entry) => ({ status: entry.slice(0, 2), path: entry.slice(3) }));

  const base = git(root, ["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`], { allowFailure: true });
  let ahead = null;
  let behind = null;
  if (base.ok) {
    const counts = git(root, ["rev-list", "--left-right", "--count", `HEAD...${baseRef}`]).stdout
      .split(/\s+/)
      .map(Number);
    [ahead, behind] = counts;
  }

  const launch = args["issue-url"] ? launchReceipt(root, args, base) : null;
  const ok = runtime.ok !== false && (launch === null || (launch.baseMatchesExpected && launch.remoteBaseMatchesExpected));
  process.stdout.write(`${JSON.stringify({
    ok,
    repo: root,
    worktreeKind,
    checkoutKind: gitDir === gitCommonDir ? "primary" : "linked",
    branch: branchResult.ok ? branchResult.stdout : null,
    detached: !branchResult.ok,
    head,
    dirty: dirtyEntries.length > 0,
    dirtyEntries,
    baseRef,
    baseExists: base.ok,
    baseSha: base.ok ? base.stdout : null,
    ahead,
    behind,
    runtime,
    ...(launch === null ? {} : { launch }),
  }, null, 2)}\n`);
  if (!ok) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
