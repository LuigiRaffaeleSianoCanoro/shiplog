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
  if (!s || !HTTPS.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && Boolean(u.hostname);
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

/** Fire-and-forget POST to each URL. Errors are logged and swallowed. */
export async function notifyWebhooks(urls: string[], payload: NotifyPayload): Promise<void> {
  const targets = dedupeWebhooks(urls);
  await Promise.all(
    targets.map(async (url) => {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(bodyFor(url, payload)),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      } catch (e) {
        console.error("[shiplog] notify webhook failed:", redactWebhookUrl(url), (e as Error).message);
      }
    }),
  );
}

/** Merge installation-level URLs with repo `.shiplog.yml` notify.webhooks. */
export function mergeNotifyWebhooks(installationUrls: string[] | undefined, configUrls: string[] | undefined): string[] {
  return dedupeWebhooks([...(installationUrls ?? []), ...(configUrls ?? [])]);
}
