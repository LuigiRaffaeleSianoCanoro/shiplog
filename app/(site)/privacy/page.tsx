export default function Privacy() {
  return (
    <main className="wrap page" style={{ maxWidth: 820 }}>
      <h1>Privacy & <span className="accent">what we store</span></h1>
      <div className="panel">
        <ul className="muted" style={{ lineHeight: 1.8 }}>
          <li>Installation id, namespace, status, and job history (PR number, link, outcome).</li>
          <li>If you connect one: your Cursor API key, encrypted with AES-256-GCM (random IV per record, installation-bound). We keep the last 4 characters to show you which key is connected.</li>
          <li>Keys are never logged or returned (only the last 4 characters are shown), decrypted only to call the Cursor API, replaced when you rotate, and deleted on uninstall or when you click Remove.</li>
          <li>Cloud agents launched with your key are billed by Cursor to the key&apos;s owner (you, or your team if you use a team service account key). Shiplog charges nothing.</li>
          <li>To check who may run <code>/shiplog release</code>, we look up the commenter&apos;s permission on the repository. We don&apos;t store it.</li>
          <li>We do not store your source code. PR titles and descriptions are sent to the model only to write the entry.</li>
        </ul>
      </div>
    </main>
  );
}
