/** Central, typed access to configuration. Never log values from here. */
export const env = {
  /** "cursor" (production default) or "neon" (test mode: draft via Neon AI Gateway). */
  llmProvider: (process.env.SHIPLOG_LLM_PROVIDER ?? "cursor") as "cursor" | "neon",
  /** BYOK key collection is behind a flag until Cursor confirms policy (FAB-80). */
  byokEnabled: process.env.SHIPLOG_BYOK_ENABLED !== "false",
  encKey: process.env.SHIPLOG_KEY_ENC ?? "",
  originAppId: process.env.ORIGIN_APP_ID ?? "",
  originPrivateKey: (process.env.ORIGIN_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  originApi: process.env.ORIGIN_API_BASE ?? "https://api.cursor.com/v1/origin",
  cursorApi: process.env.CURSOR_API_BASE ?? "https://api.cursor.com",
  neonBase: process.env.NEON_AI_GATEWAY_BASE_URL ?? "",
  neonToken: process.env.NEON_AI_GATEWAY_TOKEN ?? "",
  neonModel: process.env.SHIPLOG_NEON_MODEL ?? "claude-opus-5-5",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  /** Skip signature verification ONLY for local tests. Refused in production. */
  insecureWebhooks: process.env.SHIPLOG_INSECURE_WEBHOOKS === "true" && process.env.NODE_ENV !== "production",
  dashboardToken: process.env.SHIPLOG_DASHBOARD_TOKEN ?? "",
};
