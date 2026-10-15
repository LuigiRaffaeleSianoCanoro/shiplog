import type { ShiplogConfig } from "./config";

export type OrphanMode = "root" | "ignore";

export interface PackageDef {
  name: string;
  paths: string[];
  changelogPath: string;
}

/** Escape a glob segment for regex, then turn `*` / `**` into path-aware matchers. */
function globToRegex(pattern: string): RegExp {
  const norm = pattern.replace(/\\/g, "/").toLowerCase();
  let re = "^";
  for (let i = 0; i < norm.length; i++) {
    const c = norm[i];
    if (c === "*" && norm[i + 1] === "*") {
      re += ".*";
      if (norm[i + 2] === "/") i += 2;
      else i += 1;
      continue;
    }
    if (c === "*") { re += "[^/]*"; continue; }
    re += c.replace(/[.+?^${}()[\]\\|]/g, "\\$&");
  }
  re += "$";
  return new RegExp(re);
}

/** Whether a repo path matches a glob (case-insensitive, `/` separators). */
export function pathMatchesGlob(pattern: string, filePath: string): boolean {
  const p = filePath.replace(/\\/g, "/");
  return globToRegex(pattern).test(p.toLowerCase());
}

export function packageForPath(filePath: string, packages: PackageDef[]): PackageDef[] {
  return packages.filter((pkg) => pkg.paths.some((g) => pathMatchesGlob(g, filePath)));
}

/**
 * Changelog files to update for a PR's changed paths. Empty when monorepo mode is off.
 * With packages configured: one entry per distinct changelog; orphan files follow `orphan`.
 */
export function changelogTargets(files: string[], cfg: ShiplogConfig): string[] {
  if (!cfg.packages.length) return [cfg.changelogPath];
  const out = new Set<string>();
  let orphanCount = 0;
  for (const f of files) {
    const hits = packageForPath(f, cfg.packages);
    if (hits.length) {
      for (const h of hits) out.add(h.changelogPath);
    } else orphanCount++;
  }
  if (orphanCount > 0 && cfg.orphan === "root") out.add(cfg.changelogPath);
  return [...out].sort();
}

/** Every changelog path Shiplog manages in a monorepo (for release cuts and bump notes). */
export function allChangelogPaths(cfg: ShiplogConfig): string[] {
  if (!cfg.packages.length) return [cfg.changelogPath];
  const paths = new Set(cfg.packages.map((p) => p.changelogPath));
  if (cfg.orphan === "root") paths.add(cfg.changelogPath);
  return [...paths].sort();
}
