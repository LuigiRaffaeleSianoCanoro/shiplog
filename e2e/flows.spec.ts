import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import {
  githubInstallSession,
  loadRuntime,
  mockOriginBackfill,
  mockOriginComment,
  mockOriginFile,
  originInstallSession,
  resetMock,
  sendGitHubWebhook,
  sendOriginWebhook,
  waitForText,
} from "./helpers";

const rt = () => loadRuntime();
const artifacts = join(import.meta.dirname, "artifacts");

function cookieHeader(session: string) {
  return { cookie: `shiplog_inst=${session}` };
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  mkdirSync(artifacts, { recursive: true });
});

const repo = { id: "repo_e2e", name: "demo", owner: { slug: "luigi", type: "user" } };
const pr = (number: string, title: string, body = "") => ({
  pullRequest: {
    number,
    title,
    body,
    merged: true,
    state: "merged",
    webUrl: `https://cursor.com/codebase/luigi/demo/pull/${number}`,
  },
  repository: repo,
});

test("landing and setup pages", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.screenshot({ path: join(artifacts, "01-landing.png"), fullPage: true });

  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: /Connect/i })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /Install on Origin/i })).toBeVisible();
  await page.screenshot({ path: join(artifacts, "02-setup.png"), fullPage: true });
});

test("install start routes (Origin and GitHub)", async ({ request }) => {
  const { baseUrl } = rt();
  const originStart = await request.get(`${baseUrl}/api/install/start`, { maxRedirects: 0 });
  expect(originStart.status()).toBe(307);
  const originLoc = originStart.headers()["location"] ?? "";
  expect(originLoc).toContain("cursor.com/codebase/apps/install");
  expect(originLoc).toContain("redirect_uri=");
  expect(originStart.headers()["set-cookie"]).toMatch(/shiplog_state=/);

  const ghStart = await request.get(`${baseUrl}/api/github/install/start`, { maxRedirects: 0 });
  expect(ghStart.status()).toBe(307);
  const ghLoc = ghStart.headers()["location"] ?? "";
  expect(ghLoc).toContain("github.com");
  expect(ghStart.headers()["set-cookie"]).toMatch(/shiplog_github_state=/);
});

test("Origin install callback and session", async ({ page }) => {
  const { baseUrl, mockUrl } = rt();
  const instId = "i_e2e_origin";
  await sendOriginWebhook(baseUrl, instId, "installation.created", {
    installation: { id: instId, account: { slug: "luigi" } },
  });
  const session = await originInstallSession(baseUrl, instId);
  await page.context().addCookies([{ name: "shiplog_inst", value: session, url: baseUrl }]);
  await page.goto(`/setup?installation_id=${instId}`);
  await expect(page.getByText("luigi")).toBeVisible();
  await expect(page.getByText("Origin App")).toBeVisible();
  await page.screenshot({ path: join(artifacts, "03-setup-connected.png"), fullPage: true });
  await resetMock(mockUrl);
});

test("signed webhook merge generates changelog entry", async ({ page }) => {
  const { baseUrl } = rt();
  const instId = "i_e2e_origin";
  await sendOriginWebhook(baseUrl, instId, "installation.created", {
    installation: { id: instId, account: { slug: "luigi" } },
  });
  const merge = await sendOriginWebhook(
    baseUrl,
    instId,
    "pull_request.merged",
    pr("42", "feat: annual pricing toggle on landing page"),
  );
  expect(merge.status).toBe(202);
  await waitForText(`${baseUrl}/luigi/demo`, /annual pricing toggle/i);
  await page.goto("/luigi/demo");
  await expect(page.getByRole("listitem").filter({ hasText: /annual pricing/i }).first()).toBeVisible();
  await expect(page.getByText("Changelog by")).toBeVisible();
  await page.screenshot({ path: join(artifacts, "04-public-changelog.png"), fullPage: true });
});

test("/shiplog entry command at merge", async () => {
  const { baseUrl, mockUrl, installerUserId } = rt();
  const instId = "i_e2e_origin";
  await mockOriginComment(mockUrl, "luigi", "demo", "43", '/shiplog entry "Shipped SSO for enterprise teams"', installerUserId);
  await sendOriginWebhook(baseUrl, instId, "pull_request.merged", pr("43", "feat: enterprise SSO"));
  await waitForText(`${baseUrl}/luigi/demo`, /SSO for enterprise teams/i);
});

test("/shiplog release command on PR comment", async () => {
  const { baseUrl, installerUserId } = rt();
  const instId = "i_e2e_origin";
  await sendOriginWebhook(baseUrl, instId, "pull_request.comment.created", {
    pullRequest: { number: "43", repository: repo },
    comment: { body: "/shiplog release v1.1.0", author: { user: { id: installerUserId } } },
  });
  await waitForText(`${baseUrl}/luigi/demo`, /v1\.1\.0/);
});

test("tag push release and RSS or JSON feeds", async ({ page, request }) => {
  const { baseUrl } = rt();
  const instId = "i_e2e_origin";
  await sendOriginWebhook(baseUrl, instId, "pull_request.merged", pr("45", "fix: RSS item dates"));
  await waitForText(`${baseUrl}/luigi/demo`, /RSS item dates/i);
  await sendOriginWebhook(baseUrl, instId, "repository.pushed", {
    repository: repo,
    refUpdates: [
      {
        ref: "refs/tags/v1.2.0",
        before: "0".repeat(40),
        after: "c0ffee".padEnd(40, "0"),
        created: true,
      },
    ],
  });
  await waitForText(`${baseUrl}/luigi/demo`, /v1\.2\.0/);
  const rss = await request.get("/luigi/demo/feed.xml");
  expect(rss.ok()).toBeTruthy();
  const rssText = await rss.text();
  expect(rssText).toContain("1.2.0");
  expect(rssText).not.toContain("|");
  const json = await request.get("/luigi/demo/feed.json");
  expect(json.ok()).toBeTruthy();
  const feed = await json.json();
  expect(feed.releases?.some((r: { version: string }) => r.version === "1.2.0")).toBe(true);
  await page.goto("/luigi/demo/feed.json");
  await page.screenshot({ path: join(artifacts, "05-feed-json.png"), fullPage: true });
});

test("powered_by badge off via .shiplog.yml", async ({ page }) => {
  const { baseUrl, mockUrl } = rt();
  const instId = "i_e2e_origin";
  await mockOriginFile(mockUrl, "luigi", "demo", ".shiplog.yml", "powered_by: false\n");
  await page.goto("/luigi/demo");
  await expect(page.getByText("Changelog by")).toHaveCount(0);
  await page.screenshot({ path: join(artifacts, "06-no-badge.png"), fullPage: true });
});

test("dashboard provider column, jobs, and outbox", async ({ page }) => {
  const { baseUrl } = rt();
  const instId = "i_e2e_origin";
  const session = await originInstallSession(baseUrl, instId);
  await page.context().addCookies([{ name: "shiplog_inst", value: session, url: baseUrl }]);
  await page.goto(`/dashboard?installation_id=${instId}`);
  const installs = page.locator("table").first();
  await expect(installs.getByText("Origin", { exact: true })).toBeVisible();
  await expect(installs.getByText("luigi")).toBeVisible();
  const jobs = page.locator("table").nth(1);
  await expect(jobs.getByText("luigi/demo").first()).toBeVisible();
  await expect(page.getByText("Latest PR comments")).toBeVisible();
  await page.screenshot({ path: join(artifacts, "07-dashboard.png"), fullPage: true });
});

test("notify webhooks fire on changelog events", async ({ request }) => {
  const { baseUrl, mockUrl } = rt();
  const instId = "i_e2e_origin";
  const session = await originInstallSession(baseUrl, instId);
  const notifyUrl = `${mockUrl}/notify/capture`;
  const save = await request.post("/api/notify", {
    headers: { ...cookieHeader(session), "content-type": "application/json" },
    data: { installationId: instId, webhooks: [notifyUrl] },
  });
  expect(save.ok()).toBeTruthy();
  await sendOriginWebhook(baseUrl, instId, "pull_request.merged", pr("46", "fix: null guard on checkout"));
  await waitForText(`${baseUrl}/luigi/demo`, /null guard/i);
  const posts = await (await fetch(`${mockUrl}/__e2e/notify`)).json();
  expect((posts as { posts: unknown[] }).posts.length).toBeGreaterThan(0);
});

test("history backfill API", async ({ request }) => {
  const { baseUrl, mockUrl } = rt();
  const instId = "i_e2e_backfill";
  await sendOriginWebhook(baseUrl, instId, "installation.created", {
    installation: { id: instId, account: { slug: "acme" } },
  });
  await mockOriginBackfill(mockUrl, "acme", "widget", [
    { number: "1", title: "feat: first widget", mergedAt: "2026-01-10T12:00:00Z" },
    { number: "2", title: "fix: widget resize", mergedAt: "2026-01-11T12:00:00Z" },
  ], [{ name: "v0.1.0", sha: "e".repeat(40) }]);
  const session = await originInstallSession(baseUrl, instId);
  const r = await request.post("/api/history/backfill", {
    headers: { ...cookieHeader(session), "content-type": "application/json" },
    data: { installationId: instId, repo: "acme/widget", force: true },
  });
  expect(r.ok()).toBeTruthy();
  await waitForText(`${baseUrl}/acme/widget`, /first widget/i);
});

test("read-only changelog API and MCP", async ({ request }) => {
  const { baseUrl } = rt();
  const api = await request.get("/api/v1/changelogs/acme/widget");
  expect(api.ok()).toBeTruthy();
  const body = await api.json();
  expect(body.apiVersion).toBe("v1");
  expect(body.repo).toBe("acme/widget");

  const mcp = await request.post("/api/mcp", {
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "e2e", version: "1.0.0" },
      },
    },
  });
  expect(mcp.status()).toBe(200);
  const mcpText = await mcp.text();
  expect(mcpText).toMatch(/initialize|protocolVersion/i);
});

test("Vercel cron poll with CRON_SECRET", async ({ request }) => {
  const { cronSecret } = rt();
  const denied = await request.get("/api/cron/poll");
  expect(denied.status()).toBe(401);
  const ok = await request.get("/api/cron/poll", {
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  expect(ok.ok()).toBeTruthy();
  const j = await ok.json();
  expect(j).toHaveProperty("updated");
});

test("GitHub App install callback and merged PR", async ({ page, request }) => {
  const { baseUrl } = rt();
  const instId = "1002";
  await sendGitHubWebhook(baseUrl, "installation", {
    action: "created",
    installation: { id: Number(instId), account: { login: "ghuser" } },
  });
  const session = await githubInstallSession(baseUrl, instId);
  await page.context().addCookies([{ name: "shiplog_inst", value: session, url: baseUrl }]);
  await page.goto(`/setup?installation_id=${instId}`);
  await expect(page.getByText("GitHub App")).toBeVisible();
  await page.screenshot({ path: join(artifacts, "08-github-setup.png"), fullPage: true });

  await sendGitHubWebhook(baseUrl, "pull_request", {
    action: "closed",
    installation: { id: Number(instId) },
    repository: { name: "widget", owner: { login: "ghuser" } },
    pull_request: {
      number: 7,
      title: "feat: dark mode for widget",
      body: "",
      merged: true,
      html_url: "https://github.com/ghuser/widget/pull/7",
    },
  });
  await waitForText(`${baseUrl}/ghuser/widget`, /dark mode/i);
  await page.goto("/ghuser/widget");
  await page.screenshot({ path: join(artifacts, "09-github-changelog.png"), fullPage: true });

  const dash = await request.get(`/dashboard?installation_id=${instId}`, {
    headers: cookieHeader(session),
  });
  expect(dash.ok()).toBeTruthy();
  const html = await dash.text();
  expect(html).toContain("GitHub");
});

test("uninstall stops processing webhooks", async () => {
  const { baseUrl } = rt();
  const instId = "i_e2e_origin";
  await sendOriginWebhook(baseUrl, instId, "installation.deleted", { installation: { id: instId } });
  const ignored = await sendOriginWebhook(baseUrl, instId, "pull_request.merged", pr("99", "feat: should be ignored"));
  expect(ignored.status).toBe(202);
  const page = await fetch(`${baseUrl}/luigi/demo`);
  const text = await page.text();
  expect(text).not.toMatch(/should be ignored/i);
});
