import { createPrivateKey, sign } from "node:crypto";
import { env } from "./env";

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** GitHub App JWT (RS256) for app-level API calls. */
export function githubAppJwt(appId = env.githubAppId, pem = env.githubAppPrivateKey, now = Math.floor(Date.now() / 1000)) {
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const p = b64u(JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId }));
  const s = sign("RSA-SHA256", Buffer.from(`${h}.${p}`), createPrivateKey(pem));
  return `${h}.${p}.${b64u(s)}`;
}

export const githubConfigured = () => Boolean(env.githubAppId && env.githubAppPrivateKey);
export const githubWebhookConfigured = () => Boolean(env.githubWebhookSecret);

let appSlugCache: { slug: string; at: number } | null = null;

/** App slug for install URLs (cached 1h). */
export async function githubAppSlug(): Promise<string | null> {
  if (appSlugCache && Date.now() - appSlugCache.at < 3_600_000) return appSlugCache.slug;
  if (!githubConfigured()) return null;
  const r = await fetch(`${env.githubApi.replace(/\/+$/, "")}/app`, {
    headers: { Authorization: `Bearer ${githubAppJwt()}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { slug?: string };
  if (!j.slug) return null;
  appSlugCache = { slug: j.slug, at: Date.now() };
  return j.slug;
}

export interface GithubInstallationInfo {
  namespace: string;
  namespaceType: "user" | "team" | null;
  installerId: string | null;
}

/** Resolve account namespace for a GitHub App installation. */
export async function getGithubInstallationInfo(installationId: string): Promise<GithubInstallationInfo> {
  const r = await fetch(`${env.githubApi.replace(/\/+$/, "")}/app/installations/${encodeURIComponent(installationId)}`, {
    headers: { Authorization: `Bearer ${githubAppJwt()}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`github installation ${r.status}`);
  const j = (await r.json()) as {
    account?: { login?: string; type?: string };
    installed_by?: { id?: number };
  };
  const t = j.account?.type;
  return {
    namespace: j.account?.login ?? "",
    namespaceType: t === "Organization" ? "team" : t === "User" ? "user" : null,
    installerId: j.installed_by?.id != null ? String(j.installed_by.id) : null,
  };
}
