# Governance

Shiplog is an Apache-2.0 open source project. This document describes how the project is maintained and how decisions are made.

## Maintainer model

Today Shiplog uses a **single maintainer** model:

- **Maintainer:** Luigi Raffaele Siano Canoro ([@LuigiRaffaeleSianoCanoro](https://github.com/LuigiRaffaeleSianoCanoro))

The maintainer is responsible for release hygiene, security response, merging contributions that meet project standards, and stewarding the public roadmap. Day-to-day development happens through GitHub pull requests and issues.

This structure is intentional while the project grows. It matches what many early-stage open source projects need before joining a fiscal host such as the [Open Source Collective](https://opencollective.com/).

## Adding maintainers

Additional maintainers may be added when the project needs shared on-call or review capacity. The path is:

1. A person has demonstrated sustained contribution (see [CONTRIBUTOR_LADDER.md](CONTRIBUTOR_LADDER.md), especially **Reviewer** and **Maintainer**).
2. The current maintainer opens a [GitHub Discussion](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/discussions) in the **Governance** category (or the closest available category) proposing the new maintainer, with a short rationale and expected responsibilities.
3. The community may comment for **at least 7 calendar days**.
4. After that comment period, the incumbent maintainer records the outcome in the same Discussion and updates repository access (GitHub org or repo role) if the proposal is accepted.

Removing or stepping down as maintainer follows the same Discussion process, with emeritus status described in [CONTRIBUTOR_LADDER.md](CONTRIBUTOR_LADDER.md).

## Decision making

**Routine changes** (bug fixes, documentation, tests, small features aligned with [ROADMAP.md](ROADMAP.md)) are decided through normal pull request review and merge to `main`.

**Significant or contentious changes** (governance updates, trademark use, licensing changes, large architectural direction, or anything that would surprise existing adopters) use this process:

1. Open a GitHub Discussion with a clear title, context, and proposed outcome.
2. Allow **at least 7 calendar days** for comments from contributors and users.
3. The maintainer summarizes feedback in the Discussion and states the decision, including any follow-up issues or pull requests.

Security issues are **not** decided in public Discussions. Follow [SECURITY.md](SECURITY.md) instead.

## Community spaces

For informal community conversation (including self-hosters), [mardelplata.dev.ar](https://mardelplata.dev.ar) is the named community site when we point people beyond GitHub.

## Related documents

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute code and docs
- [CONTRIBUTOR_LADDER.md](CONTRIBUTOR_LADDER.md) — roles and progression
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — behavior expectations
- [SUPPORT.md](SUPPORT.md) — where to ask questions
- [BACKERS.md](BACKERS.md) — sponsorship recognition
- [ADOPTERS.md](ADOPTERS.md) — projects using Shiplog in production
