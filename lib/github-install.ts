import { env } from "./env";
import { githubAppSlug } from "./github";

/** GitHub App install URL (user or org picks repositories on GitHub). */
export async function githubInstallUrl(state?: string) {
  const slug = await githubAppSlug();
  const u = slug
    ? new URL(`https://github.com/apps/${slug}/installations/new`)
    : new URL("https://github.com/settings/installations/new");
  if (!slug && env.githubAppId) u.searchParams.set("app_id", env.githubAppId);
  if (state) u.searchParams.set("state", state);
  return u.toString();
}
