import type { Sealed } from "../crypto";

export type InstallStatus = "active" | "suspended" | "disconnected";
export interface Installation {
  id: string; namespace: string; status: InstallStatus; createdAt: string; disconnectedAt?: string | null;
  installerId?: string | null; namespaceType?: "user" | "team" | null;
  /** Per-repo backfill marker (ISO timestamp or skipped:reason:time). */
  historyBackfillAt?: Record<string, string>;
  /** Installation-wide outbound notify webhooks (Slack, Discord, generic HTTPS). */
  notifyWebhooks?: string[];
}
export type KeyKind = "personal" | "service_account";
export interface UserKey extends Sealed { installationId: string; last4: string; createdAt: string; kind?: KeyKind; rotatedAt?: string | null }
export type JobKind = "changelog" | "release";
export type JobMode = "cursor" | "neon" | "fallback";
export interface Job {
  id: string; deliveryId: string; installationId: string; repo: string; prNumber: string; prUrl: string;
  kind: JobKind; mode: JobMode; status: "queued" | "running" | "done" | "failed" | "ignored";
  agentId?: string | null; runId?: string | null; prOpened?: string | null; result?: string | null; createdAt: string;
  /** Changelog paths this job updates (monorepo). */
  changelogPaths?: string[];
}
export interface Outbox { id: string; installationId: string; repo: string; prNumber: string; body: string; delivered: boolean; createdAt: string }

export interface Store {
  /** Returns false if this delivery id was already seen (replay / retry). */
  claimDelivery(deliveryId: string): Promise<boolean>;
  upsertInstallation(i: Installation): Promise<void>;
  getInstallation(id: string): Promise<Installation | null>;
  listInstallations(): Promise<Installation[]>;
  putKey(k: UserKey): Promise<void>;
  getKey(installationId: string): Promise<UserKey | null>;
  deleteKey(installationId: string): Promise<void>;
  putJob(j: Job): Promise<void>;
  listJobs(installationId?: string): Promise<Job[]>;
  putOutbox(o: Outbox): Promise<void>;
  listOutbox(installationId?: string): Promise<Outbox[]>;
  /** Persisted unreleased changelog per repo (used by neon mode and release cuts). */
  getChangelog(repo: string): Promise<string | null>;
  putChangelog(repo: string, md: string): Promise<void>;
  /** Storage keys for changelog documents under a repo slug (root and monorepo paths). */
  listChangelogKeysForRepo(repoSlug: string): Promise<string[]>;
  /** Exclusive lock for `/api/cron/poll` (overlapping schedulers). */
  acquireCronPollLock(ttlMs: number): Promise<boolean>;
  releaseCronPollLock(): Promise<void>;
  getNotifyWebhooks(installationId: string): Promise<string[]>;
  putNotifyWebhooks(installationId: string, webhooks: string[]): Promise<void>;
}
