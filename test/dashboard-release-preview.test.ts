import { afterEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/lib/store";
import { releasePreviews, skippedSince } from "@/lib/release-preview";

let n = 0;
function job(p: Partial<Job> & { at: string }): Job {
  const { at, ...rest } = p;
  return { id: `j${++n}`, deliveryId: `d${n}`, installationId: "i1", repo: "acme/web", prNumber: "", prUrl: "", kind: "changelog", mode: "cursor", status: "done", createdAt: at, ...rest };
}
const queued = (num: string, title: string, at: string, extra: Record<string, unknown> = {}, repo = "acme/web") =>
  job({ at, repo, prNumber: num, prUrl: `https://x/${num}`, status: "queued", result: JSON.stringify({ number: num, url: `https://x/${num}`, title, body: "", section: null, breaking: false, batch: "release", ...extra }) });

const jobs: Job[] = [
  job({ at: "2026-11-01T10:00:00Z", kind: "release", status: "running", prNumber: "9" }),
  job({ at: "2026-10-30T10:00:00Z", prNumber: "8", status: "ignored", result: "excluded by label no-changelog" }), // before the last release
  queued("10", "feat: dark mode", "2026-11-02T10:00:00Z"),
  job({ at: "2026-11-03T10:00:00Z", prNumber: "11", status: "ignored", result: "excluded by type chore" }),
  queued("12", "chore(deps): bump next from 16.4.2 to 16.4.5", "2026-11-04T10:00:00Z", { bot: true }),
  queued("13", "fix: login loop", "2026-11-05T10:00:00Z", { section: "Fixed", entry: "Login no longer loops on Safari", breaking: true }),
  queued("14", "chore(deps): bump zod from 3.1.0 to 3.2.0", "2026-11-06T10:00:00Z", { bot: true }),
  queued("3", "feat: billing", "2026-11-07T10:00:00Z", { batch: "daily" }, "acme/api"),
  job({ at: "2026-11-08T10:00:00Z", prNumber: "15", status: "done", result: "batched into x" }),
];

describe("dashboard release preview (backlog 21)", () => {
  it("lists the next release per repo: own bullets in merge order, bots grouped, skips since the last release", () => {
    const [api, web] = releasePreviews(jobs, () => true);
    expect(web.repo).toBe("acme/web");
    expect(web.batch).toBe("release");
    expect(web.since).toBe("2026-11-02T10:00:00Z");
    expect(web.bullets.map((b) => [b.number, b.text, b.section, b.breaking, b.explicit])).toEqual([
      ["10", "feat: dark mode", null, false, false],
      ["13", "Login no longer loops on Safari", "Fixed", true, true],
    ]);
    expect(web.botBullet).toBe("Dependency updates: next 16.4.5 (#12), zod 3.2.0 (#14)");
    expect(web.grouped.map((e) => e.number)).toEqual(["12", "14"]);
    expect(web.skipped).toEqual([{ number: "11", reason: "type chore" }]);
    expect(api).toMatchObject({ repo: "acme/api", batch: "daily", botBullet: null, skipped: [] });
  });

  it("without group_bots, bot PRs keep their own bullets and nothing is grouped", () => {
    const web = releasePreviews(jobs, (_i, repo) => repo !== "acme/web").find((p) => p.repo === "acme/web")!;
    expect(web.bullets.map((b) => b.number)).toEqual(["10", "12", "13", "14"]);
    expect(web.botBullet).toBeNull();
    expect(web.grouped).toEqual([]);
    expect(web.bullets.filter((b) => b.bot).map((b) => b.number)).toEqual(["12", "14"]);
  });

  it("the panel suggests group_bots only when bot PRs are not grouped", async () => {
    const { ReleasePreview } = await import("@/app/(site)/dashboard/ReleasePreview");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const render = (on: boolean) => renderToStaticMarkup(createElement(ReleasePreview, { previews: releasePreviews(jobs, () => on) }));
    expect(render(false)).toContain("group_bots: true");
    expect(render(true)).not.toContain("group_bots: true");
    expect(render(true)).toContain("2 bot PRs grouped into one bullet: #12, #14");
  });

  it("repos with nothing queued get no preview; a broken queued record is skipped, not thrown", () => {
    const bad = { ...queued("20", "x", "2026-11-09T00:00:00Z", {}, "acme/bad"), result: "{not json" };
    expect(releasePreviews([...jobs.filter((j) => j.repo !== "acme/api"), bad], () => false).map((p) => p.repo)).toEqual(["acme/web"]);
    expect(releasePreviews([jobs[0], jobs[3]], () => true)).toEqual([]);
  });

  it("a repo mixing daily and release PRs waits for the release", () => {
    const mixed = [queued("1", "feat: a", "2026-11-01T00:00:00Z", { batch: "daily" }, "acme/mix"), queued("2", "feat: b", "2026-11-02T00:00:00Z", {}, "acme/mix")];
    expect(releasePreviews(mixed, () => false)[0].batch).toBe("release");
  });

  it("an ignored or failed release does not reset the left-out list", () => {
    const extra = [
      job({ at: "2026-11-03T12:00:00Z", kind: "release", status: "failed", prNumber: "9" }),
      job({ at: "2026-11-03T13:00:00Z", kind: "release", status: "ignored", prNumber: "9" }),
    ];
    const web = releasePreviews([...jobs, ...extra], () => true).find((p) => p.repo === "acme/web")!;
    expect(web.skipped.map((s) => s.number)).toEqual(["11"]);
  });

  it("skippedSince is bounded by the latest release at or before the given time", () => {
    expect(skippedSince(jobs, "acme/web", "2026-10-31T00:00:00Z").map((s) => s.number)).toEqual(["8", "11"]); // no release yet: everything skipped counts
    expect(skippedSince(jobs, "acme/web", "2026-11-30T00:00:00Z")).toEqual([{ number: "11", reason: "type chore" }]);
  });
});

describe("dashboard page renders the release preview", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.doUnmock("next/headers"); vi.doUnmock("@/lib/repo-config"); vi.restoreAllMocks(); });

  async function render(params: { token?: string; installation_id?: string }, session?: string, groupBotsRepos: string[] = []) {
    vi.resetModules();
    vi.stubEnv("SHIPLOG_DASHBOARD_TOKEN", "op-token-123");
    vi.stubEnv("SHIPLOG_KEY_ENC", "a".repeat(64)); // session cookie HMAC, test-only
    const { COOKIE, signSession } = await import("@/lib/session");
    const cookie = session ? signSession(session) : undefined;
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === COOKIE && cookie ? { value: cookie } : undefined) }) }));
    vi.doMock("@/lib/repo-config", async () => {
      const { DEFAULT_CONFIG } = await import("@/lib/config");
      return { loadRepoConfig: async (_i: string, repo: string) => ({ ...DEFAULT_CONFIG, groupBots: groupBotsRepos.includes(repo) }) };
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { MemoryStore } = await import("@/lib/store/memory");
    const { setStore } = await import("@/lib/store");
    const store = new MemoryStore();
    await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" } as never);
    await store.upsertInstallation({ id: "i2", namespace: "other", status: "active", createdAt: "2026-01-01" } as never);
    for (const j of jobs) await store.putJob(j);
    await store.putJob({ ...queued("50", "feat: secret other-tenant work", "2026-11-09T00:00:00Z", {}, "other/app"), installationId: "i2" });
    setStore(store);
    const { default: Dashboard } = await import("@/app/(site)/dashboard/page");
    const html = renderToStaticMarkup(await Dashboard({ searchParams: Promise.resolve(params) }));
    const start = html.indexOf('id="release-preview"');
    const panel = start < 0 ? "" : html.slice(start, html.indexOf("<h3>Recent jobs</h3>"));
    return { html, panel, store, fetchSpy };
  }

  it("operator view: queued PRs, grouped bots from .shiplog.yml and skip reasons; runs and fetches nothing", async () => {
    const { panel, store, fetchSpy } = await render({ token: "op-token-123" }, undefined, ["acme/web"]);
    expect(panel).toContain("acme/web");
    expect(panel).toContain("waits for /shiplog release");
    expect(panel).toContain("4 queued PRs since 2026-11-02");
    expect(panel).toContain("Login no longer loops on Safari");
    expect(panel).toContain("exact text from /shiplog entry");
    expect(panel).toMatch(/<span class="pill off">breaking<\/span>/);
    expect(panel).toContain("Dependency updates: next 16.4.5 (#12), zod 3.2.0 (#14)");
    expect(panel).toContain("2 bot PRs grouped into one bullet: #12, #14");
    expect(panel).toContain("#11: type chore");
    expect(panel).not.toContain("#8:");
    expect(panel).toContain("daily batch"); // acme/api
    expect(panel).not.toContain("group_bots: true");
    expect(panel).toContain("secret other-tenant work"); // operator sees every installation
    expect((await store.listJobs()).filter((j) => j.status === "queued")).toHaveLength(6);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("group_bots off in .shiplog.yml: bots keep their bullets and the panel says how to group them", async () => {
    const { panel } = await render({ token: "op-token-123" });
    expect(panel).not.toContain("Dependency updates:");
    expect(panel).toContain("2 bot PRs get their own bullets");
  });

  it("an install session sees only its own installation's queue", async () => {
    const { panel } = await render({ installation_id: "i1" }, "i1");
    expect(panel).toContain("acme/web");
    expect(panel).not.toContain("other-tenant");
  });

  it("no auth, no preview", async () => {
    const { html } = await render({ token: "wrong" });
    expect(html).not.toContain("release-preview");
    expect(html).not.toContain("Login no longer loops");
  });

  it("hides the panel when nothing is queued", async () => {
    const { ReleasePreview } = await import("@/app/(site)/dashboard/ReleasePreview");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    expect(renderToStaticMarkup(createElement(ReleasePreview, { previews: [] }))).toBe("");
  });
});
