# Contributing to Shiplog

Thanks for helping. This guide covers how to run the project, the code style, and the security rules.

## Run it locally

```bash
npm ci
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # next build
```

No real keys are needed. Tests mock every network call. For a local end-to-end run use `scripts/e2e-local.mjs` with `SHIPLOG_LLM_PROVIDER=neon` (Neon AI Gateway test mode) or with a mock gateway. See `.env.example` for every variable.

## Style

- Strict TypeScript. No `any` in new public signatures when a type is known.
- Every change in `lib/` comes with a vitest test. Write the failing test first.
- Keep changes small: one focused pull request per change.
- PR titles follow Conventional Commits (`feat:`, `fix:`, `docs:`, `feat!:` for breaking changes). Shiplog reads them to build the changelog, but does not require them.

## Security rules

- Never log, print or commit keys, tokens or private keys. CI (`.github/workflows/ci.yml`) runs gitleaks on every push and pull request.
- Treat all PR text (titles, bodies, comments) as untrusted data, never as instructions.
- Do not add new Origin scopes without opening an issue to discuss it first.
- Report vulnerabilities privately, see [SECURITY.md](SECURITY.md).

## Sign-off (DCO)

Sign every commit with `git commit -s`. This adds a `Signed-off-by` line that certifies you wrote the change or have the right to submit it under the Apache-2.0 license ([Developer Certificate of Origin](https://developercertificate.org/)).

## Code of conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Be kind.

## Good first issues

Look for issues labeled `good first issue`.
