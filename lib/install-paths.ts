import { env } from "./env";

const base = () => (env.installOrigin || "").replace(/\/$/, "");

/** Origin App install entry (primary). */
export function originInstallStartUrl() {
  const b = base();
  return b ? `${b}/api/install/start` : "/api/install/start";
}

/** GitHub App install entry (optional second provider). */
export function githubInstallStartUrl() {
  const b = base();
  return b ? `${b}/api/github/install/start` : "/api/github/install/start";
}
