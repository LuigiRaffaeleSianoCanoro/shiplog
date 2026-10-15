import { createPrivateKey, sign } from "node:crypto";
import { env } from "./env";
import type { HistoricalPr, HistoricalTag } from "./history";
import { compareSemverTags } from "./history";

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function appJwt(appId = env.originAppId, pem = env.originPrivateKey, now = Math.floor(Date.now() / 1000)) {
  const h = b64u(JSON.stringify({ alg: "EdDSA", kid: appId, typ: "JWT" }));
  const p = b64u(JSON.stringify({ iss: appId, aud: "origin-apps", iat: now - 30, exp: now + 270 }));
  const s = sign(null, Buffer.from(`${h}.${p}`), createPrivateKey(pem));
  return `${h}.${p}.${b64u(s)}`;
}

export const originConfigured = () => Boolean(env.originAppId && env.originPrivateKey);

export async function installationToken(installationId: string): Promise<string> {
  const r = await fetch(`${env.originApi}/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    method: "POST", headers: { Authorization: `Bearer ${appJwt()}`, "content-type": "application/json" }, body: "{}",
  });
  if (!r.ok) throw new Error(`installation token ${r.status}`);
  return ((await r.json()) as { token: string }).token;
}

export async function commentOnPr(installationId: string, repo: string, prNumber: string, body: string) {
  const [owner, name] = repo.split("/");
  const token = await installationToken(installationId);
  const r = await fetch(`${env.originApi}/repos/${owner}/${name}/pulls/${prNumber}/comments`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ body }),
  });
  if (!r.ok) throw new Error(`comment ${r.status}`);
}

export interface InstallationInfo { installerId: string | null; namespace: string; namespaceType: "user" | "team" | null }
/** Who installed the app and where (app JWT). */
export async function getInstallationInfo(installationId: string): Promise<InstallationInfo> {
  const r = await fetch(`${env.originApi}/app/installations/${encodeURIComponent(installationId)}`, { headers: { Authorization: `Bearer ${appJwt()}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`installation ${r.status}`);
  const j = (await r.json()) as { installedBy?: { id?: string }; target?: { slug?: string; type?: string } };
  const t = j.target?.type;
  return { installerId: j.installedBy?.id ?? null, namespace: j.target?.slug ?? "", namespaceType: t === "team" || t === "user" ? t : null };
}

/** A user's effective permission on a repo (needs repository:members:read). null when unknown / no access. */
export async function repoPermission(installationId: string, repo: string, userId: string): Promise<string | null> {
  const [owner, name] = repo.split("/");
  const token = await installationToken(installationId);
  const r = await fetch(`${env.originApi}/repos/${owner}/${name}/collaborators/${encodeURIComponent(userId)}/permission`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!r.ok) return null;
  return ((await r.json()) as { permission?: string }).permission ?? null;
}

/** A text file from the repo's default branch (needs repository:contents:read). null when absent. */
export async function getRepoFile(installationId: string, repo: string, path: string): Promise<string | null> {
  const [owner, name] = repo.split("/");
  const token = await installationToken(installationId);
  const r = await fetch(`${env.originApi}/repos/${owner}/${name}/contents?path=${encodeURIComponent(path)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!r.ok) return null;
  const j = (await r.json()) as { type?: string; content?: string };
  return j.type === "file" && j.content ? Buffer.from(j.content, "base64").toString("utf8") : null;
}

/** Changed paths in a PR (needs repository:pull_requests:read). Capped at 500 files. */
export async function listPrFiles(installationId: string, repo: string, prNumber: string): Promise<string[]> {
  const [owner, name] = repo.split("/");
  const token = await installationToken(installationId);
  const out: string[] = [];
  let page = "";
  for (let i = 0; i < 5; i++) {
    const q = `pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`;
    const r = await fetch(`${env.originApi}/repos/${owner}/${name}/pulls/${prNumber}/files?${q}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r.ok) throw new Error(`pr files ${r.status}`);
    const j = (await r.json()) as { files?: { filename?: string }[]; nextPageToken?: string };
    for (const file of j.files ?? []) {
      if (file.filename) out.push(file.filename);
    }
    if (!j.nextPageToken) break;
    page = j.nextPageToken;
  }
  return out;
}

export interface PrComment { body: string; author: any }
/** Every comment on a PR, oldest first (needs repository:pull_requests:reviews:read). Capped at 500. */
export async function listPrComments(installationId: string, repo: string, prNumber: string): Promise<PrComment[]> {
  const [owner, name] = repo.split("/");
  const token = await installationToken(installationId);
  const out: PrComment[] = [];
  let page = "";
  for (let i = 0; i < 5; i++) {
    const q = `pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`;
    const r = await fetch(`${env.originApi}/repos/${owner}/${name}/pulls/${prNumber}/comments?${q}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r.ok) throw new Error(`comments ${r.status}`);
    const j = (await r.json()) as { comments?: PrComment[]; nextPageToken?: string };
    out.push(...(j.comments ?? []));
    if (!j.nextPageToken) break;
    page = j.nextPageToken;
  }
  return out;
}

const repoParts = (repo: string) => {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error("bad repo");
  return { owner, name };
};

/** Repositories visible to this installation (installation access token). */
export async function listInstallationRepos(installationId: string): Promise<string[]> {
  const token = await installationToken(installationId);
  const out: string[] = [];
  let page = "";
  for (let i = 0; i < 20; i++) {
    const q = `pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`;
    const r = await fetch(`${env.originApi}/installation/repos?${q}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r.ok) throw new Error(`installation repos ${r.status}`);
    const j = (await r.json()) as { repositories?: { fullName?: string; name?: string; owner?: { slug?: string } }[]; nextPageToken?: string };
    for (const repo of j.repositories ?? []) {
      const full = repo.fullName ?? (repo.owner?.slug && repo.name ? `${repo.owner.slug}/${repo.name}` : "");
      if (full) out.push(full);
    }
    if (!j.nextPageToken) break;
    page = j.nextPageToken;
  }
  return out;
}

/** Newest merged pull requests first, capped at `max`. */
export async function listMergedPullRequests(installationId: string, repo: string, max = 100): Promise<HistoricalPr[]> {
  const { owner, name } = repoParts(repo);
  const token = await installationToken(installationId);
  const out: HistoricalPr[] = [];
  let page = "";
  while (out.length < max) {
    const pageSize = Math.min(100, max - out.length);
    const q = `state=merged&sortBy=updated&direction=desc&pageSize=${pageSize}${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`;
    const r = await fetch(`${env.originApi}/repos/${owner}/${name}/pulls?${q}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r.ok) throw new Error(`pulls ${r.status}`);
    const j = (await r.json()) as { pullRequests?: any[]; nextPageToken?: string };
    for (const pr of j.pullRequests ?? []) {
      if (!pr.merged || !pr.mergedAt) continue;
      out.push({
        number: String(pr.number),
        title: pr.title ?? "",
        body: pr.body ?? "",
        mergedAt: pr.mergedAt,
        labels: pr.labels,
        author: pr.author,
      });
    }
    if (!j.nextPageToken) break;
    page = j.nextPageToken;
  }
  return out;
}

const semverTag = /^v?\d+\.\d+\.\d+(?:-[\w.]+)?$/;

/** Semver tags on the repo, oldest first, capped at `maxTags`. */
export async function listSemverTags(installationId: string, repo: string, maxTags = 50): Promise<HistoricalTag[]> {
  const { owner, name } = repoParts(repo);
  const token = await installationToken(installationId);
  const r = await fetch(`${env.originApi}/repos/${owner}/${name}/git/matching-refs?ref=${encodeURIComponent("tags/")}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  if (!r.ok) throw new Error(`tags ${r.status}`);
  const j = (await r.json()) as { refs?: { ref?: string; object?: { sha?: string; type?: string } }[] } | { ref?: string; object?: { sha?: string } }[];
  const refs = Array.isArray(j) ? j : j.refs ?? [];
  const tags = refs
    .map((row) => {
      const ref = row.ref ?? "";
      const short = ref.startsWith("refs/tags/") ? ref.slice("refs/tags/".length) : "";
      return short && semverTag.test(short) ? { name: short, sha: row.object?.sha ?? "" } : null;
    })
    .filter(Boolean) as { name: string; sha: string }[];
  tags.sort((a, b) => compareSemverTags(a.name, b.name));
  const slice = tags.slice(-maxTags);
  const dated: HistoricalTag[] = [];
  for (const t of slice) {
    let at = new Date().toISOString();
    if (t.sha) {
      try {
        const cr = await fetch(`${env.originApi}/repos/${owner}/${name}/commits/${t.sha}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
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

async function defaultBranchHead(installationId: string, repo: string): Promise<{ branch: string; sha: string }> {
  const { owner, name } = repoParts(repo);
  const token = await installationToken(installationId);
  const rr = await fetch(`${env.originApi}/repos/${owner}/${name}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!rr.ok) throw new Error(`repo ${rr.status}`);
  const meta = (await rr.json()) as { defaultBranch?: string };
  const branch = meta.defaultBranch ?? "main";
  const ref = encodeURIComponent(`heads/${branch}`);
  const gr = await fetch(`${env.originApi}/repos/${owner}/${name}/git/ref/${ref}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!gr.ok) throw new Error(`ref ${gr.status}`);
  const gj = (await gr.json()) as { object?: { sha?: string } };
  const sha = gj.object?.sha;
  if (!sha) throw new Error("missing head sha");
  return { branch, sha };
}

/** Create or replace a single file on the default branch (needs repository:contents:write). */
export async function commitChangelogFile(installationId: string, repo: string, path: string, content: string, message: string) {
  const { owner, name } = repoParts(repo);
  const { branch, sha } = await defaultBranchHead(installationId, repo);
  const token = await installationToken(installationId);
  const r = await fetch(`${env.originApi}/repos/${owner}/${name}/git/commits:createFromFiles`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      targetBranch: branch,
      expectedHeadSha: sha,
      message,
      author: { name: "Shiplog", email: "shiplog@users.noreply.cursor.com" },
      files: [{ path, content, encoding: "utf-8" }],
    }),
  });
  if (!r.ok) throw new Error(`commit ${r.status}`);
}
