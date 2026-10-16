# Roadmap

Public priorities for Shiplog on the `feat/mvp` line. Source list: internal strategy doc section 3. Implementation notes and tradeoffs live in [PROGRESS.md](PROGRESS.md).

Status key: **Done** shipped on `feat/mvp`. **Next** is the near-term focus after the MVP slice. **Later** needs product direction before build.

## Done on `feat/mvp`

1. **Open source hygiene** — Apache-2.0, SECURITY.md, CONTRIBUTING.md, CI, Dependabot, issue and PR templates, CODE_OF_CONDUCT.md
2. **Per-repo config** — `.shiplog.yml`
3. **PR commands** — `/shiplog skip`, `/shiplog entry`, `/shiplog release`
4. **Batch mode** — `batch: release` and `batch: daily`, with dashboard run visibility
5. **Breaking changes** — detection and advisory semver bump suggestions
6. **Public changelog pages** — Harbor styling, RSS and JSON feeds
7. **Notify webhooks** — Slack, Discord, generic HTTPS POST
8. **Audience release notes** — technical and customer, en and es via `notes` in config
9. **History backfill** — seed `CHANGELOG.md` from merged PRs and semver tags
10. **Self-host** — `docs/self-host.md` and Deploy to Vercel flow
11. **Agent polling** — Vercel Cron, lock, documented external schedulers
13. **Monorepo** — multiple changelogs via `packages` in `.shiplog.yml`
14. **Read-only API and MCP** — `/api/v1/changelogs/…` and `/api/mcp`
12. **GitHub App** — GitHub-native and mirrored repos: webhooks, install path, GitHub REST client, dual-provider setup and dashboard UX ([docs/adr/0012-github-app.md](docs/adr/0012-github-app.md))

**Monetization readiness (section 5.4)**

- GitHub Sponsors via [`.github/FUNDING.yml`](.github/FUNDING.yml)
- Default **Changelog by Shiplog** badge on public pages (`powered_by` in `.shiplog.yml`)

## Next

- **Origin marketplace publish** — record the public demo video and complete Cursor Origin app review (see [README.md](README.md#publishing-not-done-yet)). Needs the maintainer; tracked in PROGRESS.md.

## Later

15. **In-app changelog widget** — embed or surface changelogs inside other products; not scoped yet

16. **Paid hosted Shiplog plan** — hosted offering beyond self-host and BYOK; not scoped yet

## How to contribute

Pick an item, read the matching notes in [PROGRESS.md](PROGRESS.md), and open a small PR against `feat/mvp`. For brand use, see [TRADEMARKS.md](TRADEMARKS.md).
