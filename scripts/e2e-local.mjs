// Local end-to-end: signs Origin-style webhooks with a throwaway Ed25519 key, serves its JWKS,
// and drives install → merge (feat, fix) → release → uninstall against a running Shiplog.
// Usage: start a JWKS server via this script (it serves on :4455), run Shiplog with ORIGIN_JWKS_URL=http://127.0.0.1:4455/keys
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import http from "node:http";

const BASE = process.env.SHIPLOG_URL ?? "http://127.0.0.1:3000";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "local-1" };
const srv = http.createServer((_, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ keys: [jwk] })); }).listen(4455);

let n = 0;
async function send(type, payload, { tamper = false } = {}) {
  const id = `whd_e2e_${Date.now()}_${n++}`; const ts = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ deliveryId: id, appId: "app_local", installationId: "i_demo", event: { id: `evt_${n}`, type, eventTime: new Date().toISOString(), payload } });
  const digest = createHash("sha256").update(`${id}.${ts}.`).update(body).digest("hex");
  const sig = sign(null, Buffer.from(digest), privateKey).toString("base64");
  const r = await fetch(`${BASE}/api/webhooks/origin`, { method: "POST", headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": `v1ed,${sig}`, "webhook-event-type": type }, body: tamper ? body + " " : body });
  console.log(type, tamper ? "(tampered)" : "", r.status);
  return r.status;
}
const repo = { id: "repo_demo", name: "landing-page", owner: { slug: "luigi", type: "user" } };
const pr = (number, title, body) => ({ pullRequest: { number, title, body, merged: true, state: "merged", webUrl: `https://cursor.com/codebase/luigi/landing-page/pull/${number}` }, repository: repo });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Install callback: signed installation_receipt (sub = installation id) → session cookie → /setup
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const si = `${b64u({ alg: "EdDSA", typ: "origin-installation-receipt+jwt", kid: "local-1" })}.${b64u({ iss: "https://api.cursor.com/v1/origin", aud: process.env.ORIGIN_APP_ID ?? "app_local", sub: "i_demo", exp: now + 300, iat: now })}`;
const receipt = `${si}.${sign(null, Buffer.from(si), privateKey).toString("base64url")}`;
const cb = await fetch(`${BASE}/api/install/callback?installation_receipt=${receipt}`, { redirect: "manual" });
console.log("install callback", cb.status, cb.headers.get("location"));
if (process.env.E2E_RECEIPT_OUT) (await import("node:fs")).writeFileSync(process.env.E2E_RECEIPT_OUT, receipt);
await send("installation.created", { installation: { id: "i_demo", account: { slug: "luigi" } } });
await send("pull_request.merged", pr("17", "feat: add pricing section with annual toggle", "Adds a pricing section to the landing page with a monthly/annual switch."), { tamper: true });
await send("pull_request.merged", pr("17", "feat: add pricing section with annual toggle", "Adds a pricing section to the landing page with a monthly/annual switch."));
await wait(Number(process.env.E2E_WAIT ?? 15000));
await send("pull_request.merged", pr("18", "fix: hero video no longer autoplays on mobile data", "Respects Save-Data and prefers-reduced-data."));
await wait(Number(process.env.E2E_WAIT ?? 15000));
await send("repository.pushed", { repository: repo, refUpdates: [{ ref: "refs/tags/v1.2.0", before: "0".repeat(40), after: "c0ffee".padEnd(40, "0"), created: true }] });
await wait(Number(process.env.E2E_WAIT ?? 15000));
if (process.env.E2E_UNINSTALL !== "false") {
  await send("installation.deleted", { installation: { id: "i_demo" } });
  await send("pull_request.merged", pr("19", "feat: should be ignored", ""));
}
if (process.env.E2E_HOLD) await wait(Number(process.env.E2E_HOLD));
srv.close();
