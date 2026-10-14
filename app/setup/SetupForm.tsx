"use client";
import { useState } from "react";

type Kind = "personal" | "service_account";

export default function SetupForm({ installationId, byok, connectedLast4, connectedKind, team }: { installationId: string; byok: boolean; connectedLast4: string | null; connectedKind?: Kind | null; team?: boolean }) {
  const [key, setKey] = useState("");
  const [kind, setKind] = useState<Kind>(connectedKind ?? (team ? "service_account" : "personal"));
  const [last4, setLast4] = useState(connectedLast4);
  const [curKind, setCurKind] = useState<Kind | null>(connectedKind ?? null);
  const [rotating, setRotating] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!byok) return <div className="panel"><span className="pill gray">Prompt-only mode</span><p className="muted">Shiplog will post a ready-to-run prompt on each merged PR. Paste it into Cursor to update your changelog.</p></div>;

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ installationId, key, kind }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (r.ok) { setLast4(j.last4); setCurKind(j.kind); setKey(""); setRotating(false); setMsg({ ok: true, text: j.rotated ? `Key rotated · old key deleted · new key ends ${j.last4}` : `Key verified · ends ${j.last4}` }); }
    else setMsg({ ok: false, text: (j.error ?? "Something went wrong") + (last4 ? " Your current key is unchanged." : "") });
  }
  async function remove() {
    const r = await fetch(`/api/keys?installation_id=${encodeURIComponent(installationId)}`, { method: "DELETE" });
    if (!r.ok) { setMsg({ ok: false, text: "Could not remove the key. Try again." }); return; }
    setLast4(null); setCurKind(null); setMsg({ ok: true, text: "Key deleted. Shiplog will post prompts instead." });
  }

  const form = (
    <>
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
        <legend className="muted">Whose key is this?</legend>
        <label style={{ display: "block", marginTop: 6 }}><input type="radio" name="kind" checked={kind === "personal"} onChange={() => setKind("personal")} /> My personal Cursor API key</label>
        <label style={{ display: "block", marginTop: 6 }}><input type="radio" name="kind" checked={kind === "service_account"} onChange={() => setKind("service_account")} /> A team service account key {team && <span className="pill gray">recommended for teams</span>}</label>
      </fieldset>
      <label className="muted" htmlFor="key">{last4 ? "New Cursor API key" : "Cursor API key"} (Cursor Dashboard → API Keys)</label>
      <input id="key" className="key" type="password" autoComplete="off" placeholder="key_…" value={key} onChange={(e) => setKey(e.target.value)} style={{ marginTop: 10 }} />
      <p className="muted" style={{ fontSize: 14 }}>Agent usage is billed to <strong>the owner of this key</strong>{kind === "service_account" ? " (your team's Cursor plan)" : " (your Cursor plan)"}. We check the key with Cursor before saving{last4 ? " and keep your current key until the new one passes" : ""}.</p>
      <div className="row">
        <button className="btn primary" disabled={busy || !key} onClick={save}>{busy ? "Verifying…" : last4 ? "Verify & replace" : "Save & verify"}</button>
        {last4 ? <button className="btn" onClick={() => { setRotating(false); setKey(""); }}>Cancel</button> : <a className="btn" href={`/dashboard?installation_id=${encodeURIComponent(installationId)}`}>Skip, use prompt-only mode</a>}
      </div>
    </>
  );

  return (
    <div className="panel fade-up d1">
      {last4 && !rotating ? (
        <>
          <p><span className="pill">Connected</span> <code>key_••••{last4}</code> · {curKind === "service_account" ? "team service account" : "personal key"}</p>
          <div className="row">
            <button className="btn primary" onClick={() => { setRotating(true); setMsg(null); }}>Rotate key</button>
            <button className="btn" onClick={remove}>Remove key</button>
          </div>
          <p className="muted" style={{ fontSize: 14 }}>To rotate: create a new key in Cursor Dashboard → API Keys, paste it here, then revoke the old key in Cursor.</p>
        </>
      ) : form}
      {msg && <p style={{ marginTop: 14 }}><span className={msg.ok ? "pill" : "pill off"} role="status">{msg.ok ? "✓ " : ""}{msg.text}</span></p>}
    </div>
  );
}
