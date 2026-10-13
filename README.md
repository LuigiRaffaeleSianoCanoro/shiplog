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
| `BLOB_READ_WRITE_TOKEN` | from the connected Blob store |
| `ORIGIN_APP_ID`, `ORIGIN_APP_PRIVATE_KEY` | **placeholders** (`REPLACE_ME…`, treated as unset). Fill them after creating the Origin App, then redeploy. Until then PR comments are recorded on the dashboard only, and `/api/install/callback` returns 503. |

Origin App settings: webhook URL `https://shiplog-luigi-canoros-projects.vercel.app/api/webhooks/origin`, callback URL `https://shiplog-luigi-canoros-projects.vercel.app/api/install/callback`.

Polling: Vercel Hobby cron runs once a day (`vercel.json`), and the dashboard also polls whenever it is viewed. For minute-level polling, use Supabase `pg_cron` + `pg_net` to call `/api/cron/poll` with `CRON_SECRET`.

## Publishing (not done yet)
Per https://cursor.com/docs/origin/apps/publish:
1. Set the app to Public.
2. Record a public 5–10 min demo video covering install (personal and team namespaces, all repos and selected repos) and uninstall from both sides (Origin settings, and the Shiplog dashboard showing Disconnected).
3. Click Submit on the app settings page.
