# Progress and decision log

Roadmap source: shiplog-estrategia.md, section 3 (items 1 to 5). One small PR per item against `feat/mvp`.

## Decisions

- 2026-10-15. No Neon AI Gateway credentials or model config on the build box, so implement, test and review were done directly by the agent, not delegated to claude-opus-5-5, grok-4-6 or claude-fable-5-1.
- 2026-10-15. Item 1. The demo video and marketplace review need Luigi, so this PR covers only SECURITY.md, CONTRIBUTING.md and CI. LICENSE was already added in PR #3.
- 2026-10-15. Item 1. CI runs gitleaks as a pinned binary instead of gitleaks-action, so no license key or paid service is involved.
- 2026-10-15. Item 1. Vulnerability reports go through GitHub private vulnerability reporting. It must be enabled once in repo settings (Security, Private vulnerability reporting).

- 2026-10-15. Item 1. The push token has no `workflow` scope, so GitHub refused `.github/workflows/ci.yml`. The workflow ships at `docs/ci/ci.yml`. Activating it is one move (`git mv docs/ci/ci.yml .github/workflows/ci.yml`) by someone whose token has that scope. Routing around the scope was not attempted.

## Left to do

- Item 1. Move `docs/ci/ci.yml` to `.github/workflows/ci.yml` (needs a token with `workflow` scope, for example `gh auth refresh -s workflow`).

- Item 1. Record the 5 to 10 minute demo video and pass Origin marketplace review (needs Luigi).
- Item 1. Enable secret scanning, push protection, Dependabot and private vulnerability reporting in GitHub settings. Add CODEOWNERS and issue templates.
