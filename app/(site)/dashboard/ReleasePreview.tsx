import type { RepoReleasePreview } from "@/lib/release-preview";

/** Who may start a manual flush for an installation: only its own install session, and only with a Cursor key. */
export type FlushAccess = { kind: "ready"; keyLast4: string } | { kind: "no_key" } | null;

export interface FlushNotice { status: string; repo: string; prs?: number; runs?: number; failed?: number }

const runs = (n: number) => `${n} agent run${n === 1 ? "" : "s"}`;

function noticeText(n: FlushNotice): { text: string; ok: boolean } | null {
  switch (n.status) {
    case "launched": return n.failed
      ? { ok: false, text: `Started ${runs(n.runs ?? 1)} for ${n.repo}, but ${n.failed} changelog file${n.failed === 1 ? "" : "s"} failed to start. Those PRs stay queued for the failed file${n.failed === 1 ? "" : "s"}; try again.` }
      : { ok: true, text: `Started ${runs(n.runs ?? 1)} for ${n.prs ?? 0} queued PR${n.prs === 1 ? "" : "s"} in ${n.repo}. A changelog PR will follow.` };
    case "empty": return { ok: true, text: `Nothing is queued for ${n.repo} any more. Another run may already have picked it up.` };
    case "no_key": return { ok: false, text: `${n.repo} needs a Cursor key before a batch can run.` };
    case "busy": return { ok: true, text: `Another run is already starting for ${n.repo}. Refresh in a minute to see it under Recent jobs.` };
    case "failed": return { ok: false, text: `The agent launch for ${n.repo} failed. The PRs are still queued; check the Cursor key and try again.` };
    default: return null;
  }
}

/** Read-only preview of the next batched release per repo. The only action is the explicit, session-only "Run batch now" form. */
export function ReleasePreview({ previews, flushAccess = () => null, notice }: { previews: RepoReleasePreview[]; flushAccess?: (installationId: string) => FlushAccess; notice?: FlushNotice | null }) {
  const n = notice ? noticeText(notice) : null;
  if (!previews.length && !n) return null;
  return (
    <div className="panel fade-up d2" id="release-preview">
      <h3>Next release preview</h3>
      {n && <p className={n.ok ? "rp-notice" : "rp-notice off"} role="status">{n.text}</p>}
      {previews.length > 0 && <p className="muted">PRs waiting for a batch, grouped the way the release comment will group them. Opening this view runs nothing.</p>}
      {previews.map((p) => {
        const left = p.grouped.length + p.skipped.length;
        const count = p.bullets.length + p.grouped.length;
        const ungroupedBots = p.bullets.filter((b) => b.bot).length;
        const access = flushAccess(p.installationId);
        const agentRuns = p.changelogFiles.length;
        return (
          <section key={`${p.installationId}/${p.repo}`} className="rp-repo">
            <div className="rp-head">
              <strong>{p.repo}</strong>
              <span className="pill gray">{p.batch === "daily" ? "daily batch" : "waits for /shiplog release"}</span>
              <span className="muted">{count} queued PR{count === 1 ? "" : "s"} since {p.since.slice(0, 10)}</span>
            </div>
            <ul className="rp-list">
              {p.bullets.map((b) => (
                <li key={b.number}>
                  <span className={b.section ? "pill outline" : "pill gray"}>{b.section ?? "agent picks"}</span>{" "}
                  {b.breaking && <><span className="pill off">breaking</span>{" "}</>}
                  {b.text} <a href={b.url}>#{b.number}</a>
                  {b.explicit && <span className="muted"> · exact text from /shiplog entry</span>}
                </li>
              ))}
              {p.botBullet && <li><span className="pill outline">Changed</span> {p.botBullet}</li>}
            </ul>
            {ungroupedBots > 1 && <p className="muted rp-note">{ungroupedBots} bot PRs get their own bullets. Add <code>group_bots: true</code> to <code>.shiplog.yml</code> to fold them into one.</p>}
            {left > 0 && (
              <div className="rp-left">
                <p><strong>Left out of the changelog, and why</strong></p>
                <ul>
                  {p.grouped.length > 0 && <li>{p.grouped.length} bot PR{p.grouped.length === 1 ? "" : "s"} grouped into one bullet: {p.grouped.map((e) => `#${e.number}`).join(", ")}</li>}
                  {p.skipped.map((s, i) => <li key={`${s.number}-${i}`}>#{s.number}: {s.reason}</li>)}
                </ul>
              </div>
            )}
            {access?.kind === "ready" && (
              <details className="rp-flush">
                <summary className="btn">Run batch now</summary>
                <form method="post" action="/api/batch/flush">
                  <input type="hidden" name="installationId" value={p.installationId} />
                  <input type="hidden" name="repo" value={p.repo} />
                  <p>
                    Starts {runs(agentRuns)} on your Cursor key (•••• {access.keyLast4}) to add these {count} PR{count === 1 ? "" : "s"} under <code>[Unreleased]</code>
                    {agentRuns > 1 ? `, one per changelog file` : ""}. No version is cut; comment <code>/shiplog release vX.Y.Z</code> for that.
                  </p>
                  <button type="submit" className="btn primary sm">Start {runs(agentRuns)}</button>
                </form>
              </details>
            )}
            {access?.kind === "no_key" && <p className="muted rp-note">Add a Cursor key on the setup page to run this batch now. Without a key, Shiplog posts a ready-to-run prompt once the queue goes stale.</p>}
          </section>
        );
      })}
      {previews.length > 0 && <p className="muted rp-note">Bullets without exact text show the PR title. The agent rewrites them when it runs.</p>}
    </div>
  );
}
