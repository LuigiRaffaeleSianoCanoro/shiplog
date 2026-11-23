/**
 * Read-only Vercel Blob connectivity check. Prints status lines only (no secrets).
 * Usage: npx tsx scripts/blob-diagnose.ts [namespace] [repoSlug]
 */
import { head, list } from "@vercel/blob";

const P = "shiplog/v1";
const enc = (s: string) => encodeURIComponent(s).replace(/%/g, "_");

async function probe(label: string, work: () => Promise<void>) {
  try {
    await work();
    console.log(`${label}: ok`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
  const status = /Failed to fetch blob:\s*(\d+)/.exec(msg)?.[1] ?? "error";
    console.log(`${label}: ${status}`);
  }
}

const namespace = process.argv[2] ?? "luigi";
const repoSlug = process.argv[3] ?? "luigi/shiplog-demo";

async function main() {
  const nsPath = `${P}/ns/${enc(namespace)}.json`;
  const changelogPath = `${P}/changelogs/${enc(repoSlug)}.json`;

  await probe(`head ${nsPath}`, async () => { await head(nsPath); });
  await probe("list installations", async () => {
    await list({ prefix: `${P}/installations/`, limit: 1 });
  });
  await probe(`head ${changelogPath}`, async () => { await head(changelogPath); });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
