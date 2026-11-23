import type { RepoReleasePreview } from "@/lib/release-preview";

/** Read-only: what the next batched release will contain per repo. Nothing runs or bills from this panel. */
export function ReleasePreview({ previews }: { previews: RepoReleasePreview[] }) {
  if (!previews.length) return null;
  return (
    <div className="panel fade-up d2" id="release-preview">
      <h3>Next release preview</h3>
      <p className="muted">PRs waiting for a batch, grouped the way the release comment will group them. Opening this view runs nothing.</p>
      {previews.map((p) => {
        const left = p.grouped.length + p.skipped.length;
        const count = p.bullets.length + p.grouped.length;
        const ungroupedBots = p.bullets.filter((b) => b.bot).length;
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
          </section>
        );
      })}
      <p className="muted rp-note">Bullets without exact text show the PR title. The agent rewrites them when it cuts the release.</p>
    </div>
  );
}
