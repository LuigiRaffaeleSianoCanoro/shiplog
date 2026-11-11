# Shiplog product & engineering backlog

Evidence-based priorities for `main`. Draft PRs **#57–#60** are in flight; this doc does not duplicate their scope. Issues **#33–#40** are reserved for community contributors (listed at the end, not owned here).

**Legend:** Size S (&lt;1 day) · M (2–4 days) · L (1+ week). **UI** = needs design pass with strong models + cross-review before build.

---

## Now

Ship reliability and operator truthfulness before new product surface.

### 1. Land Blob store-auth failure handling (403 → 503)

| Field | Detail |
| --- | --- |
| **Problem** | Vercel Blob `get()` 403 surfaces as 500 on public pages and read APIs; operators cannot tell missing index from bad token. |
| **Evidence** | [PR #57](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/pull/57); `lib/store/blob.ts:22-26`; `app/api/health/route.ts:6` (env-only check today) |
| **Fix** | Merge #57: `StoreAuthError`, `head()` disambiguation, `store_unavailable` JSON, friendly HTML unavailable view, `npm run blob:diagnose`. |
| **Size** | M (review + merge) |
| **Risk** | Low once tests in `test/blob-store.test.ts` stay green. |
| **Dependencies** | None |

### 2. Health endpoint must prove Blob is readable

| Field | Detail |
| --- | --- |
| **Problem** | `/api/health` reports `storage: vercel-blob` when env vars exist but reads still 403—false “healthy” during outages. |
| **Evidence** | [PR #58](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/pull/58); `app/api/health/route.ts:5-7` |
| **Fix** | Merge #58: `storageReadable` probe + HTTP 503 when probe fails. |
| **Size** | S |
| **Risk** | Low; may flip prod health to 503 until Blob is reconnected (desired). |
| **Dependencies** | Complements #57 |

### 3. Propagate `StoreAuthError` through MCP tools

| Field | Detail |
| --- | --- |
| **Problem** | `/api/mcp` calls the same store reads as v1 API but is not in #57’s route diff—tools may still throw opaque 500s when Blob auth fails. |
| **Evidence** | `app/api/mcp/route.ts:24-26`; `lib/mcp-tools.ts:20-23`; #57 covers v1 + feeds, not MCP |
| **Fix** | Wrap `resolveReadableChangelog` / store listing in shared `withStoreAuth` helper; return MCP `isError` text or JSON-RPC error consistent with `store_unavailable`. |
| **Size** | S |
| **Risk** | Low |
| **Dependencies** | After **#57** |

### 4. Bundle and land safe Dependabot npm bumps

| Field | Detail |
| --- | --- |
| **Problem** | Many small Dependabot PRs (#42–#55) create review noise; one drifted dep is a security/process liability. |
| **Evidence** | [PR #60](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/pull/60); open Dependabot PRs on `main` |
| **Fix** | Merge #60 after CI green; **exclude** `posthog-node` v5 ([#56](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/pull/56)) until edge-safe capture is proven (`instrumentation.ts:16-40`, `test/middleware-edge.test.ts`). |
| **Size** | S |
| **Risk** | Medium on major bumps (e.g. Next); run full `npm test` + e2e. |
| **Dependencies** | None |

### 5. Remove stale `feat/mvp` guidance from operator docs

| Field | Detail |
| --- | --- |
| **Problem** | Self-host and README still tell contributors to deploy `feat/mvp`, conflicting with governance on `main`. |
| **Evidence** | [PR #59](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/pull/59); [issue #40](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/issues/40); `docs/self-host.md:31` |
| **Fix** | Merge #59; follow with ROADMAP refresh (item 6). |
| **Size** | S |
| **Risk** | Low |
| **Dependencies** | None |

---

## Next

Correctness gaps, operator ergonomics, and API/MCP hardening.

### 6. Refresh ROADMAP and PROGRESS for `main`

| Field | Detail |
| --- | --- |
| **Problem** | `ROADMAP.md` still anchors on `feat/mvp` and stale “Next/Later” labels; new contributors mis-route PRs. |
| **Evidence** | `ROADMAP.md:3-7`, `ROADMAP.md:41`; `PROGRESS.md:90-107` “Left to do” |
| **Fix** | Rewrite roadmap status on `main`; move completed GitHub App slice to Done; link this backlog. |
| **Size** | S |
| **Risk** | Low (docs only) |
| **Dependencies** | After **#59** |

### 7. Public changelog HTML should return 503 when store is down

| Field | Detail |
| --- | --- |
| **Problem** | Unavailable store renders friendly UI but HTTP status may stay 200—bad for monitors and caches. |
| **Evidence** | [PR #57](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/pull/57) decision log (App Router limitation); `app/(changelog)/[namespace]/[repo]/page.tsx:34-37` |
| **Fix** | Route Handler wrapper or `middleware` signal; until then document monitor JSON/feeds not HTML. |
| **Size** | M |
| **Risk** | Medium (SEO/cache tradeoffs) |
| **Dependencies** | After **#57** |
| **UI** | Yes — unavailable page copy/layout |

### 8. Optional live sync: public page reads repo `CHANGELOG.md`

| Field | Detail |
| --- | --- |
| **Problem** | Cursor/prompt modes write changelog in git; public page reads Blob store only—deployed view can lag agent PRs. |
| **Evidence** | `PROGRESS.md:103`; `lib/public-changelog.ts` (`resolvePublicChangelog` → `store.getChangelog`) |
| **Fix** | `.shiplog.yml` flag (e.g. `public_source: repo|store`) + VCS contents read with fallback; invalidate on webhook. |
| **Size** | L |
| **Risk** | Medium (rate limits, private repos, monorepo paths) |
| **Dependencies** | None |

### 9. Batch `release` / `daily` queue recovery

| Field | Detail |
| --- | --- |
| **Problem** | Queued PRs never run if batch mode is on but no release is cut or the Cursor key is removed—silent backlog. |
| **Evidence** | `PROGRESS.md:95`; `lib/jobs.ts:387-422` (`flushBatches` skips when `!key`) |
| **Fix** | TTL + operator-visible “stale queued” state; optional auto-fallback to prompt mode; metrics in dashboard. |
| **Size** | M |
| **Risk** | Medium (unexpected agent spend if auto-flush) |
| **Dependencies** | None |

### 10. Dashboard control: manual batch flush

| Field | Detail |
| --- | --- |
| **Problem** | `flushBatches` runs on daily cron only; installers on Hobby cannot unstick `batch: daily` without external cron. |
| **Evidence** | `vercel.json:1` (single cron); `app/(site)/dashboard/page.tsx:22` (poll only); `lib/cronPoll.ts:24` |
| **Fix** | Session-gated `POST /api/.../flush-batch` + dashboard button showing queued count. |
| **Size** | M |
| **Risk** | Low |
| **Dependencies** | Pairs with **#9** |
| **UI** | Yes |

### 11. Notify webhooks: retry with backoff

| Field | Detail |
| --- | --- |
| **Problem** | Failed Slack/Discord/generic notify is log-only—no retry, no dead-letter visibility. |
| **Evidence** | `PROGRESS.md:106`; `lib/notify.ts:107-121` |
| **Fix** | Store outbox rows for notify attempts; cron or inline retry (cap attempts); surface last failure on dashboard. |
| **Size** | M |
| **Risk** | Low |
| **Dependencies** | None |

### 12. OpenAPI description for `/api/v1/changelogs`

| Field | Detail |
| --- | --- |
| **Problem** | Integrators lack a machine-readable contract; only README curl examples exist. |
| **Evidence** | `PROGRESS.md:107`; `app/api/v1/changelogs/[namespace]/[repo]/route.ts` |
| **Fix** | `docs/openapi/v1-changelogs.yaml` generated from shared types / sample fixtures; CI check drift optional. |
| **Size** | M |
| **Risk** | Low |
| **Dependencies** | After **#57** (503 semantics) |

### 13. Rate limit and tighten MCP / public read API

| Field | Detail |
| --- | --- |
| **Problem** | Read API and MCP are unauthenticated; `Access-Control-Allow-Origin: *` on MCP invites abuse. |
| **Evidence** | `app/api/mcp/route.ts:8-12`; `PROGRESS.md:107` |
| **Fix** | Vercel firewall or token bucket per IP; optional env allowlist for MCP origins; document fair use. |
| **Size** | M |
| **Risk** | Medium (can break legitimate agents if too aggressive) |
| **Dependencies** | None |

### 14. Automate namespace index backfill in production

| Field | Detail |
| --- | --- |
| **Problem** | Missing `shiplog/v1/ns/{namespace}.json` forces slow `listInstallations` fallback; route exists but is not scheduled. |
| **Evidence** | `app/api/cron/backfill-namespace-index/route.ts:8-13`; `lib/store/blob.ts:75-84`; `vercel.json` (no entry) |
| **Fix** | Weekly cron + runbook in `docs/self-host.md`; call after mass reinstall. |
| **Size** | S |
| **Risk** | Low |
| **Dependencies** | After **#57** (403 clarity) |

### 15. Vitest coverage for MCP HTTP transport

| Field | Detail |
| --- | --- |
| **Problem** | MCP logic is unit-tested via `mcpToolHandlers` only—no test for Streamable HTTP handshake on `/api/mcp`. |
| **Evidence** | `test/changelog-api.test.ts:95-112`; `e2e/flows.spec.ts:220` (e2e only) |
| **Fix** | Route-level test with mocked store + `initialize` SSE; assert tool list matches `lib/mcp-server.ts:13-41`. |
| **Size** | S |
| **Risk** | Low |
| **Dependencies** | None |

### 16. `posthog-node` v5 upgrade (edge-safe)

| Field | Detail |
| --- | --- |
| **Problem** | Dependabot #56 blocked: `posthog-node` v5 must not enter middleware/instrumentation graph. |
| **Evidence** | [PR #56](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/pull/56); `lib/analytics/server.ts:40-45`; `instrumentation.ts:16-17` comment |
| **Fix** | Prove dynamic import stays Node-only; extend `test/middleware-edge.test.ts` guards; then merge bump. |
| **Size** | S |
| **Risk** | High if edge bundle regresses |
| **Dependencies** | After **#60** or separate |

---

## Later

Product direction, marketplace, and larger bets.

### 17. Origin marketplace publish (demo + review)

| Field | Detail |
| --- | --- |
| **Problem** | Public listing blocked on maintainer-owned video and Cursor Origin app review. |
| **Evidence** | `ROADMAP.md:31-32`; `PROGRESS.md:105` |
| **Fix** | Record demo; submit listing; link from README. |
| **Size** | L (human-gated) |
| **Risk** | Process |
| **Dependencies** | Reliability items **#1–#2** for credible demo |

### 18. GitHub Marketplace listing for the GitHub App

| Field | Detail |
| --- | --- |
| **Problem** | GitHub install path works but discovery/install friction remains high without Marketplace. |
| **Evidence** | `docs/adr/0012-github-app.md:37,55` |
| **Fix** | Register production app; marketplace metadata; align permissions with `docs/self-host.md`. |
| **Size** | L |
| **Risk** | Medium (permission review) |
| **Dependencies** | **#17** optional |

### 19. MCP auth (per-repo tokens or OAuth)

| Field | Detail |
| --- | --- |
| **Problem** | Today anyone can read any public changelog via MCP—no scoped tokens for private future tiers. |
| **Evidence** | `PROGRESS.md:107`; `README.md:95` |
| **Fix** | Design token issuance on setup page; optional auth on MCP + v1. |
| **Size** | L |
| **Risk** | High (security design) |
| **Dependencies** | **#13** |

### 20. In-app changelog widget (roadmap 15)

| Field | Detail |
| --- | --- |
| **Problem** | Embeddable widget unscoped; only public Harbor pages exist. |
| **Evidence** | `ROADMAP.md:35`; `PROGRESS.md` item 15 implicit |
| **Fix** | Product spec + iframe/JS SDK; CORS and branding rules. |
| **Size** | L |
| **Risk** | Medium |
| **Dependencies** | **#8**, **#12** |
| **UI** | Yes |

### 21. Paid hosted Shiplog plan (roadmap 16)

| Field | Detail |
| --- | --- |
| **Problem** | No multi-tenant billing beyond self-host + BYOK. |
| **Evidence** | `ROADMAP.md:37` |
| **Fix** | Business model + isolation; out of scope until widget/API auth exist. |
| **Size** | L |
| **Risk** | High |
| **Dependencies** | **#19** |

---

## Reserved for community (`good first issue`)

**Do not implement in maintainer/agent PRs**—left for new contributors. Accessibility work on the public changelog (**#35**) should follow **#57** (stable error states).

| Issue | Title |
| --- | --- |
| [#33](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/issues/33) | Add pt-BR and it languages for audience release notes |
| [#34](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/issues/34) | Example `.shiplog.yml` for monorepos under `docs/examples` |
| [#35](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/issues/35) | Improve accessibility on the public changelog page (**after #57**) |
| [#36](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/issues/36) | Self-host guide screenshots + drop stale deploy note |
| [#37](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/issues/37) | Spanish README section |
| [#38](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/issues/38) | `ADOPTERS.md` one-line PR instructions |
| [#39](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/issues/39) | “Your first PR in 15 minutes” in CONTRIBUTING |
| [#40](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/issues/40) | Replace stale `feat/mvp` contributor guidance (**overlaps #59**) |

---

## How to use this doc

1. Pick **Now** items first; merge open draft PRs where they exist.
2. Link new PRs to a backlog row number in the PR body (one focused change).
3. Refresh this file when **#57–#60** land or when issue priorities shift.
