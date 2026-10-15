import type { Installation, Job, Outbox, Store, UserKey } from "./types";

/** Supabase (PostgREST) store, server-side only with the service role key. Tables in supabase/migrations. */
export class SupabaseStore implements Store {
  constructor(private url: string, private key: string) {}
  private async q(pathq: string, init: RequestInit & { prefer?: string } = {}) {
    const r = await fetch(`${this.url}/rest/v1/${pathq}`, {
      ...init,
      cache: "no-store",
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, "content-type": "application/json", ...(init.prefer ? { Prefer: init.prefer } : {}) },
    });
    if (!r.ok && r.status !== 409) throw new Error(`supabase ${r.status} on ${pathq.split("?")[0]}`);
    return r;
  }
  private async rows<T>(p: string): Promise<T[]> { return (await (await this.q(p)).json()) as T[]; }
  async claimDelivery(id: string) {
    const r = await this.q("shiplog_deliveries", { method: "POST", body: JSON.stringify({ id }), prefer: "return=minimal" });
    return r.status !== 409;
  }
  async upsertInstallation(i: Installation) {
    await this.q("shiplog_installations?on_conflict=id", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify({ id: i.id, namespace: i.namespace, status: i.status, created_at: i.createdAt, disconnected_at: i.disconnectedAt ?? null }) });
  }
  private mapI = (r: any): Installation => ({ id: r.id, namespace: r.namespace, status: r.status, createdAt: r.created_at, disconnectedAt: r.disconnected_at });
  async getInstallation(id: string) { const r = await this.rows<any>(`shiplog_installations?id=eq.${encodeURIComponent(id)}`); return r[0] ? this.mapI(r[0]) : null; }
  async listInstallations() { return (await this.rows<any>("shiplog_installations?order=created_at.desc")).map(this.mapI); }
  async putKey(k: UserKey) {
    await this.q("shiplog_user_keys?on_conflict=installation_id", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify({ installation_id: k.installationId, ciphertext: k.ciphertext, iv: k.iv, tag: k.tag, key_version: k.keyVersion, last4: k.last4, created_at: k.createdAt }) });
  }
  async getKey(id: string) {
    const r = (await this.rows<any>(`shiplog_user_keys?installation_id=eq.${encodeURIComponent(id)}`))[0];
    return r ? { installationId: r.installation_id, ciphertext: r.ciphertext, iv: r.iv, tag: r.tag, keyVersion: r.key_version, last4: r.last4, createdAt: r.created_at } : null;
  }
  async deleteKey(id: string) { await this.q(`shiplog_user_keys?installation_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }); }
  async putJob(j: Job) {
    await this.q("shiplog_jobs?on_conflict=id", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify({ id: j.id, delivery_id: j.deliveryId, installation_id: j.installationId, repo: j.repo, pr_number: j.prNumber, pr_url: j.prUrl, kind: j.kind, mode: j.mode, status: j.status, agent_id: j.agentId ?? null, run_id: j.runId ?? null, pr_opened: j.prOpened ?? null, result: j.result ?? null, created_at: j.createdAt }) });
  }
  async listJobs(id?: string) {
    const r = await this.rows<any>(`shiplog_jobs?order=created_at.desc&limit=100${id ? `&installation_id=eq.${encodeURIComponent(id)}` : ""}`);
    return r.map((x) => ({ id: x.id, deliveryId: x.delivery_id, installationId: x.installation_id, repo: x.repo, prNumber: x.pr_number, prUrl: x.pr_url, kind: x.kind, mode: x.mode, status: x.status, agentId: x.agent_id, runId: x.run_id, prOpened: x.pr_opened, result: x.result, createdAt: x.created_at }));
  }
  async putOutbox(o: Outbox) {
    await this.q("shiplog_outbox", { method: "POST", prefer: "return=minimal", body: JSON.stringify({ id: o.id, installation_id: o.installationId, repo: o.repo, pr_number: o.prNumber, body: o.body, delivered: o.delivered, created_at: o.createdAt }) });
  }
  async listOutbox(id?: string) {
    const r = await this.rows<any>(`shiplog_outbox?order=created_at.desc&limit=50${id ? `&installation_id=eq.${encodeURIComponent(id)}` : ""}`);
    return r.map((x) => ({ id: x.id, installationId: x.installation_id, repo: x.repo, prNumber: x.pr_number, body: x.body, delivered: x.delivered, createdAt: x.created_at }));
  }
  async getChangelog(repo: string) { const r = await this.rows<any>(`shiplog_changelogs?repo=eq.${encodeURIComponent(repo)}`); return r[0]?.markdown ?? null; }
  async putChangelog(repo: string, md: string) {
    await this.q("shiplog_changelogs?on_conflict=repo", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify({ repo, markdown: md, updated_at: new Date().toISOString() }) });
  }
  private static CRON_LOCK = "__cron_poll_lock__";
  async acquireCronPollLock(ttlMs: number) {
    const rows = await this.rows<{ received_at: string }>(`shiplog_deliveries?id=eq.${SupabaseStore.CRON_LOCK}`);
    const now = Date.now();
    if (rows[0]) {
      const age = now - new Date(rows[0].received_at).getTime();
      if (age < ttlMs) return false;
      await this.q(`shiplog_deliveries?id=eq.${SupabaseStore.CRON_LOCK}`, { method: "DELETE" });
    }
    const r = await this.q("shiplog_deliveries", { method: "POST", body: JSON.stringify({ id: SupabaseStore.CRON_LOCK }), prefer: "return=minimal" });
    return r.status !== 409;
  }
  async releaseCronPollLock() {
    await this.q(`shiplog_deliveries?id=eq.${SupabaseStore.CRON_LOCK}`, { method: "DELETE" });
  }
}
