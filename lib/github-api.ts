import { env } from "./env";
import { githubAppJwt, githubConfigured } from "./github";
import type { HistoricalPr, HistoricalTag } from "./history";
import { compareSemverTags } from "./history";
import type { PrComment } from "./origin";

export { githubConfigured };

const apiBase = () => env.githubApi.replace(/\/+$/, "");

const tokenCache = new Map<string, { token: string; exp: number }>();

/** Installation access token for a GitHub App installation (cached until shortly before expiry). */
export async function githubInstallationToken(installationId: string): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const r = await fetch(`${apiBase()}/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    method: "POST",
    headers: { Authorization: `Bearer ${githubAppJwt()}`, Accept: "application/vnd.github+json" },
    body: "{}",
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`github installation token ${r.status}`);
  const j = (await r.json()) as { token: string; expires_at?: string };
  const exp = j.expires_at ? Date.parse(j.expires_at) : Date.now() + 3_600_000;
  tokenCache.set(installationId, { token: j.token, exp });
  return j.token;
}

const repoParts = (repo: string) => {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error("bad repo");
  return { owner, name };
};

const ghHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

/** Post a top-level comment on a pull request (issue comment API). */
export async function githubCommentOnPr(installationId: string, repo: string, prNumber: string, body: string) {
  const { owner, name } = repoParts(repo);
  const token = await githubInstallationToken(installationId);
  const r = await fetch(`${apiBase()}/repos/${owner}/${name}/issues/${encodeURIComponent(prNumber)}/comments`, {
    method: "POST",
    headers: { ...ghHeaders(token), "content-type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!r.ok) throw new Error(`github comment ${r.status}`);
}

async function resolveLogin(userId: string, login?: string): Promise<string | null> {
  if (login) return login;
  const r = await fetch(`${apiBase()}/user/${encodeURIComponent(userId)}`, {
    headers: ghHeaders(githubAppJwt()),
    cache: "no-store",
  });
  if (!r.ok) return null;
  return ((await r.json()) as { login?: string }).login ?? null;
}

/** Map GitHub collaborator permission to Origin-shaped write/admin/read. */
function mapPermission(permission: string | undefined): string | null {
  if (!permission) return null;
  if (permission === "admin" || permission === "maintain") return "admin";
  if (permission === "write") return "write";
  return permission;
}

/** Effective permission for a user on a repo (installation token). null when unknown. */
export async function githubRepoPermission(
  installationId: string,
  repo: string,
  userId: string,
  login?: string,
): Promise<string | null> {
  const username = await resolveLogin(userId, login);
  if (!username) return null;
  const { owner, name } = repoParts(repo);
  const token = await githubInstallationToken(installationId);
  const r = await fetch(
    `${apiBase()}/repos/${owner}/${name}/collaborators/${encodeURIComponent(username)}/permission`,
    { headers: ghHeaders(token), cache: "no-store" },
  );
  if (!r.ok) return null;
  return mapPermission(((await r.json()) as { permission?: string }).permission);
}

/** Default-branch file contents, or null when missing. */
export async function githubGetRepoFile(installationId: string, repo: string, path: string): Promise<string | null> {
  const { owner, name } = repoParts(repo);
  const token = await githubInstallationToken(installationId);
  const r = await fetch(`${apiBase()}/repos/${owner}/${name}/contents/${encodeURIComponent(path)}`, {
    headers: ghHeaders(token),
    cache: "no-store",
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { type?: string; content?: string; encoding?: string };
  if (j.type !== "file" || !j.content) return null;
  const raw = j.content.replace(/\n/g, "");
  return Buffer.from(raw, j.encoding === "base64" ? "base64" : "utf8").toString("utf8");
}

/** Changed paths in a merged or open PR (capped at 300 files). */
export async function githubListPrFiles(installationId: string, repo: string, prNumber: string): Promise<string[]> {
  const { owner, name } = repoParts(repo);
  const token = await githubInstallationToken(installationId);
  const out: string[] = [];
  for (let page = 1; page <= 3 && out.length < 300; page++) {
    const r = await fetch(
      `${apiBase()}/repos/${owner}/${name}/pulls/${encodeURIComponent(prNumber)}/files?per_page=100&page=${page}`,
      { headers: ghHeaders(token), cache: "no-store" },
    );
    if (!r.ok) throw new Error(`github pr files ${r.status}`);
    const files = (await r.json()) as { filename?: string }[];
    if (!files.length) break;
    for (const f of files) {
      if (f.filename) out.push(f.filename);
    }
    if (files.length < 100) break;
  }
  return out;
}

function ghAuthor(user: { id?: number; login?: string; type?: string } | undefined) {
  return {
    user: {
      id: user?.id != null ? String(user.id) : "",
      login: user?.login ?? "",
      type: user?.type,
    },
  };
}

/** PR conversation comments (issue + review), oldest first. */
export async function githubListPrComments(installationId: string, repo: string, prNumber: string): Promise<PrComment[]> {
  const { owner, name } = repoParts(repo);
  const token = await githubInstallationToken(installationId);
  const headers = ghHeaders(token);
  const merged: { body: string; author: any; at: string }[] = [];

  for (let page = 1; page <= 5; page++) {
    const r = await fetch(
      `${apiBase()}/repos/${owner}/${name}/issues/${encodeURIComponent(prNumber)}/comments?per_page=100&page=${page}`,
      { headers, cache: "no-store" },
    );
    if (!r.ok) throw new Error(`github issue comments ${r.status}`);
    const batch = (await r.json()) as { body?: string; user?: { id?: number; login?: string; type?: string }; created_at?: string }[];
    if (!batch.length) break;
    for (const c of batch) {
      merged.push({ body: c.body ?? "", author: ghAuthor(c.user), at: c.created_at ?? "" });
    }
    if (batch.length < 100) break;
  }

  for (let page = 1; page <= 5; page++) {
    const r = await fetch(
      `${apiBase()}/repos/${owner}/${name}/pulls/${encodeURIComponent(prNumber)}/comments?per_page=100&page=${page}`,
      { headers, cache: "no-store" },
    );
    if (!r.ok) throw new Error(`github review comments ${r.status}`);
    const batch = (await r.json()) as { body?: string; user?: { id?: number; login?: string; type?: string }; created_at?: string }[];
    if (!batch.length) break;
    for (const c of batch) {
      merged.push({ body: c.body ?? "", author: ghAuthor(c.user), at: c.created_at ?? "" });
    }
    if (batch.length < 100) break;
  }

  merged.sort((a, b) => a.at.localeCompare(b.at));
  return merged.map(({ body, author }) => ({ body, author }));
}

/** Repositories visible to this GitHub App installation. */
export async function githubListInstallationRepos(installationId: string): Promise<string[]> {
  const token = await githubInstallationToken(installationId);
  const out: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${apiBase()}/installation/repositories?per_page=100&page=${page}`, {
      headers: ghHeaders(token),
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`github installation repos ${r.status}`);
    const j = (await r.json()) as { repositories?: { full_name?: string }[] };
    const repos = j.repositories ?? [];
    for (const repo of repos) {
      if (repo.full_name) out.push(repo.full_name);
    }
    if (repos.length < 100) break;
  }
  return out;
}

/** Newest merged pull requests first, capped at `max`. */
export async function githubListMergedPullRequests(installationId: string, repo: string, max = 100): Promise<HistoricalPr[]> {
  const { owner, name } = repoParts(repo);
  const token = await githubInstallationToken(installationId);
  const out: HistoricalPr[] = [];
  for (let page = 1; out.length < max; page++) {
    const r = await fetch(
      `${apiBase()}/repos/${owner}/${name}/pulls?state=closed&sort=updated&direction=desc&per_page=${Math.min(100, max - out.length)}&page=${page}`,
      { headers: ghHeaders(token), cache: "no-store" },
    );
    if (!r.ok) throw new Error(`github pulls ${r.status}`);
    const prs = (await r.json()) as {
      number?: number;
      title?: string;
      body?: string;
      merged_at?: string | null;
      labels?: { name?: string }[];
      user?: { login?: string };
    }[];
    if (!prs.length) break;
    for (const pr of prs) {
      if (!pr.merged_at) continue;
      out.push({
        number: String(pr.number ?? ""),
        title: pr.title ?? "",
        body: pr.body ?? "",
        mergedAt: pr.merged_at,
        labels: pr.labels?.map((l) => (l.name ? { name: l.name } : null)).filter(Boolean) as { name: string }[],
        author: pr.user,
      });
    }
    if (prs.length < 100) break;
  }
  return out;
}

const semverTag = /^v?\d+\.\d+\.\d+(?:-[\w.]+)?$/;

/** Semver tags on the repo, oldest first, capped at `maxTags`. */
export async function githubListSemverTags(installationId: string, repo: string, maxTags = 50): Promise<HistoricalTag[]> {
  const { owner, name } = repoParts(repo);
  const token = await githubInstallationToken(installationId);
  const r = await fetch(`${apiBase()}/repos/${owner}/${name}/tags?per_page=100`, { headers: ghHeaders(token), cache: "no-store" });
  if (!r.ok) throw new Error(`github tags ${r.status}`);
  const tags = (await r.json()) as { name?: string; commit?: { sha?: string; url?: string } }[];
  const semver = tags
    .map((t) => (t.name && semverTag.test(t.name) ? { name: t.name, sha: t.commit?.sha ?? "" } : null))
    .filter(Boolean) as { name: string; sha: string }[];
  semver.sort((a, b) => compareSemverTags(a.name, b.name));
  const slice = semver.slice(-maxTags);
  const dated: HistoricalTag[] = [];
  for (const t of slice) {
    let at = new Date().toISOString();
    if (t.sha) {
      try {
        const cr = await fetch(`${apiBase()}/repos/${owner}/${name}/commits/${t.sha}`, { headers: ghHeaders(token), cache: "no-store" });
        if (cr.ok) {
          const cj = (await cr.json()) as { commit?: { committer?: { date?: string }; author?: { date?: string } } };
          at = cj.commit?.committer?.date ?? cj.commit?.author?.date ?? at;
        }
      } catch { /* keep fallback */ }
    }
    dated.push({ name: t.name, at });
  }
  return dated;
}

/** Create or update a single file on the default branch. */
export async function githubCommitChangelogFile(
  installationId: string,
  repo: string,
  path: string,
  content: string,
  message: string,
) {
  const { owner, name } = repoParts(repo);
  const token = await githubInstallationToken(installationId);
  const headers = { ...ghHeaders(token), "content-type": "application/json" };
  let sha: string | undefined;
  const existing = await fetch(`${apiBase()}/repos/${owner}/${name}/contents/${encodeURIComponent(path)}`, {
    headers: ghHeaders(token),
    cache: "no-store",
  });
  if (existing.ok) {
    const ej = (await existing.json()) as { sha?: string };
    sha = ej.sha;
  }
  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    ...(sha ? { sha } : {}),
  };
  const r = await fetch(`${apiBase()}/repos/${owner}/${name}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`github commit ${r.status}`);
}
