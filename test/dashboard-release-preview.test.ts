import { describe, expect, it } from "vitest";
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

  it("skippedSince is bounded by the latest release at or before the given time", () => {
    expect(skippedSince(jobs, "acme/web", "2026-10-31T00:00:00Z").map((s) => s.number)).toEqual(["8", "11"]); // no release yet: everything skipped counts
    expect(skippedSince(jobs, "acme/web", "2026-11-30T00:00:00Z")).toEqual([{ number: "11", reason: "type chore" }]);
  });
});

describe("dashboard page renders the release preview", () => {
  it("shows queued PRs, grouped bots and skips for the operator; runs nothing", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    vi.stubEnv("SHIPLOG_DASHBOARD_TOKEN", "op-token-123");
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { MemoryStore } = await import("@/lib/store/memory");
    const { setStore } = await import("@/lib/store");
    const store = new MemoryStore();
    await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" } as never);
    for (const j of jobs) await store.putJob(j);
    setStore(store);
    const { default: Dashboard } = await import("@/app/(site)/dashboard/page");
    const html = renderToStaticMarkup(await Dashboard({ searchParams: Promise.resolve({ token: "op-token-123" }) }));
    expect(html).toContain("Next release preview");
    expect(html).toContain("acme/web");
    expect(html).toContain("Login no longer loops on Safari");
    expect(html).toContain("Left out of the changelog, and why");
    expect(html).toContain("#11: type chore");
    expect(html).toContain("daily batch");
    expect((await store.listJobs()).filter((j) => j.status === "queued")).toHaveLength(5); // viewing changes no job
    vi.unstubAllEnvs();
    vi.doUnmock("next/headers");
  });

  it("hides the panel when nothing is queued", async () => {
    const { ReleasePreview } = await import("@/app/(site)/dashboard/ReleasePreview");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    expect(renderToStaticMarkup(createElement(ReleasePreview, { previews: [] }))).toBe("");
  });
});
