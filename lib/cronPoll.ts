import { safeEqual } from "./crypto";
import { flushBatches, pollAgents } from "./jobs";
import { getStore } from "./store";

const defaultLockTtlMs = () => Number(process.env.CRON_POLL_LOCK_TTL_MS) || 90_000;

/** Bearer check for `/api/cron/poll`. Fails closed when `CRON_SECRET` is unset. */
export function authorizeCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  return Boolean(m && safeEqual(m[1], secret));
}

export type CronPollResult = { updated: number; batches: number; skipped?: boolean };

/** Idempotent poll cycle: one active run at a time per store (safe under overlapping cron pings). */
export async function runCronPoll(): Promise<CronPollResult> {
  const store = getStore();
  if (!(await store.acquireCronPollLock(defaultLockTtlMs()))) {
    return { updated: 0, batches: 0, skipped: true };
  }
  try {
    const batches = await flushBatches();
    const updated = await pollAgents();
    return { updated, batches };
  } finally {
    await store.releaseCronPollLock();
  }
}
