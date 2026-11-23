import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

const artifacts = join(import.meta.dirname, "artifacts");
const HOST = "https://customer.example/";
// Chrome blocks a public page from loading scripts from loopback (Private Network Access),
// so the test fetches widget.js from the running app and serves those exact bytes from a public URL.
const SCRIPT = "https://cdn.example/widget.js";
const FEED = "https://feeds.example/acme/demo/feed.json";

const feed = {
  title: "demo changelog",
  repo: "acme/demo",
  updatedAt: "2026-11-23T00:00:00.000Z",
  page: "https://shiplog.help/acme/demo",
  feeds: {},
  releases: [
    { version: "Unreleased", date: null, summary: null, sections: { Added: ["Not released yet"] } },
    { version: "1.2.0", date: "2026-11-18", summary: null, sections: { Changed: ["Faster public changelogs (#70)"], Fixed: ['<img src=x onerror="window.__xss=1"> title is shown as text (#71)'] } },
    { version: "1.1.0", date: "2026-11-01", summary: null, sections: { Added: ["PostHog observability (#50)"] } },
  ],
};

async function hostPage(page: Page, baseURL: string, feedStatus = 200) {
  const served = await page.request.get(`${baseURL}/widget.js`);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toContain("javascript");
  const js = await served.text();
  await page.route(SCRIPT, (route) => route.fulfill({ contentType: "text/javascript", body: js }));
  await page.route(HOST, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><title>Customer app</title></head><body><h1>Customer app</h1>
<script src="${SCRIPT}" data-feed="${FEED}" data-lang="es" defer></script></body></html>`,
    }),
  );
  await page.route(FEED, (route) =>
    route.fulfill({ status: feedStatus, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(feed) }),
  );
  const script = page.waitForResponse(SCRIPT);
  await page.goto(HOST);
  expect((await script).status()).toBe(200);
}

test.beforeAll(() => mkdirSync(artifacts, { recursive: true }));

test("widget shows unread entries, renders feed text safely, and closes with Escape", async ({ page, baseURL }) => {
  await hostPage(page, baseURL!);
  const button = page.getByTestId("shiplog-widget-button");
  await expect(button).toBeVisible();
  await expect(button).toContainText("Novedades");
  await expect(button).toContainText("3");
  await expect(button).toHaveAttribute("aria-expanded", "false");

  await button.click();
  const panel = page.getByTestId("shiplog-widget-panel");
  await expect(panel).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("shiplog-widget-entry")).toHaveCount(3);
  // The host page declares no charset; accents must still render.
  await expect(panel.getByRole("heading")).toHaveText("Qu\u00e9 hay de nuevo");
  await expect(panel).not.toContainText("Not released yet");
  await expect(panel).toContainText('<img src=x onerror="window.__xss=1"> title is shown as text');
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await expect(panel.getByRole("link", { name: "Changelog by Shiplog" })).toHaveAttribute("href", "https://shiplog.help");
  await page.screenshot({ path: join(artifacts, "widget-open.png") });

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(button).toBeFocused();
  await expect(button).not.toContainText("3");

  await page.reload();
  await expect(page.getByTestId("shiplog-widget-button")).toBeVisible();
  await expect(page.getByTestId("shiplog-widget-button")).toHaveText("Novedades");
});

test("widget renders nothing when the feed fails", async ({ page, baseURL }) => {
  await hostPage(page, baseURL!, 503);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("shiplog-widget-button")).toHaveCount(0);
});
