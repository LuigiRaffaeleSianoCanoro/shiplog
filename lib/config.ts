import { parse } from "yaml";
import { classify, SECTIONS, type Section } from "./changelog";
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
  /** Optional per-audience release notes (technical and customer) with en/es output. */
  notes: { audiences: NoteAudience[]; languages: NoteLanguage[] };
}
export type BatchMode = "off" | "release" | "daily";

export const CONFIG_PATH = ".shiplog.yml";
export const DEFAULT_CONFIG: ShiplogConfig = {
  sections: {}, exclude: { labels: ["skip-changelog"], authors: [] },
  language: "en", tone: "concise, user-facing", changelogPath: "CHANGELOG.md", mode: "agent", batch: "off",
  notes: { audiences: [], languages: ["en", "es"] },
};

const str = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const strList = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x)).filter((x): x is string => !!x) : null);
const safePath = (v: unknown) => { const p = str(v, 200); return p && /^[\w./-]+\.md$/i.test(p) && !p.split("/").includes("..") && !p.startsWith("/") ? p : null; };

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
    notes: {
      audiences: parseNoteAudiences(raw.notes?.audiences),
      languages: parseNoteLanguages(raw.notes?.languages),
    },
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
