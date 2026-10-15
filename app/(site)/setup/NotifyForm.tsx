"use client";
import { useState } from "react";

export default function NotifyForm({ installationId, initial }: { installationId: string; initial: string[] }) {
  const [text, setText] = useState(initial.join("\n"));
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setMsg(null);
    const webhooks = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const r = await fetch("/api/notify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ installationId, webhooks }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (r.ok) { setSaved(j.webhooks ?? webhooks); setMsg({ ok: true, text: j.webhooks?.length ? `${j.webhooks.length} webhook(s) saved` : "Webhooks cleared" }); }
    else setMsg({ ok: false, text: j.error ?? "Could not save webhooks" });
  }

  return (
    <div className="panel fade-up d2" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Notify webhooks</h3>
      <p className="muted" style={{ fontSize: 14 }}>Optional HTTPS URLs (Slack incoming webhook, Discord webhook, or any JSON POST endpoint). Shiplog notifies on changelog entries and releases. One URL per line. You can also set <code>notify.webhooks</code> in <code>.shiplog.yml</code>.</p>
      <label className="muted" htmlFor="webhooks">Webhook URLs</label>
      <textarea id="webhooks" className="key" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="https://hooks.slack.com/services/…" style={{ marginTop: 8, width: "100%", fontFamily: "inherit" }} />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : saved.length ? "Update webhooks" : "Save webhooks"}</button>
      </div>
      {msg && <p style={{ marginTop: 12 }}><span className={msg.ok ? "pill" : "pill off"} role="status">{msg.ok ? "✓ " : ""}{msg.text}</span></p>}
    </div>
  );
}
