import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, randomBytes } from "node:crypto";

const master = randomBytes(32).toString("base64");

async function setup(envOver: Record<string, string>) {
  vi.resetModules();
  for (const k of ["SHIPLOG_LLM_PROVIDER", "SHIPLOG_BYOK_ENABLED", "SUPABASE_URL", "ORIGIN_APP_ID", "ORIGIN_APP_PRIVATE_KEY"]) delete process.env[k];
  Object.assign(process.env, { SHIPLOG_KEY_ENC: master, ...envOver });
  const { MemoryStore } = await import("@/lib/store/memory");
  const storeMod = await import("@/lib/store");
  const store = new MemoryStore(); storeMod.setStore(store);
  const jobs = await import("@/lib/jobs");
  return { store, jobs };
}
const merged = (n: string, title: string) => ({ installationId: "i_1", event: { type: "pull_request.merged", payload: { pullRequest: { number: n, title, body: "", webUrl: `https://cursor.com/codebase/luigi/demo/pull/${n}` }, repository: { name: "demo", owner: { slug: "luigi" } } } } });

describe("job flows", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("no key → posts fallback prompt comment", async () => {
    const { store, jobs } = await setup({});
    const job = await jobs.handleEvent(merged("7", "fix: crash on save"), "d1");
    expect(job?.mode).toBe("fallback"); expect(job?.status).toBe("done");
    const [c] = await store.listOutbox();
    expect(c.body).toContain("no Cursor key connected"); expect(c.body).toContain("### Fixed");
  });

  it("neon mode drafts entry, then release cuts notes", async () => {
    const { store, jobs } = await setup({ SHIPLOG_LLM_PROVIDER: "neon", NEON_AI_GATEWAY_BASE_URL: "https://gw.test", NEON_AI_GATEWAY_TOKEN: "t" });
    const replies = [JSON.stringify({ section: "Added", bullet: "Dark mode toggle" }), "This release adds dark mode."];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: replies.shift() } }] }))));
    await jobs.handleEvent(merged("8", "feat: dark mode"), "d2");
    expect(await store.getChangelog("luigi/demo")).toContain("- Dark mode toggle (#8)");
    await store.upsertInstallation({ ...(await store.getInstallation("i_1"))!, installerId: "user_owner" });
    const rel = await jobs.handleEvent({ installationId: "i_1", event: { type: "pull_request.comment.created", payload: { pullRequest: { number: "8", repository: { name: "demo", owner: { slug: "luigi" } } }, comment: { body: "/shiplog release v1.0.0", author: { user: { id: "user_owner" } } } } } }, "d3"); // real Origin shape: repo only under pullRequest
    expect(rel?.kind).toBe("release"); expect(rel?.status).toBe("done");
    const md = await store.getChangelog("luigi/demo");
    expect(md).toMatch(/## \[1\.0\.0\] - \d{4}-\d{2}-\d{2}\n\nThis release adds dark mode\./);
    vi.unstubAllGlobals();
  });

  it("ignores Shiplog's own comments", async () => {
    const { jobs } = await setup({});
    const r = await jobs.handleEvent({ installationId: "i_1", event: { type: "pull_request.comment.created", payload: { pullRequest: { number: "8", repository: { name: "demo", owner: { slug: "luigi" } } }, comment: { body: "**Shiplog** notes\n/shiplog release v1.0.0" } } } }, "d9");
    expect(r).toBeNull();
  });

  it("with a stored key → launches a Cursor agent", async () => {
    const { store, jobs } = await setup({});
    const { seal, parseMasterKey } = await import("@/lib/crypto");
    await store.putKey({ ...seal("key_abcdefghijklmnop", parseMasterKey(master), "i_1"), installationId: "i_1", last4: "mnop", createdAt: "" });
    const f = vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes("/runs/")
      ? { status: "FINISHED", git: { branches: [{ repoUrl: "r", prUrl: "https://cursor.com/codebase/luigi/demo/pull/99" }] } }
      : { agent: { id: "bc-123" }, run: { id: "run-1" } })));
    vi.stubGlobal("fetch", f);
    const job = await jobs.handleEvent(merged("9", "feat: x"), "d4");
    expect(job?.mode).toBe("cursor"); expect(job?.agentId).toBe("bc-123"); expect(job?.status).toBe("running");
    const sent = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(sent.autoCreatePR).toBe(true); expect(sent.repos[0].url).toBe("https://cursor.com/codebase/luigi/demo"); expect(sent.prompt.text).toContain("CHANGELOG.md");
    expect(await jobs.pollAgents()).toBe(1);
    const [done] = await store.listJobs();
    expect(done.status).toBe("done"); expect(done.prOpened).toContain("/pull/99");
    expect((await store.listOutbox())[0].body).toContain("/pull/99");
    vi.unstubAllGlobals();
  });

  it("uninstall → disconnected, key deleted, later webhooks ignored", async () => {
    const { store, jobs } = await setup({});
    await store.upsertInstallation({ id: "i_1", namespace: "luigi", status: "active", createdAt: "" });
    await store.putKey({ ciphertext: "x", iv: "x", tag: "x", keyVersion: 1, installationId: "i_1", last4: "abcd", createdAt: "" });
    await jobs.handleEvent({ installationId: "i_1", event: { type: "installation.deleted", payload: {} } }, "d5");
    expect((await store.getInstallation("i_1"))?.status).toBe("disconnected");
    expect(await store.getKey("i_1")).toBeNull();
    expect(await jobs.handleEvent(merged("10", "feat: y"), "d6")).toBeNull();
    expect(await store.listOutbox()).toHaveLength(0);
  });

  it("BYOK flag off → fallback even with a stored key", async () => {
    const { store, jobs } = await setup({ SHIPLOG_BYOK_ENABLED: "false" });
    await store.putKey({ ciphertext: "x", iv: "x", tag: "x", keyVersion: 1, installationId: "i_1", last4: "abcd", createdAt: "" });
    expect((await jobs.handleEvent(merged("11", "fix: z"), "d7"))?.mode).toBe("fallback");
  });

  it("tag push on repository.pushed → release job; branch push ignored", async () => {
    const { jobs } = await setup({});
    const push = (ref: string) => ({ installationId: "i_1", event: { type: "repository.pushed", payload: { repository: { name: "demo", owner: { slug: "luigi" } }, refUpdates: [{ ref, before: "0".repeat(40), after: "a".repeat(40), created: true }] } } });
    expect((await jobs.handleEvent(push("refs/tags/v2.0.0"), "t1"))?.kind).toBe("release");
    expect(await jobs.handleEvent(push("refs/heads/main"), "t2")).toBeNull();
  });

  it("dedupes delivery ids", async () => {
    const { store } = await setup({});
    expect(await store.claimDelivery("x")).toBe(true); expect(await store.claimDelivery("x")).toBe(false);
  });
});

describe(".shiplog.yml in jobs", () => {
  const pem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  /** Fake Origin: serves .shiplog.yml from the contents API and accepts tokens and comments. */
  const origin = (yml: string | null) => vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/access_tokens")) return new Response(JSON.stringify({ token: "tok" }));
    if (u.includes("/contents")) return yml === null ? new Response("{}", { status: 404 }) : new Response(JSON.stringify({ type: "file", encoding: "base64", content: Buffer.from(yml).toString("base64") }));
    return new Response("{}");
  });
  const env_ = { ORIGIN_APP_ID: "app_1", ORIGIN_APP_PRIVATE_KEY: pem };

  it("skips a PR excluded by label without commenting", async () => {
    const { store, jobs } = await setup(env_);
    vi.stubGlobal("fetch", origin("exclude:\n  labels: [skip-changelog]"));
    const ev = merged("12", "feat: x"); (ev.event.payload.pullRequest as any).labels = [{ name: "skip-changelog" }];
    const job = await jobs.handleEvent(ev, "c1");
    expect(job?.status).toBe("ignored"); expect(job?.result).toContain("skip-changelog");
    expect(await store.listOutbox()).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("skips bot authors listed in exclude.authors", async () => {
    const { jobs } = await setup(env_);
    vi.stubGlobal("fetch", origin("exclude:\n  authors: [dependabot]"));
    const ev = merged("13", "chore(deps): bump"); (ev.event.payload.pullRequest as any).author = { user: { slug: "dependabot" } };
    expect((await jobs.handleEvent(ev, "c2"))?.status).toBe("ignored");
    vi.unstubAllGlobals();
  });

  it("mode: prompt never launches an agent, and the prompt honors path, language and sections", async () => {
    const { store, jobs } = await setup(env_);
    const { seal, parseMasterKey } = await import("@/lib/crypto");
    await store.putKey({ ...seal("key_abcdefghijklmnop", parseMasterKey(master), "i_1"), installationId: "i_1", last4: "mnop", createdAt: "" });
    const f = origin("mode: prompt\nlanguage: es\nchangelog: docs/CHANGES.md\nsections:\n  deps: Security");
    vi.stubGlobal("fetch", f);
    const job = await jobs.handleEvent(merged("14", "deps: bump openssl"), "c3");
    expect(job?.mode).toBe("fallback");
    expect(f.mock.calls.some((c: any) => String(c[0]).includes("/v1/agents"))).toBe(false);
    expect(job?.result).toContain("docs/CHANGES.md"); expect(job?.result).toContain("### Security"); expect(job?.result).toContain("es");
    vi.unstubAllGlobals();
  });

  it("missing .shiplog.yml uses defaults", async () => {
    const { jobs } = await setup(env_);
    vi.stubGlobal("fetch", origin(null));
    const job = await jobs.handleEvent(merged("15", "fix: y"), "c4");
    expect(job?.status).toBe("done"); expect(job?.result).toContain("CHANGELOG.md");
    vi.unstubAllGlobals();
  });
});

describe("PR commands", () => {
  const pem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const env_ = { ORIGIN_APP_ID: "app_1", ORIGIN_APP_PRIVATE_KEY: pem };
  const owner = { user: { id: "user_owner" } };
  const stranger = { user: { id: "user_x" } };
  const origin = (comments: any[]) => vi.fn(async (url: string, init?: any) => {
    const u = String(url);
    if (u.includes("/access_tokens")) return new Response(JSON.stringify({ token: "tok" }));
    if (u.includes("/contents")) return new Response("{}", { status: 404 });
    if (u.includes("/permission")) return new Response(JSON.stringify({ permission: "read" }));
    if (u.includes("/comments") && init?.method !== "POST") return new Response(JSON.stringify({ comments, nextPageToken: "" }));
    return new Response("{}");
  });
  const withOwner = async (store: any) => store.upsertInstallation({ id: "i_1", namespace: "luigi", status: "active", createdAt: "", installerId: "user_owner" });
  const comment = (body: string, author: any) => ({ installationId: "i_1", event: { type: "pull_request.comment.created", payload: { pullRequest: { number: "20", repository: { name: "demo", owner: { slug: "luigi" } } }, comment: { body, author } } } });

  it("/shiplog skip from the installer → merge is ignored", async () => {
    const { store, jobs } = await setup(env_); await withOwner(store);
    vi.stubGlobal("fetch", origin([{ body: "/shiplog skip", author: owner }]));
    const job = await jobs.handleEvent(merged("20", "feat: x"), "p1");
    expect(job?.status).toBe("ignored"); expect(job?.result).toContain("/shiplog skip");
    vi.unstubAllGlobals();
  });

  it("commands from users without write access are not honored", async () => {
    const { store, jobs } = await setup(env_); await withOwner(store);
    vi.stubGlobal("fetch", origin([{ body: "/shiplog skip", author: stranger }]));
    expect((await jobs.handleEvent(merged("20", "feat: x"), "p2"))?.status).toBe("done");
    vi.unstubAllGlobals();
  });

  it("/shiplog entry overrides the bullet text; the latest command wins", async () => {
    const { store, jobs } = await setup(env_); await withOwner(store);
    vi.stubGlobal("fetch", origin([{ body: "/shiplog skip", author: owner }, { body: '/shiplog entry "Faster cold starts"', author: owner }]));
    const job = await jobs.handleEvent(merged("20", "perf: cache"), "p3");
    expect(job?.status).toBe("done"); expect(job?.result).toContain("Faster cold starts");
    vi.unstubAllGlobals();
  });

  it("neon mode writes the entry text without calling the model", async () => {
    const { store, jobs } = await setup({ ...env_, SHIPLOG_LLM_PROVIDER: "neon", NEON_AI_GATEWAY_BASE_URL: "https://gw.test", NEON_AI_GATEWAY_TOKEN: "t" });
    await withOwner(store);
    const f = origin([{ body: '/shiplog entry "Faster cold starts"', author: owner }]);
    vi.stubGlobal("fetch", f);
    await jobs.handleEvent(merged("20", "perf: cache"), "p4");
    expect(await store.getChangelog("luigi/demo")).toContain("### Changed\n\n- Faster cold starts (#20)");
    expect(f.mock.calls.some((c: any) => String(c[0]).includes("gw.test"))).toBe(false);
    vi.unstubAllGlobals();
  });

  it("acknowledges an authorized command and refuses others", async () => {
    const { store, jobs } = await setup(env_); await withOwner(store);
    vi.stubGlobal("fetch", origin([]));
    expect(await jobs.handleEvent(comment("/shiplog skip", owner), "p5")).toBeNull();
    expect(await jobs.handleEvent(comment('/shiplog entry "x"', stranger), "p6")).toBeNull();
    const bodies = (await store.listOutbox()).map((o: any) => o.body);
    expect(bodies).toHaveLength(2);
    expect(bodies.some((b: string) => b.includes("will skip the changelog"))).toBe(true);
    expect(bodies.some((b: string) => b.includes("`/shiplog entry` can only be run") && b.includes("write or admin"))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("no-changelog label is honored", async () => {
    const { jobs } = await setup({});
    const ev = merged("21", "feat: x"); (ev.event.payload.pullRequest as any).labels = [{ name: "no-changelog" }];
    expect((await jobs.handleEvent(ev, "p7"))?.status).toBe("ignored");
  });
});

describe("breaking changes in jobs", () => {
  it("marks a breaking entry and suggests a major bump on release", async () => {
    const { store, jobs } = await setup({ SHIPLOG_LLM_PROVIDER: "neon", NEON_AI_GATEWAY_BASE_URL: "https://gw.test", NEON_AI_GATEWAY_TOKEN: "t" });
    const replies = [JSON.stringify({ section: "Changed", bullet: "Config moved to .shiplog.yml" }), "Big release."];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: replies.shift() } }] }))));
    await store.putChangelog("luigi/demo", "# Changelog\n\n## [Unreleased]\n\n## [1.4.2] - 2026-01-01\n\n### Fixed\n\n- x\n");
    await jobs.handleEvent(merged("30", "feat!: move config"), "b1");
    expect(await store.getChangelog("luigi/demo")).toContain("- **BREAKING:** Config moved to .shiplog.yml (#30)");
    await store.upsertInstallation({ ...(await store.getInstallation("i_1"))!, installerId: "u" });
    await jobs.handleEvent({ installationId: "i_1", event: { type: "pull_request.comment.created", payload: { pullRequest: { number: "30", repository: { name: "demo", owner: { slug: "luigi" } } }, comment: { body: "/shiplog release v1.5.0", author: { user: { id: "u" } } } } } }, "b2");
    const rel = (await store.listOutbox()).find((o: any) => o.body.includes("release notes"))!;
    expect(rel.body).toContain("Suggested bump: **major** (1.4.2 to 2.0.0)"); expect(rel.body).toContain("You asked for v1.5.0");
    vi.unstubAllGlobals();
  });

  it("tells the agent to mark breaking entries", async () => {
    const { jobs } = await setup({});
    const job = await jobs.handleEvent(merged("31", "feat(api)!: rename endpoint"), "b3");
    expect(job?.result).toContain("**BREAKING:**");
  });
});

describe("batch mode", () => {
  const pem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const env_ = { ORIGIN_APP_ID: "app_1", ORIGIN_APP_PRIVATE_KEY: pem };
  const fake = (yml: string) => vi.fn(async (url: string, init?: any) => {
    const u = String(url);
    if (u.includes("/access_tokens")) return new Response(JSON.stringify({ token: "tok" }));
    if (u.includes("/contents")) return new Response(JSON.stringify({ type: "file", content: Buffer.from(yml).toString("base64") }));
    if (u.includes("/comments") && init?.method !== "POST") return new Response(JSON.stringify({ comments: [] }));
    if (u.endsWith("/v1/agents")) return new Response(JSON.stringify({ agent: { id: "bc-batch" }, run: { id: "run-b" } }));
    return new Response("{}");
  });
  const launches = (f: any) => f.mock.calls.filter((c: any) => String(c[0]).endsWith("/v1/agents"));
  async function withKey(store: any) {
    const { seal, parseMasterKey } = await import("@/lib/crypto");
    await store.upsertInstallation({ id: "i_1", namespace: "luigi", status: "active", createdAt: "", installerId: "u" });
    await store.putKey({ ...seal("key_abcdefghijklmnop", parseMasterKey(master), "i_1"), installationId: "i_1", last4: "mnop", createdAt: "" });
  }
  const release = (v: string) => ({ installationId: "i_1", event: { type: "pull_request.comment.created", payload: { pullRequest: { number: "42", repository: { name: "demo", owner: { slug: "luigi" } } }, comment: { body: `/shiplog release ${v}`, author: { user: { id: "u" } } } } } });

  it("batch: release queues merges and launches one agent at release time", async () => {
    const { store, jobs } = await setup(env_); await withKey(store);
    const f = fake("batch: release"); vi.stubGlobal("fetch", f);
    expect((await jobs.handleEvent(merged("40", "feat: a"), "q1"))?.status).toBe("queued");
    expect((await jobs.handleEvent(merged("41", "fix: b"), "q2"))?.status).toBe("queued");
    expect(launches(f)).toHaveLength(0);
    const rel = await jobs.handleEvent(release("v1.1.0"), "q3");
    expect(launches(f)).toHaveLength(1);
    const prompt = JSON.parse(launches(f)[0][1].body).prompt.text as string;
    expect(prompt).toContain(`number="40"`); expect(prompt).toContain(`number="41"`); expect(prompt).toContain("1.1.0");
    expect(rel?.agentId).toBe("bc-batch");
    expect((await store.listJobs()).filter((j: any) => j.status === "queued")).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("batch: daily is flushed by the cron with one agent per repo", async () => {
    const { store, jobs } = await setup(env_); await withKey(store);
    const f = fake("batch: daily"); vi.stubGlobal("fetch", f);
    await jobs.handleEvent(merged("50", "feat: a"), "r1");
    await jobs.handleEvent(merged("51", "feat: b"), "r2");
    expect(launches(f)).toHaveLength(0);
    expect(await jobs.flushBatches()).toBe(1);
    expect(launches(f)).toHaveLength(1);
    expect(await jobs.flushBatches()).toBe(0);
    vi.unstubAllGlobals();
  });

  it("without a key, batch config still posts the per-PR prompt (nothing to bill)", async () => {
    const { jobs } = await setup(env_);
    vi.stubGlobal("fetch", fake("batch: daily"));
    expect((await jobs.handleEvent(merged("52", "feat: a"), "r3"))?.mode).toBe("fallback");
    vi.unstubAllGlobals();
  });

  it("counts agent runs per installation", async () => {
    const { store, jobs } = await setup({});
    const base = { deliveryId: "d", installationId: "i_1", repo: "luigi/demo", prNumber: "", prUrl: "", kind: "changelog" as const, status: "done" as const };
    const now = new Date().toISOString();
    await store.putJob({ ...base, id: "a", mode: "cursor", agentId: "bc-1", createdAt: now });
    await store.putJob({ ...base, id: "b", mode: "cursor", agentId: "bc-2", createdAt: now });
    await store.putJob({ ...base, id: "c", mode: "fallback", createdAt: now });
    await store.putJob({ ...base, id: "d", mode: "cursor", agentId: "bc-0", createdAt: "2020-01-01T00:00:00Z" });
    expect(jobs.agentRunStats(await store.listJobs("i_1"), new Date())).toEqual({ last30Days: 2, total: 3 });
  });
});

describe("llm content shapes", () => {
  it("accepts array-of-blocks content", async () => {
    vi.resetModules();
    Object.assign(process.env, { NEON_AI_GATEWAY_BASE_URL: "https://gw.test", NEON_AI_GATEWAY_TOKEN: "t" });
    const { chat } = await import("@/lib/llm");
    const f = (async () => new Response(JSON.stringify({ choices: [{ message: { content: [{ type: "text", text: "hi " }, { type: "text", text: "there" }] } }] }))) as any;
    expect(await chat("s", "u", f)).toBe("hi there");
  });
});

describe("ping", () => {
  it("ignores Origin ping deliveries (no installation)", async () => {
    vi.resetModules();
    const { MemoryStore } = await import("@/lib/store/memory");
    const storeMod = await import("@/lib/store"); const store = new MemoryStore(); storeMod.setStore(store);
    const { handleEvent } = await import("@/lib/jobs");
    expect(await handleEvent({ installationId: undefined as any, event: { type: "ping", payload: {} } }, "p1")).toBeNull();
    expect(await store.listInstallations()).toHaveLength(0);
  });
});
