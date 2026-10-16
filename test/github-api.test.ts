import { describe, expect, it, vi, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";

const rsaPem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function mockGithubApi(handlers: Record<string, (method: string) => Response | Promise<Response>>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      for (const [prefix, fn] of Object.entries(handlers)) {
        if (u.includes(prefix)) return fn(method);
      }
      return new Response("", { status: 404 });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("github-api", () => {
  it("githubAppJwt + installation token flow posts PR comments", async () => {
    vi.resetModules();
    process.env.GITHUB_APP_ID = "12345";
    process.env.GITHUB_APP_PRIVATE_KEY = rsaPem;
    const posts: string[] = [];
    mockGithubApi({
      "/app/installations/99/access_tokens": () => Response.json({ token: "ghs_test", expires_at: new Date(Date.now() + 3600_000).toISOString() }),
      "/repos/acme/demo/issues/4/comments": (method) => {
        if (method === "POST") {
          posts.push("ok");
          return new Response("", { status: 201 });
        }
        return new Response("", { status: 404 });
      },
    });
    const { githubCommentOnPr, githubInstallationToken } = await import("@/lib/github-api");
    expect(await githubInstallationToken("99")).toBe("ghs_test");
    await githubCommentOnPr("99", "acme/demo", "4", "**Shiplog** hello");
    expect(posts).toHaveLength(1);
  });

  it("maps collaborator permission to write/admin", async () => {
    vi.resetModules();
    process.env.GITHUB_APP_ID = "1";
    process.env.GITHUB_APP_PRIVATE_KEY = rsaPem;
    mockGithubApi({
      "/app/installations/7/access_tokens": () => Response.json({ token: "t", expires_at: new Date(Date.now() + 3600_000).toISOString() }),
      "/repos/o/r/collaborators/dev/permission": () => Response.json({ permission: "write" }),
    });
    const { githubRepoPermission } = await import("@/lib/github-api");
    expect(await githubRepoPermission("7", "o/r", "42", "dev")).toBe("write");
  });

  it("maintain maps to admin", async () => {
    vi.resetModules();
    process.env.GITHUB_APP_ID = "1";
    process.env.GITHUB_APP_PRIVATE_KEY = rsaPem;
    mockGithubApi({
      "/app/installations/7/access_tokens": () => Response.json({ token: "t", expires_at: new Date(Date.now() + 3600_000).toISOString() }),
      "/repos/o/r/collaborators/lead/permission": () => Response.json({ permission: "maintain" }),
    });
    const { githubRepoPermission } = await import("@/lib/github-api");
    expect(await githubRepoPermission("7", "o/r", "1", "lead")).toBe("admin");
  });
});
