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
    <main className="wrap" style={{ maxWidth: 620, paddingTop: 40, paddingBottom: 64 }}>
      <h1 className="fade-up">Connect <span className="accent">your Cursor key</span></h1>
      {!installation_id && <p className="muted">Open this page from the Shiplog install link on Origin — it carries your <code>installation_id</code>.</p>}
      {installation_id && !inst && <p className="muted">We haven&apos;t received the install event for <code>{installation_id}</code> yet. Refresh in a few seconds.</p>}
      {inst && inst.status !== "active" && <p><span className="pill off">Disconnected</span> This installation was removed. Reinstall Shiplog on Origin to continue.</p>}
      {inst && inst.status === "active" && session !== inst.id && <p className="muted">To connect a key, open Shiplog from the post-install redirect on Origin (your session proves you installed it).</p>}
      {inst && inst.status === "active" && session === inst.id && (
        <>
          <p className="muted fade-up d1">Installed on <strong style={{ color: "var(--navy)" }}>{inst.namespace || inst.id}</strong>. Shiplog runs Cursor cloud agents on your plan. We pay nothing; you pay model rates only.</p>
          <SetupForm installationId={inst.id} byok={env.byokEnabled} connectedLast4={key?.last4 ?? null} />
        </>
      )}
      <div className="panel fade-up d2">
        <h3>What we store</h3>
        <p className="muted">Encrypted (AES-256-GCM) key, last 4 chars, installation id. Deleted on uninstall or when you click Remove. Never logged.</p>
      </div>
    </main>
  );
}
