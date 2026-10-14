import { env } from "./env";

export const INSTALL_SCOPES = [
  "repository:contents:read",
  "repository:contents:write",
  "repository:pull_requests:read",
  "repository:pull_requests:reviews:read",
  "repository:pull_requests:reviews:write",
  // Lets Shiplog check that a `/shiplog release` commenter has write/admin on the repo.
  "repository:members:read",
];

/** Origin install URL (client_id = Origin App ID). */
export function installUrl(origin: string, state?: string) {
  const u = new URL("https://cursor.com/codebase/apps/install");
  u.searchParams.set("client_id", env.originAppId);
  u.searchParams.set("scope", INSTALL_SCOPES.join(" "));
  u.searchParams.set("redirect_uri", `${origin}/api/install/callback`);
  if (state) u.searchParams.set("state", state);
  u.searchParams.set("summary", "Shiplog reads merged PRs and comments a changelog entry or release notes.");
  // Re-consent keeps existing grants and only requests additions.
  u.searchParams.set("include_granted_scopes", "true");
  return u.toString();
}
