import { randomUUID } from "node:crypto";
import { BlobNotFoundError, del, get, head, list, put } from "@vercel/blob";
import { StoreAuthError } from "./store-auth-error";
import { pickNewestActiveInstallation } from "../installation-namespace";
import type { Installation, Job, Outbox, Store, UserKey } from "./types";

/**
 * Vercel Blob store (private access, free on Hobby). One JSON document per record.
 * Private store = no public URLs; only server code holding BLOB_READ_WRITE_TOKEN (or OIDC) can read/write,
 * which is the equivalent of "RLS on, service role only". API keys are still AES-256-GCM sealed before storage.
 * Delivery dedupe is atomic: put() without allowOverwrite fails if the pathname already exists.
 */
const P = "shiplog/v1";
const enc = (s: string) => encodeURIComponent(s).replace(/%/g, "_");
const dec = (s: string) => decodeURIComponent(s.replace(/_/g, "%"));
function changelogKeyFromPathname(pathname: string): string | null {
  const prefix = `${P}/changelogs/`;
  if (!pathname.startsWith(prefix) || !pathname.endsWith(".json")) return null;
  return dec(pathname.slice(prefix.length, -".json".length));
}
const opts = { access: "private" as const, contentType: "application/json", addRandomSuffix: false, cacheControlMaxAge: 60 };

function isBlobGet403(err: unknown): boolean {
  return err instanceof Error && /Failed to fetch blob:\s*403\b/i.test(err.message);
}

function pathnamePrefix(pathname: string): string {
  const slash = pathname.lastIndexOf("/");
  return slash >= 0 ? `${pathname.slice(0, slash + 1)}` : pathname;
}

function logBlobForbidden(pathname: string, kind: "missing" | "auth") {
  console.log(JSON.stringify({ event: "blob_read_forbidden", pathnamePrefix: pathnamePrefix(pathname), kind }));
}

async function readJson<T>(pathname: string): Promise<T | null> {
  let r: Awaited<ReturnType<typeof get>>;
  try {
    r = await get(pathname, { access: "private", useCache: false });
  } catch (err) {
    if (!isBlobGet403(err)) throw err;
    try {
      await head(pathname);
      logBlobForbidden(pathname, "auth");
      throw new StoreAuthError(pathnamePrefix(pathname));
    } catch (headErr) {
      if (headErr instanceof StoreAuthError) throw headErr;
      if (headErr instanceof BlobNotFoundError) {
        logBlobForbidden(pathname, "missing");
        return null;
      }
      if (isBlobGet403(headErr)) {
        logBlobForbidden(pathname, "auth");
        throw new StoreAuthError(pathnamePrefix(pathname));
      }
      throw headErr;
    }
  }
  if (!r || !r.stream) return null;
  return JSON.parse(await new Response(r.stream as ReadableStream).text()) as T;
}
const write = (pathname: string, data: unknown) => put(pathname, JSON.stringify(data), { ...opts, allowOverwrite: true });

async function readAll<T>(prefix: string, limit = 100): Promise<T[]> {
  const { blobs } = await list({ prefix, limit: 1000 });
  const newest = blobs.sort((a, b) => a.pathname.localeCompare(b.pathname)).slice(0, limit); // rev() prefix: ascending = newest first
  return (await Promise.all(newest.map((b) => readJson<T>(b.pathname)))).filter(Boolean) as T[];
}
// Reverse-chronological sortable prefix so newest-first listing is a string sort.
const rev = (iso: string) => String(9_999_999_999_999 - new Date(iso || Date.now()).getTime()).padStart(13, "0");
const CRON_LOCK = `${P}/locks/cron-poll.json`;
type CronPollLock = { expiresAt: string; token: string };
type NamespaceIndex = { installationId: string; createdAt: string };
const nsIndexPath = (namespace: string) => `${P}/ns/${enc(namespace)}.json`;

export class BlobStore implements Store {
  private cronPollToken: string | null = null;
  async claimDelivery(id: string) {
    try { await put(`${P}/deliveries/${enc(id)}.json`, "{}", { ...opts, allowOverwrite: false }); return true; }
    catch (e) { if (/already exists|precondition|409/i.test(String((e as Error).message))) return false; throw e; }
  }
  async upsertInstallation(i: Installation) {
    const prev = await this.getInstallation(i.id);
    await write(`${P}/installations/${enc(i.id)}.json`, { ...prev, ...i });
    await this.syncNamespaceIndex({ ...prev, ...i } as Installation);
  }
  getInstallation(id: string) { return readJson<Installation>(`${P}/installations/${enc(id)}.json`); }
  private async syncNamespaceIndex(i: Installation) {
    const path = nsIndexPath(i.namespace);
    if (i.status !== "active") {
      const cur = await readJson<NamespaceIndex>(path);
      if (cur?.installationId === i.id) await del(path);
      return;
    }
    const cur = await readJson<NamespaceIndex>(path);
    if (!cur) {
      await write(path, { installationId: i.id, createdAt: i.createdAt });
      return;
    }
    if (cur.installationId === i.id) {
      await write(path, { installationId: i.id, createdAt: i.createdAt });
      return;
    }
    const indexed = await this.getInstallation(cur.installationId);
    const indexedCreated = indexed?.createdAt ?? cur.createdAt;
    if (i.createdAt.localeCompare(indexedCreated) >= 0) {
      await write(path, { installationId: i.id, createdAt: i.createdAt });
    }
  }
  async getActiveInstallationByNamespace(namespace: string) {
    const idx = await readJson<NamespaceIndex>(nsIndexPath(namespace));
    if (idx) {
      const inst = await this.getInstallation(idx.installationId);
      if (inst?.status === "active" && inst.namespace === namespace) return inst;
    }
    const active = pickNewestActiveInstallation(await this.listInstallations(), namespace);
    if (active) await write(nsIndexPath(namespace), { installationId: active.id, createdAt: active.createdAt });
    return active;
  }
  async backfillNamespaceIndex() {
    const installs = await this.listInstallations();
    const byNs = new Map<string, Installation>();
    for (const i of installs) {
      if (i.status !== "active") continue;
      const prev = byNs.get(i.namespace);
      if (!prev || i.createdAt.localeCompare(prev.createdAt) > 0) byNs.set(i.namespace, i);
    }
    let written = 0;
    for (const [namespace, inst] of byNs) {
      await write(nsIndexPath(namespace), { installationId: inst.id, createdAt: inst.createdAt });
      written++;
    }
    return written;
  }
  async listInstallations() { return (await readAll<Installation>(`${P}/installations/`)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async putKey(k: UserKey) { await write(`${P}/keys/${enc(k.installationId)}.json`, k); }
  getKey(id: string) { return readJson<UserKey>(`${P}/keys/${enc(id)}.json`); }
  // del() is a no-op for missing blobs; real failures must surface.
  async deleteKey(id: string) { await del(`${P}/keys/${enc(id)}.json`); }
  async putJob(j: Job) {
    // Index by installation for scoped listing; job id stays stable so updates overwrite.
    await write(`${P}/jobs/${enc(j.installationId)}/${rev(j.createdAt)}-${j.id}.json`, j);
  }
  async listJobs(id?: string) { return readAll<Job>(id ? `${P}/jobs/${enc(id)}/` : `${P}/jobs/`); }
  async putOutbox(o: Outbox) { await write(`${P}/outbox/${enc(o.installationId)}/${rev(o.createdAt)}-${o.id}.json`, o); }
  async listOutbox(id?: string) { return readAll<Outbox>(id ? `${P}/outbox/${enc(id)}/` : `${P}/outbox/`, 50); }
  async getChangelog(repo: string) { return (await readJson<{ markdown: string }>(`${P}/changelogs/${enc(repo)}.json`))?.markdown ?? null; }
  async putChangelog(repo: string, md: string) { await write(`${P}/changelogs/${enc(repo)}.json`, { markdown: md, updatedAt: new Date().toISOString() }); }
  async listChangelogKeysForRepo(repoSlug: string) {
    const { blobs } = await list({ prefix: `${P}/changelogs/`, limit: 1000 });
    const keys: string[] = [];
    for (const b of blobs) {
      const key = changelogKeyFromPathname(b.pathname);
      if (!key) continue;
      if (key === repoSlug || key.startsWith(`${repoSlug}::`)) keys.push(key);
    }
    return keys.sort();
  }
  async acquireCronPollLock(ttlMs: number) {
    const now = Date.now();
    const cur = await readJson<CronPollLock>(CRON_LOCK);
    if (cur && Date.parse(cur.expiresAt) > now) return false;
    const lock: CronPollLock = { expiresAt: new Date(now + ttlMs).toISOString(), token: randomUUID() };
    if (!cur) {
      try {
        await put(CRON_LOCK, JSON.stringify(lock), { ...opts, allowOverwrite: false });
        this.cronPollToken = lock.token;
        return true;
      } catch (e) {
        if (!/already exists|precondition|409/i.test(String((e as Error).message))) throw e;
      }
    }
    const again = await readJson<CronPollLock>(CRON_LOCK);
    if (again && Date.parse(again.expiresAt) > now) return false;
    await write(CRON_LOCK, lock);
    this.cronPollToken = lock.token;
    return true;
  }
  async releaseCronPollLock() {
    if (!this.cronPollToken) return;
    const cur = await readJson<CronPollLock>(CRON_LOCK);
    if (cur?.token === this.cronPollToken) await del(CRON_LOCK);
    this.cronPollToken = null;
  }
  async getNotifyWebhooks(id: string) { return (await this.getInstallation(id))?.notifyWebhooks ?? []; }
  async putNotifyWebhooks(id: string, webhooks: string[]) {
    const prev = await this.getInstallation(id);
    if (!prev) throw new Error("unknown installation");
    await this.upsertInstallation({ ...prev, notifyWebhooks: webhooks });
  }
}
