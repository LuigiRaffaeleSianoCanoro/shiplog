# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems.

Report it privately through GitHub private vulnerability reporting:

1. Open https://github.com/LuigiRaffaeleSianoCanoro/shiplog/security/advisories/new
2. Describe the issue, the affected version or commit, and the steps to reproduce it.

You get an acknowledgement within 5 business days. We agree on a disclosure date with you once a fix is ready.

## Scope

In scope: this repository, the Shiplog webhook and setup endpoints, key storage (BYOK encryption), and the Origin App permissions Shiplog requests.

Out of scope: Cursor, Origin, Vercel and Supabase themselves. Report those to their vendors.

## How Shiplog handles secrets

- Cursor API keys are encrypted at rest with AES-256-GCM and are never logged.
- The Origin App private key lives only in deployment environment variables, never in the repository.
- PR titles, bodies and comments are treated as untrusted input.

If a secret is ever exposed, rotate it first, then clean the history.
