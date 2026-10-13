"use client";
import { useState } from "react";

export default function SetupForm({ installationId, byok, connectedLast4 }: { installationId: string; byok: boolean; connectedLast4: string | null }) {
  const [key, setKey] = useState("");
  const [last4, setLast4] = useState(connectedLast4);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(connectedLast4 ? { ok: true, text: `Key verified · ends ${connectedLast4}` } : null);
  const [busy, setBusy] = useState(false);

  if (!byok) return <div className="panel"><span className="pill gray">Prompt-only mode</span><p className="muted">Shiplog will post a ready-to-run prompt on each merged PR. Paste it into Cursor to update your changelog.</p></div>;

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ installationId, key }) });
    const j = await r.json(); setBusy(false);
    if (r.ok) { setLast4(j.last4); setKey(""); setMsg({ ok: true, text: `Key verified · ends ${j.last4}` }); }
    else setMsg({ ok: false, text: j.error ?? "Something went wrong" });
  }
  async function remove() {
    await fetch(`/api/keys?installation_id=${encodeURIComponent(installationId)}`, { method: "DELETE" });
    setLast4(null); setMsg({ ok: true, text: "Key removed. Shiplog will post prompts instead." });
  }

  return (
    <div className="panel fade-up d1">
      <label className="muted" htmlFor="key">Cursor API key (Dashboard → API Keys)</label>
      <input id="key" className="key" type="password" autoComplete="off" placeholder={last4 ? `key_••••••••••••••••${last4}` : "key_…"} value={key} onChange={(e) => setKey(e.target.value)} style={{ marginTop: 10 }} />
      <div className="row">
        <button className="btn primary" disabled={busy || !key} onClick={save}>{busy ? "Verifying…" : "Save & verify"}</button>
        {last4 ? <button className="btn" onClick={remove}>Remove key</button> : <a className="btn" href={`/dashboard?installation_id=${encodeURIComponent(installationId)}`}>Skip — use prompt-only mode</a>}
      </div>
      {msg && <p style={{ marginTop: 14 }}><span className={msg.ok ? "pill" : "pill off"} role="status">{msg.ok ? "✓ " : ""}{msg.text}</span></p>}
    </div>
  );
}
