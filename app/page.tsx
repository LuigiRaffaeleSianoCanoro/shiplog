import Link from "next/link";

export default function Home() {
  return (
    <main className="wrap">
      <section className="hero">
        <span className="pill fade-up">Origin App · beta</span>
        <h1 className="fade-up d1" style={{ marginTop: 16 }}>Your merges,<br /><span className="lime">written up.</span></h1>
        <p className="muted fade-up d2" style={{ fontSize: "1.15rem", maxWidth: 620 }}>
          Shiplog turns every merged pull request on Cursor Origin into a Keep a Changelog entry, and every release into human-readable notes. Agents run on your own Cursor plan — no extra subscription.
        </p>
        <div className="row fade-up d3">
          <a className="btn primary" href="/api/install/start">Install on Origin</a>
          <Link className="btn" href="/dashboard">Open dashboard</Link>
        </div>
      </section>
      <section className="panel fade-up d3">
        <pre style={{ border: 0, padding: 0, background: "transparent" }}>{`## [Unreleased]

### Added
- Launch telemetry for the ignition path (#17)

### Fixed
- Countdown no longer skips a second on resume (#18)`}<span className="ticker">&nbsp;</span></pre>
      </section>
      <section className="grid3">
        <div className="panel"><h3>Merge</h3><p className="muted">A merged PR triggers a signed webhook. Shiplog classifies it (feat → Added, fix → Fixed…).</p></div>
        <div className="panel"><h3>Draft</h3><p className="muted">A Cursor cloud agent on your key edits only CHANGELOG.md and opens a PR. No key? You get a copy-ready prompt.</p></div>
        <div className="panel"><h3>Release</h3><p className="muted">Comment <code>/shiplog release v1.2.0</code> and Unreleased becomes a dated section with a summary.</p></div>
      </section>
      <footer>Shiplog is an independent Origin App. Not affiliated with Cursor.</footer>
    </main>
  );
}
