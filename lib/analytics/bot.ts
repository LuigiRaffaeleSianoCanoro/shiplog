const BOT =
  /bot\b|crawler|spider|slurp|facebookexternalhit|embedly|quora link preview|linkedinbot|whatsapp|telegrambot|discordbot|preview|curl\/|wget\/|python-requests|go-http-client|httpx\/|libwww|scanning|headlesschrome/i;

/** Heuristic for separating real browsers from crawlers, probes, and link expanders. */
export function isLikelyBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent?.trim()) return false;
  return BOT.test(userAgent);
}
