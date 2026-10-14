import { getStore } from "@/lib/store";
import { env } from "@/lib/env";
import SetupForm from "./SetupForm";
import { cookies } from "next/headers";
import { COOKIE, readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Setup({ searchParams }: { searchParams: Promise<{ installation_id?: string }> }) {
  const { installation_id } = await searchParams;
  const store = getStore();
  const inst = installation_id ? await store.getInstallation(installation_id) : null;
  const session = readSession((await cookies()).get(COOKIE)?.value);
  const key = inst ? await store.getKey(inst.id) : null;
  return (
    <main className="wrap page" style={{ maxWidth: 620 }}>
      <h1 className="fade-up">Connect <span className="accent">your Cursor key</span></h1>
      {!installation_id && <p className="muted">Open this page from the Shiplog install link on Origin — it carries your <code>installation_id</code>.</p>}
      {installation_id && !inst && <p className="muted">We haven&apos;t received the install event for <code>{installation_id}</code> yet. Refresh in a few seconds.</p>}
      {inst && inst.status !== "active" && <p><span className="pill off">Disconnected</span> This installation was removed. Reinstall Shiplog on Origin to continue.</p>}
      {inst && inst.status === "active" && session !== inst.id && <p className="muted">To connect a key, open Shiplog from the post-install redirect on Origin (your session proves you installed it).</p>}
      {inst && inst.status === "active" && session === inst.id && (
        <>
          <p className="muted fade-up d1">Installed on <strong style={{ color: "var(--navy)" }}>{inst.namespace || inst.id}</strong>. Cursor apps can&apos;t launch agents themselves, so Shiplog uses a Cursor API key you provide. Cloud agents bill to <strong>the key&apos;s owner</strong>. Shiplog charges nothing.</p>
          {inst.namespaceType === "team" && <p className="muted"><span className="pill gray">Team install</span> Use a <strong>team service account key</strong> so usage bills to the team plan and keeps working if someone leaves. Create it under Cursor Dashboard → API Keys / service accounts.</p>}
          <SetupForm installationId={inst.id} byok={env.byokEnabled} connectedLast4={key?.last4 ?? null} connectedKind={key?.kind ?? null} team={inst.namespaceType === "team"} />
          <p className="muted">No key? Shiplog still works: it posts a ready-to-run prompt on each merged PR. <a href={`/dashboard?installation_id=${encodeURIComponent(inst.id)}`}>Open dashboard</a></p>
        </>
      )}
      <div className="panel fade-up d2">
        <h3>What we store</h3>
        <p className="muted">Your key is encrypted at rest (AES-256-GCM with a server-held secret, unique IV, bound to this installation). We keep the last 4 characters so you can tell keys apart. The full key is never logged, shown, or returned. It is decrypted only to call the Cursor API. Rotating a key overwrites the old one; uninstalling or clicking Remove deletes it.</p>
      </div>
    </main>
  );
}
