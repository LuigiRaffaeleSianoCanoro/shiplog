import { describe, expect, it } from "vitest";
import { EMPTY, addEntry, cutRelease } from "@/lib/changelog";
import {
  buildJsonFeed,
  buildPublicMeta,
  buildRssFeed,
  changelogPageUrl,
  parseChangelogDocument,
  publicRepoSlug,
  resolvePublicChangelog,
} from "@/lib/public-changelog";
import { MemoryStore } from "@/lib/store/memory";

describe("parseChangelogDocument", () => {
  it("parses released sections and unreleased", () => {
    let md = addEntry(null, "Added", "Widgets (#1)");
    md = cutRelease(md, "1.0.0", "2026-01-15", "First release.");
    md = addEntry(md, "Fixed", "Crash (#2)");
    const doc = parseChangelogDocument(md);
    expect(doc.releases.map((r) => r.version)).toEqual(["Unreleased", "1.0.0"]);
    expect(doc.releases[1].date).toBe("2026-01-15");
    expect(doc.releases[1].summary).toContain("First release");
    expect(doc.releases[1].sections.Added).toEqual(["Widgets (#1)"]);
    expect(doc.releases[0].sections.Fixed).toEqual(["Crash (#2)"]);
  });

  it("handles empty markdown", () => {
    const doc = parseChangelogDocument(EMPTY);
    expect(doc.releases).toHaveLength(1);
    expect(doc.releases[0].version).toBe("Unreleased");
  });
});

describe("feeds", () => {
  const meta = {
    title: "demo changelog",
    repoSlug: "acme/demo",
    pageUrl: "https://shiplog.example/acme/demo",
    updatedAt: "2026-10-15T12:00:00.000Z",
  };
  const doc = parseChangelogDocument(cutRelease(addEntry(null, "Added", "Ship it (#1)"), "0.1.0", "2026-10-01"));

  it("builds JSON with releases", () => {
    const j = buildJsonFeed(doc, meta);
    expect(j.repo).toBe("acme/demo");
    expect(j.releases[0].version).toBe("0.1.0");
    expect(j.feeds.rss).toContain("/feed.xml");
    expect(j.feeds.json).toContain("/feed.json");
  });

  it("builds RSS 2.0 with items per release", () => {
    const xml = buildRssFeed(doc, meta);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain("<rss");
    expect(xml).toContain("<title>demo changelog</title>");
    expect(xml).toContain("0.1.0");
    expect(xml).not.toContain("|");
  });
});

describe("resolvePublicChangelog", () => {
  it("returns changelog for an active namespace", async () => {
    const store = new MemoryStore();
    await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" });
    await store.putChangelog("acme/demo", addEntry(null, "Added", "Launch (#1)"));
    const r = await resolvePublicChangelog("acme", "demo", store);
    expect(r?.repoSlug).toBe("acme/demo");
    expect(r?.markdown).toContain("Launch");
  });

  it("404s disconnected installs and slug mismatches", async () => {
    const store = new MemoryStore();
    await store.upsertInstallation({ id: "i1", namespace: "acme", status: "disconnected", createdAt: "2026-01-01" });
    expect(await resolvePublicChangelog("acme", "demo", store)).toBeNull();
    await store.upsertInstallation({ id: "i2", namespace: "acme", status: "active", createdAt: "2026-01-02" });
    expect(await resolvePublicChangelog("other", "demo", store)).toBeNull();
  });

  it("validates slug segments", () => {
    expect(publicRepoSlug("acme", "demo")).toBe("acme/demo");
    expect(publicRepoSlug("acme", "../etc")).toBeNull();
    expect(publicRepoSlug("", "demo")).toBeNull();
  });
});

describe("routing", () => {
  it("builds canonical page and feed URLs", () => {
    expect(changelogPageUrl("https://shiplog.help/", "ns", "repo")).toBe("https://shiplog.help/ns/repo");
    const meta = buildPublicMeta("https://shiplog.help", "ns", "repo", "2026-10-15T00:00:00.000Z");
    expect(meta.pageUrl).toBe("https://shiplog.help/ns/repo");
    const json = buildJsonFeed(parseChangelogDocument(EMPTY), meta);
    expect(json.feeds.rss).toBe("https://shiplog.help/ns/repo/feed.xml");
  });
});
