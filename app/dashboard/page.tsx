import { getStore } from "@/lib/store";
import { env } from "@/lib/env";
import { pollAgents } from "@/lib/jobs";
import { cookies } from "next/headers";
import { COOKIE, readSession } from "@/lib/session";
import { safeEqual } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ installation_id?: string; token?: string }> }) {
  const { installation_id, token } = await searchParams;
  const store = getStore();
  // Scoped view needs the install session for that installation; the overview needs the operator token.
  const scoped = installation_id ?? null;
  const operator = !!env.dashboardToken && !!token && safeEqual(token, env.dashboardToken);
  const session = readSession((await cookies()).get(COOKIE)?.value);
  if (!operator && !(scoped && session === scoped)) {
    return <main className="wrap page"><h1>Dash<span className="accent">board</span></h1><p className="muted">Open from your setup page link (sessions last 1 hour; reinstall or re-consent to get a new one).</p></main>;
  }
  await pollAgents().catch(() => 0); // Hobby cron is daily; also poll on view (after auth).
  const installs = scoped ? [await store.getInstallation(scoped)].filter(Boolean) as Awaited<ReturnType<typeof store.listInstallations>> : await store.listInstallations();
  const jobs = (await store.listJobs(scoped ?? undefined)).slice(0, 20);
  const outbox = (await store.listOutbox(scoped ?? undefined)).slice(0, 5);
  return (
    <main className="wrap page" style={{ maxWidth: 1040 }}>
      <h1 className="fade-up">Dash<span className="accent">board</span></h1>
      <p className="muted">Mode: <span className="pill gray">{env.llmProvider === "neon" ? "test · direct model" : "cursor agents"}</span></p>
      <div className="panel fade-up d1">
        <h3>Installations</h3>
        <div className="table-scroll"><table><thead><tr><th>Installation</th><th>Namespace</th><th>Status</th><th>Key</th></tr></thead><tbody>
          {await Promise.all(installs.map(async (i) => { const k = await store.getKey(i.id); return (
            <tr key={i.id}><td><code>{i.id}</code></td><td>{i.namespace}</td>
              <td><span className={i.status === "active" ? "pill" : "pill off"}>{i.status === "active" ? "Connected" : i.status === "disconnected" ? "Disconnected" : "Suspended"}</span></td>
              <td>{k ? `•••• ${k.last4}` : <span className="muted">none (prompt mode)</span>}</td></tr>); }))}
          {!installs.length && <tr><td colSpan={4} className="muted">No installations yet.</td></tr>}
        </tbody></table></div>
      </div>
      <div className="panel fade-up d2">
        <h3>Recent jobs</h3>
        <div className="table-scroll"><table><thead><tr><th>When (UTC)</th><th>Repo</th><th>PR</th><th>Kind</th><th>Mode</th><th>Status</th></tr></thead><tbody>
          {jobs.map((j) => <tr key={j.id}><td>{j.createdAt.slice(0, 16).replace("T", " ")}</td><td>{j.repo}</td><td>{j.prNumber ? <a href={j.prUrl}>#{j.prNumber}</a> : <span className="muted">tag</span>}</td><td>{j.kind}</td><td>{j.mode}</td>
            <td><span className={j.status === "done" ? "pill" : j.status === "failed" ? "pill off" : "pill gray"}>{j.status}</span></td></tr>)}
          {!jobs.length && <tr><td colSpan={6} className="muted">Merge a PR to see Shiplog work.</td></tr>}
        </tbody></table></div>
      </div>
      {outbox.length > 0 && <div className="panel fade-up d3"><h3>Latest PR comments</h3>{outbox.map((o) => <div key={o.id}><p className="muted">{o.repo} #{o.prNumber} {o.delivered ? "· posted to Origin" : !o.prNumber ? "· tag release (no PR to comment on)" : "· recorded (not posted)"}</p><pre>{o.body}</pre></div>)}</div>}
    </main>
  );
}
