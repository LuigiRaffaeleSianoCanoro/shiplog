/**
 * Local Origin + GitHub + Neon gateway mocks for Playwright e2e.
 * Started by e2e/global-setup.ts; reads keys from e2e/.runtime/keys.json.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const keys = JSON.parse(readFileSync(join(__dir, ".runtime/keys.json"), "utf8"));
const port = Number(process.env.E2E_MOCK_PORT ?? 4567);

const state = {
  notifyPosts: [],
  origin: {
    comments: new Map(),
    files: new Map(),
    mergedPrs: new Map(),
    tags: new Map(),
    repos: ["luigi/demo", "acme/widget"],
  },
  github: {
    issueComments: new Map(),
    files: new Map(),
    mergedPrs: new Map(),
    tags: new Map(),
    repos: ["ghuser/widget"],
  },
};

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function repoKey(owner, name) {
  return `${owner}/${name}`;
}

function commentKey(owner, name, pr) {
  return `${owner}/${name}#${pr}`;
}

function parseUrl(req) {
  return new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
}

function neonResponse(prTitle) {
  const section = /^fix/i.test(prTitle) ? "Fixed" : "Added";
  const bullet = prTitle.replace(/^\w+(\([^)]*\))?!?:\s*/, "").slice(0, 120) || prTitle;
  return {
    choices: [{ message: { content: JSON.stringify({ section, bullet }) } }],
  };
}

function resetMockState() {
  state.notifyPosts.length = 0;
  state.origin.comments.clear();
  state.origin.files.clear();
  state.origin.mergedPrs.clear();
  state.origin.tags.clear();
  state.github.issueComments.clear();
  state.github.files.clear();
  state.github.mergedPrs.clear();
  state.github.tags.clear();
}

function handleE2eControl(pathname, req, res) {
  if (req.method === "POST" && pathname === "/__e2e/reset") {
    resetMockState();
    json(res, 200, { ok: true });
    return true;
  }
  if (req.method === "POST" && pathname === "/__e2e/origin/comment") {
    void readBody(req).then((raw) => {
      const { owner, name, pr, body, userId } = JSON.parse(raw);
      const k = commentKey(owner, name, String(pr));
      const list = state.origin.comments.get(k) ?? [];
      list.push({ body, author: { user: { id: userId ?? keys.installerUserId, handle: "luigi" } } });
      state.origin.comments.set(k, list);
      json(res, 200, { ok: true });
    });
    return true;
  }
  if (req.method === "POST" && pathname === "/__e2e/origin/file") {
    void readBody(req).then((raw) => {
      const { owner, name, path, content } = JSON.parse(raw);
      state.origin.files.set(`${owner}/${name}:${path}`, content);
      json(res, 200, { ok: true });
    });
    return true;
  }
  if (req.method === "POST" && pathname === "/__e2e/origin/backfill") {
    void readBody(req).then((raw) => {
      const { owner, name, prs, tags } = JSON.parse(raw);
      const rk = repoKey(owner, name);
      state.origin.mergedPrs.set(rk, prs ?? []);
      state.origin.tags.set(rk, tags ?? []);
      json(res, 200, { ok: true });
    });
    return true;
  }
  if (req.method === "GET" && pathname === "/__e2e/notify") {
    json(res, 200, { posts: state.notifyPosts });
    return true;
  }
  return false;
}

function handleNotify(pathname, req, res) {
  if (req.method === "POST" && pathname === "/notify/capture") {
    void readBody(req).then((raw) => {
      try {
        state.notifyPosts.push(JSON.parse(raw));
      } catch {
        state.notifyPosts.push({ raw });
      }
      json(res, 200, { ok: true });
    });
    return true;
  }
  return false;
}

function handleJwks(pathname, res) {
  if (pathname === "/keys" || pathname === "/v1/origin/keys") {
    json(res, 200, { keys: [keys.originJwk] });
    return true;
  }
  return false;
}

function handleNeon(pathname, req, res) {
  if (!pathname.startsWith("/neon/")) return false;
  if (req.method === "POST" && pathname === "/neon/v1/chat/completions") {
    void readBody(req).then((raw) => {
      let title = "";
      try {
        const j = JSON.parse(raw);
        const user = j.messages?.find((m) => m.role === "user")?.content ?? "";
        const m = /<pr_title>([\s\S]*?)<\/pr_title>/i.exec(user);
        title = m?.[1]?.trim() ?? "";
      } catch {
        /* ignore */
      }
      if (/summary/i.test(raw) && /Version /.test(raw)) {
        json(res, 200, { choices: [{ message: { content: "E2E release summary for users." } }] });
        return;
      }
      json(res, 200, neonResponse(title));
    });
    return true;
  }
  res.writeHead(404);
  res.end();
  return true;
}

function originInstallation(res) {
  json(res, 200, {
    installedBy: { id: keys.installerUserId },
    target: { slug: "luigi", type: "user" },
  });
}

function handleOrigin(pathname, req, res) {
  if (!pathname.startsWith("/v1/origin/")) return false;

  if (req.method === "POST" && /\/app\/installations\/[^/]+\/access_tokens$/.test(pathname)) {
    json(res, 200, { token: "origin-mock-token" });
    return true;
  }
  if (req.method === "GET" && /^\/v1\/origin\/app\/installations\/[^/]+$/.test(pathname)) {
    originInstallation(res);
    return true;
  }
  const permMatch = pathname.match(/^\/v1\/origin\/repos\/([^/]+)\/([^/]+)\/collaborators\/([^/]+)\/permission$/);
  if (req.method === "GET" && permMatch) {
    json(res, 200, { permission: "write" });
    return true;
  }
  const contentsMatch = pathname.match(/^\/v1\/origin\/repos\/([^/]+)\/([^/]+)\/contents$/);
  if (req.method === "GET" && contentsMatch) {
    const path = parseUrl(req).searchParams.get("path") ?? "";
    const key = `${contentsMatch[1]}/${contentsMatch[2]}:${path}`;
    const content = state.origin.files.get(key);
    if (!content) {
      res.writeHead(404);
      res.end("{}");
      return true;
    }
    json(res, 200, { type: "file", encoding: "base64", content: Buffer.from(content).toString("base64") });
    return true;
  }
  const commentsMatch = pathname.match(/^\/v1\/origin\/repos\/([^/]+)\/([^/]+)\/pulls\/([^/]+)\/comments$/);
  if (req.method === "GET" && commentsMatch) {
    const k = commentKey(commentsMatch[1], commentsMatch[2], commentsMatch[3]);
    json(res, 200, { comments: state.origin.comments.get(k) ?? [] });
    return true;
  }
  if (req.method === "POST" && commentsMatch) {
    void readBody(req).then((raw) => {
      const k = commentKey(commentsMatch[1], commentsMatch[2], commentsMatch[3]);
      const list = state.origin.comments.get(k) ?? [];
      const body = JSON.parse(raw).body ?? "";
      list.push({ body, author: { user: { id: keys.installerUserId, handle: "luigi" } } });
      state.origin.comments.set(k, list);
      json(res, 201, { ok: true });
    });
    return true;
  }
  const filesMatch = pathname.match(/^\/v1\/origin\/repos\/([^/]+)\/([^/]+)\/pulls\/([^/]+)\/files$/);
  if (req.method === "GET" && filesMatch) {
    json(res, 200, { files: [{ filename: "src/index.ts" }] });
    return true;
  }
  if (req.method === "GET" && pathname === "/v1/origin/installation/repos") {
    json(res, 200, {
      repositories: state.origin.repos.map((full) => {
        const [slug, name] = full.split("/");
        return { fullName: full, name, owner: { slug } };
      }),
    });
    return true;
  }
  const pullsMatch = pathname.match(/^\/v1\/origin\/repos\/([^/]+)\/([^/]+)\/pulls$/);
  if (req.method === "GET" && pullsMatch) {
    const rk = repoKey(pullsMatch[1], pullsMatch[2]);
    const prs = state.origin.mergedPrs.get(rk) ?? [];
    json(res, 200, {
      pullRequests: prs.map((p) => ({
        number: p.number,
        title: p.title,
        body: p.body ?? "",
        merged: true,
        mergedAt: p.mergedAt,
        labels: p.labels ?? [],
        author: p.author ?? { user: { slug: "luigi" } },
      })),
    });
    return true;
  }
  const tagsMatch = pathname.match(/^\/v1\/origin\/repos\/([^/]+)\/([^/]+)\/git\/matching-refs$/);
  if (req.method === "GET" && tagsMatch) {
    const rk = repoKey(tagsMatch[1], tagsMatch[2]);
    const tags = state.origin.tags.get(rk) ?? [];
    json(res, 200, {
      refs: tags.map((t) => ({ ref: `refs/tags/${t.name}`, object: { sha: t.sha ?? "a".repeat(40) } })),
    });
    return true;
  }
  const repoMeta = pathname.match(/^\/v1\/origin\/repos\/([^/]+)\/([^/]+)$/);
  if (req.method === "GET" && repoMeta && !repoMeta[0].includes("/git/")) {
    json(res, 200, { defaultBranch: "main" });
    return true;
  }
  const refMatch = pathname.match(/^\/v1\/origin\/repos\/([^/]+)\/([^/]+)\/git\/ref\/heads\/main$/);
  if (req.method === "GET" && refMatch) {
    json(res, 200, { object: { sha: "b".repeat(40) } });
    return true;
  }
  const commitMatch = pathname.match(/^\/v1\/origin\/repos\/([^/]+)\/([^/]+)\/commits\/([^/]+)$/);
  if (req.method === "GET" && commitMatch) {
    json(res, 200, { commit: { committer: { date: "2026-01-01T00:00:00Z" } } });
    return true;
  }
  if (req.method === "POST" && /\/git\/commits:createFromFiles$/.test(pathname)) {
    json(res, 200, { ok: true });
    return true;
  }
  res.writeHead(404);
  res.end();
  return true;
}

function githubInstallation(res, id) {
  json(res, 200, {
    account: { login: "ghuser", type: "User" },
    installed_by: { id: Number(keys.installerUserId) || 42 },
    id: Number(id) || 1002,
  });
}

function handleGithub(pathname, req, res) {
  if (!pathname.startsWith("/github/")) return false;
  const p = pathname.slice("/github".length);

  if (req.method === "GET" && p === "/app") {
    json(res, 200, { slug: "shiplog-e2e" });
    return true;
  }
  if (req.method === "POST" && /^\/app\/installations\/[^/]+\/access_tokens$/.test(p)) {
    json(res, 200, { token: "gh-mock-token", expires_at: new Date(Date.now() + 3_600_000).toISOString() });
    return true;
  }
  const instMatch = p.match(/^\/app\/installations\/([^/]+)$/);
  if (req.method === "GET" && instMatch) {
    githubInstallation(res, instMatch[1]);
    return true;
  }
  const permMatch = p.match(/^\/repos\/([^/]+)\/([^/]+)\/collaborators\/([^/]+)\/permission$/);
  if (req.method === "GET" && permMatch) {
    json(res, 200, { permission: "write" });
    return true;
  }
  const contentsPath = p.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
  if (req.method === "GET" && contentsPath) {
    const path = decodeURIComponent(contentsPath[3]);
    const key = `${contentsPath[1]}/${contentsPath[2]}:${path}`;
    const content = state.github.files.get(key);
    if (!content) {
      res.writeHead(404);
      res.end("{}");
      return true;
    }
    json(res, 200, { type: "file", content: Buffer.from(content).toString("base64"), encoding: "base64" });
    return true;
  }
  if (req.method === "PUT" && contentsPath) {
    json(res, 200, { content: { sha: "c".repeat(40) } });
    return true;
  }
  const issueComments = p.match(/^\/repos\/([^/]+)\/([^/]+)\/issues\/([^/]+)\/comments$/);
  if (req.method === "GET" && issueComments) {
    const k = commentKey(issueComments[1], issueComments[2], issueComments[3]);
    json(res, 200, state.github.issueComments.get(k) ?? []);
    return true;
  }
  if (req.method === "POST" && issueComments) {
    void readBody(req).then((raw) => {
      const k = commentKey(issueComments[1], issueComments[2], issueComments[3]);
      const list = state.github.issueComments.get(k) ?? [];
      const body = JSON.parse(raw).body ?? "";
      list.push({
        body,
        user: { id: Number(keys.installerUserId) || 42, login: "ghuser", type: "User" },
        created_at: new Date().toISOString(),
      });
      state.github.issueComments.set(k, list);
      json(res, 201, { id: list.length });
    });
    return true;
  }
  const reviewComments = p.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/([^/]+)\/comments$/);
  if (req.method === "GET" && reviewComments) {
    json(res, 200, []);
    return true;
  }
  const pullsMatch = p.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls$/);
  if (req.method === "GET" && pullsMatch) {
    const rk = repoKey(pullsMatch[1], pullsMatch[2]);
    const prs = state.github.mergedPrs.get(rk) ?? [];
    json(
      res,
      200,
      prs.map((pr) => ({
        number: Number(pr.number),
        title: pr.title,
        body: pr.body ?? "",
        merged_at: pr.mergedAt,
        labels: pr.labels ?? [],
        user: { login: "ghuser" },
      })),
    );
    return true;
  }
  if (req.method === "GET" && p === "/installation/repositories") {
    json(res, 200, { repositories: state.github.repos.map((full) => ({ full_name: full })) });
    return true;
  }
  const tagsMatch = p.match(/^\/repos\/([^/]+)\/([^/]+)\/tags$/);
  if (req.method === "GET" && tagsMatch) {
    const rk = repoKey(tagsMatch[1], tagsMatch[2]);
    const tags = state.github.tags.get(rk) ?? [];
    json(res, 200, tags.map((t) => ({ name: t.name, commit: { sha: t.sha ?? "d".repeat(40) } })));
    return true;
  }
  const commitMatch = p.match(/^\/repos\/([^/]+)\/([^/]+)\/commits\/([^/]+)$/);
  if (req.method === "GET" && commitMatch) {
    json(res, 200, { commit: { committer: { date: "2026-02-01T00:00:00Z" } } });
    return true;
  }
  const filesMatch = p.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/([^/]+)\/files$/);
  if (req.method === "GET" && filesMatch) {
    json(res, 200, [{ filename: "lib/widget.ts" }]);
    return true;
  }
  res.writeHead(404);
  res.end();
  return true;
}

createServer((req, res) => {
  const { pathname } = parseUrl(req);
  if (handleE2eControl(pathname, req, res)) return;
  if (handleNotify(pathname, req, res)) return;
  if (handleJwks(pathname, res)) return;
  if (handleNeon(pathname, req, res)) return;
  if (handleOrigin(pathname, req, res)) return;
  if (handleGithub(pathname, req, res)) return;
  res.writeHead(404);
  res.end("not found");
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`e2e mock listening on ${port}\n`);
});
