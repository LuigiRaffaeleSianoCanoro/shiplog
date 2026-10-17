# Contributing to Shiplog

Thanks for helping. This guide covers how to run the project, the code style, and the security rules.

Community docs: [GOVERNANCE.md](GOVERNANCE.md), [SUPPORT.md](SUPPORT.md), [CONTRIBUTOR_LADDER.md](CONTRIBUTOR_LADDER.md), [BACKERS.md](BACKERS.md), [ADOPTERS.md](ADOPTERS.md).

## Your first PR in 15 minutes

1. **Find something small.** Pick a [good first issue](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or a docs typo you already spotted. Comment on the issue so nobody duplicates the work.
2. **Fork and branch.** Fork the repo on GitHub, clone your fork, and create a branch from `main` (for example `docs/fix-typo`).
3. **Run checks locally.**

   ```bash
   npm ci
   npm test
   npm run typecheck
   ```

   For documentation-only changes, `npm test` and `npm run typecheck` still run in CI, so run them if you can.
4. **Commit with sign-off.** Every commit needs DCO sign-off:

   ```bash
   git commit -s -m "docs: describe your change"
   ```

5. **Open a pull request to `main`.** The default integration branch is `main` (the MVP work already lives there). Fill in the PR template, link the issue if there is one, and wait for CI. Address review comments with new signed commits or fixups.
6. **Need help?** Ask in [GitHub Discussions](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/discussions) or see [SUPPORT.md](SUPPORT.md).

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

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md), version 2.1. Be kind.

## Good first issues

Look for issues labeled `good first issue`.
