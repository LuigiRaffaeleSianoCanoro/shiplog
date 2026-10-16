import { createHash, createHmac, createPrivateKey, randomBytes, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));

export interface E2eRuntime {
  baseUrl: string;
  mockUrl: string;
  originAppId: string;
  githubWebhookSecret: string;
  cronSecret: string;
  dashboardToken: string;
  installerUserId: string;
  originPrivateKeyPem: string;
  originJwk: { kid: string };
}

export function loadRuntime(): E2eRuntime {
  return JSON.parse(readFileSync(join(__dir, ".runtime/config.json"), "utf8"));
}

const b64u = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

export function originPrivateKey() {
  const cfg = loadRuntime();
  return createPrivateKey(cfg.originPrivateKeyPem);
}

export function signOriginReceipt(sub: string) {
  const cfg = loadRuntime();
  const privateKey = originPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const header = b64u({ alg: "EdDSA", typ: "origin-installation-receipt+jwt", kid: cfg.originJwk.kid });
  const payload = b64u({
    iss: "https://api.cursor.com/v1/origin",
    aud: cfg.originAppId,
    sub,
    exp: now + 600,
    iat: now,
  });
  const sig = sign(null, Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
  return `${header}.${payload}.${sig}`;
}

export async function sendOriginWebhook(baseUrl: string, installationId: string, type: string, payload: object) {
  const cfg = loadRuntime();
  const privateKey = originPrivateKey();
  const id = `whd_e2e_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const ts = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    deliveryId: id,
    appId: cfg.originAppId,
    installationId,
    event: { id: `evt_${id}`, type, eventTime: new Date().toISOString(), payload },
  });
  const digest = createHash("sha256").update(`${id}.${ts}.`).update(body).digest("hex");
  const sig = sign(null, Buffer.from(digest), privateKey).toString("base64");
  return fetch(`${baseUrl}/api/webhooks/origin`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(ts),
      "webhook-signature": `v1ed,${sig}`,
      "webhook-event-type": type,
    },
    body,
  });
}

export async function sendGitHubWebhook(baseUrl: string, event: string, body: object) {
  const cfg = loadRuntime();
  const raw = JSON.stringify(body);
  const hex = createHmac("sha256", cfg.githubWebhookSecret).update(raw).digest("hex");
  const delivery = `ghd_${randomBytes(8).toString("hex")}`;
  return fetch(`${baseUrl}/api/webhooks/github`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-github-delivery": delivery,
      "x-hub-signature-256": `sha256=${hex}`,
    },
    body: raw,
  });
}

export async function resetMock(mockUrl: string) {
  await fetch(`${mockUrl}/__e2e/reset`, { method: "POST" });
}

export async function mockOriginFile(mockUrl: string, owner: string, name: string, path: string, content: string) {
  await fetch(`${mockUrl}/__e2e/origin/file`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ owner, name, path, content }),
  });
}

export async function mockOriginComment(
  mockUrl: string,
  owner: string,
  name: string,
  pr: string,
  body: string,
  userId?: string,
) {
  await fetch(`${mockUrl}/__e2e/origin/comment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ owner, name, pr, body, userId }),
  });
}

export async function mockOriginBackfill(
  mockUrl: string,
  owner: string,
  name: string,
  prs: { number: string; title: string; mergedAt: string }[],
  tags: { name: string; sha?: string }[],
) {
  await fetch(`${mockUrl}/__e2e/origin/backfill`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ owner, name, prs, tags }),
  });
}

export async function waitForText(url: string, re: RegExp, ms = 45_000) {
  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < ms) {
    const r = await fetch(url, { cache: "no-store" });
    last = await r.text();
    if (re.test(last)) return last;
    await new Promise((res) => setTimeout(res, 600));
  }
  throw new Error(`timeout waiting for ${re} at ${url}\nlast:\n${last.slice(0, 500)}`);
}

/** Session cookie from install callback redirect. */
export async function originInstallSession(baseUrl: string, installationId = "i_e2e_origin") {
  const receipt = signOriginReceipt(installationId);
  const r = await fetch(`${baseUrl}/api/install/callback?installation_receipt=${encodeURIComponent(receipt)}`, {
    redirect: "manual",
  });
  const cookie = r.headers.get("set-cookie") ?? "";
  const match = /shiplog_inst=([^;]+)/.exec(cookie);
  if (!match) throw new Error(`no session cookie from install callback: ${r.status}`);
  return match[1];
}

export async function githubInstallSession(baseUrl: string, installationId = "1002") {
  const start = await fetch(`${baseUrl}/api/github/install/start`, { redirect: "manual" });
  const stateCookie = /shiplog_github_state=([^;]+)/.exec(start.headers.get("set-cookie") ?? "");
  const state = stateCookie?.[1] ?? "";
  const r = await fetch(
    `${baseUrl}/api/github/install/callback?installation_id=${installationId}&setup_action=install&state=${encodeURIComponent(state)}`,
    {
      redirect: "manual",
      headers: state ? { cookie: `shiplog_github_state=${state}` } : {},
    },
  );
  const match = /shiplog_inst=([^;]+)/.exec(r.headers.get("set-cookie") ?? "");
  if (!match) throw new Error(`no session from github callback: ${r.status}`);
  return match[1];
}
