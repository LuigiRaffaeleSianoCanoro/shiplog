# Self-host Shiplog on Vercel

Run your own private Shiplog instance for your Cursor Origin namespace. This guide targets **Vercel Hobby** (free tier, personal non-commercial use) with a **private Vercel Blob** store. Supabase is optional if you already use it elsewhere.

## What you need

- A Cursor account with permission to create an **Origin App** (private apps are fine).
- A Vercel account (Hobby is enough for personal use).
- About fifteen minutes for first-time setup.

## 1. Create your Origin App

1. Open [Origin App settings](https://cursor.com/codebase/settings/apps) and create a new app (keep it **private** until you are ready to publish).
2. Set the **webhook URL** to `https://<your-vercel-host>/api/webhooks/origin`.
3. Set the **installation redirect URL** to `https://<your-vercel-host>/api/install/callback` (exact match; no trailing slash on the path).
4. Subscribe to these **events** (installation events are always sent):
   - `pull_request.merged`
   - `pull_request.comment.created`
   - `repository.pushed`
5. Request these **scopes**:
   - `repository:pull_requests:read`
   - `repository:pull_requests:reviews:write` (PR comments)
   - `repository:contents:read` (read `.shiplog.yml` and changelog paths)
   - Only if you want Shiplog to open changelog PRs itself (not required for keyless mode): `repository:pull_requests:write` and `repository:contents:write`
6. Copy the **App ID** and **private key** from the app settings. Store them only in Vercel environment variables, never in git.

## 2. Deploy to Vercel

Use the **Deploy to Vercel** button in the [README](../README.md#self-host), or import the repository manually.

1. Create a new Vercel project from `https://github.com/LuigiRaffaeleSianoCanoro/shiplog` (branch `feat/mvp` until it merges to `main`).
2. Framework preset: **Next.js**. Root directory: repository root. Build command `npm run build`, install `npm i`.
3. In the Vercel project, open **Storage**, create a **Blob** store, set it to **private**, and **connect** it to this project. Vercel injects `BLOB_READ_WRITE_TOKEN` (and may set `BLOB_STORE_ID`). You do not paste those manually.
4. After the first deploy, note your production URL (for example `https://shiplog-yourname.vercel.app`). You will use it for `SHIPLOG_INSTALL_ORIGIN` and for the Origin app URLs in step 1.

### Vercel Hobby limits (be honest)

- Hobby is for **personal, non-commercial** use. Team or commercial hosting needs a paid plan.
- **Cron** on Hobby runs at most **once per day**. This repo schedules `/api/cron/poll` at 09:00 UTC (`vercel.json`). Agent polling also runs when someone opens the dashboard. For faster polling you can call `/api/cron/poll` yourself with `Authorization: Bearer <CRON_SECRET>` (for example from an external scheduler), or use Supabase `pg_cron` as described in the README.
- Function duration and bandwidth limits apply; Shiplog keeps webhook work in `after()` and returns 202 quickly.

## 3. Environment variables

Set these in the Vercel project **Settings → Environment Variables** for Production (and Preview if you test installs there). See `.env.example` in the repo for the same list with comments.

### Required for a production Vercel deploy

- `ORIGIN_APP_ID` — your Origin App ID (`app_…`).
- `ORIGIN_APP_PRIVATE_KEY` — PEM private key from the app. In Vercel, paste the full key; you may use `\n` for newlines in a single line.
- `SHIPLOG_KEY_ENC` — 32-byte AES master key, base64. Generate with `openssl rand -base64 32`. Used to encrypt stored Cursor API keys at rest.
- `CRON_SECRET` — random string; required so `/api/cron/poll` is not public. Cron requests must send `Authorization: Bearer <CRON_SECRET>`.
- `SHIPLOG_INSTALL_ORIGIN` — canonical HTTPS origin of **this** deployment, no trailing slash (for example `https://shiplog-yourname.vercel.app`). Must match an entry in the Origin app `installationRedirectUris`. Installs started on another host redirect here first.

### AI and cost mode (pick one posture)

- `SHIPLOG_LLM_PROVIDER` — `cursor` (default, production path) or `neon` (operator test mode via Neon AI Gateway).
- `SHIPLOG_BYOK_ENABLED` — `true` (default) shows the setup flow to paste a Cursor API key. Set to **`false`** for **keyless mode**: Shiplog only posts ready-to-run prompts on PRs. **No LLM cost on your Cursor plan** (recommended default for self-hosters who want zero spend).

For **Neon test mode** only (`SHIPLOG_LLM_PROVIDER=neon`):

- `NEON_AI_GATEWAY_BASE_URL`
- `NEON_AI_GATEWAY_TOKEN`
- `SHIPLOG_NEON_MODEL` (optional, default `claude-opus-5-5`)

### Optional

- `SHIPLOG_DASHBOARD_TOKEN` — if set, the all-installations dashboard requires `?token=` or a `Authorization: Bearer` header with this value.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — use Supabase instead of Blob if you prefer (see `supabase/migrations/0001_shiplog.sql`). Not required when Blob is connected.
- `ORIGIN_API_BASE` — override Origin API base (default `https://api.cursor.com/v1/origin`).
- `CURSOR_API_BASE` — override Cursor API base (default `https://api.cursor.com`).
- `ORIGIN_JWKS_URL` — override JWKS URL for webhook verification (default production Cursor JWKS). Local tests only.
- `SHIPLOG_INSECURE_WEBHOOKS` — `true` skips webhook signatures when `NODE_ENV` is not `production`. **Never set on Vercel production.**

### Local development only

- `SHIPLOG_DATA_FILE` — path for JSON file storage when not on Vercel and Blob is not configured (default `.data/shiplog.json`).

### Set by the platform (do not copy into `.env.local` for Vercel)

- `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` — injected when a Blob store is linked to the project.
- `VERCEL` — set on Vercel; without Blob or Supabase the app refuses to start in production.
- `NODE_ENV` — set by Next.js (`production` on Vercel).

## 4. Install Shiplog in your namespace

1. Confirm `GET https://<your-host>/api/health` returns `ok: true` and `storage: "vercel-blob"`.
2. Open `https://<your-host>/api/install/start` while logged into Cursor. Complete the Origin consent screen for your user or team namespace.
3. On `/setup`, either paste a Cursor API key (BYOK) or, if you set `SHIPLOG_BYOK_ENABLED=false`, finish setup without a key and use prompt-only changelog updates.

## 5. Verify

- Merge a small `feat:` PR in a connected repo and check for a Shiplog comment or changelog job on the dashboard.
- Optionally comment `/shiplog release v0.0.1` on a PR to exercise release notes.

## Community

Questions and show-and-tell for self-hosters are welcome at [mardelplata.dev.ar](https://mardelplata.dev.ar) when you want a human audience beyond GitHub issues.

## Security reminders

- Rotate `SHIPLOG_KEY_ENC` only with a planned re-encryption flow; changing it invalidates stored keys.
- Never commit `.env.local`, PEM files, or Vercel env exports.
- Keep the Blob store **private**; changelog and encrypted keys must not be world-readable.
