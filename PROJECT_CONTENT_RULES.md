# PROJECT_CONTENT_RULES.md — Shiplog

Project-specific rules on top of `AGENTS.md`. The HARD RULES in `AGENTS.md` always win. **Never put secrets, API keys, personal emails/phones, or other sensitive data here.**

## Project

- Name / brand as written: **Shiplog**
- What it is (one concrete sentence): Open-source AI changelog and release notes for **Cursor Origin** — turns merged PRs into Keep a Changelog entries and version tags into release notes.
- Audience (as they name themselves): **Teams and developers** who use **Cursor Origin** and want automatic changelogs and release notes from merged PRs and semver tags, without a separate LLM subscription (agents run on the installer’s Cursor plan). Public positioning: *“Your merges, written up”* and *“Changelogs automáticos para tu producto, open source”* / *“Automatic changelogs from your merged PRs.”*
- Out of scope (projects/brands that must never appear here): Pavla, PsicoConecta, mardelplata.dev.ar, Builders OFF The Record, Builder en la Bahía, personal ambassador/Cursor collateral not about Shiplog — see `AGENTS.md` hard rule 12.
- Public product URL: **https://shiplog.help** (marketing site and install entry; production also documented at `https://shiplog-luigi-canoros-projects.vercel.app` in `README.md`).

## Brand

- Approved logo files (paths in this repo):
  - `public/logo.svg` (**Sail mark** — red sail and navy hull; `TRADEMARKS.md`)
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
  - **Harbor** (public changelog pages at `/{namespace}/{repo}`): separate palette in `TRADEMARKS.md` — Harbor lime `#c6ff3d`, background `#0c0c0e`, panel `#141418` (use only for Harbor/changelog-page demos, not mixed with marketing-site plates unless the demo is explicitly about Harbor).
- Approved templates (plates, lower thirds, intro/outro, carousel):
  - **Static brand:** in-repo assets above plus `public/og.png` for link previews.
  - **Screenshots for marketing:** `docs/screenshots/` (landing, setup, dashboard, harbor desktop/mobile, etc.) — use only if they match the current UI.
  - **Motion plates / lower thirds:** build per `docs/ffmpeg-cookbook.md` §6 with Shiplog logo (`public/logo.svg` or `public/brand/logo-mono-white.svg`), product URL **https://shiplog.help**, and marketing colors above. No separate intro/outro master video or After Effects project is checked into this repository.
  - **Carousel:** not used on current Shiplog social feeds (verified Bluesky/Mastodon/X timelines, 2026-11-10); default format is **~30 s vertical screen-recording demo** plus text post.
- NOT approved / do not use (POCs, old brands): Non-Shiplog Luigi project brands; broken or unfinished UI states as hero footage; Pavla rebrand POC (`AGENTS.md`); unofficial forks presented as “official Shiplog.”
- Instagram/TikTok safe-zone notes: Follow `AGENTS.md` hard rule 5 (no tiny top-left logo + URL; center layout, larger logo, URL at bottom). Shiplog’s active channels today are X, Bluesky, and Mastodon (no Shiplog IG/TikTok account found in repo or on linked profiles).

## Voice

- Person and register:
  - **@shiplogoss, @shiploghelp (Bluesky), @shiploghelp (Mastodon):** English, **product voice** (third person / “Shiplog” / lead with **shiplog.help**), concise feature explanation, link to `github.com/LuigiRaffaeleSianoCanoro/shiplog` where appropriate. Match live post style on those profiles.
  - **Demo video voice-over and on-screen copy:** English technical narration aligned with published alt-text on Bluesky/Mastodon (feature name + what the recording shows + “Open source app for Cursor Origin” / Apache-2.0 when stating license).
  - **Luigi’s personal accounts** (X [@LuigiMdpDev](https://x.com/LuigiMdpDev), YouTube [@LuigiRaffaeleSiano](https://www.youtube.com/@LuigiRaffaeleSiano), LinkedIn [linkedin.com/in/luigicanoro](https://www.linkedin.com/in/luigicanoro)): first person rioplatense (voseo) only when Luigi explicitly signs personal copy — **do not** use that voice on the Shiplog product accounts above (`AGENTS.md` rule 12).
- Words and constructions banned in this project (in addition to `qa-texto-anti-tropes-llm`): LLM tropes per `AGENTS.md` rule 11; no claims about features that are not working in this repo; do not imply affiliation with Cursor beyond “Origin App” / independent app (see landing footer: *“Shiplog is an independent Origin App. Not affiliated with Cursor.”*).
- Recurring people and exact spelling:
  - **Luigi Canoro** — maintainer (`.github/CODEOWNERS` → GitHub `@LuigiRaffaeleSianoCanoro`).
  - **Cursor Origin** / **Origin** — platform Shiplog integrates with (`README.md`, landing page).
  - **Harbor** — product name for the public changelog experience (`TRADEMARKS.md`), not a person.
  - Demos are **screen recordings of the app and repo**; do not feature identifiable third parties unless Luigi supplies written consent (see Assets → consent rule).

## Channels and accounts

- Networks + public handles:
  - X: **@shiplogoss** — https://x.com/shiplogoss
  - Bluesky: **shiploghelp.bsky.social** — https://bsky.app/profile/shiploghelp.bsky.social
  - Mastodon: **@shiploghelp@mastodon.social** — https://mastodon.social/@shiploghelp
- Scheduler used (e.g. Buffer) and plan limits: **No third-party scheduler is documented for Shiplog in this repository** (no Buffer or similar references under Shiplog paths; repo search). **Operating rule:** Luigi publishes or schedules on each network manually (or via that network’s native scheduling) **only after explicit approval** of the exact post text and media; never “publish now” without his OK (`AGENTS.md` hard rule 8).
- Approval flow: **Luigi must explicitly approve** each piece and version before anything is published (`AGENTS.md` hard rule 8).

## Assets

- Where masters, jingles, bumpers, B-roll, photos live (folder or drive name, no credentials):
  - **In this repo (safe to cite in prompts):** `public/brand/`, `public/logo.svg`, `public/og.png`, `docs/screenshots/`.
  - **Rendered demo exports and project masters** (full timelines, music beds, non-repo B-roll): **not stored in this git repository** (directory listing `public/`, `docs/`, repo root — no `content/` or `video-masters/` tree). **Operating rule:** keep work-in-progress and masters in Luigi’s local content workspace; deliver **Review packages** to Luigi per `video-review-package` skill; only commit docs/scripts/brand assets unless he asks to add a specific export.
- Consent sources for featured people: **No consent records or release files exist in this repository** (searched repo for consent/release patterns; none for Shiplog marketing). **Operating rule:** do not show identifiable third parties (faces, names, DMs) in Shiplog posts or demos; use screen capture of the product, maintainer-voiced narration, and in-repo mascot/brand only unless Luigi provides a written consent note stored outside public git.

## Claims

- Verified claims we can make (with source):
  - Shiplog drafts changelogs from merged PRs and release notes from version tags for Cursor Origin installations (see repo `README.md`).
  - Public changelog pages, read-only JSON API, and MCP are described in `README.md` — only show flows that work in the current deployment/repo.
  - Brand colors, logos, and mascot assets exist at paths listed above in this repository.
  - Open source **Apache-2.0** (`package.json`, X profile bio).
- Banned claims:
  - Features or pages that are broken, mocked, or not shipped in this repo.
  - Mixing other Luigi brands or unrelated products.
  - Publishing without Luigi’s explicit OK.
  - Stating that Shiplog is published on the Origin App marketplace before `README.md` “Publishing (not done yet)” steps are complete.

## Video specifics

- Default formats and durations:
  - Primary deliverable: **~30 s daily demo video** of a **real, working Shiplog feature** — **screen recording of the real app**, never slideshow-style stills.
  - Complete edit required: jump cuts, audio cleanup, transitions/SFX, integrated plates (`reel-production-complete-edit`).
  - **Aspect ratio:** vertical **9:16**, **1080×1920** for social demos (consistent with `content-tools/preflight_deliver.sh` examples and published Bluesky/Mastodon video posts).
- Intro/outro rules:
  - **No mandatory branded intro bumper** in repo; demos **start in the feature** (README, UI, or Origin flow) with optional **1–3 s** logo plate built from `public/logo.svg` / mascot per `docs/ffmpeg-cookbook.md` §6 if needed.
  - **Outro:** land on **https://shiplog.help** homepage or the feature page shown in the demo (matches published alt-text: *“Ends on the shiplog.help homepage”*).
  - License line in VO or post when relevant: **Open source, Apache-2.0, app for Cursor Origin** (as on live posts).
- Caption style (font, size, colors, position):
  - **Burned-in subtitles (9:16):** default to `docs/ffmpeg-cookbook.md` §5.1 — **Inter Bold**, **FontSize=64**, white `&H00FFFFFF` with black outline, **Alignment=2** (bottom center), **MarginV=420** on **1080×1920**; keep text out of face/UI safe zones.
  - **On-screen titles / plates:** prefer **Oswald** (headlines) and **Manrope** (body) when drawtext/cookbook allows, with **navy `#13235A`** or **white on navy panel** and accent **red `#F2382B`** for emphasis — aligned with `app/globals.css`.
  - **Social post text** (not burned in): English on product accounts; no markdown or production notes in publishable files (`docs/qa-checklist.md` §B).

## Content focus (Shiplog)

- Demos must show the **real app** with **real recordings** (install, setup, changelog generation, public changelog page, API/MCP, etc.).
- Social posts promote the same story on X, Bluesky, and Mastodon accounts listed above.
- Primary skills for this repo: `reel-production-complete-edit`, `video-review-package`, `short-form-reel-editor`, `social-content-with-purpose`, `qa-texto-anti-tropes-llm`, `ai-copywriter`.

## Sources

Values above were verified on **2026-11-10** from:

| Topic | Source |
|-------|--------|
| Product definition, API/MCP, install flows | `README.md`, `app/(site)/page.tsx` |
| Audience / tagline | Landing hero (`app/(site)/page.tsx`), X OG description (https://x.com/shiplogoss), Bluesky/Mastodon profile bios |
| Brand colors, fonts, logos | `app/globals.css`, `app/layout.tsx`, `TRADEMARKS.md`, `public/brand/` |
| Harbor palette | `TRADEMARKS.md` |
| Production URLs | `README.md`, `https://shiplog.help` (live fetch), tests referencing `shiplog.help` |
| Social handles and post style | https://bsky.app/profile/shiploghelp.bsky.social, https://mastodon.social/@shiploghelp, https://x.com/shiplogoss (Apify fetch) |
| Maintainer | `.github/CODEOWNERS`, GitHub repo owner |
| Luigi personal profiles (voice boundary) | User-provided public URLs cross-checked: X @LuigiMdpDev, YouTube @LuigiRaffaeleSiano, LinkedIn /in/luigicanoro |
| License | `package.json` (`Apache-2.0`), X bio |
| Video format (~30 s vertical, VO+captions, outro) | Bluesky/Mastodon post descriptions and alt-text on video posts |
| Caption ffmpeg defaults | `docs/ffmpeg-cookbook.md` §5.1 |
| No in-repo video masters / consent files | Repo tree `public/`, `docs/`, root; no consent artifacts |
| No Buffer/scheduler for Shiplog | Repo grep (no Buffer under Shiplog content paths); Shiplog-specific operating rule |
| Independence from Cursor | `app/(site)/page.tsx` footer |
| Publishing status | `README.md` § Publishing (not done yet) |
