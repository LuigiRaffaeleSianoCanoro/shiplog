# Progress and decision log

Roadmap source: shiplog-estrategia.md, section 3. One small PR per item against `feat/mvp`.

## Decisions

- 2026-10-15. No Neon AI Gateway credentials or model config on the build box, so implement, test and review were done directly by the agent, not delegated to claude-opus-5-5, grok-4-6 or claude-fable-5-1.
- 2026-10-15. Item 1. The demo video and marketplace review need Luigi, so this PR covers only SECURITY.md, CONTRIBUTING.md and CI. LICENSE was already added in PR #3.
- 2026-10-15. Item 1. CI runs gitleaks as a pinned binary instead of gitleaks-action, so no license key or paid service is involved.
- 2026-10-15. Item 1. Vulnerability reports go through GitHub private vulnerability reporting. It must be enabled once in repo settings (Security, Private vulnerability reporting).

- 2026-10-15. Item 1. The push token has no `workflow` scope, so GitHub refused `.github/workflows/ci.yml`. The workflow ships at `docs/ci/ci.yml`. Activating it is one move (`git mv docs/ci/ci.yml .github/workflows/ci.yml`) by someone whose token has that scope. Routing around the scope was not attempted.
- 2026-10-15. Item 2. Config is read from `.shiplog.yml` on the default branch through the Origin Get Contents API (scope `repository:contents:read`, already requested). Without Origin credentials (local, tests) the defaults apply.
- 2026-10-15. Item 2. Parsed with the `yaml` package (free, no deps) rather than a hand-written parser. Repo content is untrusted, so unknown sections, bad modes and paths with `..` or absolute paths fall back to defaults.
- 2026-10-15. Item 2. Excluded PRs are recorded as `ignored` jobs with the reason and get no comment, to keep PRs quiet. Default exclude label is `skip-changelog`.
- 2026-10-15. Item 2. `mode: prompt` downgrades only the Cursor agent mode to the prompt fallback. Neon test mode is left alone because it is an operator switch.
- 2026-10-15. Item 2. Config is loaded once per event, no caching. One extra Origin read per event is cheap and avoids stale config.
- 2026-10-15. Item 3. `/shiplog skip` and `/shiplog entry` are read back from the PR's comments at merge time (Origin List Pull Request Comments) instead of being stored. No new store table, so no Supabase change, and an edited or later command simply wins.
- 2026-10-15. Item 3. Commands use the same authorization as `/shiplog release` (installer, or write or admin on the repo). Unauthorized commands get the refusal comment and are ignored at merge.
- 2026-10-15. Item 3. Shiplog acknowledges each accepted command with a comment so the author knows it registered.
- 2026-10-15. Item 3. `no-changelog` is always honored, even when `.shiplog.yml` overrides `exclude.labels`.
- 2026-10-15. Item 3. In Neon test mode an entry override is written directly, with no model call. Agent and prompt modes pass it to the agent verbatim inside an `<entry>` tag.
- 2026-10-15. Item 3. Fixed author matching from item 2 to read Origin's real fields (`user.handle`, `app.displayName`, `serviceAccount.displayName`) per the List Pull Request Comments schema.
- 2026-10-15. Item 5. Breaking is detected from the PR title (`type!:` or `type(scope)!:`) or a `BREAKING CHANGE:` footer in the body, per Conventional Commits. A loose mention of "breaking change" in prose does not count.
- 2026-10-15. Item 5. Breaking entries are marked in the changelog with a `**BREAKING:**` prefix. That keeps the signal in the file itself, so the release suggestion needs no extra stored state and works for agent-written changelogs too.
- 2026-10-15. Item 5. Bump rule follows semver with Keep a Changelog sections. Breaking or Removed gives major, Added or Deprecated gives minor, everything else patch. The suggestion is advisory. Shiplog still cuts the version the user asked for and flags a mismatch.
- 2026-10-15. Item 5. For agent and prompt modes the suggestion reads the repo's changelog file through Origin. Without Origin credentials there is no suggestion.
- 2026-10-15. Item 4. Batch mode is a `.shiplog.yml` option (`batch: off`, `release` or `daily`), default off so current installs keep one agent per PR.
- 2026-10-15. Item 4. Queued PRs are ordinary jobs with status `queued` (already in the Job type) and their entry data as JSON in `result`. No schema change, so no Supabase migration.
- 2026-10-15. Item 4. `batch: release` folds every queued PR into the release agent run, so a release costs one run total. `batch: daily` flushes from the existing daily Vercel cron (`/api/cron/poll`), one agent per repo. The dashboard view does not flush, so opening it never spends money.
- 2026-10-15. Item 4. Batching applies only to Cursor agent mode. Prompt and Neon modes cost the key owner nothing, so they stay per PR.
- 2026-10-15. Item 4. The dashboard shows agent runs per installation (last 30 days and total) and which key pays (personal or service account). Runs are counted from jobs with an agent id. Exact credit cost is not available from the Cursor API used here.
- 2026-10-15. Item 6. Public changelog lives at `/{namespace}/{repo}` with `feed.xml` (RSS) and `feed.json`. Harbor styling is scoped to that route group so the marketing site stays unchanged.
- 2026-10-15. Item 6. Pages read markdown from the existing store (`getChangelog`). Agent mode still edits `CHANGELOG.md` in the repo, so the public page reflects neon test mode and any release cuts that write to the store until a future sync from Origin is added.
- 2026-10-15. Item 6. Only active installations with a matching `namespace` can be viewed. Disconnected installs return 404. Slug segments are restricted to safe characters.

- 2026-10-15. Item 7. Outbound notify webhooks are optional HTTPS URLs the user provides (Slack incoming webhook, Discord webhook, or generic JSON POST). Shiplog POSTs from the server with `fetch`; Luigi pays no email or messaging vendor.
- 2026-10-15. Item 7. URLs are stored per installation on the setup page (`/api/notify`, session-gated like keys) and/or per repo in `.shiplog.yml` as `notify.webhooks`. Blob and memory stores keep them on the installation record; Supabase stores installation URLs in the existing changelogs table under `@notify:<installationId>` so no migration is needed.
- 2026-10-15. Item 7. Events: changelog entry written (neon test mode immediately; Cursor mode when the agent PR is detected) and release cut (neon immediately; Cursor when the release PR is detected). Queued batch PRs notify only when the batch agent finishes. Prompt-only fallback does not notify (no changelog file write).
- 2026-10-15. Item 7. Delivery failures are logged with query strings redacted and never fail the job. Invalid URLs are skipped at save time and at send time.
- 2026-10-15. Item 7. No Neon AI Gateway credentials on the cloud agent VM; implementation and tests were done directly by the agent (same pattern as items 1–6).

- 2026-10-15. Item 8. No Neon AI Gateway from the Cloud Agent VM, so implement, test and review were done directly by the agent (same constraint as the global note above).
- 2026-10-15. Item 8. Audience notes are opt-in via `.shiplog.yml` `notes.audiences` (`technical`, `customer`) and `notes.languages` (`en`, `es` only). Default is off so existing repos behave the same.
- 2026-10-15. Item 8. Notes are generated on **release** (tag or `/shiplog release`), not on every merged PR, to avoid extra model or agent cost.
- 2026-10-15. Item 8. Neon test mode stores JSON bundles with `putChangelog` under `owner/repo::notes::X.Y.Z` (reuses the changelog blob table, no Supabase migration). Agent mode writes `.shiplog/notes/<version>/<audience>.<lang>.md` per the release prompt.
- 2026-10-15. Item 8. User-facing PR comments use `#### Technical (en)` headings and never the pipe character in generated copy.
- 2026-10-15. Item 9. No Neon AI Gateway credentials on the build box, so implement, test and review were done directly by the agent (same as items 1 to 8).
- 2026-10-15. Item 9. Initial changelog backfill runs on `installation.created` (all installation repos) and lazily on the first repo webhook when a repo was not covered yet. Idempotency uses `historyBackfillAt` on the installation record plus a check that the repo changelog file is still empty.
- 2026-10-15. Item 9. History is built deterministically from merged PR titles (Keep a Changelog sections, exclude labels) and semver tags (tag commit time when Origin returns it). It commits through `git/commits:createFromFiles` when Origin is configured; neon test mode also mirrors into stored changelog.
- 2026-10-15. Item 9. `.shiplog.yml` accepts `history.enabled`, `history.max_prs` and `history.max_tags` (snake_case aliases). Default helps first-time installs without extra config.
- 2026-10-15. Item 10. Self-host guide lives at `docs/self-host.md` with README Deploy-to-Vercel button (clone URL on `feat/mvp`, env names prefilled, `envLink` to the guide). `.env.example` lists every variable read under `lib/` and `app/`. `test/env-docs.test.ts` enforces that list.
- 2026-10-15. Item 10. Default recommendation for self-hosters is keyless mode (`SHIPLOG_BYOK_ENABLED=false`) for US$0 LLM spend; BYOK remains the production default for the maintainer deploy.
- 2026-10-15. Item 10. No Neon AI Gateway on the build box; `npm test` and `npm run build` were run on the agent VM only. The first `next build` failed on a transient `next/font` Google fetch error; a immediate retry succeeded.

- 2026-10-15. Item 11. Polling stays on Vercel Cron plus optional external schedulers. No Supabase `pg_cron` or `pg_net` (owner decision). `vercel.json` keeps the daily Hobby schedule; Pro and GitHub Actions are documented for faster intervals.
- 2026-10-15. Item 11. `/api/cron/poll` uses constant-time `CRON_SECRET` bearer auth and fails closed when the secret is unset. Overlapping callers get `{ skipped: true }` via a store-backed lock (`CRON_POLL_LOCK_TTL_MS`, default 90s).
- 2026-10-15. Item 11. `flushBatches` re-checks queued jobs before launch; `pollAgents` posts the PR comment only on the first transition to a PR URL.
- 2026-10-15. Item 11. Implement, test and self-review were done directly on the agent VM. The Neon AI Gateway is not reachable from this environment (same as item 1).

- 2026-10-15. Item 1 (CI activation). Moved `docs/ci/ci.yml` to `.github/workflows/ci.yml`. Steps: `npm ci`, `npx tsc --noEmit`, `npm test`, `npm run build`, then pinned gitleaks (unchanged from the parked workflow). Triggers on `main`, `feat/mvp`, and all pull requests.
- 2026-10-15. Item 1 (CI activation). Did not add `docs/ci/cron-poll.yml` under `.github/workflows/` because it requires `CRON_SECRET` (and a real `SHIPLOG_URL`). The template stays in `docs/ci/` for operators who opt in.
- 2026-10-15. Item 1 (CI activation). Added `.github/dependabot.yml` for weekly npm and github-actions updates (`open-pull-requests-limit: 10` each).
- 2026-10-15. Item 1 (CI activation). Fixed `test/notify.test.ts` fetch mock typing so `npx tsc --noEmit` is clean (typed `vi.fn` args; read `init.body` with optional chaining).
- 2026-10-15. Item 1 (CI activation). Push of `.github/workflows/ci.yml` and `.github/dependabot.yml` succeeded from the cloud agent token (PR #16). Unlike the earlier attempt, no `workflow` scope error was returned.
- 2026-10-15. Item 1 (CI activation). First CI run failed on gitleaks: a PEM-shaped fixture in `test/backfill.test.ts` (two commits in history). Replaced it with a plain placeholder and added `.gitleaks.toml` allowlist for `test/` so runtime-generated test keys do not fail the scan.
- 2026-10-15. Item 1 (CI activation). GitHub Actions `next build` failed on `next/font` for `Big Shoulders` (missing override metadata). Root layout now uses `Oswald` (already used on public changelog pages) so CI builds do not depend on that font catalog entry.
- 2026-10-15. Item 1 (OSS templates). Added `.github/CODEOWNERS`, issue forms (bug and feature), `pull_request_template.md`, and `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1). Security and conduct reports use GitHub private vulnerability reporting per SECURITY.md. Secret scanning, push protection, Dependabot and private vulnerability reporting are enabled in repo settings.

- 2026-10-15. Item 14. No Neon AI Gateway on the build box; implement, test and self-review were done directly by the agent (same as items 1 to 13).
- 2026-10-15. Item 14. Read-only HTTP API lives under `/api/v1/changelogs/…` with `apiVersion: v1`, reusing `parseChangelogDocument` and the same active-installation plus slug rules as `resolvePublicChangelog`. Monorepo paths use the `changelog` query param and the existing `repo::path` storage keys (`listChangelogKeysForRepo` on the store; notes and `@notify` keys are excluded from package listings).
- 2026-10-15. Item 14. MCP is a stateless Streamable HTTP handler at `/api/mcp` using `@modelcontextprotocol/sdk` (`WebStandardStreamableHTTPServerTransport`), exposing read-only tools `get_changelog`, `get_release`, and `list_packages` backed by the same lib helpers as the REST routes. No API keys or new Origin scopes; public visibility only.
- 2026-10-15. Item 14. Verified locally on `npm start` with `SHIPLOG_DATA_FILE`: `GET /api/v1/changelogs/acme/demo` and `GET …/releases/1.0.0` returned 200 JSON; `POST /api/mcp` with `Accept: application/json, text/event-stream` returned `initialize` over SSE.

- 2026-10-15. Item 5.4 (monetization readiness 1–2). Added `.github/FUNDING.yml` with GitHub Sponsors only (`LuigiRaffaeleSianoCanoro`). No Ko-fi, Buy Me a Coffee, or other third-party funding URLs.
- 2026-10-15. Item 5.4. Public changelog badge copy is **Changelog by Shiplog**, on by default. Opt out with `powered_by: false` in `.shiplog.yml` (camelCase `poweredBy` accepted). Config is loaded through the shared `loadRepoConfig` helper (same Origin contents read as other options).
- 2026-10-15. Item 5.4. Dashboard and setup link to `https://github.com/sponsors/LuigiRaffaeleSianoCanoro` via `lib/sponsors.ts` (**Support Shiplog**). No invented payment URLs.
- 2026-10-15. Item 5.4. No Neon AI Gateway on the build box; `npm test` and `npm run build` were run directly on the agent VM (same pattern as prior items).

- 2026-10-15. OSS docs hygiene (strategy 4.1 and 4.7). Added [TRADEMARKS.md](TRADEMARKS.md) (names Shiplog, Harbor, sail mark, brand colors; Apache-2.0 does not grant trademark use) and [ROADMAP.md](ROADMAP.md) (items 1–11, 13, 14 and monetization badge or FUNDING marked done on `feat/mvp`; 12, 15, 16 later). Linked both from README Contributing. No Neon AI Gateway on the build box; `npm test` run on the agent VM only.

- 2026-10-15. Item 12 (direction). Origin App stays primary. A separate GitHub App install path covers GitHub-native and GitHub-mirrored repos where Origin does not deliver `repository.pushed`. Same Vercel host, new route `/api/webhooks/github`, env `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`. Shared changelog core (classify, batch, notes, notify, public pages, read API and MCP) behind a thin provider adapter. Installations record `provider=origin` or `provider=github`; dual install and independent uninstall. v1 GitHub events: merged `pull_request`, `/shiplog` via `issue_comment` or `pull_request_review_comment`, tag `push` when available. GitHub-only BYOK uses OpenAI-compatible or Neon-style keys or prompt-only; Cursor agent mode is Origin-first and on GitHub only when Cursor can reach the repo. Out of scope for first slice: items 15–16, full webhook or install implementation, GitHub Marketplace listing. ADR: [docs/adr/0012-github-app.md](docs/adr/0012-github-app.md).

- 2026-10-15. Item 12 (first slice). Shipped `POST /api/webhooks/github` (HMAC `GITHUB_WEBHOOK_SECRET`, `X-GitHub-Delivery` dedupe), `lib/github-adapter.ts` into the existing `handleEvent` pipeline, and GitHub install at `/api/github/install/start` with callback `/api/github/install/callback` persisting `provider=github`. Origin callback sets `provider=origin`. No Supabase migration; `provider` lives on installation JSON in Blob or memory stores like `notifyWebhooks`. Tests cover signature tampering, adapter routing, route persistence, and independent uninstall. Follow-up: GitHub REST for PR comments and permission checks on GitHub-only installs.

- 2026-10-16. Item 12 (second slice). Added `lib/github-api.ts` (GitHub App JWT, installation access token cache, PR issue comments, contents read, PR files, merged PR and tag history, collaborator permission mapping) and `lib/vcs.ts` to route changelog pipeline calls by `provider`. `jobs.ts`, `repo-config.ts`, and `backfill.ts` use the VCS facade so GitHub-only installs post acknowledgements, prompt fallbacks, and permission refusals without Origin credentials. Setup and dashboard show provider badges, dual install links, and provider-specific uninstall copy. Documented GitHub App permissions in `docs/self-host.md`. Tests: `github-api.test.ts`, `vcs-provider.test.ts`, `github-vcs-jobs.test.ts`. No Supabase migration. Origin behavior unchanged when `provider=origin`.

## Left to do

- Item 2. Neon test mode keeps its own stored changelog and ignores `changelog:` (path matters only for agent and prompt modes).
- Item 3. Without Origin credentials (local runs) commands are not read at merge time. Only labels apply there.
- Item 5. Pre-1.0 versions get plain semver bumps (0.x to 1.0.0 on breaking). No special 0.x rule.
- Item 4. Queued PRs wait forever if `batch: release` is set and no release is ever cut, or if the key is removed. A dashboard flush button or expiry would close this.
- Item 4. Run cost in money is not shown, only the run count.

- 2026-10-15. Item 13. No Neon AI Gateway credentials on the build box, so implement, test and review were done directly by the agent.
- 2026-10-15. Item 13. Monorepo routing uses Origin List Pull Request Files (`GET /v1/origin/repos/{owner}/{repo}/pulls/{number}/files`, scope `repository:pull_requests:read`, already in the install scope list). Without Origin credentials (local, tests) package routing falls back to the root `changelog` path only.
- 2026-10-15. Item 13. Optional `packages` in `.shiplog.yml` maps a name to path globs and a changelog file. `orphan: root` (default) sends unmatched files to the root changelog; `orphan: ignore` drops PRs that touch only unmatched paths.
- 2026-10-15. Item 13. One merged PR can update several changelogs. Agent and prompt modes use a single run with a multi-file prompt. Batch daily flush groups queued PRs by changelog path. Release bump notes and neon cuts iterate every configured changelog.
- 2026-10-15. Item 13. Neon test mode stores each changelog under `repo::path` when the path is not the default `CHANGELOG.md`, so single-changelog repos keep the existing storage key.
- Item 6. Public page does not yet pull `CHANGELOG.md` from Origin for cursor or prompt mode installs. Luigi or a follow-up can add optional `.shiplog.yml` `public: true` plus Origin file fetch.
- Item 8. Per-PR audience snippets (before release) and languages beyond en/es are not implemented.
- Item 1. Record the 5 to 10 minute demo video and pass Origin marketplace review (needs Luigi).
- Item 7. Email notifications are out of scope (webhook-only per roadmap). Retry/backoff for failed webhooks is not implemented.
- Item 14. MCP has no OAuth or per-repo URL tokens (public read only). Optional API rate limiting and OpenAPI export are not implemented.
