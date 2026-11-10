# PROJECT_CONTENT_RULES.md — Shiplog

Project-specific rules on top of `AGENTS.md`. The HARD RULES in `AGENTS.md` always win. **Never put secrets, API keys, personal emails/phones, or other sensitive data here.**

## Project

- Name / brand as written: **Shiplog**
- What it is (one concrete sentence): Open-source AI changelog and release notes for **Cursor Origin** — turns merged PRs into Keep a Changelog entries and version tags into release notes.
- Audience (as they name themselves): TBD (Luigi) — likely maintainers and teams using Cursor Origin who want automated changelogs.
- Out of scope (projects/brands that must never appear here): Pavla, PsicoConecta, mardelplata.dev.ar, Builders OFF The Record, Builder en la Bahía, personal ambassador/Cursor collateral not about Shiplog — see `AGENTS.md` hard rule 12.

## Brand

- Approved logo files (paths in this repo):
  - `public/logo.svg`
  - `public/brand/logo-mono-white.svg`
  - `public/brand/mascot-still.png`, `public/brand/mascot-loop.webp`
  - `public/og.png`, `public/favicon-32.png`, `app/icon.svg`
- Colors (hex) and fonts (from `app/globals.css` / `app/layout.tsx`):
  - Background: `#FBF8F1`
  - Navy (primary text / brand): `#13235A`
  - Ink: `#1E2A52`
  - Muted: `#5A6386`
  - Accent red: `#F2382B`, red dark: `#C9241A`
  - Panel white: `#FFFFFF`, line: `#E3DED3`
  - Textures: `public/brand/texture-subway-tile.png`, `public/brand/texture-subway-tile-navy.png`
  - Display font: **Oswald** (700)
  - Body font: **Manrope** (400–700)
- Approved templates (plates, lower thirds, intro/outro, carousel): TBD (Luigi)
- NOT approved / do not use (POCs, old brands): Non-Shiplog Luigi project brands; broken or unfinished UI states as hero footage.
- Instagram/TikTok safe-zone notes: Follow `AGENTS.md` hard rule 5 (no tiny top-left logo + URL; center layout, larger logo, URL at bottom).

## Voice

- Person and register: First person as Luigi, rioplatense Spanish (voseo) for social copy when Luigi signs; product demos may use concise technical English where the app UI is English — TBD (Luigi) per channel.
- Words and constructions banned in this project (in addition to `qa-texto-anti-tropes-llm`): LLM tropes per `AGENTS.md` rule 11; no claims about features that are not working in this repo.
- Recurring people and exact spelling: TBD (Luigi)

## Channels and accounts

- Networks + public handles:
  - X: **@shiplogoss**
  - Bluesky: **shiploghelp.bsky.social**
  - Mastodon: **@shiploghelp**
- Scheduler used (e.g. Buffer) and plan limits: TBD (Luigi)
- Approval flow: **Luigi must explicitly approve** each piece and version before anything is published (`AGENTS.md` hard rule 8).

## Assets

- Where masters, jingles, bumpers, B-roll, photos live (folder or drive name, no credentials): TBD (Luigi)
- Consent sources for featured people: TBD (Luigi)

## Claims

- Verified claims we can make (with source):
  - Shiplog drafts changelogs from merged PRs and release notes from version tags for Cursor Origin installations (see repo `README.md`).
  - Public changelog pages, read-only JSON API, and MCP are described in `README.md` — only show flows that work in the current deployment/repo.
  - Brand colors, logos, and mascot assets exist at paths listed above in this repository.
- Banned claims:
  - Features or pages that are broken, mocked, or not shipped in this repo.
  - Mixing other Luigi brands or unrelated products.
  - Publishing without Luigi’s explicit OK.

## Video specifics

- Default formats and durations:
  - Primary deliverable: **~30 s daily demo video** of a **real, working Shiplog feature** — **screen recording of the real app**, never slideshow-style stills.
  - Complete edit required: jump cuts, audio cleanup, transitions/SFX, integrated plates (`reel-production-complete-edit`).
- Intro/outro rules: TBD (Luigi); use Shiplog brand assets only.
- Caption style (font, size, colors, position): Prefer on-brand navy/red on light background; match site typography where possible — TBD (Luigi) for burned-in specs.

## Content focus (Shiplog)

- Demos must show the **real app** with **real recordings** (install, setup, changelog generation, public changelog page, API/MCP, etc.).
- Social posts promote the same story on X, Bluesky, and Mastodon accounts listed above.
- Primary skills for this repo: `reel-production-complete-edit`, `video-review-package`, `short-form-reel-editor`, `social-content-with-purpose`, `qa-texto-anti-tropes-llm`, `ai-copywriter`.
