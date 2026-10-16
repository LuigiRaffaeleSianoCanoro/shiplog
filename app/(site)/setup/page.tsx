import { getStore } from "@/lib/store";
import { env } from "@/lib/env";
import SetupForm from "./SetupForm";
import NotifyForm from "./NotifyForm";
import { getInstallationInfo } from "@/lib/vcs";
import { getGithubInstallationInfo, githubConfigured } from "@/lib/github";
import { originInstallStartUrl, githubInstallStartUrl } from "@/lib/install-paths";
import { originConfigured } from "@/lib/origin";
import { cookies } from "next/headers";
import { COOKIE, readSession } from "@/lib/session";
import { GITHUB_SPONSORS_URL } from "@/lib/sponsors";
import type { InstallProvider } from "@/lib/store/types";

export const dynamic = "force-dynamic";

export default async function Setup({ searchParams }: { searchParams: Promise<{ installation_id?: string }> }) {
  const { installation_id } = await searchParams;
  const store = getStore();
  let inst = installation_id ? await store.getInstallation(installation_id) : null;
  // Older records saved before the callback resolved the namespace: backfill it once.
  const provider: InstallProvider = inst?.provider ?? "origin";
  if (inst && !inst.namespace) {
    try {
      if (provider === "github" && githubConfigured()) {
        const info = await getGithubInstallationInfo(inst.id);
        if (info.namespace) {
          inst = { ...inst, namespace: info.namespace, namespaceType: inst.namespaceType ?? info.namespaceType, installerId: inst.installerId ?? info.installerId };
          await store.upsertInstallation(inst);
        }
      } else if (originConfigured()) {
        const info = await getInstallationInfo(inst.id, "origin");
        if (info.namespace) {
          inst = { ...inst, namespace: info.namespace, namespaceType: inst.namespaceType ?? info.namespaceType, installerId: inst.installerId ?? info.installerId };
          await store.upsertInstallation(inst);
        }
      }
    } catch (e) { console.error("[shiplog] installation lookup failed:", (e as Error).message); }
  }
  const session = readSession((await cookies()).get(COOKIE)?.value);
  const key = inst ? await store.getKey(inst.id) : null;
  return (
    <main className="wrap page" style={{ maxWidth: 620 }}>
      <h1 className="fade-up">Connect <span className="accent">your Cursor key</span></h1>
      {!installation_id && (
        <div className="muted fade-up d1">
          <p>Install Shiplog on one or both providers. Each install gets its own <code>installation_id</code> and setup session.</p>
          <p style={{ marginTop: 12 }}>
            <a href={originInstallStartUrl()} className="pill">Install on Origin</a>
            <span style={{ margin: "0 8px" }} />
            <a href={githubInstallStartUrl()} className="pill gray">Install on GitHub</a>
          </p>
        </div>
      )}
      {installation_id && !inst && <p className="muted">We haven&apos;t received the install event for <code>{installation_id}</code> yet. Refresh in a few seconds.</p>}
      {inst && inst.status !== "active" && (
        <p>
          <span className="pill off">Disconnected</span>
          {provider === "github"
            ? " This GitHub App installation was removed. Reinstall from the GitHub install link above."
            : " This Origin installation was removed. Reinstall from the Origin install link above."}
        </p>
      )}
      {inst && inst.status === "active" && session !== inst.id && (
        <p className="muted">
          To connect a key, open Shiplog from the post-install redirect on {provider === "github" ? "GitHub" : "Origin"} (your session proves you installed it).
        </p>
      )}
      {inst && inst.status === "active" && session === inst.id && (
        <>
          <p className="muted fade-up d1">
            <span className={provider === "github" ? "pill gray" : "pill"}>{provider === "github" ? "GitHub App" : "Origin App"}</span>
            {" "}on <strong style={{ color: "var(--navy)" }}>{inst.namespace || inst.id}</strong>.
            {provider === "github" && " Webhooks and PR comments use the GitHub App for this installation only."}
            {" "}Cursor apps can&apos;t launch agents themselves, so Shiplog uses a Cursor API key you provide. Cloud agents bill to <strong>the key&apos;s owner</strong>. Shiplog charges nothing.
          </p>
          {provider === "origin" && githubConfigured() && (
            <p className="muted">Need GitHub-native repos too? <a href={githubInstallStartUrl()}>Install the GitHub App</a> separately (second installation record).</p>
          )}
          {provider === "github" && originConfigured() && (
            <p className="muted">Using Cursor Origin repos too? <a href={originInstallStartUrl()}>Install the Origin App</a> separately.</p>
          )}
          {inst.namespaceType === "team" && <p className="muted"><span className="pill gray">Team install</span> Use a <strong>team service account key</strong> so usage bills to the team plan and keeps working if someone leaves. Create it under Cursor Dashboard → API Keys / service accounts.</p>}
          <SetupForm installationId={inst.id} byok={env.byokEnabled} connectedLast4={key?.last4 ?? null} connectedKind={key?.kind ?? null} team={inst.namespaceType === "team"} />
          <NotifyForm installationId={inst.id} initial={await store.getNotifyWebhooks(inst.id)} />
          <p className="muted">No key? Shiplog still works: it posts a ready-to-run prompt on each merged PR. <a href={`/dashboard?installation_id=${encodeURIComponent(inst.id)}`}>Open dashboard</a> · <a href={GITHUB_SPONSORS_URL}>Support Shiplog</a></p>
        </>
      )}
      <div className="panel fade-up d2">
        <h3>What we store</h3>
        <p className="muted">Your key is encrypted at rest (AES-256-GCM with a server-held secret, unique IV, bound to this installation). We keep the last 4 characters so you can tell keys apart. The full key is never logged, shown, or returned. It is decrypted only to call the Cursor API. Rotating a key overwrites the old one; uninstalling or clicking Remove deletes it.</p>
      </div>
    </main>
  );
}
