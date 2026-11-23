# Shiplog engineering backlog

Evidence-based priorities for `main`, refreshed 2026-11-23. It replaces the draft in PR #61 and keeps its numbering, so older PRs that cite "backlog N" still resolve. Each row names the problem, the evidence, and the PR that closed it or the fix still open. Issues #33 to #40 are reserved for community contributors and listed at the end.

Size: S is under a day, M is 2 to 4 days, L is a week or more. **UI** means the change needs image proposals and a visual OK before it merges.

## Done

1. **Blob store-auth failure returns 503, not 500.** A Vercel Blob 403 used to surface as a 500 on public pages and the read API. Fixed in #57: `StoreAuthError`, typed `head()` and `list()` errors, `store_unavailable` JSON with `no-store`.
2. **Health proves Blob is readable.** `/api/health` reported healthy from env vars alone. Fixed in #58: it lists and reads one blob, with a timeout, and returns 503 when the read fails.
3. **MCP tools propagate `StoreAuthError`.** Fixed in #62.
4. **Dependabot bumps landed.** Merged individually after green CI (#42, #43, #45, #46, #47, #48, #53, #54, #55, #67, #68, #69; #56 is row 16), plus the zod advisory override in #71. The bundle in #60 is left for the maintainer.
5. **Stale `feat/mvp` guidance removed** from operator docs in #59.
6. **ROADMAP and PROGRESS refreshed for `main`.** This file's PR.
11. **Notify webhooks retry with backoff.** Fixed in #64: bounded retries, honours `Retry-After`, per-attempt timeout.
12. **OpenAPI description for `/api/v1/changelogs`.** Added in #75 with a drift test that runs the real route handlers against the spec.
14. **Namespace index backfill is scheduled.** Weekly cron and runbook in #74.
15. **Vitest coverage for the MCP HTTP transport.** Added in #65.
16. **`posthog-node` v5.** Merged as #56. The edge guard in `test/middleware-edge.test.ts` stayed green.
20. **In-app "What's new" widget (roadmap 15).** `public/widget.js` in #73, with CORS on `feed.json` in #72.
22. **GitHub exclude rules.** GitHub PR webhooks dropped labels and the author, so `exclude.labels`, `exclude.authors` and `no-changelog` never matched on GitHub repos. Fixed in #76.
23. **Group bot PRs and explain skips (competitor proposal 2).** `group_bots` and `skip_types` in `.shiplog.yml`, and a "Left out of the changelog, and why" block on batched release comments. Added in #77.

## Next

7. **Public changelog HTML should return 503 when the store is down.** The unavailable view renders with HTTP 200, which monitors and caches read as healthy. Evidence: `app/(changelog)/[namespace]/[repo]/page.tsx`. Size M. **UI.**
8. **Optional live sync from the repo's `CHANGELOG.md`.** Agent and prompt modes write the changelog in git, but the public page reads only the Blob store, so it can lag. Evidence: `lib/public-changelog.ts`. Fix: a `.shiplog.yml` flag and a contents read with fallback. Size L.
9. **Batch queue recovery.** Queued PRs never run if no release is cut or the Cursor key is removed. Evidence: `lib/jobs.ts` `flushBatches` skips when there is no key. Fix: an expiry and an operator-visible stale state. Size M.
10. **Dashboard control for a manual batch flush.** Pairs with 9. Size M. **UI.**
13. **Rate limits for the read API and MCP.** Both are unauthenticated and MCP allows any origin. Fix: a per-IP token bucket and documented fair use. Size M.
21. **Release preview view in the dashboard.** Show the batch draft beside the left-out list from #77. Size M. **UI.**

17. **Origin marketplace publish.** Needs the maintainer's demo video and Cursor Origin app review.

## Later

18. **GitHub Marketplace listing** for the GitHub App. See [ADR 0012](adr/0012-github-app.md).
19. **MCP auth** with per-repo tokens or OAuth. Depends on 13.
24. **Paid hosted Shiplog plan (roadmap 16).** Depends on 19.

## Reserved for community (`good first issue`)

Do not implement these in maintainer or agent PRs.

- #33 Add pt-BR and it languages for audience release notes
- #34 Example `.shiplog.yml` for monorepos under `docs/examples`
- #35 Improve accessibility on the public changelog page
- #36 Self-host guide screenshots and drop the stale deploy note
- #37 Spanish README section
- #38 `ADOPTERS.md` one-line PR instructions
- #39 "Your first PR in 15 minutes" in CONTRIBUTING. CONTRIBUTING.md has had this section since #31, so the issue looks done; left open for the maintainer to confirm and close.
- #40 Replace stale `feat/mvp` contributor guidance. #59 removed it from the operator docs, so this one also looks done; same as #39.
