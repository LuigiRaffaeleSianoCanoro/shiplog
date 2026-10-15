# Progress and decision log

Roadmap source: shiplog-estrategia.md, section 3 (items 1 to 5). One small PR per item against `feat/mvp`.

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

## Left to do

- Item 2. Neon test mode keeps its own stored changelog and ignores `changelog:` (path matters only for agent and prompt modes).
- Item 3. Without Origin credentials (local runs) commands are not read at merge time. Only labels apply there.
- Item 5. Pre-1.0 versions get plain semver bumps (0.x to 1.0.0 on breaking). No special 0.x rule.
- Item 4. Queued PRs wait forever if `batch: release` is set and no release is ever cut, or if the key is removed. A dashboard flush button or expiry would close this.
- Item 4. Run cost in money is not shown, only the run count.
- Item 1. Move `docs/ci/ci.yml` to `.github/workflows/ci.yml` (needs a token with `workflow` scope, for example `gh auth refresh -s workflow`).

- Item 1. Record the 5 to 10 minute demo video and pass Origin marketplace review (needs Luigi).
- Item 1. Enable secret scanning, push protection, Dependabot and private vulnerability reporting in GitHub settings. Add CODEOWNERS and issue templates.
