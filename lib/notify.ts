/** Outbound user-configured webhooks (Slack, Discord, generic HTTP). Inbound Origin verification lives in lib/webhook.ts. */

export type NotifyEvent = "changelog_entry" | "release_cut";

export interface NotifyPayload {
  event: NotifyEvent;
  repo: string;
  prNumber: string;
  prUrl: string;
  title?: string;
  detail: string;
  version?: string;
}

const HTTPS = /^https:\/\//i;

export function isValidNotifyWebhookUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    if (!u.hostname) return false;
    if (u.protocol === "https:") return true;
    if (
      process.env.SHIPLOG_ALLOW_HTTP_NOTIFY === "true" &&
      u.protocol === "http:" &&
      (u.hostname === "127.0.0.1" || u.hostname === "localhost")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function classifyWebhookUrl(url: string): "slack" | "discord" | "generic" {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h === "hooks.slack.com" || h.endsWith(".hooks.slack.com")) return "slack";
    if (h === "discord.com" || h === "discordapp.com" || h.endsWith(".discord.com")) return "discord";
  } catch { /* fall through */ }
  return "generic";
}

/** Never log webhook secrets that may appear in query strings. */
export function redactWebhookUrl(url: string): string {
  try {
    const u = new URL(url);
    if (!u.search) return url;
    return `${u.origin}${u.pathname}?…`;
  } catch {
    return "<invalid url>";
  }
}

export function dedupeWebhooks(urls: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const u = raw.trim();
    if (!isValidNotifyWebhookUrl(u) || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export function buildSlackBody(p: NotifyPayload): { text: string } {
  const head = p.event === "release_cut" ? `Release **${p.version ?? ""}** cut` : `Changelog entry for PR #${p.prNumber || "?"}`;
  const lines = [`*Shiplog* — ${head}`, `*Repo:* ${p.repo}`];
  if (p.title) lines.push(`*PR:* ${p.title}`);
  if (p.prUrl) lines.push(p.prUrl);
  lines.push("", p.detail.slice(0, 3500));
  return { text: lines.join("\n") };
}

export function buildDiscordBody(p: NotifyPayload): { content: string } {
  const head = p.event === "release_cut" ? `release **${p.version ?? ""}**` : "changelog entry";
  const lines = [`**Shiplog** — ${head} on \`${p.repo}\``];
  if (p.title) lines.push(`**${p.title}**`);
  if (p.prUrl) lines.push(p.prUrl);
  lines.push("", p.detail.slice(0, 1800));
  return { content: lines.join("\n").slice(0, 2000) };
}

export function buildGenericBody(p: NotifyPayload): Record<string, unknown> {
  return {
    event: p.event,
    repo: p.repo,
    prNumber: p.prNumber || null,
    prUrl: p.prUrl || null,
    title: p.title ?? null,
    version: p.version ?? null,
    detail: p.detail,
    source: "shiplog",
  };
}

function bodyFor(url: string, p: NotifyPayload): unknown {
  const kind = classifyWebhookUrl(url);
  if (kind === "slack") return buildSlackBody(p);
  if (kind === "discord") return buildDiscordBody(p);
  return buildGenericBody(p);
}

/** Max delivery attempts per webhook URL (fits within typical serverless timeouts). */
export const NOTIFY_WEBHOOK_MAX_ATTEMPTS = 3;

const NOTIFY_BACKOFF_BASE_MS = 400;
const NOTIFY_BACKOFF_MAX_MS = 4_000;
/** Cap a single Retry-After wait (seconds or HTTP-date). */
const NOTIFY_RETRY_AFTER_MAX_MS = 10_000;
/** Total sleep budget across retries for one URL inside a single invocation. */
const NOTIFY_BACKOFF_BUDGET_MS = 8_000;

export function isRetryableNotifyStatus(status: number): boolean {
  if (status === 408 || status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

function parseRetryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header?.trim()) return null;
  const trimmed = header.trim();
  const seconds = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const when = Date.parse(trimmed);
  if (!Number.isNaN(when)) return Math.max(0, when - now);
  return null;
}

/** Exponential backoff with jitter; honors Retry-After when present (capped). */
export function notifyRetryDelayMs(
  attempt: number,
  retryAfter: string | null,
  random: () => number = Math.random,
  now = Date.now(),
): number {
  const fromHeader = parseRetryAfterMs(retryAfter, now);
  if (fromHeader != null) {
    return Math.min(fromHeader, NOTIFY_RETRY_AFTER_MAX_MS);
  }
  const exp = NOTIFY_BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1);
  const jitter = 0.5 + random() * 0.5;
  return Math.min(NOTIFY_BACKOFF_MAX_MS, Math.round(exp * jitter));
}

function logNotifyAttempt(fields: Record<string, unknown>): void {
  console.error(`[shiplog] notify webhook attempt ${JSON.stringify(fields)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deliverNotifyWebhook(url: string, payload: NotifyPayload): Promise<void> {
  const urlRedacted = redactWebhookUrl(url);
  const body = JSON.stringify(bodyFor(url, payload));
  let backoffSpentMs = 0;

  for (let attempt = 1; attempt <= NOTIFY_WEBHOOK_MAX_ATTEMPTS; attempt++) {
    let status: number | undefined;
    let errorMessage: string | undefined;
    let retryAfter: string | null = null;
    let ok = false;

    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      status = r.status;
      if (r.ok) {
        ok = true;
      } else {
        errorMessage = `HTTP ${r.status}`;
        retryAfter = r.headers.get("Retry-After");
        if (!isRetryableNotifyStatus(r.status)) {
          logNotifyAttempt({
            url: urlRedacted,
            attempt,
            maxAttempts: NOTIFY_WEBHOOK_MAX_ATTEMPTS,
            ok: false,
            status,
            willRetry: false,
            error: errorMessage,
          });
          return;
        }
      }
    } catch (e) {
      errorMessage = (e as Error).message;
    }

    if (ok) {
      logNotifyAttempt({
        url: urlRedacted,
        attempt,
        maxAttempts: NOTIFY_WEBHOOK_MAX_ATTEMPTS,
        ok: true,
        status,
      });
      return;
    }

    const willRetry = attempt < NOTIFY_WEBHOOK_MAX_ATTEMPTS && (status === undefined || isRetryableNotifyStatus(status));
    logNotifyAttempt({
      url: urlRedacted,
      attempt,
      maxAttempts: NOTIFY_WEBHOOK_MAX_ATTEMPTS,
      ok: false,
      ...(status !== undefined ? { status } : {}),
      willRetry,
      ...(errorMessage ? { error: errorMessage } : {}),
    });

    if (!willRetry) return;

    let delay = notifyRetryDelayMs(attempt, retryAfter);
    if (backoffSpentMs + delay > NOTIFY_BACKOFF_BUDGET_MS) {
      delay = Math.max(0, NOTIFY_BACKOFF_BUDGET_MS - backoffSpentMs);
    }
    if (delay <= 0) return;
    backoffSpentMs += delay;
    await sleep(delay);
  }
}

/** Fire-and-forget POST to each URL. Errors are logged and swallowed. */
export async function notifyWebhooks(urls: string[], payload: NotifyPayload): Promise<void> {
  const targets = dedupeWebhooks(urls);
  await Promise.all(targets.map((url) => deliverNotifyWebhook(url, payload)));
}

/** Merge installation-level URLs with repo `.shiplog.yml` notify.webhooks. */
export function mergeNotifyWebhooks(installationUrls: string[] | undefined, configUrls: string[] | undefined): string[] {
  return dedupeWebhooks([...(installationUrls ?? []), ...(configUrls ?? [])]);
}
