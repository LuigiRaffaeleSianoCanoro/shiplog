# Roadmap

Public priorities for Shiplog. Work lands on `main` in small PRs. The evidence-based engineering list, with one row per item and its status, is [docs/BACKLOG.md](docs/BACKLOG.md). Implementation notes and tradeoffs live in [PROGRESS.md](PROGRESS.md).

Status key: **Done** is merged on `main`. **Next** is the near-term focus. **Later** needs product direction before build.

## Done

1. **Open source hygiene**: Apache-2.0, SECURITY.md, CONTRIBUTING.md, CI, Dependabot, issue and PR templates, CODE_OF_CONDUCT.md, governance docs
2. **Per-repo config**: `.shiplog.yml`
3. **PR commands**: `/shiplog skip`, `/shiplog entry`, `/shiplog release`
4. **Batch mode**: `batch: release` and `batch: daily`, with dashboard run visibility. Bot PRs can be grouped into one bullet and internal types skipped with a reason (`group_bots`, `skip_types`, #77)
5. **Breaking changes**: detection and advisory semver bump suggestions
6. **Public changelog pages**: Harbor styling, RSS and JSON feeds
7. **Notify webhooks**: Slack, Discord, generic HTTPS POST, with bounded retries (#64)
8. **Audience release notes**: technical and customer, en and es via `notes` in config
9. **History backfill**: seed `CHANGELOG.md` from merged PRs and semver tags
10. **Self-host**: [docs/self-host.md](docs/self-host.md) and the Deploy to Vercel flow
11. **Agent polling**: Vercel Cron, lock, documented external schedulers, weekly namespace index backfill (#74)
12. **GitHub App**: GitHub-native and mirrored repos, webhooks, install path, REST client, dual-provider setup and dashboard ([ADR 0012](docs/adr/0012-github-app.md)). Labels and authors on GitHub PRs feed the exclude rules (#76)
13. **Monorepo**: multiple changelogs via `packages` in `.shiplog.yml`
14. **Read-only API and MCP**: `/api/v1/changelogs/…` and `/api/mcp`, described in [OpenAPI 3.1](docs/openapi/v1-changelogs.yaml) with a drift test (#75)
15. **In-app "What's new" widget**: `public/widget.js` reads a repo's `feed.json` and shows unread releases in a badge and panel (#72, #73)

**Reliability on `main` (November 2026)**: public changelogs are served with ISR and a narrower middleware (#70). A Blob store that refuses reads returns `503 store_unavailable` instead of 500 on the API, feeds and MCP (#57, #62). `/api/health` proves Blob is readable (#58). The MCP HTTP route has its own tests (#65). The read API and MCP have per-IP rate limits (#79), and queued PRs that wait too long get recovered by the daily cron (#80).

**Monetization readiness**

- GitHub Sponsors via [`.github/FUNDING.yml`](.github/FUNDING.yml)
- Default **Changelog by Shiplog** badge on public pages (`powered_by` in `.shiplog.yml`)

## Next

- **Release preview in the dashboard**: show the batch draft next to "Left out of the changelog, and why" (the data shipped in #77). UI, so it needs a design pass first (backlog 21).
- **Outage status on public changelog pages**: answer a `no-store` 5xx instead of a 200 when the store is down. In review as #81 (backlog 7).
- **Origin marketplace publish**: record the public demo video and complete Cursor Origin app review (see [README.md](README.md#publishing-not-done-yet)). Needs the maintainer (backlog 17).

## Later

- **Paid hosted Shiplog plan** (roadmap 16): hosted offering beyond self-host and BYOK; not scoped yet (backlog 24)
- **MCP auth** with per-repo tokens or OAuth (backlog 19)
- **GitHub Marketplace listing** for the GitHub App (backlog 18)

## How to contribute

Pick an item, read its row in [docs/BACKLOG.md](docs/BACKLOG.md) and the matching notes in [PROGRESS.md](PROGRESS.md), then open a small PR against `main`. Issues labeled `good first issue` (#33 to #40) are kept for new contributors; see the list in [docs/BACKLOG.md](docs/BACKLOG.md#reserved-for-community-good-first-issue). For brand use, see [TRADEMARKS.md](TRADEMARKS.md).
