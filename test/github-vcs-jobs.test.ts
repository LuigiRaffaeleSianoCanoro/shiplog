import { describe, expect, it, vi, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";

const rsaPem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();

async function githubJobsSetup() {
  vi.resetModules();
  delete process.env.ORIGIN_APP_ID;
  delete process.env.ORIGIN_APP_PRIVATE_KEY;
  process.env.GITHUB_APP_ID = "999";
  process.env.GITHUB_APP_PRIVATE_KEY = rsaPem;
  const { MemoryStore } = await import("@/lib/store/memory");
  const store = new MemoryStore();
  (await import("@/lib/store")).setStore(store);
  await store.upsertInstallation({
    id: "gh_1",
    namespace: "acme",
    provider: "github",
    status: "active",
    createdAt: "",
    installerId: "100",
  });
  const commentPosts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/access_tokens")) return Response.json({ token: "ghs_x", expires_at: new Date(Date.now() + 3600_000).toISOString() });
      if (u.includes("/app/installations/gh_1") && !u.includes("access_tokens")) {
        return Response.json({ account: { login: "acme", type: "Organization" }, installed_by: { id: 100 } });
      }
      if (u.includes("/issues/") && u.endsWith("/comments") && init?.method === "POST") {
        commentPosts.push(String((JSON.parse(String(init.body)) as { body: string }).body));
        return new Response("", { status: 201 });
      }
      if (u.includes("/contents/.shiplog.yml")) return new Response("", { status: 404 });
      if (u.includes("/issues/") && u.endsWith("/comments") && !init?.method) return Response.json([]);
      if (u.includes("/pulls/") && u.includes("/comments") && !init?.method) return Response.json([]);
      if (u.includes("/pulls/") && u.includes("/files")) return Response.json([]);
      if (u.includes("/collaborators/")) return Response.json({ permission: "read" });
      return new Response("", { status: 404 });
    }),
  );
  const jobs = await import("@/lib/jobs");
  return { store, jobs, commentPosts };
}

afterEach(() => vi.unstubAllGlobals());

describe("provider=github job paths", () => {
  it("posts refusal comments via GitHub API, not Origin", async () => {
    const { jobs, commentPosts } = await githubJobsSetup();
    await jobs.handleEvent(
      {
        installationId: "gh_1",
        event: {
          type: "pull_request.comment.created",
          payload: {
            pullRequest: { number: "3", repository: { name: "demo", owner: { slug: "acme" } } },
            comment: { body: "/shiplog release v1.0.0", author: { user: { id: "200", login: "rando" } } },
          },
        },
      },
      "d-gh",
    );
    expect(commentPosts.some((b) => b.includes("write or admin"))).toBe(true);
  });

  it("merged PR fallback comment uses GitHub when Origin is unset", async () => {
    const { jobs, store, commentPosts } = await githubJobsSetup();
    const job = await jobs.handleEvent(
      {
        installationId: "gh_1",
        event: {
          type: "pull_request.merged",
          payload: {
            pullRequest: { number: "5", title: "fix: x", body: "", webUrl: "https://github.com/acme/demo/pull/5" },
            repository: { name: "demo", owner: { slug: "acme" } },
          },
        },
      },
      "d-merge",
    );
    expect(job?.mode).toBe("fallback");
    expect(commentPosts.some((b) => b.includes("no Cursor key"))).toBe(true);
    const out = await store.listOutbox();
    expect(out[0]?.delivered).toBe(true);
  });
});
