import Link from "next/link";

export default function Home() {
  return (
    <>
      <main className="wrap">
        <section className="hero">
          <div>
            <span className="pill outline fade-up">Origin App · beta</span>
            <h1 className="fade-up d1" style={{ marginTop: 18 }}>Your merges,<br /><span className="accent">written up.</span></h1>
            <p className="lede fade-up d2">
              Shiplog turns every merged pull request on Cursor Origin into a Keep a Changelog entry, and every release into human-readable notes. Agents run on your own Cursor plan — no extra subscription.
            </p>
            <div className="row fade-up d3">
              <a className="btn primary" href="/api/install/start">Install on Origin</a>
              <Link className="btn" href="/dashboard">Open dashboard</Link>
            </div>
          </div>
          <div className="mascot" aria-hidden="true">
            <img className="loop" src="/brand/mascot-loop.webp" alt="" width={640} height={640} />
            <img className="still" src="/brand/mascot-still.png" alt="" width={640} height={640} />
          </div>
        </section>
        <pre className="code fade-up d3">{`## [Unreleased]

`}<span className="h">### Added</span>{`
- Launch telemetry for the ignition path (#17)

`}<span className="h">### Fixed</span>{`
- Countdown no longer skips a second on resume (#18)`}<span className="ticker">&nbsp;</span></pre>
      </main>
      <section className="waterline">
        <div className="wrap">
          <div className="grid3">
            <div className="panel"><div className="step">01</div><h3>Merge</h3><p className="muted">A merged PR triggers a signed webhook. Shiplog classifies it (feat → Added, fix → Fixed…).</p></div>
            <div className="panel"><div className="step">02</div><h3>Draft</h3><p className="muted">A Cursor cloud agent on your key edits only CHANGELOG.md and opens a PR. No key? You get a copy-ready prompt.</p></div>
            <div className="panel"><div className="step">03</div><h3>Release</h3><p className="muted">Comment <code>/shiplog release v1.2.0</code> and Unreleased becomes a dated section with a summary.</p></div>
          </div>
          <footer>Shiplog is an independent Origin App. Not affiliated with Cursor.</footer>
        </div>
      </section>
    </>
  );
}
