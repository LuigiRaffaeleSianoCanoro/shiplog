import { del, get, list, put } from "@vercel/blob";
import type { Installation, Job, Outbox, Store, UserKey } from "./types";

/**
 * Vercel Blob store (private access, free on Hobby). One JSON document per record.
 * Private store = no public URLs; only server code holding BLOB_READ_WRITE_TOKEN (or OIDC) can read/write,
 * which is the equivalent of "RLS on, service role only". API keys are still AES-256-GCM sealed before storage.
 * Delivery dedupe is atomic: put() without allowOverwrite fails if the pathname already exists.
 */
const P = "shiplog/v1";
const enc = (s: string) => encodeURIComponent(s).replace(/%/g, "_");
const opts = { access: "private" as const, contentType: "application/json", addRandomSuffix: false, cacheControlMaxAge: 60 };

async function readJson<T>(pathname: string): Promise<T | null> {
  const r = await get(pathname, { access: "private", useCache: false });
  if (!r || !r.stream) return null;
  return JSON.parse(await new Response(r.stream as ReadableStream).text()) as T;
}
const write = (pathname: string, data: unknown) => put(pathname, JSON.stringify(data), { ...opts, allowOverwrite: true });

async function readAll<T>(prefix: string, limit = 100): Promise<T[]> {
  const { blobs } = await list({ prefix, limit: 1000 });
  const newest = blobs.sort((a, b) => b.pathname.localeCompare(a.pathname)).slice(0, limit);
  return (await Promise.all(newest.map((b) => readJson<T>(b.pathname)))).filter(Boolean) as T[];
}
// Reverse-chronological sortable prefix so newest-first listing is a string sort.
const rev = (iso: string) => String(9_999_999_999_999 - new Date(iso || Date.now()).getTime()).padStart(13, "0");

export class BlobStore implements Store {
  async claimDelivery(id: string) {
    try { await put(`${P}/deliveries/${enc(id)}.json`, "{}", { ...opts, allowOverwrite: false }); return true; }
    catch (e) { if (/already exists|precondition|409/i.test(String((e as Error).message))) return false; throw e; }
  }
  async upsertInstallation(i: Installation) {
    const prev = await this.getInstallation(i.id);
    await write(`${P}/installations/${enc(i.id)}.json`, { ...prev, ...i });
  }
  getInstallation(id: string) { return readJson<Installation>(`${P}/installations/${enc(id)}.json`); }
  async listInstallations() { return (await readAll<Installation>(`${P}/installations/`)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async putKey(k: UserKey) { await write(`${P}/keys/${enc(k.installationId)}.json`, k); }
  getKey(id: string) { return readJson<UserKey>(`${P}/keys/${enc(id)}.json`); }
  async deleteKey(id: string) { await del(`${P}/keys/${enc(id)}.json`).catch(() => undefined); }
  async putJob(j: Job) {
    // Index by installation for scoped listing; job id stays stable so updates overwrite.
    await write(`${P}/jobs/${enc(j.installationId)}/${rev(j.createdAt)}-${j.id}.json`, j);
  }
  async listJobs(id?: string) { return readAll<Job>(id ? `${P}/jobs/${enc(id)}/` : `${P}/jobs/`); }
  async putOutbox(o: Outbox) { await write(`${P}/outbox/${enc(o.installationId)}/${rev(o.createdAt)}-${o.id}.json`, o); }
  async listOutbox(id?: string) { return readAll<Outbox>(id ? `${P}/outbox/${enc(id)}/` : `${P}/outbox/`, 50); }
  async getChangelog(repo: string) { return (await readJson<{ markdown: string }>(`${P}/changelogs/${enc(repo)}.json`))?.markdown ?? null; }
  async putChangelog(repo: string, md: string) { await write(`${P}/changelogs/${enc(repo)}.json`, { markdown: md, updatedAt: new Date().toISOString() }); }
}
