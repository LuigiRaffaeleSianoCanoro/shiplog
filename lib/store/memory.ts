import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Installation, Job, Outbox, Store, UserKey } from "./types";

interface Data { deliveries: string[]; installations: Record<string, Installation>; keys: Record<string, UserKey>; jobs: Job[]; outbox: Outbox[]; changelogs: Record<string, string> }
const empty = (): Data => ({ deliveries: [], installations: {}, keys: {}, jobs: [], outbox: [], changelogs: {} });

/** Dev/test store. With a file path it persists JSON to disk (local dev only; not for serverless). */
export class MemoryStore implements Store {
  private data: Data = empty();
  private loaded = false;
  private cronPollLock: { expiresAt: number; token: string } | null = null;
  private cronPollToken: string | null = null;
  constructor(private file?: string) {}
  private async load() {
    if (this.loaded) return; this.loaded = true;
    if (!this.file) return;
    try { this.data = { ...empty(), ...JSON.parse(await fs.readFile(this.file, "utf8")) }; } catch { /* first run */ }
  }
  private async save() {
    if (!this.file) return;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.data, null, 2));
  }
  private async tx<T>(fn: (d: Data) => T): Promise<T> { await this.load(); const r = fn(this.data); await this.save(); return r; }
  claimDelivery(id: string) { return this.tx((d) => (d.deliveries.includes(id) ? false : (d.deliveries.push(id), true))); }
  upsertInstallation(i: Installation) { return this.tx((d) => { d.installations[i.id] = { ...d.installations[i.id], ...i }; }); }
  getInstallation(id: string) { return this.tx((d) => d.installations[id] ?? null); }
  listInstallations() { return this.tx((d) => Object.values(d.installations)); }
  putKey(k: UserKey) { return this.tx((d) => { d.keys[k.installationId] = k; }); }
  getKey(id: string) { return this.tx((d) => d.keys[id] ?? null); }
  deleteKey(id: string) { return this.tx((d) => { delete d.keys[id]; }); }
  putJob(j: Job) { return this.tx((d) => { const i = d.jobs.findIndex((x) => x.id === j.id); if (i >= 0) d.jobs[i] = j; else d.jobs.unshift(j); }); }
  listJobs(id?: string) { return this.tx((d) => d.jobs.filter((j) => !id || j.installationId === id)); }
  putOutbox(o: Outbox) { return this.tx((d) => { d.outbox.unshift(o); }); }
  listOutbox(id?: string) { return this.tx((d) => d.outbox.filter((o) => !id || o.installationId === id)); }
  getChangelog(repo: string) { return this.tx((d) => d.changelogs[repo] ?? null); }
  putChangelog(repo: string, md: string) { return this.tx((d) => { d.changelogs[repo] = md; }); }
  async acquireCronPollLock(ttlMs: number) {
    const now = Date.now();
    if (this.cronPollLock && this.cronPollLock.expiresAt > now) return false;
    const token = randomUUID();
    this.cronPollLock = { expiresAt: now + ttlMs, token };
    this.cronPollToken = token;
    return true;
  }
  async releaseCronPollLock() {
    if (this.cronPollToken && this.cronPollLock?.token === this.cronPollToken) {
      this.cronPollLock = null;
      this.cronPollToken = null;
    }
  }
  getNotifyWebhooks(id: string) { return this.tx((d) => d.installations[id]?.notifyWebhooks ?? []); }
  putNotifyWebhooks(id: string, webhooks: string[]) {
    return this.tx((d) => {
      const prev = d.installations[id];
      if (!prev) throw new Error("unknown installation");
      d.installations[id] = { ...prev, notifyWebhooks: webhooks };
    });
  }
}
