import { createPrivateKey, sign } from "node:crypto";
import { env } from "./env";

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
