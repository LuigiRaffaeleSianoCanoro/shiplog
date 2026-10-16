import { describe, expect, it, vi } from "vitest";

describe("GitHub install URL", () => {
  it("uses app slug when the GitHub API returns one", async () => {
    vi.resetModules();
    process.env.GITHUB_APP_ID = "123";
    process.env.GITHUB_APP_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHB7MZYzLYeLilF2DYl
PBMJa2tKzZf0lQ7V5l0G0V5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y
-----END RSA PRIVATE KEY-----`;
    vi.doMock("@/lib/github", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/github")>();
      return { ...actual, githubAppSlug: async () => "shiplog-dev" };
    });
    const { githubInstallUrl } = await import("@/lib/github-install");
    const u = new URL(await githubInstallUrl("st"));
    expect(u.hostname).toBe("github.com");
    expect(u.pathname).toBe("/apps/shiplog-dev/installations/new");
    expect(u.searchParams.get("state")).toBe("st");
    vi.doUnmock("@/lib/github");
  });

  it("falls back to app_id when slug is unknown", async () => {
    vi.resetModules();
    process.env.GITHUB_APP_ID = "999";
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    vi.doMock("@/lib/github", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/github")>();
      return { ...actual, githubAppSlug: async () => null };
    });
    const { githubInstallUrl } = await import("@/lib/github-install");
    const u = new URL(await githubInstallUrl());
    expect(u.searchParams.get("app_id")).toBe("999");
    vi.doUnmock("@/lib/github");
  });
});

describe("GitHub install start canonical host", () => {
  it("bounces to SHIPLOG_INSTALL_ORIGIN", async () => {
    vi.resetModules();
    process.env.GITHUB_APP_ID = "1";
    process.env.SHIPLOG_INSTALL_ORIGIN = "https://reg.test";
    vi.doMock("@/lib/github-install", () => ({ githubInstallUrl: async () => "https://github.com/apps/x/installations/new" }));
    const { GET } = await import("@/app/api/github/install/start/route");
    const r = await GET(new Request("https://shiplog.help/api/github/install/start"));
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("https://reg.test/api/github/install/start");
    vi.doUnmock("@/lib/github-install");
  });
});
