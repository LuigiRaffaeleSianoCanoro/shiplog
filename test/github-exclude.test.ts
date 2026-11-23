import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { githubToEnvelope } from "@/lib/github-adapter";
import { excludedBy, parseConfig } from "@/lib/config";

const repo = { name: "demo", owner: { login: "acme" } };
const mergedGh = (pr: Record<string, unknown>) =>
  githubToEnvelope("pull_request", {
    action: "closed", installation: { id: "gh_1" }, repository: repo,
    pull_request: { merged: true, number: 7, title: "chore(deps): bump next from 16.4.2 to 16.4.5", body: "", html_url: "https://github.com/acme/demo/pull/7", ...pr },
  })!;
const dependabot = { login: "dependabot[bot]", id: 49699333, type: "Bot" };
const human = { login: "octocat", id: 1, type: "User" };

describe("GitHub PRs carry labels and author into exclude rules", () => {
  it("forwards label names", () => {
    const pr = mergedGh({ labels: [{ name: "dependencies" }, { name: "no-changelog" }], user: human }).event.payload.pullRequest;
    expect(excludedBy(pr, parseConfig(""))).toBe("label no-changelog");
  });

  it("the default exclude label skip-changelog matches case-insensitively", () => {
    const pr = mergedGh({ labels: [{ name: "Skip-Changelog" }], user: human }).event.payload.pullRequest;
    expect(excludedBy(pr, parseConfig(""))).toBe("label skip-changelog");
  });

  it("a configured exclude.labels entry matches a GitHub label; other labels do not", () => {
    const cfg = parseConfig("exclude:\n  labels: [dependencies]\n");
    expect(excludedBy(mergedGh({ labels: [{ name: "Dependencies" }], user: human }).event.payload.pullRequest, cfg)).toBe("label dependencies");
    expect(excludedBy(mergedGh({ labels: [{ name: "javascript" }], user: human }).event.payload.pullRequest, cfg)).toBeNull();
  });

  it("exclude.authors: [dependabot] matches the dependabot[bot] app", () => {
    const pr = mergedGh({ user: dependabot }).event.payload.pullRequest;
    expect(excludedBy(pr, parseConfig("exclude:\n  authors: [dependabot]\n"))).toBe("author dependabot");
  });

  it('exclude.authors: [bots] matches any GitHub Bot account', () => {
    const pr = mergedGh({ user: { login: "renovate[bot]", id: 2, type: "Bot" } }).event.payload.pullRequest;
    expect(excludedBy(pr, parseConfig("exclude:\n  authors: [bots]\n"))).toBe("author renovate");
  });

  it("human authors are matched by login glob and are not bots", () => {
    const pr = mergedGh({ user: human }).event.payload.pullRequest;
    expect(excludedBy(pr, parseConfig("exclude:\n  authors: [bots]\n"))).toBeNull();
    expect(excludedBy(pr, parseConfig("exclude:\n  authors: [\"octo*\"]\n"))).toBe("author octocat");
  });

  it("missing user and labels exclude nothing", () => {
    const pr = mergedGh({}).event.payload.pullRequest;
    expect(excludedBy(pr, parseConfig("exclude:\n  authors: [bots]\n"))).toBeNull();
  });
});

const rsaPem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("handleEvent on a GitHub merge", () => {
  it("a no-changelog label makes the job ignored, with no agent and no comment", async () => {
    vi.resetModules();
    vi.stubEnv("ORIGIN_APP_ID", ""); vi.stubEnv("ORIGIN_APP_PRIVATE_KEY", "");
    vi.stubEnv("GITHUB_APP_ID", "999"); vi.stubEnv("GITHUB_APP_PRIVATE_KEY", rsaPem);
    const { MemoryStore } = await import("@/lib/store/memory");
    const store = new MemoryStore();
    (await import("@/lib/store")).setStore(store);
    await store.upsertInstallation({ id: "gh_1", namespace: "acme", provider: "github", status: "active", createdAt: "", installerId: "100" });
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url); calls.push(`${init?.method ?? "GET"} ${u}`);
      if (u.includes("/access_tokens")) return Response.json({ token: "ghs_x", expires_at: new Date(Date.now() + 3600_000).toISOString() });
      if (u.includes("/app/installations/gh_1")) return Response.json({ account: { login: "acme", type: "Organization" }, installed_by: { id: 100 } });
      if (u.includes("/contents/.shiplog.yml")) return new Response("", { status: 404 });
      if (u.endsWith("/comments") && !init?.method) return Response.json([]);
      return new Response("", { status: 404 });
    }));
    const jobs = await import("@/lib/jobs");
    const job = await jobs.handleEvent(mergedGh({ labels: [{ name: "no-changelog" }], user: human }), "gh-d1");
    expect(job?.status).toBe("ignored");
    expect(job?.result).toBe("excluded by label no-changelog");
    expect(calls.filter((c) => c.startsWith("POST") && c.includes("/comments"))).toHaveLength(0);
  });
});

describe("GitHub history backfill authors", () => {
  it("maps Bot users so exclude.authors works during backfill", async () => {
    vi.resetModules();
    vi.stubEnv("GITHUB_APP_ID", "999"); vi.stubEnv("GITHUB_APP_PRIVATE_KEY", rsaPem);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/access_tokens")) return Response.json({ token: "ghs_x", expires_at: new Date(Date.now() + 3600_000).toISOString() });
      if (u.includes("/pulls?") && u.includes("state=closed")) return Response.json([
        { number: 1, title: "chore(deps): bump a from 1 to 2", merged_at: "2026-11-01T00:00:00Z", user: dependabot },
        { number: 2, title: "feat: x", merged_at: "2026-11-02T00:00:00Z", user: human },
        { number: 3, title: "feat: y", merged_at: "2026-11-03T00:00:00Z", user: human, labels: [{ name: "no-changelog" }] },
      ]);
      return new Response("", { status: 404 });
    }));
    const { githubListMergedPullRequests } = await import("@/lib/github-api");
    const prs = await githubListMergedPullRequests("gh_1", "acme/demo", 10);
    const cfg = parseConfig("exclude:\n  authors: [bots]\n");
    expect(prs.map((p) => excludedBy(p, cfg))).toEqual(["author dependabot", null, "label no-changelog"]);
    expect(prs.map((p) => excludedBy(p, parseConfig('exclude:\n  authors: ["octo*"]\n')))).toEqual([null, "author octocat", "label no-changelog"]);
  });
});
