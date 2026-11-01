import type { Installation } from "./store/types";

/** Match `listInstallations().find(active + namespace)` with newest `createdAt` winning. */
export function pickNewestActiveInstallation(installations: Installation[], namespace: string): Installation | null {
  let best: Installation | null = null;
  for (const i of installations) {
    if (i.status !== "active" || i.namespace !== namespace) continue;
    if (!best || i.createdAt.localeCompare(best.createdAt) > 0) best = i;
  }
  return best;
}
