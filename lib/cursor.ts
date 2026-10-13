import { env } from "./env";

// Cursor Cloud Agents API v1. Auth: the installer's user or service-account API key (Basic, key as username).
// Per Cursor support (T-H28768) key-paste is the official path; Origin installation tokens cannot call /v1/agents.
const auth = (key: string) => ({ Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` });

/** Cheap validation: list one agent. No model usage. */
export async function validateCursorKey(key: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!/^[\w-]{16,}$/.test(key)) return false;
  const r = await fetcher(`${env.cursorApi}/v1/agents?limit=1`, { headers: auth(key), cache: "no-store" });
  return r.ok;
}

export interface Launched { agentId: string; runId: string }

/** Launch a cloud agent billed to the key owner; it opens a PR itself (autoCreatePR). */
export async function launchAgent(key: string, prompt: string, repoUrl: string, fetcher: typeof fetch = fetch): Promise<Launched> {
  const r = await fetcher(`${env.cursorApi}/v1/agents`, {
    method: "POST",
    headers: { ...auth(key), "content-type": "application/json" },
    body: JSON.stringify({ prompt: { text: prompt }, repos: [{ url: repoUrl }], autoCreatePR: true }),
  });
  if (!r.ok) throw new Error(`agent launch ${r.status}`);
  const j = (await r.json()) as { agent: { id: string }; run: { id: string } };
  return { agentId: j.agent.id, runId: j.run.id };
}

export interface RunState { status: string; prUrl: string | null }

/** Poll a run; the PR opened by autoCreatePR is at run.git.branches[].prUrl. */
export async function getRun(key: string, agentId: string, runId: string, fetcher: typeof fetch = fetch): Promise<RunState> {
  const r = await fetcher(`${env.cursorApi}/v1/agents/${agentId}/runs/${runId}`, { headers: auth(key), cache: "no-store" });
  if (!r.ok) throw new Error(`run ${r.status}`);
  const j = (await r.json()) as { status: string; git?: { branches?: { prUrl?: string }[] } };
  return { status: j.status, prUrl: j.git?.branches?.find((b) => b.prUrl)?.prUrl ?? null };
}
