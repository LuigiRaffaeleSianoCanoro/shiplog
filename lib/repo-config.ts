import { CONFIG_PATH, DEFAULT_CONFIG, parseConfig, type ShiplogConfig } from "./config";
import { getRepoFile, installProvider, vcsConfigured } from "./vcs";

/** The repo's `.shiplog.yml`, or defaults when the provider API is not configured or the file is missing. */
export async function loadRepoConfig(installationId: string, repo: string): Promise<ShiplogConfig> {
  const provider = await installProvider(installationId);
  if (!vcsConfigured(provider)) return DEFAULT_CONFIG;
  try {
    return parseConfig(await getRepoFile(installationId, repo, CONFIG_PATH));
  } catch (e) {
    console.error("[shiplog] config load failed:", (e as Error).message);
    return DEFAULT_CONFIG;
  }
}
