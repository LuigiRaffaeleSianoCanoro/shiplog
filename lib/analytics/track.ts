import { after } from "next/server";
import type { Job } from "@/lib/store";
import { isLikelyBotUserAgent } from "./bot";
import { AnalyticsEvents, captureServerEvent, flushServerAnalytics } from "./server";

function scheduleFlush(): void {
  try {
    after(async () => {
      await flushServerAnalytics();
    });
  } catch {
    void flushServerAnalytics();
  }
}

export async function trackInstallationCreated(provider: string, installationId: string): Promise<void> {
  await captureServerEvent(AnalyticsEvents.installationCreated, { provider, installation_id: installationId });
  scheduleFlush();
}

export async function trackInstallationDeleted(provider: string, installationId: string): Promise<void> {
  await captureServerEvent(AnalyticsEvents.installationDeleted, { provider, installation_id: installationId });
  scheduleFlush();
}

export async function trackChangelogGenerated(job: Job): Promise<void> {
  await captureServerEvent(AnalyticsEvents.changelogGenerated, jobProps(job));
  scheduleFlush();
}

export async function trackChangelogPublished(job: Job): Promise<void> {
  await captureServerEvent(AnalyticsEvents.changelogPublished, jobProps(job));
  scheduleFlush();
}

function jobProps(job: Job): Record<string, unknown> {
  return {
    installation_id: job.installationId,
    repo: job.repo,
    mode: job.mode,
    job_kind: job.kind,
    job_status: job.status,
    pr_number: job.prNumber || undefined,
  };
}

/** Post-response analytics so ISR pages never call `headers()` during render. */
export function schedulePublicChangelogViewed(repoSlug: string): void {
  try {
    after(async () => {
      const { headers } = await import("next/headers");
      const ua = (await headers()).get("user-agent");
      await trackPublicChangelogViewed(repoSlug, ua);
    });
  } catch {
    void trackPublicChangelogViewed(repoSlug, null);
  }
}

export function scheduleFeedRead(format: "json" | "xml", repoSlug: string, userAgent: string | null): void {
  try {
    after(() => trackFeedRead(format, repoSlug, userAgent));
  } catch {
    void trackFeedRead(format, repoSlug, userAgent);
  }
}

export function scheduleApiRead(
  endpoint: "changelog" | "release" | "packages",
  repoSlug: string,
  userAgent: string | null,
): void {
  try {
    after(() => trackApiRead(endpoint, repoSlug, userAgent));
  } catch {
    void trackApiRead(endpoint, repoSlug, userAgent);
  }
}

export async function trackPublicChangelogViewed(repoSlug: string, userAgent: string | null): Promise<void> {
  await captureServerEvent(AnalyticsEvents.publicChangelogViewed, {
    repo: repoSlug,
    is_bot: isLikelyBotUserAgent(userAgent),
  });
  scheduleFlush();
}

export async function trackFeedRead(format: "json" | "xml", repoSlug: string, userAgent: string | null): Promise<void> {
  await captureServerEvent(AnalyticsEvents.feedRead, {
    format,
    repo: repoSlug,
    is_bot: isLikelyBotUserAgent(userAgent),
  });
  scheduleFlush();
}

export async function trackApiRead(
  endpoint: "changelog" | "release" | "packages",
  repoSlug: string,
  userAgent: string | null,
): Promise<void> {
  await captureServerEvent(AnalyticsEvents.apiRead, {
    endpoint,
    repo: repoSlug,
    is_bot: isLikelyBotUserAgent(userAgent),
  });
  scheduleFlush();
}

export async function trackCronRun(result: { updated: number; batches: number; skipped?: boolean }): Promise<void> {
  await captureServerEvent(AnalyticsEvents.cronRun, result);
  scheduleFlush();
}

export async function trackJobCompletion(job: Job): Promise<void> {
  if (job.kind === "changelog" && job.status === "done") await trackChangelogGenerated(job);
  if (job.kind === "release" && job.status === "done") await trackChangelogPublished(job);
}

export async function trackAgentAnnouncement(job: Job): Promise<void> {
  if (job.kind === "changelog") await trackChangelogGenerated(job);
  if (job.kind === "release") await trackChangelogPublished(job);
}
