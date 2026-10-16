import { getStore } from "@/lib/store";
import { env } from "@/lib/env";
import { agentRunStats, pollAgents } from "@/lib/jobs";
import { cookies } from "next/headers";
import { COOKIE, readSession } from "@/lib/session";
import { safeEqual } from "@/lib/crypto";
import { GITHUB_SPONSORS_URL } from "@/lib/sponsors";
import { vcsDeliveryLabel } from "@/lib/vcs";

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
      <p className="muted fade-up d1" style={{ marginTop: -8 }}>
        <a href={GITHUB_SPONSORS_URL} className="support-link">Support Shiplog</a>
        <span className="muted"> · open source on GitHub Sponsors</span>
      </p>
      <div className="panel fade-up d1">
        <h3>Installations</h3>
        <div className="table-scroll"><table><thead><tr><th>Installation</th><th>Provider</th><th>Namespace</th><th>Status</th><th>Key</th><th>Agent runs</th></tr></thead><tbody>
          {await Promise.all(installs.map(async (i) => { const k = await store.getKey(i.id); const runs = agentRunStats(await store.listJobs(i.id), new Date()); const prov = i.provider ?? "origin"; return (
            <tr key={i.id}><td><code>{i.id}</code></td><td><span className={prov === "github" ? "pill gray" : "pill"}>{prov === "github" ? "GitHub" : "Origin"}</span></td><td>{i.namespace}</td>
              <td><span className={i.status === "active" ? "pill" : "pill off"}>{i.status === "active" ? "Connected" : i.status === "disconnected" ? "Disconnected" : "Suspended"}</span></td>
              <td>{k ? `•••• ${k.last4}${k.kind === "service_account" ? " · service account" : ""}` : <span className="muted">none (prompt mode)</span>} {scoped && session === i.id && <a href={`/setup?installation_id=${encodeURIComponent(i.id)}`}>{k ? "Rotate" : "Add key"}</a>}</td>
              <td>{runs.last30Days} in 30 days, {runs.total} total<br /><span className="muted">{runs.total ? `paid by the ${k?.kind === "service_account" ? "service account" : "personal"} Cursor key` : "no agent runs yet"}</span></td></tr>); }))}
          {!installs.length && <tr><td colSpan={6} className="muted">No installations yet. <a href="/setup">Install on Origin or GitHub</a>.</td></tr>}
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
      {outbox.length > 0 && <div className="panel fade-up d3"><h3>Latest PR comments</h3>{await Promise.all(outbox.map(async (o) => {
        const label = o.delivered ? `posted to ${await vcsDeliveryLabel(o.installationId)}` : !o.prNumber ? "tag release (no PR to comment on)" : "recorded (not posted)";
        return <div key={o.id}><p className="muted">{o.repo} #{o.prNumber} · {label}</p><pre>{o.body}</pre></div>;
      }))}</div>}
    </main>
  );
}
