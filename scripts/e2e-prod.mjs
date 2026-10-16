// Live E2E against the real deploy + Origin demo repo. Needs an installation token in $OIT (never printed)
// and a local clone of the demo repo in $DEMO_DIR whose git auth uses that token.
import { execSync } from "node:child_process";
const API = "https://api.cursor.com/v1/origin", REPO = process.env.REPO ?? "luigi/shiplog-demo";
const BASE = process.env.BASE ?? "https://shiplog-luigi-canoros-projects.vercel.app";
const H = { Authorization: `Bearer ${process.env.OIT}`, "content-type": "application/json" };
const sh = (c) => execSync(c, { cwd: process.env.DEMO_DIR, stdio: "pipe" }).toString().trim();
const api = async (m, p, b) => { const r = await fetch(`${API}/repos/${REPO}${p}`, { method: m, headers: H, body: b && JSON.stringify(b) }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : {}; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};
async function waitComment(pr, re, label, ms = 120000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(5000)) {
    const c = await api("GET", `/pulls/${pr}/comments`);
    const hit = (c.comments ?? c.items ?? []).find((x) => re.test(x.body ?? ""));
    if (hit) { results[label] = "PASS"; return hit; }
  }
  results[label] = "FAIL (no matching comment)";
}
const stamp = Date.now().toString(36);
// 1) landing + health
results.landing = (await fetch(BASE)).status === 200 ? "PASS" : "FAIL";
results.health = JSON.stringify(await (await fetch(`${BASE}/api/health`)).json());
// 2) merged PR -> changelog comment
// PR is opened beforehand (installation tokens lack pull_requests:write): pass PR=<number>
const n = Number(process.env.PR);

await sleep(3000);
await api("POST", `/pulls/${n}/merge`, {});
await waitComment(n, /Shiplog/i, "merged_pr_comment");
// 3) /shiplog release command
const ver = `v1.${Math.floor(Date.now() / 1000) % 1000}.0`;
await api("POST", `/pulls/${n}/comments`, { body: `/shiplog release ${ver}` });
await waitComment(n, new RegExp(`Shiplog[\\s\\S]*${ver.slice(1).replace(/\./g, "\\.")}`), "release_command");
// 4) tag push
sh(`git fetch -q origin && git tag v9.${stamp.length}.${Math.floor(Date.now()/1000)%10000} origin/main && git push -q origin --tags`);
console.log(JSON.stringify({ pr: n, ver, results }, null, 2));
