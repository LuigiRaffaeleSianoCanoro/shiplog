# Shiplog — your merges, written up

AI changelog & release notes for **Cursor Origin**. An Origin App that turns each merged PR into a [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) entry and each version tag into release notes. Agents run on the installer's own Cursor plan.

## How it works
| Trigger | Origin event | What Shiplog does |
|---|---|---|
| Install | redirect to `/api/install/callback?installation_receipt=<JWT>` + `installation.created` | Verifies the receipt (EdDSA, `typ origin-installation-receipt+jwt`, iss/aud/exp via JWKS), reads the installation id from `sub`, sets a signed session cookie, sends you to `/setup` |
| PR merged | `pull_request.merged` | Classifies the title (feat→Added, fix→Fixed…) and drafts the entry |
| Version tag | `repository.pushed` with `refUpdates[].ref` = `refs/tags/vX.Y.Z` | Moves Unreleased into `## [X.Y.Z] - YYYY-MM-DD` with a summary. **Native Origin repos only**: Origin does not deliver `repository.pushed` for GitHub-mirrored repos |
| PR comment | `pull_request.comment.created` with `/shiplog release vX.Y.Z` | Same as a tag (works on mirrored repos too) |
| Uninstall | `installation.deleted` | Marks the installation Disconnected, deletes the key, ignores later webhooks |

### Modes
1. **Cursor key (production default).** The installer pastes a Cursor user or service-account API key on `/setup`. This is the path Cursor confirmed (support ticket T-H28768). Origin installation tokens can't call `POST /v1/agents`. Shiplog launches a cloud agent with `autoCreatePR: true` that edits only `CHANGELOG.md`. It polls `GET /v1/agents/{id}/runs/{runId}` and posts the PR link from `run.git.branches[].prUrl` back on the source PR.
2. **No key (fallback).** Shiplog posts a PR comment with a ready-to-run prompt; this costs $0 of anyone's LLM. `SHIPLOG_BYOK_ENABLED=false` forces this mode for everyone.
3. **Test mode** (`SHIPLOG_LLM_PROVIDER=neon`). Shiplog drafts entries and notes directly through an OpenAI-compatible gateway (Neon AI Gateway, `claude-opus-5-5`) and keeps the changelog in storage. This is for end-to-end testing without Cursor keys.

## Per-repo config (.shiplog.yml)

Optional. Put it at the repo root (default branch). Every key is optional; bad values fall back to defaults.

```yaml
sections:            # extra prefix to section mappings (Added, Changed, Deprecated, Removed, Fixed, Security)
  deps: Security
exclude:
  labels: [skip-changelog]          # default
  authors: [dependabot, "renovate*", bots]   # "bots" matches any app or service account
language: en
tone: concise, user-facing
changelog: CHANGELOG.md
mode: agent          # or "prompt": never launch an agent, post a ready-to-run prompt instead
batch: off           # "release": one agent per release; "daily": one agent per repo per day (cron)
history:             # initial CHANGELOG backfill on install (merged PRs + semver tags)
  enabled: true
  max_prs: 100
  max_tags: 50
```

On first install (and on the first webhook per repo), Shiplog can seed `CHANGELOG.md` from merged pull requests and existing semver tags when the file is still empty. Re-runs are skipped unless you call `POST /api/history/backfill` from an authenticated setup session with `{ "installationId", "repo?", "force": true }`.

## PR commands

Comment on a PR before it merges. Only the installer or someone with write or admin access can run them. The latest command wins.

- `/shiplog skip` leaves this PR out of the changelog.
- `/shiplog entry "Faster cold starts on Linux"` uses this exact text as the bullet.
- `/shiplog release v1.2.0` cuts release notes.

Breaking changes (`feat!:` titles or a `BREAKING CHANGE:` footer) are marked `**BREAKING:**` in the changelog, and the release comment suggests a major, minor or patch bump.

The `no-changelog` label always skips a PR, as does any label in `exclude.labels` (default `skip-changelog`).

## Security
- Webhooks: Origin `v1ed` scheme. Ed25519 over lowercase-hex SHA-256 of `"<webhook-id>.<webhook-timestamp>.<raw body>"`, checked against the JWKS (cached 10 min, refreshed on an unknown key), with a ±5 min window and dedupe on `webhook-id`. The receiver returns 202 and does the work in `after()`.
- Keys: AES-256-GCM, random 12-byte IV per record, installation id bound as AAD, `key_version` for rotation. Only the last 4 characters are shown and keys are never logged. Setting or removing a key requires the session cookie issued by a verified install receipt.
- Prompt injection: PR text is fenced as untrusted, and the agent is told to edit only `CHANGELOG.md`.
- Supabase: RLS on with no policies, so only the server-side service role can access the data.

## Origin App settings
- Webhook URL: `https://<deploy>/api/webhooks/origin`. Callback / redirect URL: `https://<deploy>/api/install/callback`
- Events: `pull_request.merged`, `pull_request.comment.created`, `repository.pushed` (installation.* are always sent)
- Scopes: PR read + `repository:pull_requests:reviews:write` (comments). Only if Shiplog writes PRs itself: `repository:pull_requests:write`, `repository:contents:write`.

## Develop
```bash
npm i && npm test && npm run build
cp .env.example .env.local   # fill values; openssl rand -base64 32 for SHIPLOG_KEY_ENC
# local end-to-end with signed webhooks + receipt (serves a throwaway JWKS on :4455):
SHIPLOG_LLM_PROVIDER=neon ORIGIN_APP_ID=app_local ORIGIN_JWKS_URL=http://127.0.0.1:4455/keys npm start &
node scripts/e2e-local.mjs
```
Storage: **Vercel Blob, private store `shiplog-store`** in production (free on Hobby; `BLOB_READ_WRITE_TOKEN` is injected when the store is connected to the project).
- One JSON document per record under `shiplog/v1/`, with no public URLs; only server code holding the token can read it. That is the RLS / service-role-only equivalent.
- Keys are AES-256-GCM sealed before they are written.
- Delivery dedupe is atomic: `put` without `allowOverwrite` fails on an existing pathname.
- Optional: Supabase when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set (`supabase/migrations/0001_shiplog.sql`). A local JSON file is used only outside Vercel, for dev.

## Deployment (Vercel, team luigi-canoros-projects)
Production: https://shiplog-luigi-canoros-projects.vercel.app. Vercel Authentication is off, so webhooks and pages are public.

| Env var | Status |
|---|---|
| `SHIPLOG_KEY_ENC`, `CRON_SECRET`, `SHIPLOG_DASHBOARD_TOKEN` | generated, sensitive |
| `SHIPLOG_LLM_PROVIDER=neon`, `SHIPLOG_NEON_MODEL`, `NEON_AI_GATEWAY_*` | test mode |
| `SHIPLOG_BYOK_ENABLED=true` | set |
| `SHIPLOG_INSTALL_ORIGIN` | `https://shiplog-luigi-canoros-projects.vercel.app`. Must be the host of an entry in the Origin app's `installationRedirectUris` (exact match). `/api/install/start` on any other host (e.g. shiplog.help) redirects here first. |
| `BLOB_READ_WRITE_TOKEN` | from the connected Blob store |
| `ORIGIN_APP_ID` (`app_01m4vhdccyfywsqbd9v26h126w`), `ORIGIN_APP_PRIVATE_KEY` | set, sensitive. App JWT verified live (`GET /v1/origin/app` returned 200), and a signed Origin ping was accepted (202). |

Origin App settings: webhook URL `https://shiplog-luigi-canoros-projects.vercel.app/api/webhooks/origin`, callback URL `https://shiplog-luigi-canoros-projects.vercel.app/api/install/callback`.

Polling: Vercel Hobby cron runs once a day (`vercel.json`), and the dashboard also polls whenever it is viewed. For minute-level polling, use Supabase `pg_cron` + `pg_net` to call `/api/cron/poll` with `CRON_SECRET`.

## Publishing (not done yet)
Per https://cursor.com/docs/origin/apps/publish:
1. Set the app to Public.
2. Record a public 5–10 min demo video covering install (personal and team namespaces, all repos and selected repos) and uninstall from both sides (Origin settings, and the Shiplog dashboard showing Disconnected).
3. Click Submit on the app settings page.

## Install (private app, owner namespace `luigi`)
Use https://shiplog-luigi-canoros-projects.vercel.app/api/install/start. It sets an anti-forgery `state` cookie and redirects to:
`https://cursor.com/codebase/apps/install?client_id=app_01m4vhdccyfywsqbd9v26h126w&scope=repository:contents:read repository:contents:write repository:pull_requests:read repository:pull_requests:reviews:read repository:pull_requests:reviews:write&redirect_uri=https://shiplog-luigi-canoros-projects.vercel.app/api/install/callback&state=…&include_granted_scopes=true` (also the re-consent link for existing installs)
(`client_id` is the Origin App ID; `repository:metadata:read` is added automatically.)

## Demo repo `luigi/shiplog-demo` (native Origin)
The repo is created and empty. A local copy with 3 commits, a `v1.0.0` tag and a `CHANGELOG.md` is on the box at `/workspace/shiplog-demo`. To push it from a machine with Origin git access:
```bash
cd shiplog-demo && git push -u origin main --tags   # remote: https://origin.cursor.com/luigi/shiplog-demo.git
```
Then:
1. Install Shiplog on `luigi` (selected repos → shiplog-demo).
2. Open and merge a `feat:` PR, and check the Shiplog comment.
3. Push tag `v1.1.0`; release notes are recorded on the dashboard. There is no PR to comment on for a tag.
