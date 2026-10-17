# Contributor ladder

Shiplog adapts the spirit of the [CNCF contributor ladder](https://github.com/cncf/project-template/blob/main/CONTRIBUTOR_LADDER.md) to a small, early-stage project. Roles are earned through consistent, constructive participation. Titles are not handed out for one-off drive-by pull requests.

Progression is described below from first involvement through maintainer. The maintainer may invite someone to a higher role earlier when trust and need are already clear; that still goes through the public process in [GOVERNANCE.md](GOVERNANCE.md) when the role includes write or admin access.

## Participant

**Who:** Anyone who uses Shiplog, reads the docs, or joins Discussions.

**How to participate:**

- Ask and answer questions in [GitHub Discussions](https://github.com/LuigiRaffaeleSianoCanoro/shiplog/discussions)
- Open issues with clear reproduction steps
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md)

No repository permissions are required.

## Contributor

**Who:** Someone who lands non-trivial improvements through pull requests.

**Expectations:**

- Signed-off commits (`git commit -s`) per [CONTRIBUTING.md](CONTRIBUTING.md)
- Tests for changes under `lib/` when behavior changes
- Small, focused pull requests with Conventional Commit-style titles when practical

**Recognition:** Attribution in release notes via merged pull requests; optional mention in [ADOPTERS.md](ADOPTERS.md) if you represent a deploying organization (see that file).

## Triager

**Who:** A trusted contributor who helps keep the issue and discussion backlog usable.

**Expectations:**

- Apply labels, close duplicates, and request missing information politely
- Do not merge pull requests unless you are also a Reviewer or Maintainer

**How to become a Triager:** Sustained helpful triage over several weeks, then nomination in a Governance Discussion per [GOVERNANCE.md](GOVERNANCE.md).

**GitHub permission:** Triage on the repository (or equivalent).

## Reviewer

**Who:** A contributor who regularly reviews pull requests for correctness, security, and fit with the roadmap.

**Expectations:**

- Review with kindness and technical clarity
- Block merges when tests, security rules, or scope are wrong
- Help authors split large changes when needed

**How to become a Reviewer:** Several high-quality reviews and merged contributions, then nomination in a Governance Discussion with a 7-day comment period.

**GitHub permission:** Write access is not required for review-only; maintainers may grant write when it reduces friction for docs and test fixes.

## Maintainer

**Who:** Accepts responsibility for project health, releases, and security response.

**Expectations:**

- Merge contributions that meet project standards
- Steward [ROADMAP.md](ROADMAP.md) and [GOVERNANCE.md](GOVERNANCE.md)
- Respond to security reports per [SECURITY.md](SECURITY.md)
- Run the Discussion-based decision process for significant changes

**How to become a Maintainer:** Demonstrated Reviewer work and agreement through the process in [GOVERNANCE.md](GOVERNANCE.md).

**GitHub permission:** Maintain or Admin on the repository, as appropriate.

## Emeritus

Maintainers, Reviewers, or Triagers who become inactive for **six consecutive months** without notice may be moved to **emeritus** status:

- Emeritus folks keep credit in project history and may return without shame.
- Permissions are reduced to Participant until they re-engage and go through the ladder again if they want an active role.

If you need a planned break, say so in a Discussion or direct message to the maintainer so you are not marked emeritus while intentionally away.

## Related

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [GOVERNANCE.md](GOVERNANCE.md)
- [SUPPORT.md](SUPPORT.md)
