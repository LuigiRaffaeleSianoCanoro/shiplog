export default function Privacy() {
  return (
    <main className="wrap" style={{ paddingTop: 40 }}>
      <h1>Privacy & <span className="lime">what we store</span></h1>
      <div className="panel">
        <ul className="muted" style={{ lineHeight: 1.8 }}>
          <li>Installation id, namespace, status, and job history (PR number, link, outcome).</li>
          <li>If you connect one: your Cursor API key, encrypted with AES-256-GCM (random IV per record, installation-bound). We keep the last 4 characters to show you which key is connected.</li>
          <li>Keys are never logged, decrypted only to launch an agent, and deleted on uninstall or when you click Remove.</li>
          <li>We do not store your source code. PR titles and descriptions are sent to the model only to write the entry.</li>
        </ul>
      </div>
    </main>
  );
}
