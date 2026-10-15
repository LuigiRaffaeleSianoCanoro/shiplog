import { parse } from "yaml";
import { classify, SECTIONS, type Section } from "./changelog";
import type { OrphanMode, PackageDef } from "./packages";
import { parseNoteAudiences, parseNoteLanguages, type NoteAudience, type NoteLanguage } from "./notes";

export type ConfigMode = "agent" | "prompt";
export interface ShiplogConfig {
  /** Extra or overriding conventional-commit prefix → section mappings. */
  sections: Record<string, Section>;
  exclude: { labels: string[]; authors: string[] };
  language: string;
  tone: string;
  changelogPath: string;
  /** "prompt" never launches an agent: Shiplog posts a ready-to-run prompt instead. */
  mode: ConfigMode;
  /** Agent cost control: "release" or "daily" queue merged PRs and launch one agent per batch. */
  batch: BatchMode;
  /** Monorepo: path globs per package. Empty keeps single-changelog behavior. */
  packages: PackageDef[];
  /** Where PR files that match no package go when `packages` is set. */
  orphan: OrphanMode;
  /** Initial changelog backfill from merged PRs and tags (install time). */
  history: HistoryConfig;
  /** Optional per-audience release notes (technical and customer) with en/es output. */
  notes: { audiences: NoteAudience[]; languages: NoteLanguage[] };
  /** Optional outbound webhook URLs (Slack incoming, Discord, or generic HTTPS POST). */
  notify: { webhooks: string[] };
  /** Show the "Changelog by Shiplog" badge on the public changelog page (default on). */
  poweredBy: boolean;
}
export type BatchMode = "off" | "release" | "daily";
export interface HistoryConfig {
  enabled: boolean;
  maxPrs: number;
  maxTags: number;
}

export const CONFIG_PATH = ".shiplog.yml";
export const DEFAULT_HISTORY: HistoryConfig = { enabled: true, maxPrs: 100, maxTags: 50 };
export const DEFAULT_CONFIG: ShiplogConfig = {
  sections: {}, exclude: { labels: ["skip-changelog"], authors: [] },
  language: "en", tone: "concise, user-facing", changelogPath: "CHANGELOG.md", mode: "agent", batch: "off",
  packages: [], orphan: "root",
  history: DEFAULT_HISTORY,
  notes: { audiences: [], languages: ["en", "es"] },
  notify: { webhooks: [] },
  poweredBy: true,
};

const str = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const strList = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x)).filter((x): x is string => !!x) : null);
const safePath = (v: unknown) => { const p = str(v, 200); return p && /^[\w./-]+\.md$/i.test(p) && !p.split("/").includes("..") && !p.startsWith("/") ? p : null; };
const safeGlob = (v: unknown) => {
  const p = str(v, 200);
  return p && !p.startsWith("/") && !p.includes("..") ? p.replace(/\\/g, "/") : null;
};

function parsePackages(raw: unknown): PackageDef[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: PackageDef[] = [];
  for (const [name, val] of Object.entries(raw)) {
    if (!/^[a-z0-9][a-z0-9._-]{0,40}$/i.test(name) || !val || typeof val !== "object" || Array.isArray(val)) continue;
    const changelogPath = safePath((val as any).changelog);
    const paths = strList((val as any).paths)?.map(safeGlob).filter((x): x is string => !!x) ?? [];
    if (!changelogPath || !paths.length) continue;
    out.push({ name, paths, changelogPath });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
const posInt = (v: unknown, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
};

/** Parse .shiplog.yml text. Repo content is untrusted: unknown keys and bad values fall back to defaults. */
export function parseConfig(text: string | null): ShiplogConfig {
  let raw: any = null;
  try { raw = text ? parse(text) : null; } catch { raw = null; }
  if (!raw || typeof raw !== "object") return DEFAULT_CONFIG;
  const sections: Record<string, Section> = {};
  for (const [k, v] of Object.entries(raw.sections ?? {})) {
    if ((SECTIONS as readonly string[]).includes(v as string)) sections[k.toLowerCase()] = v as Section;
  }
  return {
    sections,
    exclude: { labels: strList(raw.exclude?.labels) ?? DEFAULT_CONFIG.exclude.labels, authors: strList(raw.exclude?.authors) ?? [] },
    language: str(raw.language, 20) ?? DEFAULT_CONFIG.language,
    tone: str(raw.tone) ?? DEFAULT_CONFIG.tone,
    changelogPath: safePath(raw.changelog) ?? DEFAULT_CONFIG.changelogPath,
    mode: raw.mode === "prompt" ? "prompt" : "agent",
    batch: raw.batch === "release" || raw.batch === "daily" ? raw.batch : "off",
    packages: parsePackages(raw.packages),
    orphan: raw.orphan === "ignore" ? "ignore" : "root",
    history: {
      enabled: raw.history?.enabled === false ? false : DEFAULT_HISTORY.enabled,
      maxPrs: posInt(raw.history?.maxPrs ?? raw.history?.max_prs, 500, DEFAULT_HISTORY.maxPrs),
      maxTags: posInt(raw.history?.maxTags ?? raw.history?.max_tags, 200, DEFAULT_HISTORY.maxTags),
    },
    notes: {
      audiences: parseNoteAudiences(raw.notes?.audiences),
      languages: parseNoteLanguages(raw.notes?.languages),
    },
    notify: { webhooks: strList(raw.notify?.webhooks) ?? [] },
    poweredBy: raw.powered_by === false || raw.poweredBy === false ? false : DEFAULT_CONFIG.poweredBy,
  };
}

export function notesEnabled(c: ShiplogConfig) {
  return c.notes.audiences.length > 0;
}

export function sectionFor(title: string, c: ShiplogConfig): Section | null {
  const m = /^(\w+)(\([^)]*\))?!?:/.exec(title.trim());
  return (m && c.sections[m[1].toLowerCase()]) || classify(title);
}

const labelNames = (pr: any): string[] => (pr?.labels ?? []).map((l: any) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
const glob = (pat: string, s: string) => new RegExp(`^${pat.toLowerCase().replace(/[.+?^${}()[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(s.toLowerCase());

/** Why this PR is excluded from the changelog, or null. The no-changelog label always excludes. "bots" in authors matches any app or service account. */
export const ALWAYS_SKIP_LABEL = "no-changelog";
export function excludedBy(pr: any, c: ShiplogConfig): string | null {
  const wanted = [...c.exclude.labels, ALWAYS_SKIP_LABEL].map((l) => l.toLowerCase());
  const label = labelNames(pr).find((l) => wanted.includes(l.toLowerCase()));
  if (label) return `label ${label.toLowerCase()}`;
  const a = pr?.author ?? {};
  const isBot = Boolean(a.app || a.serviceAccount || a.user?.performedVia?.app);
  const name: string = a.user?.handle ?? a.user?.slug ?? a.user?.username ?? a.app?.slug ?? a.app?.displayName ?? a.serviceAccount?.displayName ?? a.login ?? "";
  if (!name && !isBot) return null;
  if (c.exclude.authors.some((p) => (p.toLowerCase() === "bots" && isBot) || (name && glob(p, name)))) return `author ${name || "bot"}`;
  return null;
}
