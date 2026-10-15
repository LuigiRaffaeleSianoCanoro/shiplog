# ADR 0012: GitHub App install path (roadmap item 12)

**Status:** Accepted (first slice: webhook + install path shipped)

**Date:** 2026-10-15

## Context

Shiplog today is an **Origin App**. It receives Origin webhooks at `/api/webhooks/origin`, verifies install receipts, and drives changelog work from Origin events (`pull_request.merged`, PR comments, `repository.pushed` for tags).

Origin does **not** deliver `repository.pushed` for **GitHub-mirrored** repositories. Many teams still keep code on GitHub (native GitHub repos or mirrors) and want the same changelog behavior without moving the primary remote to Origin.

Roadmap item 12 asked for product direction: scope, hosting, and how a GitHub path relates to the Origin App.

## Decision

**Origin App remains the primary product.** Item 12 is a **separate GitHub App** install surface for:

- GitHub-native repositories, and
- GitHub-mirrored repos where Origin does not deliver `repository.pushed` (and similar gaps).

### v1 scope (first implementation slice)

| Area | Choice |
|------|--------|
| Hosting | Same hosted Shiplog deploy on Vercel; same app, same environment. Webhook route: `POST /api/webhooks/github` with HMAC verification and adapter into the shared core. |
| Events | `pull_request` (merged); `issue_comment` or `pull_request_review_comment` for `/shiplog` commands; `push` for tags when GitHub delivers them. |
| Core engine | Reuse the existing changelog pipeline (classify, batch, notes, notify, public pages, read API and MCP) behind a **thin adapter** so Origin and GitHub share one core. |
| Install records | Dual install is allowed. Installation records distinguish `provider=origin` and `provider=github`. Uninstall is independent per provider. |
| Credentials | Separate GitHub App env vars: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`. Never invent or commit secrets. |
| BYOK / LLM | For GitHub-only repos, prefer an OpenAI-compatible or Neon-style key path (or prompt-only fallback). **Cursor Cloud Agents** are Origin-first: use agent mode on GitHub only when the repo is also reachable by Cursor (same constraints as today). Do not assume agents can run on arbitrary GitHub-only repos. |

### Explicitly out of scope for v1 (follow-up PRs)

- Paid hosted plan (roadmap item 16)
- In-app changelog widget (roadmap item 15)
- GitHub API client for PR comments, file reads, and permission checks (webhook + install persistence only in the first slice)
- GitHub Marketplace listing for the app

## Consequences

**Positive**

- One Vercel project, one changelog engine, one public read API and MCP; only ingress and provider-specific API calls differ.
- GitHub-mirrored repos can get tag-based releases via GitHub `push` events without waiting on Origin `repository.pushed`.
- Teams can install Origin for Cursor-native workflows and GitHub App for GitHub-only repos on the same Shiplog host without forcing a single provider.

**Negative / tradeoffs**

- Two install surfaces to document, test, and operate (Origin + GitHub App credentials and webhooks).
- Installation and dashboard UX must show provider and avoid conflating uninstall or keys across providers.
- Agent mode on GitHub-only repos is limited unless Cursor can reach the repo; prompt-only or BYOK LLM paths are the default expectation for v1.

**Follow-up work**

- GitHub REST client for comments, contents, and collaborator permission checks on `provider=github` installs.
- Dashboard and setup UX that surfaces provider and links to both install paths.
- Document GitHub App permissions and events alongside [docs/self-host.md](../self-host.md) (partial notes in self-host today).

## References

- [ROADMAP.md](../../ROADMAP.md) — item 12 under **Next**
- [PROGRESS.md](../../PROGRESS.md) — decision log entry 2026-10-15
- [README.md](../../README.md) — Origin vs GitHub-mirrored behavior
